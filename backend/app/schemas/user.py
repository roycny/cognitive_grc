from pydantic import BaseModel, EmailStr, validator
from typing import Optional
from app.models.user import UserRole
import re

def _validate_password_complexity(password: str) -> str:
    """Shared password validation logic."""
    if len(password) < 8:
        raise ValueError('Password must be at least 8 characters long')
    if not re.search(r"[A-Z]", password):
        raise ValueError('Password must contain at least one uppercase letter')
    if not re.search(r"[a-z]", password):
        raise ValueError('Password must contain at least one lowercase letter')
    if not re.search(r"\d", password):
        raise ValueError('Password must contain at least one number')
    return password

class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole = UserRole.VIEWER

class UserCreate(UserBase):
    password: str
    role: UserRole = UserRole.VIEWER

    @validator("password")
    def password_complexity(cls, v):
        return _validate_password_complexity(v)

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    
    class Config:
        from_attributes = True

class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str

    @validator("new_password")
    def password_complexity(cls, v):
        return _validate_password_complexity(v)
