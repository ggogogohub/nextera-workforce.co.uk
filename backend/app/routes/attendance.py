from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from app.models.attendance import ClockEvent, ClockEventCreate, AttendanceStatus, AttendanceSummary
from app.services.location_service import (
    validate_location_proximity, 
    find_nearest_location,
    get_employee_current_shift,
    get_location_for_schedule,
    create_clock_event,
    get_employee_attendance_status,
    calculate_daily_hours
)
from app.services.notification_service import create_notification
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from bson import ObjectId
from datetime import datetime, timedelta

router = APIRouter()

@router.post("/clock-in", response_model=dict)
async def clock_in(
    event_data: ClockEventCreate,
    current_user: dict = Depends(get_current_user)
):
    """Clock in with GPS validation"""
    employee_id = str(current_user["_id"])
    
    try:
        # Check if already clocked in today
        status = await get_employee_attendance_status(employee_id)
        if status.is_clocked_in:
            raise HTTPException(400, "You are already clocked in. Please clock out first.")
        
        # Get current shift if no schedule_id provided
        current_shift = None
        if event_data.schedule_id:
            db = get_db()
            current_shift = await db["schedules"].find_one({"_id": ObjectId(event_data.schedule_id)})
        else:
            current_shift = await get_employee_current_shift(employee_id, datetime.utcnow())
        
        if not current_shift:
            # Allow clock-in without shift but find nearest location
            nearest_result = await find_nearest_location(event_data.gps_coordinates)
            if not nearest_result:
                raise HTTPException(400, "No workplace locations found. Please contact your manager.")
            
            nearest_location, distance = nearest_result
            location_id = nearest_location.id
            is_valid = distance <= nearest_location.radius_meters
            
            if not is_valid:
                raise HTTPException(400, f"You are {round(distance, 1)}m from the nearest location '{nearest_location.name}'. Please get closer (within {nearest_location.radius_meters}m).")
        
        else:
            # Get location for the scheduled shift
            location_id = await get_location_for_schedule(str(current_shift["_id"]))
            if not location_id:
                # Fallback to nearest location
                nearest_result = await find_nearest_location(event_data.gps_coordinates)
                if not nearest_result:
                    raise HTTPException(400, "No workplace locations found. Please contact your manager.")
                
                nearest_location, distance = nearest_result
                location_id = nearest_location.id
                is_valid = distance <= nearest_location.radius_meters
            else:
                # Validate proximity to assigned location
                is_valid, distance, location = await validate_location_proximity(
                    event_data.gps_coordinates, 
                    location_id
                )
        
        # Check time window (allow clock-in 15 minutes early, 30 minutes late)
        if current_shift:
            shift_start = datetime.strptime(f"{current_shift['date']} {current_shift['startTime']}", "%Y-%m-%d %H:%M")
            current_time = datetime.utcnow()
            
            early_threshold = shift_start - timedelta(minutes=15)
            late_threshold = shift_start + timedelta(minutes=30)
            
            if current_time < early_threshold:
                raise HTTPException(400, f"Too early to clock in. Shift starts at {current_shift['startTime']}.")
            
            if current_time > late_threshold:
                # Allow late clock-in but flag it
                await create_notification(
                    user_id=employee_id,
                    title="Late Clock-In",
                    message=f"You clocked in {round((current_time - shift_start).total_seconds() / 60)} minutes late.",
                    type="warning"
                )
        
        # Create clock event
        clock_event = await create_clock_event(
            employee_id=employee_id,
            event_data=event_data,
            location_id=location_id,
            distance=distance,
            is_valid=is_valid
        )
        
        if not clock_event:
            raise HTTPException(500, "Failed to record clock-in event")
        
        # Log the event
        await log_event("employee_clocked_in", {
            "employee_id": employee_id,
            "location_id": location_id,
            "distance_meters": round(distance, 2),
            "is_valid": is_valid,
            "schedule_id": event_data.schedule_id
        })
        
        # Send notification to manager if location is invalid
        if not is_valid:
            # Find managers to notify
            db = get_db()
            managers = await db["users"].find({
                "role": {"$in": ["manager", "administrator"]},
                "isActive": True
            }).to_list(None)
            
            employee_name = f"{current_user['firstName']} {current_user['lastName']}"
            
            for manager in managers:
                await create_notification(
                    user_id=str(manager["_id"]),
                    title="Invalid Clock-In Location",
                    message=f"{employee_name} attempted to clock in from {round(distance, 1)}m away from the required location.",
                    type="alert"
                )
        
        return {
            "success": True,
            "message": "Clock-in successful!" if is_valid else f"Clock-in recorded but you were {round(distance, 1)}m from the location.",
            "clock_event": clock_event.dict(),
            "is_location_valid": is_valid,
            "distance_meters": round(distance, 2)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Clock-in failed: {str(e)}")

@router.post("/clock-out", response_model=dict)
async def clock_out(
    event_data: ClockEventCreate,
    current_user: dict = Depends(get_current_user)
):
    """Clock out with GPS validation"""
    employee_id = str(current_user["_id"])
    
    try:
        # Check if currently clocked in
        status = await get_employee_attendance_status(employee_id)
        if not status.is_clocked_in:
            raise HTTPException(400, "You are not currently clocked in.")
        
        # Use the same location as clock-in
        last_clock_in = status.last_clock_event
        if not last_clock_in or last_clock_in.event_type != "clock_in":
            raise HTTPException(400, "No valid clock-in record found for today.")
        
        location_id = last_clock_in.location_id
        
        # Validate proximity to same location
        is_valid, distance, location = await validate_location_proximity(
            event_data.gps_coordinates, 
            location_id
        )
        
        # Create clock-out event
        event_data.event_type = "clock_out"
        clock_event = await create_clock_event(
            employee_id=employee_id,
            event_data=event_data,
            location_id=location_id,
            distance=distance,
            is_valid=is_valid
        )
        
        if not clock_event:
            raise HTTPException(500, "Failed to record clock-out event")
        
        # Calculate hours worked
        hours_worked = (clock_event.timestamp - last_clock_in.timestamp).total_seconds() / 3600
        
        # Log the event
        await log_event("employee_clocked_out", {
            "employee_id": employee_id,
            "location_id": location_id,
            "distance_meters": round(distance, 2),
            "is_valid": is_valid,
            "hours_worked": round(hours_worked, 2),
            "schedule_id": event_data.schedule_id
        })
        
        # Send notification if location is invalid
        if not is_valid:
            db = get_db()
            managers = await db["users"].find({
                "role": {"$in": ["manager", "administrator"]},
                "isActive": True
            }).to_list(None)
            
            employee_name = f"{current_user['firstName']} {current_user['lastName']}"
            
            for manager in managers:
                await create_notification(
                    user_id=str(manager["_id"]),
                    title="Invalid Clock-Out Location", 
                    message=f"{employee_name} attempted to clock out from {round(distance, 1)}m away from the required location.",
                    type="alert"
                )
        
        return {
            "success": True,
            "message": f"Clock-out successful! You worked {round(hours_worked, 2)} hours." if is_valid else f"Clock-out recorded but you were {round(distance, 1)}m from the location.",
            "clock_event": clock_event.dict(),
            "hours_worked": round(hours_worked, 2),
            "is_location_valid": is_valid,
            "distance_meters": round(distance, 2)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Clock-out failed: {str(e)}")

@router.get("/status", response_model=AttendanceStatus)
async def get_attendance_status(
    current_user: dict = Depends(get_current_user)
):
    """Get current attendance status for the employee"""
    employee_id = str(current_user["_id"])
    return await get_employee_attendance_status(employee_id)

@router.get("/events", response_model=List[ClockEvent])
async def get_attendance_events(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    event_type: Optional[str] = Query(None, description="Event type filter"),
    current_user: dict = Depends(get_current_user)
):
    """Get attendance events for the current user"""
    db = get_db()
    employee_id = str(current_user["_id"])
    
    # Build date filter
    filter_dict = {"employee_id": employee_id}
    
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = datetime.strptime(start_date, "%Y-%m-%d")
        if end_date:
            # Include the entire end date
            end_datetime = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            date_filter["$lte"] = end_datetime
        filter_dict["timestamp"] = date_filter
    
    if event_type:
        filter_dict["event_type"] = event_type
    
    # Get events
    events_cursor = db["clock_events"].find(filter_dict).sort("timestamp", -1).limit(100)
    events = await events_cursor.to_list(None)
    
    event_list = []
    for event_doc in events:
        event_doc["_id"] = str(event_doc["_id"])
        event_list.append(ClockEvent(**event_doc))
    
    return event_list

@router.get("/summary", response_model=AttendanceSummary)
async def get_attendance_summary(
    date: Optional[str] = Query(None, description="Date (YYYY-MM-DD), defaults to today"),
    current_user: dict = Depends(get_current_user)
):
    """Get attendance summary for a specific date"""
    employee_id = str(current_user["_id"])
    
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    
    db = get_db()
    
    try:
        # Get clock events for the date
        start_of_day = datetime.strptime(date, "%Y-%m-%d")
        end_of_day = start_of_day.replace(hour=23, minute=59, second=59)
        
        events_cursor = db["clock_events"].find({
            "employee_id": employee_id,
            "timestamp": {"$gte": start_of_day, "$lte": end_of_day}
        }).sort("timestamp", 1)
        
        events = await events_cursor.to_list(None)
        
        clock_in_time = None
        clock_out_time = None
        break_duration = 0.0
        
        for event in events:
            if event["event_type"] == "clock_in" and event["is_valid"]:
                clock_in_time = event["timestamp"]
            elif event["event_type"] == "clock_out" and event["is_valid"]:
                clock_out_time = event["timestamp"]
        
        # Calculate total hours
        total_hours = await calculate_daily_hours(employee_id, date)
        
        # Get location info
        location_name = "Unknown Location"
        distance_compliance = True
        
        if events:
            first_event = events[0]
            location_doc = await db["locations"].find_one({"_id": ObjectId(first_event["location_id"])})
            if location_doc:
                location_name = location_doc["name"]
            
            # Check if all events were location compliant
            distance_compliance = all(event["is_valid"] for event in events)
        
        return AttendanceSummary(
            employee_id=employee_id,
            date=date,
            clock_in_time=clock_in_time,
            clock_out_time=clock_out_time,
            total_hours=total_hours,
            break_duration=break_duration,
            is_complete=clock_in_time is not None and clock_out_time is not None,
            location_name=location_name,
            distance_compliance=distance_compliance
        )
        
    except Exception as e:
        raise HTTPException(500, f"Failed to get attendance summary: {str(e)}")

# Manager/Admin endpoints
@router.get("/team/status", response_model=List[dict])
async def get_team_attendance_status(
    current_user: dict = Depends(get_current_user)
):
    """Get attendance status for all team members (Manager/Admin only)"""
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    db = get_db()
    
    try:
        # Get all employees
        employees = await db["users"].find({
            "role": "employee",
            "isActive": True
        }).to_list(None)
        
        team_status = []
        
        for employee in employees:
            employee_id = str(employee["_id"])
            status = await get_employee_attendance_status(employee_id)
            
            team_status.append({
                "employee": {
                    "id": employee_id,
                    "firstName": employee["firstName"],
                    "lastName": employee["lastName"],
                    "department": employee.get("department")
                },
                "attendance_status": status.dict()
            })
        
        return team_status
        
    except Exception as e:
        raise HTTPException(500, f"Failed to get team status: {str(e)}")

@router.get("/debug/system-status", response_model=dict)
async def get_system_diagnostic_status(
    current_user: dict = Depends(get_current_user)
):
    """Debug endpoint to check system status for attendance tracking"""
    db = get_db()
    
    try:
        # Check locations
        locations = await db["locations"].find({"is_active": True}).to_list(None)
        
        # Check recent clock events
        recent_events = await db["clock_events"].find().sort("timestamp", -1).limit(5).to_list(None)
        
        # Check schedules for today
        today = datetime.utcnow().strftime("%Y-%m-%d")
        today_schedules = await db["schedules"].find({
            "date": today
        }).limit(10).to_list(None)
        
        return {
            "current_user": {
                "id": str(current_user["_id"]),
                "role": current_user.get("role"),
                "firstName": current_user.get("firstName"),
                "email": current_user.get("email")
            },
            "system_status": {
                "locations_count": len(locations),
                "locations": [
                    {
                        "id": str(loc["_id"]),
                        "name": loc["name"],
                        "coordinates": loc["coordinates"],
                        "radius_meters": loc["radius_meters"]
                    } for loc in locations
                ],
                "recent_clock_events": len(recent_events),
                "today_schedules": len(today_schedules),
                "database_connected": True
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "system_status": {
                "database_connected": False
            },
            "timestamp": datetime.utcnow().isoformat()
        }

@router.get("/reports/daily", response_model=List[AttendanceSummary])
async def get_daily_attendance_report(
    date: Optional[str] = Query(None, description="Date (YYYY-MM-DD), defaults to today"),
    department: Optional[str] = Query(None, description="Filter by department"),
    current_user: dict = Depends(get_current_user)
):
    """Get daily attendance report for all employees (Manager/Admin only)"""
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    
    db = get_db()
    
    try:
        # Build employee filter
        employee_filter = {"role": "employee", "isActive": True}
        if department:
            employee_filter["department"] = department
        
        # Get employees
        employees = await db["users"].find(employee_filter).to_list(None)
        
        daily_report = []
        
        for employee in employees:
            employee_id = str(employee["_id"])
            
            # Get attendance summary for each employee
            summary = await get_attendance_summary(date, employee_id)
            daily_report.append(summary)
        
        return daily_report
        
    except Exception as e:
        raise HTTPException(500, f"Failed to generate daily report: {str(e)}") 

# Manager/Admin Clock Event Management
@router.get("/manage/events", response_model=List[dict])
async def get_attendance_events_for_management(
    date: Optional[str] = Query(None, description="Date (YYYY-MM-DD), defaults to today"),
    employee_id: Optional[str] = Query(None, description="Filter by employee ID"),
    department: Optional[str] = Query(None, description="Filter by department"),
    current_user: dict = Depends(get_current_user)
):
    """Get all attendance events for management (Manager/Admin only)"""
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    db = get_db()
    
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    
    try:
        start_of_day = datetime.strptime(date, "%Y-%m-%d")
        end_of_day = start_of_day.replace(hour=23, minute=59, second=59)
        
        # Build filter
        event_filter = {
            "timestamp": {"$gte": start_of_day, "$lte": end_of_day}
        }
        
        if employee_id:
            event_filter["employee_id"] = employee_id
        
        # Get clock events
        events_cursor = db["clock_events"].find(event_filter).sort("timestamp", 1)
        events = await events_cursor.to_list(None)
        
        # Get employee info and enrich events
        enriched_events = []
        for event in events:
            # Get employee details
            employee = await db["users"].find_one({"_id": ObjectId(event["employee_id"])})
            if employee and (not department or employee.get("department") == department):
                # Get schedule info if exists
                schedule_info = None
                if event.get("schedule_id"):
                    schedule_info = await db["schedules"].find_one({"_id": ObjectId(event["schedule_id"])})
                
                # Get location info
                location_info = None
                if event.get("location_id"):
                    location_doc = await db["locations"].find_one({"_id": ObjectId(event["location_id"])})
                    if location_doc:
                        location_info = {
                            "id": str(location_doc["_id"]),
                            "name": location_doc["name"],
                            "address": location_doc["address"]
                        }
                
                enriched_events.append({
                    "id": str(event["_id"]),
                    "employee": {
                        "id": str(employee["_id"]),
                        "firstName": employee["firstName"],
                        "lastName": employee["lastName"],
                        "department": employee.get("department"),
                        "email": employee["email"]
                    },
                    "event_type": event["event_type"],
                    "timestamp": event["timestamp"].isoformat(),
                    "gps_coordinates": event.get("gps_coordinates"),
                    "distance_from_location": event.get("distance_from_location"),
                    "is_valid": event.get("is_valid", True),
                    "notes": event.get("notes"),
                    "location": location_info,
                    "schedule": {
                        "id": str(schedule_info["_id"]) if schedule_info else None,
                        "startTime": schedule_info.get("startTime") if schedule_info else None,
                        "endTime": schedule_info.get("endTime") if schedule_info else None,
                        "role": schedule_info.get("role") if schedule_info else None
                    } if schedule_info else None,
                    "created_at": event["created_at"].isoformat()
                })
        
        return enriched_events
        
    except Exception as e:
        raise HTTPException(500, f"Failed to get attendance events: {str(e)}")

@router.get("/manage/daily-summary", response_model=List[dict])
async def get_daily_attendance_summary(
    date: Optional[str] = Query(None, description="Date (YYYY-MM-DD), defaults to today"),
    department: Optional[str] = Query(None, description="Filter by department"),
    current_user: dict = Depends(get_current_user)
):
    """Get daily attendance summary with schedule comparison (Manager/Admin only)"""
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    db = get_db()
    
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    
    try:
        # Get all employees
        employee_filter = {"isActive": True}
        if department:
            employee_filter["department"] = department
        
        employees = await db["users"].find(employee_filter).to_list(None)
        
        daily_summary = []
        
        for employee in employees:
            employee_id = str(employee["_id"])
            
            # Get schedule for the day
            schedule = await db["schedules"].find_one({
                "employeeId": employee_id,
                "date": date
            })
            
            # Get clock events for the day
            start_of_day = datetime.strptime(date, "%Y-%m-%d")
            end_of_day = start_of_day.replace(hour=23, minute=59, second=59)
            
            events_cursor = db["clock_events"].find({
                "employee_id": employee_id,
                "timestamp": {"$gte": start_of_day, "$lte": end_of_day}
            }).sort("timestamp", 1)
            
            events = await events_cursor.to_list(None)
            
            # Process events to get clock in/out times
            clock_in_time = None
            clock_out_time = None
            break_events = []
            
            for event in events:
                if event["event_type"] == "clock_in" and event.get("is_valid", True) and not clock_in_time:
                    clock_in_time = event["timestamp"]
                elif event["event_type"] == "clock_out" and event.get("is_valid", True):
                    clock_out_time = event["timestamp"]
                elif event["event_type"] in ["break_start", "break_end"]:
                    break_events.append({
                        "type": event["event_type"],
                        "timestamp": event["timestamp"]
                    })
            
            # Calculate hours worked
            total_hours = 0.0
            break_duration = 0.0
            
            if clock_in_time and clock_out_time:
                total_hours = (clock_out_time - clock_in_time).total_seconds() / 3600
            
            # Calculate break time
            break_start = None
            for break_event in break_events:
                if break_event["type"] == "break_start":
                    break_start = break_event["timestamp"]
                elif break_event["type"] == "break_end" and break_start:
                    break_duration += (break_event["timestamp"] - break_start).total_seconds() / 3600
                    break_start = None
            
            # Subtract break time from total hours
            if break_duration > 0:
                total_hours = max(0, total_hours - break_duration)
            
            # Schedule comparison
            schedule_info = None
            on_time_status = "no_schedule"
            overtime_hours = 0.0
            
            if schedule:
                scheduled_start = datetime.strptime(f"{date} {schedule['startTime']}", "%Y-%m-%d %H:%M")
                scheduled_end = datetime.strptime(f"{date} {schedule['endTime']}", "%Y-%m-%d %H:%M")
                scheduled_hours = (scheduled_end - scheduled_start).total_seconds() / 3600
                
                schedule_info = {
                    "id": str(schedule["_id"]),
                    "startTime": schedule["startTime"],
                    "endTime": schedule["endTime"],
                    "location": schedule.get("location"),
                    "role": schedule.get("role"),
                    "scheduled_hours": scheduled_hours
                }
                
                # Determine on-time status
                if clock_in_time and clock_out_time:
                    late_minutes = (clock_in_time - scheduled_start).total_seconds() / 60
                    if late_minutes <= 5:  # 5 minutes grace period
                        on_time_status = "on_time"
                    elif late_minutes <= 15:
                        on_time_status = "slightly_late"
                    else:
                        on_time_status = "late"
                    
                    # Calculate overtime
                    if total_hours > scheduled_hours:
                        overtime_hours = total_hours - scheduled_hours
                elif clock_in_time and not clock_out_time:
                    on_time_status = "not_completed"
                else:
                    on_time_status = "absent"
            
            daily_summary.append({
                "employee": {
                    "id": employee_id,
                    "firstName": employee["firstName"],
                    "lastName": employee["lastName"],
                    "department": employee.get("department"),
                    "email": employee["email"]
                },
                "date": date,
                "schedule": schedule_info,
                "actual": {
                    "clock_in_time": clock_in_time.isoformat() if clock_in_time else None,
                    "clock_out_time": clock_out_time.isoformat() if clock_out_time else None,
                    "total_hours": round(total_hours, 2),
                    "break_duration": round(break_duration, 2),
                    "overtime_hours": round(overtime_hours, 2)
                },
                "status": on_time_status,
                "events_count": len(events),
                "last_updated": datetime.utcnow().isoformat()
            })
        
        return daily_summary
        
    except Exception as e:
        raise HTTPException(500, f"Failed to get daily summary: {str(e)}")

@router.post("/manage/create-event", response_model=dict)
async def create_clock_event_for_employee(
    event_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create clock event for an employee (Manager/Admin only)"""
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    db = get_db()
    
    try:
        # Validate required fields
        required_fields = ["employee_id", "event_type", "timestamp"]
        for field in required_fields:
            if field not in event_data:
                raise HTTPException(400, f"Missing required field: {field}")
        
        # Validate employee exists
        employee = await db["users"].find_one({"_id": ObjectId(event_data["employee_id"])})
        if not employee:
            raise HTTPException(404, "Employee not found")
        
        # Parse timestamp
        try:
            timestamp = datetime.fromisoformat(event_data["timestamp"].replace('Z', '+00:00'))
        except:
            raise HTTPException(400, "Invalid timestamp format. Use ISO format.")
        
        # Get default location if not provided
        location_id = event_data.get("location_id")
        if not location_id:
            default_location = await db["locations"].find_one({"is_active": True})
            if default_location:
                location_id = str(default_location["_id"])
            else:
                raise HTTPException(400, "No locations available and none specified")
        
        # Create clock event
        new_event = {
            "employee_id": event_data["employee_id"],
            "schedule_id": event_data.get("schedule_id"),
            "event_type": event_data["event_type"],
            "timestamp": timestamp,
            "location_id": location_id,
            "gps_coordinates": event_data.get("gps_coordinates", {"lat": 0, "lng": 0}),
            "distance_from_location": event_data.get("distance_from_location", 0),
            "is_valid": True,  # Manager-created events are always valid
            "notes": event_data.get("notes", f"Created by {current_user['firstName']} {current_user['lastName']}"),
            "created_at": datetime.utcnow(),
            "created_by": str(current_user["_id"])
        }
        
        result = await db["clock_events"].insert_one(new_event)
        new_event["_id"] = str(result.inserted_id)
        
        await log_event("clock_event_created_by_manager", {
            "event_id": str(result.inserted_id),
            "employee_id": event_data["employee_id"],
            "event_type": event_data["event_type"],
            "created_by": str(current_user["_id"]),
            "timestamp": timestamp.isoformat()
        })
        
        return {
            "success": True,
            "message": "Clock event created successfully",
            "event": {
                "id": str(result.inserted_id),
                "employee_id": event_data["employee_id"],
                "event_type": event_data["event_type"],
                "timestamp": timestamp.isoformat()
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to create clock event: {str(e)}")

@router.put("/manage/events/{event_id}", response_model=dict)
async def update_clock_event(
    event_id: str,
    update_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update clock event (Manager/Admin only)"""
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    db = get_db()
    
    try:
        # Check if event exists
        existing_event = await db["clock_events"].find_one({"_id": ObjectId(event_id)})
        if not existing_event:
            raise HTTPException(404, "Clock event not found")
        
        # Build update dict
        update_dict = {}
        
        if "timestamp" in update_data:
            try:
                update_dict["timestamp"] = datetime.fromisoformat(update_data["timestamp"].replace('Z', '+00:00'))
            except:
                raise HTTPException(400, "Invalid timestamp format")
        
        if "event_type" in update_data:
            if update_data["event_type"] not in ["clock_in", "clock_out", "break_start", "break_end"]:
                raise HTTPException(400, "Invalid event type")
            update_dict["event_type"] = update_data["event_type"]
        
        if "notes" in update_data:
            update_dict["notes"] = update_data["notes"]
        
        if "is_valid" in update_data:
            update_dict["is_valid"] = bool(update_data["is_valid"])
        
        update_dict["updated_at"] = datetime.utcnow()
        update_dict["updated_by"] = str(current_user["_id"])
        
        # Update the event
        await db["clock_events"].update_one(
            {"_id": ObjectId(event_id)},
            {"$set": update_dict}
        )
        
        await log_event("clock_event_updated_by_manager", {
            "event_id": event_id,
            "updated_by": str(current_user["_id"]),
            "changes": list(update_dict.keys())
        })
        
        return {
            "success": True,
            "message": "Clock event updated successfully",
            "event_id": event_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if "ObjectId" in str(e):
            raise HTTPException(400, "Invalid event ID format")
        raise HTTPException(500, f"Failed to update clock event: {str(e)}")

@router.delete("/manage/events/{event_id}", response_model=dict)
async def delete_clock_event(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete clock event (Manager/Admin only)"""
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    db = get_db()
    
    try:
        # Check if event exists
        existing_event = await db["clock_events"].find_one({"_id": ObjectId(event_id)})
        if not existing_event:
            raise HTTPException(404, "Clock event not found")
        
        # Delete the event
        await db["clock_events"].delete_one({"_id": ObjectId(event_id)})
        
        await log_event("clock_event_deleted_by_manager", {
            "event_id": event_id,
            "employee_id": existing_event["employee_id"],
            "event_type": existing_event["event_type"],
            "deleted_by": str(current_user["_id"])
        })
        
        return {
            "success": True,
            "message": "Clock event deleted successfully",
            "event_id": event_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if "ObjectId" in str(e):
            raise HTTPException(400, "Invalid event ID format")
        raise HTTPException(500, f"Failed to delete clock event: {str(e)}")

@router.get("/analytics/real-time-metrics", response_model=dict)
async def get_real_time_attendance_metrics(
    date: Optional[str] = Query(None, description="Date (YYYY-MM-DD), defaults to today"),
    current_user: dict = Depends(get_current_user)
):
    """Get real-time attendance metrics for analytics integration"""
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    db = get_db()
    
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    
    try:
        start_of_day = datetime.strptime(date, "%Y-%m-%d")
        end_of_day = start_of_day.replace(hour=23, minute=59, second=59)
        
        # Get total active employees
        total_employees = await db["users"].count_documents({"isActive": True, "role": "employee"})
        
        # Get today's schedules
        scheduled_today = await db["schedules"].count_documents({"date": date})
        
        # Get clock events for today
        clock_events = await db["clock_events"].find({
            "timestamp": {"$gte": start_of_day, "$lte": end_of_day}
        }).to_list(None)
        
        # Calculate metrics
        employees_clocked_in = set()
        employees_clocked_out = set()
        total_hours_worked = 0.0
        late_arrivals = 0
        early_departures = 0
        
        # Process events by employee
        employee_events = {}
        for event in clock_events:
            emp_id = event["employee_id"]
            if emp_id not in employee_events:
                employee_events[emp_id] = []
            employee_events[emp_id].append(event)
        
        for emp_id, events in employee_events.items():
            events.sort(key=lambda x: x["timestamp"])
            
            clock_in_time = None
            clock_out_time = None
            
            for event in events:
                if event["event_type"] == "clock_in" and event.get("is_valid", True):
                    if not clock_in_time:  # First valid clock in
                        clock_in_time = event["timestamp"]
                        employees_clocked_in.add(emp_id)
                elif event["event_type"] == "clock_out" and event.get("is_valid", True):
                    clock_out_time = event["timestamp"]
                    employees_clocked_out.add(emp_id)
            
            # Calculate hours for this employee
            if clock_in_time and clock_out_time:
                hours = (clock_out_time - clock_in_time).total_seconds() / 3600
                total_hours_worked += hours
            
            # Check if late/early based on schedule
            schedule = await db["schedules"].find_one({"employeeId": emp_id, "date": date})
            if schedule and clock_in_time:
                scheduled_start = datetime.strptime(f"{date} {schedule['startTime']}", "%Y-%m-%d %H:%M")
                if clock_in_time > scheduled_start + timedelta(minutes=5):
                    late_arrivals += 1
            
            if schedule and clock_out_time:
                scheduled_end = datetime.strptime(f"{date} {schedule['endTime']}", "%Y-%m-%d %H:%M")
                if clock_out_time < scheduled_end - timedelta(minutes=5):
                    early_departures += 1
        
        # Calculate rates
        attendance_rate = (len(employees_clocked_in) / max(total_employees, 1)) * 100
        completion_rate = (len(employees_clocked_out) / max(len(employees_clocked_in), 1)) * 100 if employees_clocked_in else 0
        currently_working = len(employees_clocked_in) - len(employees_clocked_out)
        
        return {
            "date": date,
            "total_employees": total_employees,
            "scheduled_today": scheduled_today,
            "employees_clocked_in": len(employees_clocked_in),
            "employees_clocked_out": len(employees_clocked_out),
            "attendance_rate": round(attendance_rate, 1),
            "completion_rate": round(completion_rate, 1),
            "total_hours_worked": round(total_hours_worked, 1),
            "late_arrivals": late_arrivals,
            "early_departures": early_departures,
            "currently_working": currently_working,
            "last_updated": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to get metrics: {str(e)}")

@router.get("/my-records", response_model=dict)
async def get_my_attendance_records(
    startDate: str = Query(..., description="Start date (YYYY-MM-DD)"),
    endDate: str = Query(..., description="End date (YYYY-MM-DD)"),
    current_user: dict = Depends(get_current_user)
):
    """Get employee's own attendance records for a date range"""
    if current_user.get("role") != "employee":
        raise HTTPException(403, "This endpoint is only available to employees")
    
    db = get_db()
    employee_id = str(current_user["_id"])
    
    try:
        start_date = datetime.strptime(startDate, "%Y-%m-%d")
        end_date = datetime.strptime(endDate, "%Y-%m-%d")
        
        if (end_date - start_date).days > 90:
            raise HTTPException(400, "Date range cannot exceed 90 days")
        
        # Generate list of dates in range
        date_list = []
        current_date = start_date
        while current_date <= end_date:
            date_list.append(current_date.strftime("%Y-%m-%d"))
            current_date += timedelta(days=1)
        
        records = []
        total_scheduled_days = 0
        total_worked_days = 0
        total_hours_worked = 0.0
        total_overtime_hours = 0.0
        
        for date_str in date_list:
            # Get schedule for the day
            schedule = await db["schedules"].find_one({
                "employeeId": employee_id,
                "date": date_str
            })
            
            # Get clock events for the day
            day_start = datetime.strptime(date_str, "%Y-%m-%d")
            day_end = day_start.replace(hour=23, minute=59, second=59)
            
            events = await db["clock_events"].find({
                "employee_id": employee_id,
                "timestamp": {"$gte": day_start, "$lte": day_end}
            }).sort("timestamp", 1).to_list(None)
            
            # Process events
            clock_in_time = None
            clock_out_time = None
            break_events = []
            
            for event in events:
                if event["event_type"] == "clock_in" and event.get("is_valid", True) and not clock_in_time:
                    clock_in_time = event["timestamp"]
                elif event["event_type"] == "clock_out" and event.get("is_valid", True):
                    clock_out_time = event["timestamp"]
                elif event["event_type"] in ["break_start", "break_end"]:
                    break_events.append(event)
            
            # Calculate hours and breaks
            actual_hours = 0.0
            break_duration = 0.0
            
            if clock_in_time and clock_out_time:
                actual_hours = (clock_out_time - clock_in_time).total_seconds() / 3600
                total_worked_days += 1
            
            # Calculate break time
            break_start = None
            for event in break_events:
                if event["event_type"] == "break_start":
                    break_start = event["timestamp"]
                elif event["event_type"] == "break_end" and break_start:
                    break_duration += (event["timestamp"] - break_start).total_seconds() / 3600
                    break_start = None
            
            actual_hours = max(0, actual_hours - break_duration)
            
            # Determine status and overtime
            status = "no_schedule"
            overtime_hours = 0.0
            schedule_info = None
            
            if schedule:
                total_scheduled_days += 1
                scheduled_hours = 0.0
                
                try:
                    start_time = datetime.strptime(schedule["startTime"], "%H:%M")
                    end_time = datetime.strptime(schedule["endTime"], "%H:%M")
                    scheduled_hours = (end_time - start_time).total_seconds() / 3600
                except:
                    scheduled_hours = 8.0  # Default fallback
                
                schedule_info = {
                    "id": str(schedule["_id"]),
                    "startTime": schedule["startTime"],
                    "endTime": schedule["endTime"],
                    "location": schedule.get("location", "Unknown"),
                    "role": schedule.get("role", "General"),
                    "scheduled_hours": scheduled_hours
                }
                
                if clock_in_time and clock_out_time:
                    # Calculate lateness
                    scheduled_start = day_start.replace(
                        hour=int(schedule["startTime"].split(":")[0]),
                        minute=int(schedule["startTime"].split(":")[1])
                    )
                    
                    if clock_in_time <= scheduled_start + timedelta(minutes=5):
                        status = "on_time"
                    elif clock_in_time <= scheduled_start + timedelta(minutes=15):
                        status = "slightly_late"
                    else:
                        status = "late"
                    
                    # Calculate overtime
                    if actual_hours > scheduled_hours:
                        overtime_hours = actual_hours - scheduled_hours
                        
                elif clock_in_time and not clock_out_time:
                    status = "not_completed"
                else:
                    status = "absent"
            
            total_hours_worked += actual_hours
            total_overtime_hours += overtime_hours
            
            records.append({
                "date": date_str,
                "schedule": schedule_info,
                "actual": {
                    "clock_in_time": clock_in_time.isoformat() if clock_in_time else None,
                    "clock_out_time": clock_out_time.isoformat() if clock_out_time else None,
                    "total_hours": round(actual_hours, 2),
                    "break_duration": round(break_duration, 2),
                    "overtime_hours": round(overtime_hours, 2)
                },
                "status": status,
                "events_count": len(events)
            })
        
        # Calculate summary
        attendance_rate = (total_worked_days / max(total_scheduled_days, 1)) * 100 if total_scheduled_days > 0 else 0
        average_hours_per_day = total_hours_worked / max(total_worked_days, 1) if total_worked_days > 0 else 0
        
        summary = {
            "total_scheduled_days": total_scheduled_days,
            "total_worked_days": total_worked_days,
            "total_hours_worked": round(total_hours_worked, 2),
            "total_overtime_hours": round(total_overtime_hours, 2),
            "attendance_rate": round(attendance_rate, 1),
            "average_hours_per_day": round(average_hours_per_day, 2)
        }
        
        return {
            "records": records,
            "summary": summary,
            "dateRange": {
                "startDate": startDate,
                "endDate": endDate
            }
        }
        
    except ValueError as e:
        if "time data" in str(e):
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Failed to get attendance records: {str(e)}") 