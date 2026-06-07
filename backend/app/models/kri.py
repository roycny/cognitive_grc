from sqlalchemy import Column, Integer, String, Text
from app.database import Base


class KRI(Base):
    """A Key Risk Indicator tracked in the KRI register.

    Values and dates are stored as strings to match the rest of the app
    (dates are ISO-8601 "YYYY-MM-DD"); ``status`` drives the RAG pill.
    """

    __tablename__ = "kris"

    id = Column(Integer, primary_key=True, index=True)
    kri_code = Column(String, nullable=True, index=True)        # e.g. "KRI-001"
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, default="Cybersecurity", index=True)
    owner = Column(String, nullable=True)
    frequency = Column(String, nullable=False, default="Monthly")  # Daily | Weekly | Monthly | Quarterly

    current_value = Column(String, nullable=True)   # e.g. "99.95%", "3", "12 days"
    threshold = Column(String, nullable=True)       # risk-appetite limit, e.g. "≥ 99.9%", "≤ 5"
    status = Column(String, nullable=False, default="Green", index=True)  # Green | Amber | Red
    trend = Column(String, nullable=True)           # Improving | Stable | Worsening
    measurement_date = Column(String, nullable=True)

    description = Column(Text, nullable=True)
