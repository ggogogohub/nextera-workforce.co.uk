from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from app.schemas.user import UserOut

class ScheduleCreate(BaseModel):
    employeeId: str
    date: str  # YYYY-MM-DD format
    startTime: str  # HH:mm format
    endTime: str  # HH:mm format
    location: str
    role: str
    department: str
    notes: Optional[str] = None

class ScheduleUpdate(BaseModel):
    date: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    location: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class ScheduleOut(BaseModel):
    id: str = Field(..., alias="_id")
    employeeId: str
    employee: Optional[UserOut] = None
    date: str
    startTime: str
    endTime: str
    location: str
    role: str
    department: str
    status: str
    notes: Optional[str] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ScheduleGenerate(BaseModel):
    constraintsId: str
    startDate: str
    endDate: str
