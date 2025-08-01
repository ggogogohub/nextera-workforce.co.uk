from fastapi import APIRouter, Depends
from app.db import get_db
from app.utils.auth import get_current_user
from bson import ObjectId
from datetime import datetime, timedelta

router = APIRouter()

# ---------------------------------------------------------------------------
# New unified endpoint for front-end convenience
# GET /api/dashboard → {
#     "stats": {...},
#     "recentActivity": [...],
#     "upcomingShifts": [...]
# }
# ---------------------------------------------------------------------------

@router.get("/")
@router.get("")
async def get_dashboard_home(current_user: dict = Depends(get_current_user)):
    """Return everything the UI needs for the dashboard in one network round-trip.

    This avoids N parallel requests from the browser and also keeps backward
    compatibility with the older front-end that expected /api/dashboard (with no
    extra suffix) to exist.
    """
    # Re-use existing handler logic – no code duplication.
    stats = await get_dashboard_stats(current_user)  # type: ignore
    recent_activity = await get_recent_activity(current_user)  # type: ignore
    upcoming_shifts = await get_upcoming_shifts(current_user)  # type: ignore

    return {
        "stats": stats,
        **recent_activity,        # {"activity": [...]}
        **upcoming_shifts         # {"shifts":   [...]}
    }

@router.get("/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    db = get_db()
    
    today = datetime.utcnow().strftime("%Y-%m-%d")
    this_week_start = (datetime.utcnow() - timedelta(days=datetime.utcnow().weekday())).strftime("%Y-%m-%d")
    
    if current_user.get("role") == "employee":
        # Employee dashboard stats
        stats = {
            "upcomingShifts": await db["schedules"].count_documents({
                "employeeId": str(current_user["_id"]),
                "date": {"$gte": today},
                "status": {"$in": ["scheduled", "confirmed"]}
            }),
            "hoursThisWeek": 0,  # Calculate from schedules
            "pendingRequests": await db["time_off_requests"].count_documents({
                "employeeId": str(current_user["_id"]),
                "status": "pending"
            }),
            "unreadMessages": await db["messages"].count_documents({
                f"readBy.{str(current_user['_id'])}": {"$exists": False},
                "$or": [
                    {"recipientId": str(current_user["_id"])},
                    {"departmentId": current_user.get("department")},
                    {"type": "announcement"}
                ]
            })
        }
        
        # Calculate hours this week
        week_schedules = await db["schedules"].find({
            "employeeId": str(current_user["_id"]),
            "date": {"$gte": this_week_start, "$lte": today}
        }).to_list(None)
        
        hours_this_week = 0
        for schedule in week_schedules:
            start_time = datetime.strptime(schedule["startTime"], "%H:%M")
            end_time = datetime.strptime(schedule["endTime"], "%H:%M")
            hours = (end_time - start_time).seconds / 3600
            hours_this_week += hours
        
        stats["hoursThisWeek"] = hours_this_week
        
    else:
        # Manager/Admin dashboard stats
        stats = {
            "totalEmployees": await db["users"].count_documents({
                "role": {"$in": ["employee", "manager"]},
                "isActive": True
            }),
            "todaySchedules": await db["schedules"].count_documents({"date": today}),
            "pendingTimeOff": await db["time_off_requests"].count_documents({"status": "pending"}),
            "pendingRequests": await db["time_off_requests"].count_documents({"status": "pending"}),
            "attendanceRate": 95.0  # Mock data
        }
    
    return stats

@router.get("/recent-activity")
async def get_recent_activity(current_user: dict = Depends(get_current_user)):
    db = get_db()
    
    # Get recent activity logs
    activity = await db["activity_logs"].find({
        "userId": str(current_user["_id"])
    }).sort("timestamp", -1).limit(5).to_list(None)
    
    return {"activity": activity}

@router.get("/upcoming-shifts")
async def get_upcoming_shifts(current_user: dict = Depends(get_current_user)):
    db = get_db()
    
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Get upcoming shifts for employee
    if current_user.get("role") == "employee":
        shifts = await db["schedules"].find({
            "employeeId": str(current_user["_id"]),
            "date": {"$gte": today},
            "status": {"$in": ["scheduled", "confirmed"]}
        }).sort("date", 1).limit(5).to_list(None)
    else:
        # For managers, get all upcoming shifts
        shifts = await db["schedules"].find({
            "date": {"$gte": today},
            "status": {"$in": ["scheduled", "confirmed"]}
        }).sort("date", 1).limit(10).to_list(None)
    
    # Populate employee data for each shift
    for shift in shifts:
        employee = await db["users"].find_one({"_id": ObjectId(shift["employeeId"])})
        if employee:
            shift["employeeName"] = f"{employee['firstName']} {employee['lastName']}"
        shift["id"] = str(shift["_id"])
    
    return {"shifts": shifts}
