import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.auth import get_current_active_user
from app.schemas.audit_log import AuditLogPage
from app.rate_limit import limiter

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])

# Leading characters that spreadsheet apps (Excel / Sheets / LibreOffice) treat
# as the start of a formula. Audit-log fields carry attacker-influenced content
# (e.g. uploaded filenames, policy/app names land in `detail`), so neutralize
# them before writing the CSV to prevent formula/CSV injection.
_CSV_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value: str) -> str:
    """Prefix a leading formula trigger with a single quote so the cell stays literal text."""
    if value and value[0] in _CSV_INJECTION_PREFIXES:
        return "'" + value
    return value


def _require_admin(user: User) -> None:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")


def _build_query(
    db: Session,
    search: Optional[str],
    action: Optional[str],
    username: Optional[str],
    resource_type: Optional[str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
):
    q = db.query(AuditLog)

    # Hide low-value technical token churn from the activity view.
    q = q.filter(AuditLog.action != "TOKEN_REFRESH")
    q = q.filter(AuditLog.action != "REFRESH_TOKEN")

    if search:
        pattern = f"%{search}%"
        q = q.filter(
            or_(
                AuditLog.username.ilike(pattern),
                AuditLog.action.ilike(pattern),
                AuditLog.detail.ilike(pattern),
                AuditLog.resource_type.ilike(pattern),
            )
        )
    if action:
        q = q.filter(AuditLog.action == action)
    if username:
        q = q.filter(AuditLog.username == username)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)
    if start_date:
        q = q.filter(AuditLog.timestamp >= start_date)
    if end_date:
        q = q.filter(AuditLog.timestamp <= end_date)
    return q


@router.get("/", response_model=AuditLogPage)
def list_audit_logs(
    search: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_admin(current_user)
    q = _build_query(db, search, action, username, resource_type, start_date, end_date)
    total = q.count()
    items = q.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    return AuditLogPage(items=items, total=total, skip=skip, limit=limit)


@router.get("/export/csv")
@limiter.limit("10/minute")
def export_audit_logs_csv(
    request: Request,
    search: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_admin(current_user)
    q = _build_query(db, search, action, username, resource_type, start_date, end_date)
    logs = q.order_by(AuditLog.timestamp.desc()).limit(10000).all()

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["Timestamp", "Username", "Action", "Resource Type", "Resource ID", "Detail", "IP Address"],
    )
    writer.writeheader()
    for log in logs:
        writer.writerow({
            "Timestamp": log.timestamp.isoformat() if log.timestamp else "",
            "Username": _csv_safe(log.username or ""),
            "Action": _csv_safe(log.action or ""),
            "Resource Type": _csv_safe(log.resource_type or ""),
            "Resource ID": _csv_safe(log.resource_id or ""),
            "Detail": _csv_safe(log.detail or ""),
            "IP Address": _csv_safe(log.ip_address or ""),
        })
    output.seek(0)

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )
