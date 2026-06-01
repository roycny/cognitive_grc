"""Centralised audit-log helper.

Usage from any router:

    from app.services.audit_log_service import emit_audit_log, get_client_ip
    bg.add_task(emit_audit_log, username, action, resource_type, resource_id, detail, ip)

Because we run inside a BackgroundTask the DB session used for the main
request is already closed.  We open a **new** short-lived session here to
guarantee isolation and avoid interfering with the request lifecycle.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import Request

from app.database import SessionLocal
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# Only trust X-Forwarded-For when the direct TCP connection comes from one of
# these known proxy/load-balancer IPs.  Override via env var as a
# comma-separated list, e.g. TRUSTED_PROXY_IPS=10.0.0.1,10.0.0.2
_TRUSTED_PROXY_IPS: frozenset[str] = frozenset(
    ip.strip()
    for ip in os.getenv("TRUSTED_PROXY_IPS", "127.0.0.1,::1").split(",")
    if ip.strip()
)


def get_client_ip(request: Request) -> str:
    """Extract client IP.

    X-Forwarded-For is only trusted when the direct TCP peer is a known
    proxy IP (configured via TRUSTED_PROXY_IPS env var).  This prevents
    attackers from spoofing their IP by injecting arbitrary header values.
    """
    direct_ip = request.client.host if request.client else None
    if direct_ip in _TRUSTED_PROXY_IPS:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return direct_ip or "unknown"


def emit_audit_log(
    username: str,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    detail: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Insert an audit-log row using its own DB session (fire-and-forget safe)."""
    db = SessionLocal()
    try:
        entry = AuditLog(
            username=username,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            ip_address=ip_address,
        )
        db.add(entry)
        db.commit()
    except Exception:
        logger.exception("Failed to write audit log entry")
        db.rollback()
    finally:
        db.close()
