from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from app.schemas.notification import NotificationOut, PaginatedNotificationsResponse # Removed NotificationMarkReadRequest for now
from app.models.notification import Notification # Import the Pydantic model for DB interaction
from app.db import get_db
from app.utils.auth import get_current_user
from bson import ObjectId
from datetime import datetime

router = APIRouter(
    # prefix="/notifications", # Removed prefix here, it's handled in main.py
    tags=["notifications"]
)

@router.get("", response_model=PaginatedNotificationsResponse)
async def get_user_notifications(
    current_user: dict = Depends(get_current_user),
    db: any = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100), # Default limit back to 20, frontend can override
    unread_only: Optional[bool] = Query(None) # Reverted to Optional[bool]
):
    user_id = ObjectId(current_user["_id"])
    
    query = {"userId": user_id}
    if unread_only is True: # Standard boolean check
        query["isRead"] = False
    elif unread_only is False:
        query["isRead"] = True
    # If unread_only is None, fetch all

    total_notifications = await db.notifications.count_documents(query)
    unread_count = await db.notifications.count_documents({"userId": user_id, "isRead": False})
    
    skip = (page - 1) * limit
    notifications_cursor = db.notifications.find(query).sort("createdAt", -1).skip(skip).limit(limit)
    
    notifications_list = []
    async for notif_doc in notifications_cursor:
        notif_doc["id"] = str(notif_doc["_id"])
        notif_doc["userId"] = str(notif_doc["userId"])
        notifications_list.append(NotificationOut(**notif_doc))
        
    return PaginatedNotificationsResponse(
        items=notifications_list,
        total=total_notifications,
        page=page,
        limit=limit,
        totalPages=(total_notifications + limit - 1) // limit,
        unreadCount=unread_count
    )

@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_as_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db: any = Depends(get_db)
):
    user_id = ObjectId(current_user["_id"])
    
    if not ObjectId.is_valid(notification_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid notification ID format")
    
    notif_object_id = ObjectId(notification_id)

    updated_notification = await db.notifications.find_one_and_update(
        {"_id": notif_object_id, "userId": user_id},
        {"$set": {"isRead": True, "updatedAt": datetime.utcnow()}},
        return_document=True # Use pymongo.ReturnDocument.AFTER if available, else re-fetch
    )
    
    if not updated_notification:
        # Re-fetch to check if it exists but belongs to another user, or doesn't exist
        existing_notif = await db.notifications.find_one({"_id": notif_object_id})
        if not existing_notif:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
        # If it exists but userId doesn't match (though query should prevent this unless race condition)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this notification")

    updated_notification["id"] = str(updated_notification["_id"])
    updated_notification["userId"] = str(updated_notification["userId"])
    return NotificationOut(**updated_notification)


@router.post("/mark-all-read", status_code=status.HTTP_200_OK)
async def mark_all_notifications_as_read(
    current_user: dict = Depends(get_current_user),
    db: any = Depends(get_db)
):
    user_id = ObjectId(current_user["_id"])
    
    result = await db.notifications.update_many(
        {"userId": user_id, "isRead": False},
        {"$set": {"isRead": True, "updatedAt": datetime.utcnow()}}
    )
    
    return {"message": f"{result.modified_count} notifications marked as read."}
