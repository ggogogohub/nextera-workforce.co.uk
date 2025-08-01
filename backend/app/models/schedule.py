from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class Schedule(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    employeeId: str
    employee: Optional[dict] = None  # Will be populated with User data
    date: str  # YYYY-MM-DD format
    startTime: str  # HH:mm format
    endTime: str  # HH:mm format
    location: str
    role: str
    department: str
    status: str  # 'scheduled' | 'confirmed' | 'completed' | 'missed' | 'cancelled'
    notes: Optional[str] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
