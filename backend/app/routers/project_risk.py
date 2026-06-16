"""Project Risk Assessment router.

An AI-driven, quantified project risk module. Flow:

  1. Create an assessment for a project.
  2. Run an AI assessment over uploaded project docs (PDF/TXT/MD) or pasted text;
     the AI identifies risks and scores each on a 5×5 Likelihood × Impact matrix
     (inherent + residual), proposing controls and remediation actions.
  3. Edit / refine the register (owners, target dates, action completion).
  4. Export a PDF report.

Risk ratings are always (re)computed server-side from the numeric scores so the
qualitative bands stay consistent with the matrix.
"""

import io
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, status,
)
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session

from app.auth import get_current_active_user
from app.database import get_db
from app.models.project_risk import ProjectRisk, ProjectRiskAssessment, score_to_rating
from app.models.user import User, UserRole
from app.schemas.project_risk import (
    AIAssessResponse,
    ProjectRiskAssessmentCreate,
    ProjectRiskAssessmentDetail,
    ProjectRiskAssessmentSummary,
    ProjectRiskAssessmentUpdate,
)
from app.services.ai_service import ai_service
from app.services.audit_log_service import emit_audit_log, get_client_ip
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/project-risk", tags=["project-risk"])

_ALLOWED_DOC_EXTS = {".pdf", ".txt", ".md"}
_MAX_DOC_BYTES = 5 * 1024 * 1024  # 5 MB per file
_MAX_DOC_FILES = 5

_REPORT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "project_risk_reports")
os.makedirs(_REPORT_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_editor(current_user: User) -> None:
    if current_user.role == UserRole.VIEWER:
        raise HTTPException(status_code=403, detail="Viewers cannot modify assessments")


def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only administrators can delete records")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _delete_file(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


def _rating_from(likelihood: Optional[int], impact: Optional[int]) -> Optional[str]:
    if likelihood is None or impact is None:
        return None
    return score_to_rating(likelihood * impact)


_RATING_ORDER = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}


def _worst(ratings: List[Optional[str]]) -> Optional[str]:
    present = [r for r in ratings if r in _RATING_ORDER]
    if not present:
        return None
    return max(present, key=lambda r: _RATING_ORDER[r])


def _recompute_overall(assessment: ProjectRiskAssessment) -> None:
    """Set the assessment's overall ratings from the worst risk in the register."""
    assessment.overall_inherent_rating = _worst([r.inherent_rating for r in assessment.risks])
    assessment.overall_residual_rating = _worst([r.residual_rating for r in assessment.risks])


