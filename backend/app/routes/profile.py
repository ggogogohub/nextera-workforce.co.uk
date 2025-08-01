from fastapi import APIRouter, Depends, HTTPException
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from app.schemas.user import UserOut, UserUpdate
from app.services.auth_service import hash_password, verify_password
from datetime import datetime

router = APIRouter()

@router.get("/", response_model=UserOut)
async def get_profile(current_user: dict = Depends(get_current_user)):
    current_user["id"] = str(current_user["_id"])
    return UserOut(**current_user)

@router.put("/", response_model=UserOut)
async def update_profile(
    profile_update: UserUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    update_dict = profile_update.dict(exclude_unset=True)
    update_dict["updatedAt"] = datetime.utcnow()
    
    await db["users"].update_one(
        {"_id": current_user["_id"]},
        {"$set": update_dict}
    )
    
    updated_user = await db["users"].find_one({"_id": current_user["_id"]})
    log_event("profile_updated", {"user_id": str(current_user["_id"])})
    
    updated_user["id"] = str(updated_user["_id"])
    return UserOut(**updated_user)

@router.post("/change-password")
async def change_password(
    password_data: dict,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    current_password = password_data.get("currentPassword")
    new_password = password_data.get("newPassword")
    
    if not current_password or not new_password:
        raise HTTPException(400, "Current password and new password are required")
    
    # Verify current password
    if not verify_password(current_password, current_user["hashed_password"]):
        raise HTTPException(400, "Current password is incorrect")
    
    # Validate new password
    if len(new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters long")
    
    # Hash new password
    hashed_new_password = hash_password(new_password)
    
    # Update password
    await db["users"].update_one(
        {"_id": current_user["_id"]},
        {"$set": {
            "hashed_password": hashed_new_password,
            "updatedAt": datetime.utcnow()
        }}
    )
    
    log_event("password_changed", {"user_id": str(current_user["_id"])})
    
    return {"message": "Password changed successfully"}

@router.get("/activity")
async def get_profile_activity(current_user: dict = Depends(get_current_user)):
    db = get_db()
    
    # Get recent activity for current user
    activity = await db["activity_logs"].find({
        "userId": str(current_user["_id"])
    }).sort("timestamp", -1).limit(20).to_list(None)
    
    # Format activity data
    formatted_activity = []
    for log in activity:
        formatted_activity.append({
            "id": str(log["_id"]),
            "action": log["action"],
            "details": log.get("details", {}),
            "timestamp": log["timestamp"],
            "ipAddress": log.get("ipAddress")
        })
    
    return {"activity": formatted_activity}

@router.get("/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user)):
    # Get user preferences (mock data for now)
    preferences = {
        "notifications": {
            "email": True,
            "push": True,
            "scheduleReminders": True,
            "timeOffUpdates": True
        },
        "display": {
            "theme": "light",
            "language": "en",
            "timezone": "UTC"
        },
        "privacy": {
            "profileVisibility": "team",
            "showAvailability": True
        }
    }
    
    return {"preferences": preferences}

@router.put("/preferences")
async def update_preferences(
    preferences_data: dict,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Update user preferences
    await db["users"].update_one(
        {"_id": current_user["_id"]},
        {"$set": {
            "preferences": preferences_data,
            "updatedAt": datetime.utcnow()
        }}
    )
    
    log_event("preferences_updated", {"user_id": str(current_user["_id"])})
    
    return {"message": "Preferences updated successfully"}

@router.get("/stats")
async def get_profile_stats(current_user: dict = Depends(get_current_user)):
    db = get_db()
    
    # Calculate user statistics
    today = datetime.utcnow().strftime("%Y-%m-%d")
    this_month_start = datetime.utcnow().replace(day=1).strftime("%Y-%m-%d")
    
    stats = {
        "totalShifts": await db["schedules"].count_documents({
            "employeeId": str(current_user["_id"])
        }),
        "completedShifts": await db["schedules"].count_documents({
            "employeeId": str(current_user["_id"]),
            "status": "completed"
        }),
        "thisMonthShifts": await db["schedules"].count_documents({
            "employeeId": str(current_user["_id"]),
            "date": {"$gte": this_month_start}
        }),
        "timeOffRequests": await db["time_off_requests"].count_documents({
            "employeeId": str(current_user["_id"])
        }),
        "approvedTimeOff": await db["time_off_requests"].count_documents({
            "employeeId": str(current_user["_id"]),
            "status": "approved"
        })
    }
    
    # Calculate hours worked this month
    month_schedules = await db["schedules"].find({
        "employeeId": str(current_user["_id"]),
        "date": {"$gte": this_month_start},
        "status": "completed"
    }).to_list(None)
    
    hours_this_month = 0
    for schedule in month_schedules:
        start_time = datetime.strptime(schedule["startTime"], "%H:%M")
        end_time = datetime.strptime(schedule["endTime"], "%H:%M")
        hours = (end_time - start_time).seconds / 3600
        hours_this_month += hours
    
    stats["hoursThisMonth"] = hours_this_month
    
    return {"stats": stats}
