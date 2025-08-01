from pydantic import BaseModel, EmailStr, Field, constr
from typing import Optional, List
from datetime import datetime
from app.models.user import EmergencyContact, AvailabilityPattern

class UserCreate(BaseModel):
    email: EmailStr
    password: constr(min_length=8)
    firstName: str
    lastName: str
    role: str
    department: Optional[str] = None
    skills: List[str] = []
    phoneNumber: Optional[str] = None
    emergencyContact: Optional[EmergencyContact] = None
    availability: List[AvailabilityPattern] = []

class UserUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    department: Optional[str] = None
    skills: Optional[List[str]] = None
    phoneNumber: Optional[str] = None
    emergencyContact: Optional[EmergencyContact] = None
    availability: Optional[List[AvailabilityPattern]] = None
    isActive: Optional[bool] = None # Added isActive for activation/deactivation

class UserOut(BaseModel):
    id: str = Field(..., alias="_id")
    email: str  # Changed from EmailStr to str to support anonymized emails with .local domains
    firstName: str
    lastName: str
    role: str
    department: Optional[str] = None
    skills: List[str] = []
    phoneNumber: Optional[str] = None
    emergencyContact: Optional[EmergencyContact] = None
    isActive: bool
    createdAt: datetime
    updatedAt: Optional[datetime] = None
    lastLogin: Optional[datetime] = None
    availability: List[AvailabilityPattern] = []

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    email: EmailStr
    password: constr(min_length=8)
    firstName: str
    lastName: str
    role: str = "employee"
