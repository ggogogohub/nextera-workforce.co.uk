from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ClockEvent(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    employee_id: str
    schedule_id: Optional[str] = None  # Links to specific shift
    event_type: str  # "clock_in" | "clock_out" | "break_start" | "break_end"
    timestamp: datetime
    location_id: str
    gps_coordinates: dict  # {"lat": float, "lng": float}
    distance_from_location: float  # meters
    is_valid: bool  # Within radius and time window
    notes: Optional[str] = None
    created_at: datetime
    
    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ClockEventCreate(BaseModel):
    schedule_id: Optional[str] = None
    event_type: str  # "clock_in" | "clock_out"
    gps_coordinates: dict  # {"lat": float, "lng": float}
    notes: Optional[str] = None

class AttendanceStatus(BaseModel):
    is_clocked_in: bool
    current_shift: Optional[dict] = None
    last_clock_event: Optional[ClockEvent] = None
    total_hours_today: float = 0.0

class AttendanceSummary(BaseModel):
    employee_id: str
    date: str
    clock_in_time: Optional[datetime] = None
    clock_out_time: Optional[datetime] = None
    total_hours: float = 0.0
    break_duration: float = 0.0
    is_complete: bool = False
    location_name: str
    distance_compliance: bool = True 