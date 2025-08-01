from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.schemas.user import UserOut

class TimeOffCreate(BaseModel):
    startDate: str  # YYYY-MM-DD format
    endDate: str    # YYYY-MM-DD format
    reason: str
    type: str  # 'vacation' | 'sick' | 'personal' | 'emergency' | 'other'

class TimeOffUpdate(BaseModel):
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    reason: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None # Added status field

class TimeOffReview(BaseModel):
    status: str  # 'approved' | 'rejected'
    notes: Optional[str] = None

class TimeOffOut(BaseModel):
    id: str = Field(..., alias="_id")
    employeeId: str
    employee: Optional[UserOut] = None
    startDate: str
    endDate: str
    reason: str
    type: str
    status: str  # 'pending' | 'approved' | 'rejected' | 'cancelled'
    submittedAt: datetime
    reviewedAt: Optional[datetime] = None
    reviewedBy: Optional[str] = None
    reviewerNotes: Optional[str] = None
    totalDays: int

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
