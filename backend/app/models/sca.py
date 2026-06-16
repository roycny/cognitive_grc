from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func

from app.database import Base


class SCAReport(Base):
    """A saved Software Composition Analysis report (scan results + AI triage)."""

    __tablename__ = "sca_reports"

    id = Column(Integer, primary_key=True, index=True)
    app_name = Column(String, nullable=False)
    risk_level = Column(String, nullable=False)
    summary = Column(Text, nullable=True)
    scan_results = Column(JSON, nullable=False)
    recommendations = Column(JSON, nullable=False)
    findings = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
