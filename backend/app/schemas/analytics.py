from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime
from app.schemas.user import UserOut

class StaffingPatternDay(BaseModel):
    day: str
    shifts: int

class StaffingPatternHour(BaseModel):
    hour: str
    shifts: int

class StaffingPatternsOut(BaseModel):
    byDayOfWeek: List[StaffingPatternDay]
    byHourOfDay: List[StaffingPatternHour]

class DepartmentMetricOut(BaseModel):
    department: str
    employeeCount: int
    scheduledHours: float
    actualHours: float
    utilizationRate: float

class ActivityLogOut(BaseModel):
    id: str = Field(..., alias="_id")
    userId: str
    user: UserOut
    action: str
    details: Optional[dict] = None
    timestamp: datetime
    ipAddress: Optional[str] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class WorkforceMetricsOut(BaseModel):
    totalEmployees: int
    activeEmployees: int
    scheduledHours: float
    actualHours: float
    utilizationRate: float
    attendanceRate: float
    overtimeHours: float
    departmentBreakdown: List[DepartmentMetricOut]
    recentActivity: List[ActivityLogOut]
    staffingPatterns: StaffingPatternsOut
