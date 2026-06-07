from pydantic import BaseModel
from typing import List, Optional


# ---------------------------------------------------------------------------
# Control responses
# ---------------------------------------------------------------------------
class GLBAControlResponseBase(BaseModel):
    owner_desc: Optional[str] = None
    owner_evidence: Optional[str] = None
    owner_sign: Optional[str] = None
    test_methods: Optional[List[str]] = None
    result: Optional[str] = None
    maturity: Optional[str] = None
    assessor_notes: Optional[str] = None
    assessor_sign: Optional[str] = None


class GLBAControlResponseUpdate(GLBAControlResponseBase):
    """All fields optional — only the changed ones are sent on autosave."""
    pass


class GLBAControlResponse(GLBAControlResponseBase):
    id: int
    control_id: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Assessments
# ---------------------------------------------------------------------------
class GLBAAssessmentCreate(BaseModel):
    entity: Optional[str] = None
    period: Optional[str] = None
    lead: Optional[str] = None


class GLBAAssessmentUpdate(BaseModel):
    entity: Optional[str] = None
    period: Optional[str] = None
    lead: Optional[str] = None
    status: Optional[str] = None


class GLBAAssessmentSummary(BaseModel):
    """Lightweight row for the dashboard list."""
    id: int
    entity: Optional[str] = None
    period: Optional[str] = None
    lead: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    total_controls: int
    results_recorded: int
    effective_count: int
    deficient_count: int

    class Config:
        from_attributes = True


class GLBAAssessmentDetail(BaseModel):
    """Full assessment: header + all control responses."""
    id: int
    entity: Optional[str] = None
    period: Optional[str] = None
    lead: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    responses: List[GLBAControlResponse]

    class Config:
        from_attributes = True
