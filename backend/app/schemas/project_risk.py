from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Risk line items
# ---------------------------------------------------------------------------
class ProjectRiskBase(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    category: Optional[str] = None
    description: Optional[str] = None

    likelihood: Optional[int] = Field(default=None, ge=1, le=5)
    impact: Optional[int] = Field(default=None, ge=1, le=5)

    existing_controls: Optional[str] = None
    recommended_mitigation: Optional[str] = None

    residual_likelihood: Optional[int] = Field(default=None, ge=1, le=5)
    residual_impact: Optional[int] = Field(default=None, ge=1, le=5)

    owner: Optional[str] = None
    target_date: Optional[str] = None
    action_items: Optional[List[str]] = None
    is_completed: bool = False


class ProjectRiskCreate(ProjectRiskBase):
    pass


class ProjectRisk(ProjectRiskBase):
    id: int
    inherent_rating: Optional[str] = None
    residual_rating: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Assessments
# ---------------------------------------------------------------------------
class ProjectRiskAssessmentCreate(BaseModel):
    project_name: str = Field(min_length=1, max_length=300)
    description: Optional[str] = None
    assessor: Optional[str] = None
    period: Optional[str] = None


class ProjectRiskAssessmentUpdate(BaseModel):
    project_name: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = None
    assessor: Optional[str] = None
    period: Optional[str] = None
    status: Optional[str] = None
    executive_summary: Optional[str] = None
    # When provided, replaces the full risk register (used by the editor's save).
    risks: Optional[List[ProjectRiskCreate]] = None


class ProjectRiskAssessmentSummary(BaseModel):
    """Lightweight row for the list page."""
    id: int
    project_name: str
    assessor: Optional[str] = None
    period: Optional[str] = None
    status: str
    overall_inherent_rating: Optional[str] = None
    overall_residual_rating: Optional[str] = None
    risk_count: int = 0
    open_actions: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectRiskAssessmentDetail(BaseModel):
    id: int
    project_name: str
    description: Optional[str] = None
    assessor: Optional[str] = None
    period: Optional[str] = None
    status: str
    executive_summary: Optional[str] = None
    overall_inherent_rating: Optional[str] = None
    overall_residual_rating: Optional[str] = None
    ai_model: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    risks: List[ProjectRisk] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# AI assessment
# ---------------------------------------------------------------------------
class AIAssessResponse(BaseModel):
    """Result of an AI document-driven risk assessment (before persistence)."""
    executive_summary: str = ""
    overall_inherent_rating: str = "UNKNOWN"
    overall_residual_rating: str = "UNKNOWN"
    risks: List[ProjectRisk] = []
