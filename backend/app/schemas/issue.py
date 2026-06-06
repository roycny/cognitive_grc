from pydantic import BaseModel
from typing import Optional


class IssueBase(BaseModel):
    issue_number: Optional[str] = None
    issue_type: str = "Business"
    name: str
    status: str = "Open"
    risk_rating: str = "Moderate"
    owner: Optional[str] = None
    identified_date: Optional[str] = None
    target_date: Optional[str] = None
    description: Optional[str] = None
    remediation_plan: Optional[str] = None


class IssueCreate(IssueBase):
    pass


class IssueUpdate(BaseModel):
    issue_number: Optional[str] = None
    issue_type: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None
    risk_rating: Optional[str] = None
    owner: Optional[str] = None
    identified_date: Optional[str] = None
    target_date: Optional[str] = None
    description: Optional[str] = None
    remediation_plan: Optional[str] = None


class IssueResponse(IssueBase):
    id: int

    class Config:
        from_attributes = True
