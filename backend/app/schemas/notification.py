from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Any, List # Added List
from app.models.notification import PyObjectId # Import PyObjectId if it's in the models
                                            # Or define it here if it's a general schema helper

# If PyObjectId is not directly importable or to avoid model dependency,
# you can define a similar string type for IDs in schemas:
# class ObjectIdStr(str):
#     @classmethod
#     def __get_validators__(cls):
#         yield cls.validate
#     @classmethod
#     def validate(cls, v):
#         if not ObjectId.is_valid(v): # Requires bson.ObjectId
#             try: # Try to convert if it's a string representation
#                 ObjectId(v)
#             except:
#                 raise ValueError("Invalid ObjectId string")
#         return str(v)


class NotificationOut(BaseModel):
    id: str # ObjectId will be converted to str
    userId: str # ObjectId will be converted to str
    title: str
    message: str
    type: str
    isRead: bool
    link: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    class Config:
        populate_by_name = True # Allows using alias _id from model if needed, though we map to id
        json_encoders = {
            # ObjectId: str, # No longer needed if model handles PyObjectId to str
            datetime: lambda dt: dt.isoformat()
        }

class NotificationCreate(BaseModel): # For creating notifications
    userId: str # Should be the string representation of User's ObjectId
    title: str
    message: str
    type: str = "info"
    link: Optional[str] = None
    payload: Optional[dict[str, Any]] = None

# For fetching notifications, we might want a paginated response
class PaginatedNotificationsResponse(BaseModel):
    items: List[NotificationOut]
    total: int
    page: int
    limit: int
    totalPages: int
    unreadCount: int # Add unread count

# Request for marking a single notification as read (usually ID is in path)
# No specific body needed, or could be:
# class MarkReadRequest(BaseModel):
#     isRead: bool = True

# Request for marking multiple notifications as read (if needed, though /mark-all-read is simpler)
# class MarkMultipleReadRequest(BaseModel):
#    notification_ids: List[str] # List of string ObjectIds

# The existing NotificationSeenRequest might be for a different purpose or can be removed/updated.
# If it's for marking specific notifications as read by ID:
class NotificationMarkReadRequest(BaseModel):
    notification_ids: List[str] # Assuming IDs are strings (ObjectIds)
