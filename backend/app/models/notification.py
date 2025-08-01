from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, Any
from bson import ObjectId # Import ObjectId

# Helper for ObjectId validation/serialization if needed directly in model
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v, field):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, field_schema):
        field_schema.update(type="string")


class Notification(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    userId: PyObjectId # Reference to the User's ObjectId
    title: str = Field(..., max_length=100)
    message: str = Field(..., max_length=500)
    type: str = Field(default="info", max_length=50) # e.g., "info", "alert", "approval_request", "schedule_update"
    isRead: bool = Field(default=False)
    link: Optional[str] = Field(default=None, max_length=255) # Optional URL to navigate to
    payload: Optional[dict[str, Any]] = Field(default=None) # For any additional structured data
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: Optional[datetime] = Field(default=None)

    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda dt: dt.isoformat()
        }
        # If you want to allow arbitrary types for payload, though dict[str, Any] is usually fine
        # arbitrary_types_allowed = True
