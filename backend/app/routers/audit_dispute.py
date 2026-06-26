"""Audit Dispute Agent.

Upload or paste an audit request or audit observation. The AI analyses the
content against OCC Cybersecurity Supervision Work Program (CSW) and NIST CSF
2.0 controls, providing actionable guidance, evidence suggestions, and
framework references to help the auditee respond or dispute the finding.
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
from app.models.audit_dispute import AuditDisputeResponse
from app.models.user import User, UserRole
from app.services.ai_service import ai_service
from app.services.audit_log_service import emit_audit_log, get_client_ip
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-tools/audit-dispute", tags=["audit-dispute"])

_MAX_DOC_BYTES = 10 * 1024 * 1024
_ALLOWED_EXTS = (".pdf", ".txt", ".md")


def _require_editor_or_admin(current_user: User) -> None:
    if current_user.role not in (UserRole.ADMIN, UserRole.EDITOR):
        raise HTTPException(status_code=403, detail="Not authorized to perform this action")


def _extract_text(filename: str, content: bytes) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in (".txt", ".md"):
        return content.decode("utf-8", errors="replace")
    if ext == ".pdf":
        try:
            import pypdf
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

class GuidanceItem(BaseModel):
    title: str
    description: str
    priority: Literal["High", "Medium", "Low"] = "Medium"


class EvidenceItem(BaseModel):
    document: str
    description: str
    attention_points: str


class ControlReference(BaseModel):
    framework: str
    control_id: str
    control_name: str
    relevance: str


class AuditDisputeResult(BaseModel):
    title: str
    input_type: str
    summary: str
    risk_rating: str
    guidance: List[GuidanceItem]
    evidence_suggestions: List[EvidenceItem]
    control_references: List[ControlReference]


class SavedDisputeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    input_type: str
    frameworks_referenced: list
    risk_rating: str
    summary: str
    guidance: list
    evidence_suggestions: list
    control_references: list
    created_at: datetime
    created_by: str


# ---------------------------------------------------------------------------
# Analyze
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=AuditDisputeResult)
@limiter.limit("5/minute")
async def analyze_audit(
    request: Request,
    bg: BackgroundTasks,
    input_type: str = Form(...),
    title: str = Form(default=""),
    file: Optional[UploadFile] = File(default=None),
    pasted_text: str = Form(default=""),
    model_name: str = Form(default="ollama/llama3.1"),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor_or_admin(current_user)

    if input_type not in ("audit_request", "audit_observation"):
        raise HTTPException(status_code=400, detail="input_type must be 'audit_request' or 'audit_observation'")

    audit_text = pasted_text.strip()
    name = title.strip()

    if file is not None and file.filename:
        content = await file.read()
        if len(content) > _MAX_DOC_BYTES:
            raise HTTPException(status_code=413, detail=f"File exceeds {_MAX_DOC_BYTES // (1024 * 1024)} MB limit")
        extracted = _extract_text(file.filename, content)
        audit_text = (audit_text + "\n\n" + extracted).strip() if audit_text else extracted.strip()
        if not name:
            name = os.path.splitext(file.filename)[0]

    if not audit_text:
        raise HTTPException(status_code=400, detail="No audit text provided (upload a file or paste text).")
    if not name:
        name = "Audit Item"

    result = ai_service.analyze_audit_dispute(
        audit_text=audit_text,
        input_type=input_type,
        title=name,
        model_name=model_name,
    )

    if not result.get("guidance") and "failed" in result.get("summary", "").lower():
        raise HTTPException(status_code=503, detail=result["summary"])

    bg.add_task(
        emit_audit_log, current_user.username, "AI_ACTION", "AuditDisputeAgent", None,
        f"Analyzed {input_type.replace('_', ' ')} '{name}': risk {result.get('risk_rating')}",
        get_client_ip(request),
    )

    return AuditDisputeResult(
        title=name,
        input_type=input_type,
        summary=result["summary"],
        risk_rating=result["risk_rating"],
        guidance=[GuidanceItem(**g) for g in result.get("guidance", [])],
        evidence_suggestions=[EvidenceItem(**e) for e in result.get("evidence_suggestions", [])],
        control_references=[ControlReference(**c) for c in result.get("control_references", [])],
    )


# ---------------------------------------------------------------------------
# Save & History
# ---------------------------------------------------------------------------

@router.post("/save", response_model=SavedDisputeResponse)
def save_dispute_response(
    payload: AuditDisputeResult,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor_or_admin(current_user)

    frameworks = list({c.framework for c in payload.control_references})

    row = AuditDisputeResponse(
        title=payload.title,
        input_type=payload.input_type,
        frameworks_referenced=frameworks,
        risk_rating=payload.risk_rating,
        summary=payload.summary,
        guidance=[g.model_dump() for g in payload.guidance],
        evidence_suggestions=[e.model_dump() for e in payload.evidence_suggestions],
        control_references=[c.model_dump() for c in payload.control_references],
        created_by=current_user.username,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    bg.add_task(
        emit_audit_log, current_user.username, "CREATE", "AuditDisputeAgent", str(row.id),
        f"Saved audit dispute response for '{payload.title}'", get_client_ip(request),
    )
    return row


@router.get("/history", response_model=List[SavedDisputeResponse])
def list_dispute_responses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return (
        db.query(AuditDisputeResponse)
        .order_by(AuditDisputeResponse.created_at.desc())
        .all()
    )


@router.get("/history/{response_id}", response_model=SavedDisputeResponse)
def get_dispute_response(
    response_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    row = db.query(AuditDisputeResponse).filter(AuditDisputeResponse.id == response_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Response not found")
    return row


@router.delete("/history/{response_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dispute_response(
    response_id: int,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor_or_admin(current_user)
    row = db.query(AuditDisputeResponse).filter(AuditDisputeResponse.id == response_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Response not found")
    db.delete(row)
    db.commit()
    bg.add_task(
        emit_audit_log, current_user.username, "DELETE", "AuditDisputeAgent", str(response_id),
        f"Deleted audit dispute response #{response_id}", get_client_ip(request),
    )
    return None
