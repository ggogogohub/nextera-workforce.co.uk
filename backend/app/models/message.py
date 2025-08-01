from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class MessageModel(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    sender_id: str
    recipient_id: str
    content: str
    timestamp: datetime
    read: bool = False
