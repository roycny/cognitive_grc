from sqlalchemy import Column, Integer, String, Text
from app.database import Base


class Audit(Base):
    """An audit / exam engagement tracked in the registry.

    Dates are stored as ISO-8601 strings ("YYYY-MM-DD") to match the
    frontend's native <input type="date"> values.
    """

    __tablename__ = "audits"

    id = Column(Integer, primary_key=True, index=True)
    audit_code = Column(String, nullable=True, index=True)
    audit_type = Column(String, nullable=False, default="Internal")  # Internal | External | Regulatory
    title = Column(String, nullable=False)
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    status = Column(String, nullable=False, default="Planning", index=True)

    requests_total = Column(Integer, nullable=False, default=0)
    requests_open = Column(Integer, nullable=False, default=0)
    walkthroughs = Column(Integer, nullable=False, default=0)
    total_findings = Column(Integer, nullable=False, default=0)
    open_findings = Column(Integer, nullable=False, default=0)
    past_due = Column(Integer, nullable=False, default=0)

    key_risks = Column(Text, nullable=True)
    auditor_concerns = Column(Text, nullable=True)
