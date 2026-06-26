from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func

from app.database import Base


class AuditDisputeResponse(Base):
    __tablename__ = "audit_dispute_responses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    input_type = Column(String, nullable=False)  # "audit_request" or "audit_observation"
    frameworks_referenced = Column(JSON, nullable=False, default=list)
    risk_rating = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    guidance = Column(JSON, nullable=False, default=list)
    evidence_suggestions = Column(JSON, nullable=False, default=list)
    control_references = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(String, nullable=False)
