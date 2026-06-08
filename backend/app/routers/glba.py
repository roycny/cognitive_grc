from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.glba_controls import GLBA_CONTROL_IDS
from app.models.glba import GLBAAssessment, GLBAControlResponse
from app.models.user import User, UserRole
from app.schemas.glba import (
    GLBAAssessmentCreate,
    GLBAAssessmentDetail,
    GLBAAssessmentSummary,
    GLBAAssessmentUpdate,
    GLBAControlResponse as GLBAControlResponseSchema,
    GLBAControlResponseUpdate,
)
from app.auth import get_current_active_user
from app.services.audit_log_service import emit_audit_log, get_client_ip
from app.services.glba_report import render_report_html

router = APIRouter(prefix="/glba", tags=["glba"])


def _require_editor(current_user: User) -> None:
    """VIEWER role is read-only; everyone else may mutate."""
    if current_user.role == UserRole.VIEWER:
        raise HTTPException(status_code=403, detail="Viewers cannot modify assessments")


def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only administrators can delete records")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _summarize(a: GLBAAssessment) -> GLBAAssessmentSummary:
    recorded = sum(1 for r in a.responses if r.result)
    effective = sum(1 for r in a.responses if r.result == "Effective")
    deficient = sum(1 for r in a.responses if r.result in ("Deficient", "Not Implemented"))
    return GLBAAssessmentSummary(
        id=a.id,
        entity=a.entity,
        period=a.period,
        lead=a.lead,
        status=a.status,
        created_by=a.created_by,
        created_at=a.created_at,
        updated_at=a.updated_at,
        total_controls=len(GLBA_CONTROL_IDS),
        results_recorded=recorded,
        effective_count=effective,
        deficient_count=deficient,
    )


@router.get("/assessments", response_model=List[GLBAAssessmentSummary])
def list_assessments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    assessments = db.query(GLBAAssessment).order_by(GLBAAssessment.id.desc()).all()
    return [_summarize(a) for a in assessments]


@router.post("/assessments", response_model=GLBAAssessmentDetail, status_code=status.HTTP_201_CREATED)
def create_assessment(
    payload: GLBAAssessmentCreate,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    now = _now()
    assessment = GLBAAssessment(
        entity=payload.entity,
        period=payload.period,
        lead=payload.lead,
        status="In Progress",
        created_by=current_user.username,
        created_at=now,
        updated_at=now,
    )
    # Seed one empty response row per control so the form has a row to autosave into.
    assessment.responses = [GLBAControlResponse(control_id=cid) for cid in GLBA_CONTROL_IDS]
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    bg.add_task(
        emit_audit_log, current_user.username, "CREATE_GLBA_ASSESSMENT", "GLBAAssessment",
        str(assessment.id), f"Created GLBA assessment for '{assessment.entity or 'Untitled'}'",
        get_client_ip(request),
    )
    return assessment


@router.get("/assessments/{assessment_id}", response_model=GLBAAssessmentDetail)
def get_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    assessment = db.query(GLBAAssessment).filter(GLBAAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment


@router.get("/assessments/{assessment_id}/report", response_class=HTMLResponse)
def generate_report(
    assessment_id: int,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Render a polished, print-ready HTML assessment report.

    Read-only: VIEWERs may export.  The export action is audit-logged.  The
    document is self-contained (inline CSS) so the browser can print it to PDF.
    """
    assessment = db.query(GLBAAssessment).filter(GLBAAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    html = render_report_html(assessment, generated_by=current_user.username)
    bg.add_task(
        emit_audit_log, current_user.username, "EXPORT_GLBA_REPORT", "GLBAAssessment",
        str(assessment.id), f"Exported GLBA assessment report for '{assessment.entity or 'Untitled'}'",
        get_client_ip(request),
    )
    return HTMLResponse(content=html)


@router.put("/assessments/{assessment_id}", response_model=GLBAAssessmentDetail)
def update_assessment(
    assessment_id: int,
    payload: GLBAAssessmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    assessment = db.query(GLBAAssessment).filter(GLBAAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # H9: Whitelist updateable fields to prevent mass assignment
    allowed_fields = {"entity", "period", "lead", "status"}
    for field, value in payload.model_dump(exclude_unset=True, include=allowed_fields).items():
        setattr(assessment, field, value)
    assessment.updated_at = _now()
    db.commit()
    db.refresh(assessment)
    return assessment


@router.patch(
    "/assessments/{assessment_id}/responses/{control_id}",
    response_model=GLBAControlResponseSchema,
)
def update_response(
    assessment_id: int,
    control_id: str,
    payload: GLBAControlResponseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Autosave endpoint — patch one control's editable fields."""
    _require_editor(current_user)
    response = (
        db.query(GLBAControlResponse)
        .filter(
            GLBAControlResponse.assessment_id == assessment_id,
            GLBAControlResponse.control_id == control_id,
        )
        .first()
    )
    if not response:
        raise HTTPException(status_code=404, detail="Control response not found")

    # H9: Whitelist updateable fields based on user role to prevent unauthorized sign-offs
    allowed_fields = {"owner_desc", "owner_evidence", "owner_sign", "test_methods", "result", "maturity"}
    if current_user.role in (UserRole.ADMIN, UserRole.AUDITOR):
        allowed_fields.update({"assessor_notes", "assessor_sign"})

    for field, value in payload.model_dump(exclude_unset=True, include=allowed_fields).items():
        setattr(response, field, value)

    assessment = db.query(GLBAAssessment).filter(GLBAAssessment.id == assessment_id).first()
    if assessment:
        assessment.updated_at = _now()
    db.commit()
    db.refresh(response)
    return response


@router.delete("/assessments/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(
    assessment_id: int,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_admin(current_user)
    assessment = db.query(GLBAAssessment).filter(GLBAAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    entity = assessment.entity or "Untitled"
    db.delete(assessment)
    db.commit()
    bg.add_task(
        emit_audit_log, current_user.username, "DELETE_GLBA_ASSESSMENT", "GLBAAssessment",
        str(assessment_id), f"Deleted GLBA assessment for '{entity}'", get_client_ip(request),
    )
    return None
