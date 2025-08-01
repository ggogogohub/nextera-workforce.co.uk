from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.schemas.analytics import WorkforceMetricsOut, ActivityLogOut, DepartmentMetricOut
from app.schemas.user import UserOut
from app.db import get_db
from app.utils.auth import get_current_user
from bson import ObjectId
from datetime import datetime, timedelta
from collections import defaultdict

router = APIRouter()

@router.get("/workforce", response_model=WorkforceMetricsOut)
async def get_workforce_metrics(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    # Set default date range if not provided
    if not endDate:
        end_date = datetime.utcnow()
    else:
        end_date = datetime.fromisoformat(endDate)
    
    if not startDate:
        start_date = end_date - timedelta(days=30)
    else:
        start_date = datetime.fromisoformat(startDate)
    
    # Get total and active employees (include all roles)
    total_employees = await db["users"].count_documents({"role": {"$in": ["employee", "manager", "administrator"]}})
    active_employees = await db["users"].count_documents({
        "role": {"$in": ["employee", "manager", "administrator"]},
        "isActive": True
    })
    
    # Get scheduled hours in date range
    scheduled_hours = 0
    schedules = await db["schedules"].find({
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lte": end_date.strftime("%Y-%m-%d")
        }
    }).to_list(None)
    
    for schedule in schedules:
        start_time = datetime.strptime(schedule["startTime"], "%H:%M")
        end_time = datetime.strptime(schedule["endTime"], "%H:%M")
        hours = (end_time - start_time).seconds / 3600
        scheduled_hours += hours
    
    # Calculate actual hours (for now, assume 95% of scheduled)
    actual_hours = round(scheduled_hours * 0.95, 1)
    
    # Calculate utilization and attendance rates
    utilization_rate = round((actual_hours / scheduled_hours * 100), 1) if scheduled_hours > 0 else 0
    attendance_rate = 95.0  # Mock data
    
    # Calculate overtime hours (mock data) - more realistic calculation
    overtime_hours = round(max(0, actual_hours - (active_employees * 40)), 1)  # Assume 40-hour work week
    
    # Get department breakdown (include all roles)
    departments = await db["users"].distinct("department", {"role": {"$in": ["employee", "manager", "administrator"]}})
    department_breakdown = []
    
    # If no departments found, create a default "General" department
    if not departments:
        departments = ["General"]
    
    for dept in departments:
        if dept:
            dept_employees = await db["users"].count_documents({
                "department": dept,
                "role": {"$in": ["employee", "manager", "administrator"]},
                "isActive": True
            })
            
            # Get department scheduled hours
            dept_scheduled = 0
            dept_schedules = await db["schedules"].find({
                "department": dept,
                "date": {
                    "$gte": start_date.strftime("%Y-%m-%d"),
                    "$lte": end_date.strftime("%Y-%m-%d")
                }
            }).to_list(None)
            
            for schedule in dept_schedules:
                start_time = datetime.strptime(schedule["startTime"], "%H:%M")
                end_time = datetime.strptime(schedule["endTime"], "%H:%M")
                hours = (end_time - start_time).seconds / 3600
                dept_scheduled += hours
            
            # If no schedules found for department, estimate based on employee count
            if dept_scheduled == 0 and dept_employees > 0:
                dept_scheduled = dept_employees * 40  # Assume 40 hours per employee per week
            
            dept_actual = round(dept_scheduled * 0.95, 1)
            dept_utilization = round((dept_actual / dept_scheduled * 100), 1) if dept_scheduled > 0 else 0
            
            department_breakdown.append(DepartmentMetricOut(
                department=dept,
                employeeCount=dept_employees,
                scheduledHours=round(dept_scheduled, 1),
                actualHours=dept_actual,
                utilizationRate=dept_utilization
            ))
    
    # Get recent activity
    recent_activity = await db["activity_logs"].find().sort("timestamp", -1).limit(10).to_list(None)
    activity_list = []
    
    for activity in recent_activity:
        user = await db["users"].find_one({"_id": ObjectId(activity["userId"])})
        if user:
            user["id"] = str(user["_id"])
            activity["user"] = UserOut(**user)
            activity["id"] = str(activity["_id"])
            activity_list.append(ActivityLogOut(**activity))
    
    # Staffing Patterns Analysis
    # Analyze a larger dataset for more meaningful patterns, e.g., last 90 days
    pattern_start_date = end_date - timedelta(days=90)
    pattern_schedules = await db["schedules"].find({
        "date": {"$gte": pattern_start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")}
    }).to_list(None)

    hourly_staffing = defaultdict(int)
    daily_staffing = defaultdict(int)

    for schedule in pattern_schedules:
        schedule_date = datetime.strptime(schedule["date"], "%Y-%m-%d")
        day_of_week = schedule_date.strftime('%A') # Monday, Tuesday, etc.
        daily_staffing[day_of_week] += 1

        start_hour = int(schedule["startTime"][:2])
        end_hour = int(schedule["endTime"][:2])
        
        # Handle overnight shifts
        if end_hour < start_hour:
            for hour in range(start_hour, 24):
                hourly_staffing[hour] += 1
            for hour in range(0, end_hour):
                hourly_staffing[hour] += 1
        else:
            for hour in range(start_hour, end_hour):
                hourly_staffing[hour] += 1

    # Format staffing patterns for response
    staffing_patterns = {
        "byDayOfWeek": [{"day": day, "shifts": count} for day, count in daily_staffing.items()],
        "byHourOfDay": [{"hour": f"{h:02d}:00", "shifts": count} for h, count in hourly_staffing.items()]
    }
    
    return WorkforceMetricsOut(
        totalEmployees=total_employees,
        activeEmployees=active_employees,
        scheduledHours=scheduled_hours,
        actualHours=actual_hours,
        utilizationRate=utilization_rate,
        attendanceRate=attendance_rate,
        overtimeHours=overtime_hours,
        departmentBreakdown=department_breakdown,
        recentActivity=activity_list,
        staffingPatterns=staffing_patterns
    )

@router.get("/schedule-adherence")
async def get_schedule_adherence(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    employeeId: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    # Set default date range
    if not endDate:
        end_date = datetime.utcnow()
    else:
        end_date = datetime.fromisoformat(endDate)
    
    if not startDate:
        start_date = end_date - timedelta(days=7)
    else:
        start_date = datetime.fromisoformat(startDate)
    
    # Build filter
    filter_dict = {
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lte": end_date.strftime("%Y-%m-%d")
        }
    }
    
    if employeeId:
        filter_dict["employeeId"] = employeeId
    
    # Get schedules and calculate adherence
    schedules = await db["schedules"].find(filter_dict).to_list(None)
    
    adherence_data = {
        "totalSchedules": len(schedules),
        "completedSchedules": 0,
        "missedSchedules": 0,
        "adherenceRate": 0,
        "byEmployee": {},
        "byDepartment": {}
    }
    
    for schedule in schedules:
        if schedule["status"] == "completed":
            adherence_data["completedSchedules"] += 1
        elif schedule["status"] == "missed":
            adherence_data["missedSchedules"] += 1
    
    if adherence_data["totalSchedules"] > 0:
        adherence_data["adherenceRate"] = (
            adherence_data["completedSchedules"] / adherence_data["totalSchedules"] * 100
        )
    
    return adherence_data

@router.get("/activity", response_model=dict)
async def get_activity_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    userId: Optional[str] = None,
    action: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    # Build filter
    filter_dict = {}
    if userId:
        filter_dict["userId"] = userId
    if action:
        filter_dict["action"] = {"$regex": action, "$options": "i"}
    if startDate and endDate:
        filter_dict["timestamp"] = {
            "$gte": datetime.fromisoformat(startDate),
            "$lte": datetime.fromisoformat(endDate)
        }
    
    # Get total count
    total = await db["activity_logs"].count_documents(filter_dict)
    
    # Get paginated results
    skip = (page - 1) * limit
    logs_cursor = db["activity_logs"].find(filter_dict).skip(skip).limit(limit).sort("timestamp", -1)
    logs = await logs_cursor.to_list(None)
    
    # Convert to ActivityLogOut format
    log_list = []
    for log in logs:
        user = await db["users"].find_one({"_id": ObjectId(log["userId"])})
        if user:
            user["id"] = str(user["_id"])
            log["user"] = UserOut(**user)
            log["id"] = str(log["_id"])
            log_list.append(ActivityLogOut(**log))
    
    return {
        "items": log_list,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": (total + limit - 1) // limit
    }

@router.get("/dashboard-stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    db = get_db()
    
    # Get basic stats for dashboard
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    stats = {
        "todaySchedules": await db["schedules"].count_documents({"date": today}),
        "pendingTimeOff": await db["time_off_requests"].count_documents({"status": "pending"}),
        "unreadMessages": await db["messages"].count_documents({
            f"readBy.{str(current_user['_id'])}": {"$exists": False},
            "$or": [
                {"recipientId": str(current_user["_id"])},
                {"departmentId": current_user.get("department")},
                {"type": "announcement"}
            ]
        }),
        "activeEmployees": await db["users"].count_documents({
            "role": {"$in": ["employee", "manager"]},
            "isActive": True
        })
    }
    
    return stats
