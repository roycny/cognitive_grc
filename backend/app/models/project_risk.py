"""Project Risk Assessment models.

An AI-driven, quantified project risk assessment. Each assessment is one
engagement for a project; the per-risk line items hang off it. Risk is scored
on a 5×5 Likelihood × Impact matrix, producing an *inherent* score (before
controls) and a *residual* score (after recommended mitigation). Dates are
stored as ISO-8601 strings to match the rest of the app (see GLBA module).
"""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


# 5×5 matrix score (Likelihood × Impact, 1..25) → qualitative rating band.
def score_to_rating(score: int) -> str:
    if score >= 16:
        return "Critical"
    if score >= 10:
        return "High"
    if score >= 5:
        return "Medium"
    return "Low"


class ProjectRiskAssessment(Base):
    """Header row for one project risk assessment engagement."""

    __tablename__ = "project_risk_assessments"

    id = Column(Integer, primary_key=True, index=True)
    project_name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)          # project scope / summary
    assessor = Column(String, nullable=True)           # lead assessor
    period = Column(String, nullable=True)             # e.g. "FY2026 Q2"
    status = Column(String, nullable=False, default="Draft", index=True)  # Draft | Assessed | Approved

    executive_summary = Column(Text, nullable=True)
    overall_inherent_rating = Column(String, nullable=True)   # Low | Medium | High | Critical
    overall_residual_rating = Column(String, nullable=True)
    ai_model = Column(String, nullable=True)           # model used for the AI assessment
    report_format = Column(String, nullable=True, default="Standard")

    created_by = Column(String, nullable=True)
    created_at = Column(String, nullable=True)         # ISO-8601 timestamp
    updated_at = Column(String, nullable=True)         # ISO-8601 timestamp

    risks = relationship(
        "ProjectRisk",
        back_populates="assessment",
        cascade="all, delete-orphan",
        order_by="ProjectRisk.id",
    )


class ProjectRisk(Base):
    """A single risk line item within an assessment, scored on the 5×5 matrix."""

    __tablename__ = "project_risks"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(
        Integer,
        ForeignKey("project_risk_assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(String, nullable=False)
    category = Column(String, nullable=True)           # Security | Operational | Compliance | Financial | Schedule | ...
    description = Column(Text, nullable=True)

    # Inherent risk — before controls
    likelihood = Column(Integer, nullable=True)        # 1..5
    impact = Column(Integer, nullable=True)            # 1..5
    inherent_rating = Column(String, nullable=True)    # derived from likelihood × impact

    # Controls / mitigation
    existing_controls = Column(Text, nullable=True)
    recommended_mitigation = Column(Text, nullable=True)

    # Residual risk — after recommended mitigation
    residual_likelihood = Column(Integer, nullable=True)   # 1..5
    residual_impact = Column(Integer, nullable=True)       # 1..5
    residual_rating = Column(String, nullable=True)

    # Action tracking (observations)
    owner = Column(String, nullable=True)
    target_date = Column(String, nullable=True)        # ISO-8601 date
    action_items = Column(JSON, nullable=True)         # list[str]
    is_completed = Column(Boolean, nullable=False, default=False)

    assessment = relationship("ProjectRiskAssessment", back_populates="risks")
