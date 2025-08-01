from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class Location(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str  # "Main Store", "North Branch", etc.
    address: str
    coordinates: dict  # {"lat": 40.7128, "lng": -74.0060}
    radius_meters: int = Field(default=100)  # Geofence radius (default: 100m)
    is_active: bool = Field(default=True)
    created_by: str  # admin user ID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class LocationCreate(BaseModel):
    name: str
    address: str
    coordinates: dict  # {"lat": float, "lng": float}
    radius_meters: int = Field(default=100, ge=10, le=1000)  # 10m to 1km radius

class LocationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    coordinates: Optional[dict] = None
    radius_meters: Optional[int] = Field(None, ge=10, le=1000)
    is_active: Optional[bool] = None 