def _summarize(a: ProjectRiskAssessment) -> ProjectRiskAssessmentSummary:
    return ProjectRiskAssessmentSummary(
        id=a.id,
        project_name=a.project_name,
        assessor=a.assessor,
        period=a.period,
        status=a.status,
        overall_inherent_rating=a.overall_inherent_rating,
        overall_residual_rating=a.overall_residual_rating,
        risk_count=len(a.risks),
        open_actions=sum(1 for r in a.risks if not r.is_completed),
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


def _build_risk(data, recompute: bool = True) -> ProjectRisk:
    """Build a ProjectRisk ORM row from a pydantic ProjectRiskCreate."""
    risk = ProjectRisk(
        title=data.title,
        category=data.category,
        description=data.description,
        likelihood=data.likelihood,
        impact=data.impact,
        existing_controls=data.existing_controls,
        recommended_mitigation=data.recommended_mitigation,
        residual_likelihood=data.residual_likelihood,
        residual_impact=data.residual_impact,
        owner=data.owner,
        target_date=data.target_date,
        action_items=data.action_items,
        is_completed=data.is_completed,
    )
    if recompute:
        risk.inherent_rating = _rating_from(data.likelihood, data.impact)
        risk.residual_rating = _rating_from(data.residual_likelihood, data.residual_impact)
    return risk


def _extract_text(filename: str, content: bytes) -> str:
    """Extract plain text from an uploaded project document."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in (".txt", ".md"):
        return content.decode("utf-8", errors="replace")
    if ext == ".pdf":
        try:
            import pypdf  # lazy import — optional dependency
        except ImportError:
            raise HTTPException(status_code=500, detail="PDF support not installed on the server")
        try:
            reader = pypdf.PdfReader(io.BytesIO(content))
            return "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Could not read PDF: {filename}")
    raise HTTPException(
        status_code=400,
        detail=f"Unsupported file type: {ext}. Allowed: {', '.join(sorted(_ALLOWED_DOC_EXTS))}",
    )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.get("/assessments", response_model=List[ProjectRiskAssessmentSummary])
def list_assessments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    rows = db.query(ProjectRiskAssessment).order_by(ProjectRiskAssessment.id.desc()).all()
    return [_summarize(a) for a in rows]


@router.post("/assessments", response_model=ProjectRiskAssessmentDetail, status_code=status.HTTP_201_CREATED)
def create_assessment(
    body: ProjectRiskAssessmentCreate,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    now = _now()
    assessment = ProjectRiskAssessment(
        project_name=body.project_name,
        description=body.description,
        assessor=body.assessor or current_user.username,
        period=body.period,
        status="Draft",
        created_by=current_user.username,
        created_at=now,
        updated_at=now,
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    bg.add_task(
        emit_audit_log, current_user.username, "CREATE", "ProjectRiskAssessment", str(assessment.id),
        f"Created project risk assessment '{assessment.project_name}'", get_client_ip(request),
    )
    return assessment


@router.get("/assessments/{assessment_id}", response_model=ProjectRiskAssessmentDetail)
def get_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    assessment = db.query(ProjectRiskAssessment).filter(ProjectRiskAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment


@router.put("/assessments/{assessment_id}", response_model=ProjectRiskAssessmentDetail)
def update_assessment(
    assessment_id: int,
    body: ProjectRiskAssessmentUpdate,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    assessment = db.query(ProjectRiskAssessment).filter(ProjectRiskAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    for field in ("project_name", "description", "assessor", "period", "status", "executive_summary"):
        value = getattr(body, field)
        if value is not None:
            setattr(assessment, field, value)

    # When the editor sends the full register, replace it wholesale.
    if body.risks is not None:
        assessment.risks.clear()
        db.flush()
        for risk_data in body.risks:
            assessment.risks.append(_build_risk(risk_data))
        _recompute_overall(assessment)

    assessment.updated_at = _now()
    db.commit()
    db.refresh(assessment)

    bg.add_task(
        emit_audit_log, current_user.username, "UPDATE", "ProjectRiskAssessment", str(assessment.id),
        f"Updated project risk assessment '{assessment.project_name}'", get_client_ip(request),
    )
    return assessment


@router.delete("/assessments/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(
    assessment_id: int,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_admin(current_user)
    assessment = db.query(ProjectRiskAssessment).filter(ProjectRiskAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    name = assessment.project_name
    db.delete(assessment)
    db.commit()
    bg.add_task(
        emit_audit_log, current_user.username, "DELETE", "ProjectRiskAssessment", str(assessment_id),
        f"Deleted project risk assessment '{name}'", get_client_ip(request),
    )


# ---------------------------------------------------------------------------
# AI assessment
# ---------------------------------------------------------------------------

@router.post("/assessments/{assessment_id}/ai-assess", response_model=ProjectRiskAssessmentDetail)
@limiter.limit("5/minute")
async def ai_assess(
    request: Request,
    assessment_id: int,
    bg: BackgroundTasks,
    files: List[UploadFile] = File(default=[]),
    pasted_text: str = Form(default=""),
    model_name: str = Form(default="ollama/llama3.1"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Run an AI risk assessment over uploaded docs / pasted text and persist the register."""
    _require_editor(current_user)
    assessment = db.query(ProjectRiskAssessment).filter(ProjectRiskAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if len(files) > _MAX_DOC_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {_MAX_DOC_FILES} files per request")

    combined = pasted_text.strip()
    for upload in files:
        content = await upload.read()
        if len(content) > _MAX_DOC_BYTES:
            raise HTTPException(status_code=413, detail=f"{upload.filename} exceeds 5 MB limit")
        combined += "\n\n" + _extract_text(upload.filename or "", content)

    combined = combined.strip()
    if not combined:
        raise HTTPException(status_code=400, detail="No project text provided (upload a file or paste text).")

    result = ai_service.assess_project_risk(
        project_name=assessment.project_name,
        document_text=combined,
        model_name=model_name,
    )

    # Persist: replace the register with the AI-generated risks.
    assessment.risks.clear()
    db.flush()
    from app.schemas.project_risk import ProjectRiskCreate
    for risk_dict in result.get("risks", []):
        assessment.risks.append(_build_risk(ProjectRiskCreate(**risk_dict)))

    assessment.executive_summary = result.get("executive_summary") or assessment.executive_summary
    _recompute_overall(assessment)
    if assessment.risks:
        assessment.status = "Assessed"
    assessment.ai_model = model_name
    assessment.updated_at = _now()
    db.commit()
    db.refresh(assessment)

    bg.add_task(
        emit_audit_log, current_user.username, "AI_ACTION", "ProjectRiskAssessment", str(assessment.id),
        f"AI-assessed '{assessment.project_name}': {len(assessment.risks)} risks, "
        f"residual {assessment.overall_residual_rating}", get_client_ip(request),
    )
    return assessment


# ---------------------------------------------------------------------------
# PDF report
# ---------------------------------------------------------------------------

@router.post("/assessments/{assessment_id}/report")
@limiter.limit("10/minute")
def generate_report(
    request: Request,
    assessment_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate and return a PDF risk assessment report."""
    assessment = db.query(ProjectRiskAssessment).filter(ProjectRiskAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    from app.services.project_risk_report import generate_project_risk_pdf

    safe_name = "".join(c if c.isalnum() or c in "-_ " else "_" for c in assessment.project_name)[:60]
    filename = f"Project_Risk_{safe_name}_{uuid.uuid4().hex[:8]}.pdf"
    output_path = os.path.join(_REPORT_DIR, filename)
    generate_project_risk_pdf(assessment, output_path)

    bg.add_task(
        emit_audit_log, current_user.username, "AI_ACTION", "ProjectRiskAssessment", str(assessment.id),
        f"Generated PDF report for '{assessment.project_name}'", get_client_ip(request),
    )
    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=filename,
        background=BackgroundTask(_delete_file, output_path),
    )
