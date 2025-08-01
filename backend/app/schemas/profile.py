from pydantic import BaseModel, EmailStr

class ProfileUpdate(BaseModel):
    full_name: str
    email: str  # Changed from EmailStr to str to support anonymized emails
