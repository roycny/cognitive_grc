from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.kri import KRI
from app.models.user import User, UserRole
from app.schemas.kri import KRICreate, KRIResponse, KRIUpdate
from app.auth import get_current_active_user
from app.services.audit_log_service import emit_audit_log, get_client_ip

router = APIRouter(prefix="/kris", tags=["kris"])


def _require_editor(current_user: User) -> None:
    """VIEWER role is read-only; everyone else may mutate."""
    if current_user.role == UserRole.VIEWER:
        raise HTTPException(status_code=403, detail="Viewers cannot modify KRIs")


@router.get("/", response_model=List[KRIResponse])
def list_kris(
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return db.query(KRI).order_by(KRI.id.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=KRIResponse, status_code=status.HTTP_201_CREATED)
def create_kri(
    kri: KRICreate,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    new_kri = KRI(**kri.model_dump())
    db.add(new_kri)
    db.commit()
    db.refresh(new_kri)
    bg.add_task(
        emit_audit_log, current_user.username, "CREATE_KRI", "KRI", str(new_kri.id),
        f"Created KRI '{new_kri.name}'", get_client_ip(request),
    )
    return new_kri


@router.put("/{kri_id}", response_model=KRIResponse)
def update_kri(
    kri_id: int,
    kri_update: KRIUpdate,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    db_kri = db.query(KRI).filter(KRI.id == kri_id).first()
    if not db_kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    for field, value in kri_update.model_dump(exclude_unset=True).items():
        setattr(db_kri, field, value)

    db.commit()
    db.refresh(db_kri)
    bg.add_task(
        emit_audit_log, current_user.username, "UPDATE_KRI", "KRI", str(db_kri.id),
        f"Updated KRI '{db_kri.name}'", get_client_ip(request),
    )
    return db_kri


@router.delete("/{kri_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_kri(
    kri_id: int,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    db_kri = db.query(KRI).filter(KRI.id == kri_id).first()
    if not db_kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    name = db_kri.name
    db.delete(db_kri)
    db.commit()
    bg.add_task(
        emit_audit_log, current_user.username, "DELETE_KRI", "KRI", str(kri_id),
        f"Deleted KRI '{name}'", get_client_ip(request),
    )
    return None
