from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from app.schemas.user import UserOut
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.get("/")
async def get_teams(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    # Get departments (teams), excluding anonymized users
    departments = await db["users"].distinct("department", {
        "role": {"$in": ["employee", "manager"]},
        "isActive": True,
        "anonymized": {"$ne": True}
    })
    
    teams = []
    for dept in departments:
        if dept:
            # Get team members, excluding anonymized users
            members = await db["users"].find({
                "department": dept,
                "role": {"$in": ["employee", "manager"]},
                "isActive": True,
                "anonymized": {"$ne": True}
            }).to_list(None)
            
            # Convert to UserOut format
            team_members = []
            for member in members:
                member["id"] = str(member["_id"])
                team_members.append(UserOut(**member))
            
            # Find team manager
            manager = next((m for m in team_members if m.role == "manager"), None)
            
            teams.append({
                "id": dept.lower().replace(" ", "_"),
                "name": dept,
                "department": dept,
                "manager": manager,
                "members": team_members,
                "memberCount": len(team_members)
            })
    
    # Apply pagination
    total = len(teams)
    start = (page - 1) * limit
    end = start + limit
    paginated_teams = teams[start:end]
    
    return {
        "items": paginated_teams,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": (total + limit - 1) // limit
    }

@router.get("/{team_id}")
async def get_team(
    team_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    # Convert team_id back to department name
    department = team_id.replace("_", " ").title()
    
    # Get team members, excluding anonymized users
    members = await db["users"].find({
        "department": department,
        "role": {"$in": ["employee", "manager"]},
        "isActive": True,
        "anonymized": {"$ne": True}
    }).to_list(None)
    
    if not members:
        raise HTTPException(404, "Team not found")
    
    # Convert to UserOut format
    team_members = []
    for member in members:
        member["id"] = str(member["_id"])
        team_members.append(UserOut(**member))
    
    # Find team manager
    manager = next((m for m in team_members if m.role == "manager"), None)
    
    # Get team statistics
    today = datetime.utcnow().strftime("%Y-%m-%d")
    team_stats = {
        "scheduledToday": await db["schedules"].count_documents({
            "department": department,
            "date": today
        }),
        "pendingTimeOff": await db["time_off_requests"].count_documents({
            "employeeId": {"$in": [str(m._id) for m in members]},
            "status": "pending"
        })
    }
    
    return {
        "id": team_id,
        "name": department,
        "department": department,
        "manager": manager,
        "members": team_members,
        "memberCount": len(team_members),
        "stats": team_stats
    }

@router.post("/{team_id}/members")
async def add_team_member(
    team_id: str,
    member_data: dict,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    user_id = member_data.get("userId")
    if not user_id:
        raise HTTPException(400, "User ID is required")
    
    try:
        oid = ObjectId(user_id)
    except:
        raise HTTPException(400, "Invalid user ID")
    
    user = await db["users"].find_one({"_id": oid})
    if not user:
        raise HTTPException(404, "User not found")
    
    # Convert team_id back to department name
    department = team_id.replace("_", " ").title()
    
    # Update user's department
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {"department": department, "updatedAt": datetime.utcnow()}}
    )
    
    log_event("team_member_added", {
        "team_id": team_id,
        "user_id": user_id,
        "added_by": str(current_user["_id"])
    })
    
    return {"message": "Team member added successfully"}

@router.delete("/{team_id}/members/{user_id}")
async def remove_team_member(
    team_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    try:
        oid = ObjectId(user_id)
    except:
        raise HTTPException(400, "Invalid user ID")
    
    user = await db["users"].find_one({"_id": oid})
    if not user:
        raise HTTPException(404, "User not found")
    
    # Remove user from department
    await db["users"].update_one(
        {"_id": oid},
        {"$unset": {"department": ""}, "$set": {"updatedAt": datetime.utcnow()}}
    )
    
    log_event("team_member_removed", {
        "team_id": team_id,
        "user_id": user_id,
        "removed_by": str(current_user["_id"])
    })
    
    return {"message": "Team member removed successfully"}

@router.get("/{team_id}/schedule")
async def get_team_schedule(
    team_id: str,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    # Convert team_id back to department name
    department = team_id.replace("_", " ").title()
    
    # Set default date to today if not provided
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Get team schedule
    schedules = await db["schedules"].find({
        "department": department,
        "date": date
    }).to_list(None)
    
    # Populate employee data
    for schedule in schedules:
        employee = await db["users"].find_one({"_id": ObjectId(schedule["employeeId"])})
        if employee:
            employee["id"] = str(employee["_id"])
            schedule["employee"] = UserOut(**employee)
        schedule["id"] = str(schedule["_id"])
    
    return {"schedules": schedules}
