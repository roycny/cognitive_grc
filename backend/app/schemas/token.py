from pydantic import BaseModel
from typing import Optional


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class TokenRefreshResponse(BaseModel):
    # Tokens are only present for non-cookie API clients (refresh token supplied
    # in the request body). Browser clients receive tokens via httpOnly cookies
    # exclusively, so script-injected code can never read them from the response.
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class UserLink(BaseModel):
    username: str
    role: str
