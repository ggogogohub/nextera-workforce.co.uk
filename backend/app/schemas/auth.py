from pydantic import BaseModel, EmailStr, constr
from typing import Optional
from app.schemas.user import UserOut

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: UserOut

class TokenResponse(BaseModel):
    user: UserOut
    token: str  # Frontend expects this field name
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    email: EmailStr
    password: constr(min_length=8)
    firstName: str
    lastName: str
    role: str = "employee"

class PasswordReset(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    password: constr(min_length=8)
