from pydantic import BaseModel
from typing import Optional


class AuditBase(BaseModel):
    audit_code: Optional[str] = None
    audit_type: str = "Internal"
    title: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = "Planning"
    requests_total: int = 0
    requests_open: int = 0
    walkthroughs: int = 0
    total_findings: int = 0
    open_findings: int = 0
    past_due: int = 0
    key_risks: Optional[str] = None
    auditor_concerns: Optional[str] = None


class AuditCreate(AuditBase):
    pass


class AuditUpdate(BaseModel):
    audit_code: Optional[str] = None
    audit_type: Optional[str] = None
    title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    requests_total: Optional[int] = None
    requests_open: Optional[int] = None
    walkthroughs: Optional[int] = None
    total_findings: Optional[int] = None
    open_findings: Optional[int] = None
    past_due: Optional[int] = None
    key_risks: Optional[str] = None
    auditor_concerns: Optional[str] = None


class AuditResponse(AuditBase):
    id: int

    class Config:
        from_attributes = True
