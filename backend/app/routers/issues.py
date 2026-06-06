from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.issue import Issue
from app.models.user import User, UserRole
from app.schemas.issue import IssueCreate, IssueResponse, IssueUpdate
from app.auth import get_current_active_user
from app.services.audit_log_service import emit_audit_log, get_client_ip

router = APIRouter(prefix="/issues", tags=["issues"])


def _require_editor(current_user: User) -> None:
    """VIEWER role is read-only; everyone else may mutate."""
    if current_user.role == UserRole.VIEWER:
        raise HTTPException(status_code=403, detail="Viewers cannot modify issues")


@router.get("/", response_model=List[IssueResponse])
def list_issues(
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return db.query(Issue).order_by(Issue.id.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
def create_issue(
    issue: IssueCreate,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    new_issue = Issue(**issue.model_dump())
    db.add(new_issue)
    db.commit()
    db.refresh(new_issue)
    bg.add_task(
        emit_audit_log, current_user.username, "CREATE_ISSUE", "Issue", str(new_issue.id),
        f"Created issue '{new_issue.name}'", get_client_ip(request),
    )
    return new_issue


@router.put("/{issue_id}", response_model=IssueResponse)
def update_issue(
    issue_id: int,
    issue_update: IssueUpdate,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    db_issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    for field, value in issue_update.model_dump(exclude_unset=True).items():
        setattr(db_issue, field, value)

    db.commit()
    db.refresh(db_issue)
    bg.add_task(
        emit_audit_log, current_user.username, "UPDATE_ISSUE", "Issue", str(db_issue.id),
        f"Updated issue '{db_issue.name}'", get_client_ip(request),
    )
    return db_issue


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(
    issue_id: int,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_editor(current_user)
    db_issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    name = db_issue.name
    db.delete(db_issue)
    db.commit()
    bg.add_task(
        emit_audit_log, current_user.username, "DELETE_ISSUE", "Issue", str(issue_id),
        f"Deleted issue '{name}'", get_client_ip(request),
    )
    return None
