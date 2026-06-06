from sqlalchemy import Column, Integer, String, Text
from app.database import Base


class Issue(Base):
    """A tracked governance / risk / compliance issue or finding.

    Dates are stored as ISO-8601 strings ("YYYY-MM-DD") to match the
    frontend's native <input type="date"> values.
    """

    __tablename__ = "issues"

    id = Column(Integer, primary_key=True, index=True)
    issue_number = Column(String, nullable=True, index=True)
    issue_type = Column(String, nullable=False, default="Business")  # Business | Audit | Regulatory | External
    name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Open", index=True)  # Open | Closed | Accepted | Validation
    risk_rating = Column(String, nullable=False, default="Moderate")  # High | Medium-High | Moderate | Medium-Low | Low
    owner = Column(String, nullable=True)

    identified_date = Column(String, nullable=True)
    target_date = Column(String, nullable=True)

    description = Column(Text, nullable=True)
    remediation_plan = Column(Text, nullable=True)
