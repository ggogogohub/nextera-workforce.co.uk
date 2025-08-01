from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime

class EmergencyContact(BaseModel):
    name: str
    relationship: str
    phoneNumber: str

class AvailabilityPattern(BaseModel):
    dayOfWeek: int  # 0-6 (Sunday-Saturday)
    startTime: str  # HH:mm format
    endTime: str    # HH:mm format
    isAvailable: bool

class User(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    email: EmailStr
    hashed_password: str
    firstName: str
    lastName: str
    role: str  # 'employee' | 'manager' | 'administrator'
    department: Optional[str] = None
    skills: List[str] = []
    phoneNumber: Optional[str] = None
    emergencyContact: Optional[EmergencyContact] = None
    isActive: bool = True
    createdAt: datetime
    updatedAt: Optional[datetime] = None
    lastLogin: Optional[datetime] = None
    availability: List[AvailabilityPattern] = []

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
