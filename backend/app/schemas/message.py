from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.schemas.user import UserOut

class MessageAcknowledgment(BaseModel):
    userId: str
    user: UserOut
    acknowledgedAt: datetime

class MessageCreate(BaseModel):
    recipientId: Optional[str] = None
    departmentId: Optional[str] = None
    subject: str
    content: str
    type: str = "direct"  # 'direct' | 'announcement' | 'system' | 'emergency'
    priority: str = "normal"  # 'low' | 'normal' | 'high' | 'urgent'
    requiresAcknowledgment: bool = False

class MessageUpdate(BaseModel):
    subject: Optional[str] = None
    content: Optional[str] = None
    priority: Optional[str] = None

class MessageOut(BaseModel):
    id: str = Field(..., alias="_id")
    senderId: str
    sender: UserOut
    recipientId: Optional[str] = None
    recipient: Optional[UserOut] = None
    departmentId: Optional[str] = None
    subject: str
    content: str
    type: str
    priority: str
    isRead: bool
    sentAt: datetime
    readAt: Optional[datetime] = None
    requiresAcknowledgment: bool
    acknowledgments: List[MessageAcknowledgment] = []

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
