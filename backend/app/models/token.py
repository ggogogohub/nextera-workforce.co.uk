from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class RefreshToken(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    token_id: str  # jti from JWT
    token_hash: str  # hashed version of the token for security
    expires_at: datetime
    created_at: datetime
    is_revoked: bool = False
    device_info: Optional[str] = None
    ip_address: Optional[str] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class BlacklistedToken(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    token_id: str  # jti from JWT
    token_type: str  # "access" or "refresh"
    user_id: str
    blacklisted_at: datetime
    expires_at: datetime  # when the original token would have expired
    reason: str  # "logout", "refresh", "security", etc.

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
