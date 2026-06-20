from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func

from app.database import Base


class PolicyAssessmentGap(Base):
    """A single saved gap from a Policy Gap Analyst assessment.

    Each row is one control gap identified when a policy document was assessed
    against a framework (e.g. "NIST CSF 2.0", "ISO/IEC 27001:2022").
    """

    __tablename__ = "policy_assessment_gaps"

    id = Column(Integer, primary_key=True, index=True)
    policy_name = Column(String, nullable=False, index=True)
    framework = Column(String, nullable=False)
    requirement = Column(String, nullable=False)
    gap_description = Column(Text, nullable=False)
    recommendation = Column(Text, nullable=False)
    severity = Column(String, default="Medium", nullable=False)  # High, Medium, Low
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(String, nullable=False)
