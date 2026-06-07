from pydantic import BaseModel
from typing import Optional


class KRIBase(BaseModel):
    kri_code: Optional[str] = None
    name: str
    category: str = "Cybersecurity"
    owner: Optional[str] = None
    frequency: str = "Monthly"
    current_value: Optional[str] = None
    threshold: Optional[str] = None
    status: str = "Green"
    trend: Optional[str] = None
    measurement_date: Optional[str] = None
    description: Optional[str] = None


class KRICreate(KRIBase):
    pass


class KRIUpdate(BaseModel):
    kri_code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    owner: Optional[str] = None
    frequency: Optional[str] = None
    current_value: Optional[str] = None
    threshold: Optional[str] = None
    status: Optional[str] = None
    trend: Optional[str] = None
    measurement_date: Optional[str] = None
    description: Optional[str] = None


class KRIResponse(KRIBase):
    id: int

    class Config:
        from_attributes = True
