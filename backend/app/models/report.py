from pydantic import BaseModel
from datetime import datetime

class AdherenceReport(BaseModel):
    employee_id: str
    scheduled_hours: float
    actual_hours: float
    period_start: datetime
    period_end: datetime

class HoursHistory(BaseModel):
    employee_id: str
    date: datetime
    hours: float
