from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class GLBAAssessment(Base):
    """A GLBA Information Security Program assessment engagement.

    The header row that appears on the dashboard. The 27 per-control responses
    hang off this via ``responses``. Dates are stored as ISO-8601 strings
    ("YYYY-MM-DD"/timestamp) to match the rest of the app.
    """

    __tablename__ = "glba_assessments"

    id = Column(Integer, primary_key=True, index=True)
    entity = Column(String, nullable=True)        # Institution / legal entity
    period = Column(String, nullable=True)        # Assessment period, e.g. "FY2026"
    lead = Column(String, nullable=True)          # Lead assessor
    status = Column(String, nullable=False, default="In Progress", index=True)  # In Progress | Completed

    created_by = Column(String, nullable=True)
    created_at = Column(String, nullable=True)    # ISO-8601 timestamp set at creation
    updated_at = Column(String, nullable=True)    # ISO-8601 timestamp of last edit

    responses = relationship(
        "GLBAControlResponse",
        back_populates="assessment",
        cascade="all, delete-orphan",
        order_by="GLBAControlResponse.control_id",
    )


class GLBAControlResponse(Base):
    """The editable data for a single control within one assessment.

    One row per control (27 controls). Every editable field on the assessment
    form maps to a column here so the whole assessment is persisted and can be
    re-opened, edited, and later used to generate a report.
    """

    __tablename__ = "glba_control_responses"
    __table_args__ = (
        UniqueConstraint("assessment_id", "control_id", name="uq_glba_response_control"),
    )

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(
        Integer, ForeignKey("glba_assessments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    control_id = Column(String, nullable=False, index=True)  # e.g. "A-01"

    # Control owner — self-report
    owner_desc = Column(Text, nullable=True)
    owner_evidence = Column(Text, nullable=True)
    owner_sign = Column(String, nullable=True)

    # Assessor — testing & conclusion
    test_methods = Column(JSON, nullable=True)   # list[str], subset of Inquiry/Observation/Inspection/Reperformance
    result = Column(String, nullable=True)       # Effective | Deficient | Not Implemented | N/A
    maturity = Column(String, nullable=True)     # Tier 1..4 (optional)
    assessor_notes = Column(Text, nullable=True)
    assessor_sign = Column(String, nullable=True)

    assessment = relationship("GLBAAssessment", back_populates="responses")
