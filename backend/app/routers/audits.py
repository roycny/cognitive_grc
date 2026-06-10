from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.audit import Audit
from app.models.user import User, UserRole
from app.schemas.audit import AuditCreate, AuditResponse, AuditUpdate
from app.auth import get_current_active_user
from app.services.audit_log_service import emit_audit_log, get_client_ip

router = APIRouter(prefix="/audits", tags=["audits"])


def _require_editor(current_user: User) -> None:
    """VIEWER role is read-only; everyone else may mutate."""
    if current_user.role == UserRole.VIEWER:
        raise HTTPException(status_code=403, detail="Viewers cannot modify audits")


def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only administrators can delete records")


@router.get("/", response_model=List[AuditResponse])
def list_audits(
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # H8 (accepted): single-tenant design — all authenticated users share one
    # trusted org and may read every record. Access is by role, not ownership.
    # Add organization_id scoping here before any multi-tenant deployment.
    return db.query(Audit).order_by(Audit.id.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=AuditResponse, status_code=status.HTTP_201_CREATED)
def create_audit(
    audit: AuditCreate,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    new_audit = Audit(**audit.model_dump())
    db.add(new_audit)
    db.commit()
    db.refresh(new_audit)
    bg.add_task(
        emit_audit_log, current_user.username, "CREATE_AUDIT", "Audit", str(new_audit.id),
        f"Created audit '{new_audit.title}'", get_client_ip(request),
    )
    return new_audit


@router.put("/{audit_id}", response_model=AuditResponse)
def update_audit(
    audit_id: int,
    audit_update: AuditUpdate,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    db_audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not db_audit:
        raise HTTPException(status_code=404, detail="Audit not found")

    # H9: Whitelist updateable fields to prevent mass assignment
    allowed_fields = {
        "audit_code", "audit_type", "title", "start_date", "end_date", "status",
        "requests_total", "requests_open", "walkthroughs", "total_findings",
        "open_findings", "past_due", "key_risks", "auditor_concerns"
    }
    for field, value in audit_update.model_dump(exclude_unset=True, include=allowed_fields).items():
        setattr(db_audit, field, value)

    db.commit()
    db.refresh(db_audit)
    bg.add_task(
        emit_audit_log, current_user.username, "UPDATE_AUDIT", "Audit", str(db_audit.id),
        f"Updated audit '{db_audit.title}'", get_client_ip(request),
    )
    return db_audit


@router.delete("/{audit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_audit(
    audit_id: int,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_admin(current_user)
    db_audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not db_audit:
        raise HTTPException(status_code=404, detail="Audit not found")

    title = db_audit.title
    db.delete(db_audit)
    db.commit()
    bg.add_task(
        emit_audit_log, current_user.username, "DELETE_AUDIT", "Audit", str(audit_id),
        f"Deleted audit '{title}'", get_client_ip(request),
    )
    return None
