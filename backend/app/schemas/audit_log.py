from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    timestamp: datetime
    username: str
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    detail: Optional[str] = None
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True


class AuditLogPage(BaseModel):
    items: List[AuditLogResponse]
    total: int
    skip: int
    limit: int
