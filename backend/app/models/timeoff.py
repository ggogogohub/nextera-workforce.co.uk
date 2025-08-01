from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class TimeOffModel(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    employee_id: str
    start: datetime
    end: datetime
    reason: str
    status: str
    created_at: datetime
    updated_at: Optional[datetime]
