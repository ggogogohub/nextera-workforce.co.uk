from fastapi import APIRouter, Depends, HTTPException
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from datetime import datetime

router = APIRouter()

@router.get("/")
async def get_roles(current_user: dict = Depends(get_current_user)):
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    roles = [
        {"id": "employee", "name": "Employee", "description": "Standard employee access"},
        {"id": "manager", "name": "Manager", "description": "Team management access"},
        {"id": "administrator", "name": "Administrator", "description": "Full system access"}
    ]
    
    return {"roles": roles}

@router.get("/permissions")
async def get_role_permissions(current_user: dict = Depends(get_current_user)):
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    permissions = {
        "employee": [
            "view_own_schedule",
            "request_time_off",
            "view_own_messages",
            "update_own_profile"
        ],
        "manager": [
            "view_own_schedule",
            "view_team_schedules",
            "approve_time_off",
            "send_messages",
            "view_team_analytics",
            "manage_team_members"
        ],
        "administrator": [
            "view_all_schedules",
            "manage_all_users",
            "approve_all_time_off",
            "send_announcements",
            "view_all_analytics",
            "manage_system_settings"
        ]
    }
    
    return {"permissions": permissions}

@router.put("/{user_id}/role")
async def update_user_role(
    user_id: str,
    role_data: dict,
    current_user: dict = Depends(get_current_user)
):
    # Check permissions
    if current_user.get("role") != "administrator":
        raise HTTPException(403, "Only administrators can change user roles")
    
    db = get_db()
    
    new_role = role_data.get("role")
    if new_role not in ["employee", "manager", "administrator"]:
        raise HTTPException(400, "Invalid role")
    
    try:
        from bson import ObjectId
        oid = ObjectId(user_id)
    except:
        raise HTTPException(400, "Invalid user ID")
    
    user = await db["users"].find_one({"_id": oid})
    if not user:
        raise HTTPException(404, "User not found")
    
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {"role": new_role, "updatedAt": datetime.utcnow()}}
    )
    
    log_event("role_updated", {
        "user_id": user_id,
        "old_role": user.get("role"),
        "new_role": new_role,
        "updated_by": str(current_user["_id"])
    })
    
    return {"message": "Role updated successfully"}
