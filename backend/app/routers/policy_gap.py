"""Policy Gap Analyst.

Upload a policy document (PDF / TXT / MD), choose a control framework, and an AI
model identifies where the policy falls short of that framework — missing,
partial, or inconsistent controls — each with a severity and a remediation
recommendation. Identified gaps can be saved to a register and reviewed later.

Migrated and enhanced from a single-framework prototype: the framework catalog
now spans NIST CSF 2.0, NIST 800-53, ISO/IEC 27001:2022, SOC 2, PCI DSS v4.0,
CIS Controls v8, HIPAA, GLBA, GDPR, and OCC CSW.
"""

import io
import logging
import os
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, status,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import get_current_active_user
from app.database import get_db
from app.models.policy_gap import PolicyAssessmentGap
from app.models.user import User, UserRole
from app.services.ai_service import ai_service, POLICY_FRAMEWORKS
from app.services.audit_log_service import emit_audit_log, get_client_ip
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-tools/policy-gap", tags=["policy-gap"])

_MAX_DOC_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_EXTS = (".pdf", ".txt", ".md")


def _require_editor_or_admin(current_user: User) -> None:
    if current_user.role not in (UserRole.ADMIN, UserRole.EDITOR):
        raise HTTPException(status_code=403, detail="Not authorized to perform this action")


def _extract_text(filename: str, content: bytes) -> str:
    """Extract plain text from an uploaded policy document."""
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
            raise HTTPException(status_code=400, detail=f"Could not parse PDF: {filename}")
    raise HTTPException(
        status_code=400,
        detail=f"Unsupported file type: {ext or '(none)'}. Allowed: {', '.join(_ALLOWED_EXTS)}",
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PolicyGapItem(BaseModel):
    requirement: str
    gap_description: str
    recommendation: str
    severity: Literal["High", "Medium", "Low"] = "Medium"


class PolicyAssessmentResult(BaseModel):
    policy_name: str
    framework: str
    gaps: List[PolicyGapItem]


class SavedGapResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    policy_name: str
    framework: str
    requirement: str
    gap_description: str
    recommendation: str
    severity: str
    created_at: datetime
    created_by: str


# ---------------------------------------------------------------------------
# Frameworks catalog
# ---------------------------------------------------------------------------

@router.get("/frameworks", response_model=List[str])
def list_frameworks(current_user: User = Depends(get_current_active_user)):
    """Return the control frameworks the analyst can assess against."""
    return list(POLICY_FRAMEWORKS.keys())


# ---------------------------------------------------------------------------
# Assess
# ---------------------------------------------------------------------------

@router.post("/assess", response_model=PolicyAssessmentResult)
@limiter.limit("5/minute")
async def assess_policy(
    request: Request,
    bg: BackgroundTasks,
    framework: str = Form(...),
    file: Optional[UploadFile] = File(default=None),
    pasted_text: str = Form(default=""),
    policy_name: str = Form(default=""),
    model_name: str = Form(default="ollama/llama3.1"),
    current_user: User = Depends(get_current_active_user),
):
    """Assess an uploaded / pasted policy document against a framework."""
    _require_editor_or_admin(current_user)

    if framework not in POLICY_FRAMEWORKS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported framework. Choose one of: {', '.join(POLICY_FRAMEWORKS)}",
        )

    policy_text = pasted_text.strip()
    name = policy_name.strip()

    if file is not None and file.filename:
        content = await file.read()
        if len(content) > _MAX_DOC_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds {_MAX_DOC_BYTES // (1024 * 1024)} MB limit",
            )
        extracted = _extract_text(file.filename, content)
        policy_text = (policy_text + "\n\n" + extracted).strip() if policy_text else extracted.strip()
        if not name:
            name = os.path.splitext(file.filename)[0]

    if not policy_text:
        raise HTTPException(status_code=400, detail="No policy text provided (upload a file or paste text).")
    if not name:
        name = "Uploaded Policy"

    result = ai_service.assess_policy_gaps(
        policy_text=policy_text,
        framework=framework,
        policy_name=name,
        model_name=model_name,
    )
    if result.get("error") and not result.get("gaps"):
        raise HTTPException(status_code=503, detail=result["error"])

    gaps = [PolicyGapItem(**g) for g in result.get("gaps", [])]

    bg.add_task(
        emit_audit_log, current_user.username, "AI_ACTION", "PolicyGap", None,
        f"Assessed policy '{name}' against {framework}: {len(gaps)} gap(s) found",
        get_client_ip(request),
    )
    return PolicyAssessmentResult(policy_name=name, framework=framework, gaps=gaps)


# ---------------------------------------------------------------------------
# Saved gaps
# ---------------------------------------------------------------------------

@router.post("/gaps", response_model=List[SavedGapResponse])
def save_gaps(
    payload: PolicyAssessmentResult,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Save a batch of assessment gaps to the register."""
    _require_editor_or_admin(current_user)

    saved: List[PolicyAssessmentGap] = []
    for gap in payload.gaps:
        row = PolicyAssessmentGap(
            policy_name=payload.policy_name,
            framework=payload.framework,
            requirement=gap.requirement,
            gap_description=gap.gap_description,
            recommendation=gap.recommendation,
            severity=gap.severity,
            created_by=current_user.username,
        )
        db.add(row)
        saved.append(row)

    db.commit()
    for row in saved:
        db.refresh(row)

    bg.add_task(
        emit_audit_log, current_user.username, "CREATE", "PolicyGap", None,
        f"Saved {len(saved)} gap(s) for policy '{payload.policy_name}'", get_client_ip(request),
    )
    return saved


@router.get("/gaps", response_model=List[SavedGapResponse])
def list_gaps(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all saved policy gaps (single-tenant: visible to every authenticated user)."""
    return (
        db.query(PolicyAssessmentGap)
        .order_by(PolicyAssessmentGap.created_at.desc())
        .all()
    )


@router.delete("/gaps/{gap_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gap(
    gap_id: int,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a saved policy gap."""
    _require_editor_or_admin(current_user)
    gap = db.query(PolicyAssessmentGap).filter(PolicyAssessmentGap.id == gap_id).first()
    if gap is None:
        raise HTTPException(status_code=404, detail="Gap not found")
    db.delete(gap)
    db.commit()
    bg.add_task(
        emit_audit_log, current_user.username, "DELETE", "PolicyGap", str(gap_id),
        f"Deleted policy gap #{gap_id}", get_client_ip(request),
    )
    return None
