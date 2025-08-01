from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.db import get_db
from app.utils.auth import get_current_user
from app.schemas.user import UserOut
from bson import ObjectId
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/attendance")
async def get_attendance_report(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    department: Optional[str] = None,
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
        try:
            end_date = datetime.fromisoformat(endDate)
        except ValueError:
            raise HTTPException(400, "Invalid endDate format. Expected YYYY-MM-DD")
    
    if not startDate:
        start_date = end_date - timedelta(days=30)
    else:
        try:
            start_date = datetime.fromisoformat(startDate)
        except ValueError:
            raise HTTPException(400, "Invalid startDate format. Expected YYYY-MM-DD")
    
    # Build filter
    filter_dict = {
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lte": end_date.strftime("%Y-%m-%d")
        }
    }
    
    if department:
        filter_dict["department"] = department
    if employeeId:
        filter_dict["employeeId"] = employeeId
    
    # Get schedules
    schedules = await db["schedules"].find(filter_dict).to_list(None)
    
    print(f"DEBUG: Found {len(schedules)} schedules for attendance report")
    print(f"DEBUG: Filter used: {filter_dict}")
    
    # Calculate attendance metrics
    attendance_data = {}
    
    for schedule in schedules:
        emp_id = schedule["employeeId"]
        if emp_id not in attendance_data:
            # Get employee info using the same logic as schedules endpoint
            employee = None
            if ObjectId.is_valid(emp_id):
                # First, try querying by ObjectId, as this is the standard for new data
                employee = await db["users"].find_one({"_id": ObjectId(emp_id)})
                if not employee:
                    # Fallback: if no user is found, try querying by the raw string
                    employee = await db["users"].find_one({"_id": emp_id})
            else:
                # If the ID is not a valid ObjectId format, it must be a string
                employee = await db["users"].find_one({"_id": emp_id})
            
            if employee:
                attendance_data[emp_id] = {
                    "employee": {
                        "id": str(employee["_id"]),
                        "firstName": employee["firstName"],
                        "lastName": employee["lastName"],
                        "department": employee.get("department"),
                        "email": employee.get("email"),
                        "role": employee.get("role")
                    },
                    "totalScheduled": 0,
                    "totalCompleted": 0,
                    "totalMissed": 0,
                    "attendanceRate": 0,
                    "totalHours": 0
                }
            else:
                # Create a placeholder for missing employee
                print(f"Warning: Employee not found for ID: {emp_id}")
                attendance_data[emp_id] = {
                    "employee": {
                        "id": emp_id,
                        "firstName": "Unknown",
                        "lastName": "Employee",
                        "department": "Unknown",
                        "email": "unknown@company.com",
                        "role": "unknown"
                    },
                    "totalScheduled": 0,
                    "totalCompleted": 0,
                    "totalMissed": 0,
                    "attendanceRate": 0,
                    "totalHours": 0
                }
        
        # Only process if employee data exists (which it should now always exist)
        if emp_id in attendance_data:
            attendance_data[emp_id]["totalScheduled"] += 1
            
            if schedule["status"] == "completed":
                attendance_data[emp_id]["totalCompleted"] += 1
                # Calculate hours
                try:
                    start_time = datetime.strptime(schedule["startTime"], "%H:%M")
                    end_time = datetime.strptime(schedule["endTime"], "%H:%M")
                    hours = (end_time - start_time).seconds / 3600
                    attendance_data[emp_id]["totalHours"] += hours
                except ValueError:
                    # Handle invalid time format
                    pass
            elif schedule["status"] == "missed":
                attendance_data[emp_id]["totalMissed"] += 1
    
    # Calculate attendance rates
    for emp_data in attendance_data.values():
        if emp_data["totalScheduled"] > 0:
            emp_data["attendanceRate"] = (
                emp_data["totalCompleted"] / emp_data["totalScheduled"] * 100
            )
    
    return {
        "dateRange": {
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d")
        },
        "attendanceData": list(attendance_data.values())
    }

@router.get("/hours")
async def get_hours_report(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    department: Optional[str] = None,
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
        try:
            end_date = datetime.fromisoformat(endDate)
        except ValueError:
            raise HTTPException(400, "Invalid endDate format. Expected YYYY-MM-DD")
    
    if not startDate:
        start_date = end_date - timedelta(days=30)
    else:
        try:
            start_date = datetime.fromisoformat(startDate)
        except ValueError:
            raise HTTPException(400, "Invalid startDate format. Expected YYYY-MM-DD")
    
    # Build filter
    filter_dict = {
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lte": end_date.strftime("%Y-%m-%d")
        },
        "status": "completed"
    }
    
    if department:
        filter_dict["department"] = department
    
    # Get completed schedules
    schedules = await db["schedules"].find(filter_dict).to_list(None)
    
    print(f"DEBUG: Found {len(schedules)} completed schedules for hours report")
    print(f"DEBUG: Filter used: {filter_dict}")
    
    # Calculate hours by employee
    hours_data = {}
    total_hours = 0
    
    for schedule in schedules:
        emp_id = schedule["employeeId"]
        
        # Calculate hours
        try:
            start_time = datetime.strptime(schedule["startTime"], "%H:%M")
            end_time = datetime.strptime(schedule["endTime"], "%H:%M")
            hours = (end_time - start_time).seconds / 3600
            total_hours += hours
        except ValueError:
            # Skip if time format is invalid
            continue
        
        if emp_id not in hours_data:
            # Get employee info using the same logic as schedules endpoint
            employee = None
            if ObjectId.is_valid(emp_id):
                # First, try querying by ObjectId, as this is the standard for new data
                employee = await db["users"].find_one({"_id": ObjectId(emp_id)})
                if not employee:
                    # Fallback: if no user is found, try querying by the raw string
                    employee = await db["users"].find_one({"_id": emp_id})
            else:
                # If the ID is not a valid ObjectId format, it must be a string
                employee = await db["users"].find_one({"_id": emp_id})
                
            if employee:
                hours_data[emp_id] = {
                    "employee": {
                        "id": str(employee["_id"]),
                        "firstName": employee["firstName"],
                        "lastName": employee["lastName"],
                        "department": employee.get("department"),
                        "email": employee.get("email"),
                        "role": employee.get("role")
                    },
                    "regularHours": 0,
                    "overtimeHours": 0,
                    "totalHours": 0
                }
            else:
                # Create a placeholder for missing employee
                print(f"Warning: Employee not found for ID: {emp_id}")
                hours_data[emp_id] = {
                    "employee": {
                        "id": emp_id,
                        "firstName": "Unknown",
                        "lastName": "Employee",
                        "department": "Unknown",
                        "email": "unknown@company.com",
                        "role": "unknown"
                    },
                    "regularHours": 0,
                    "overtimeHours": 0,
                    "totalHours": 0
                }
        
        # Only process if employee data exists (which it should now always exist)
        if emp_id in hours_data:
            # For simplicity, assume overtime is anything over 8 hours per day
            if hours > 8:
                hours_data[emp_id]["regularHours"] += 8
                hours_data[emp_id]["overtimeHours"] += (hours - 8)
            else:
                hours_data[emp_id]["regularHours"] += hours
            
            hours_data[emp_id]["totalHours"] += hours
    
    return {
        "dateRange": {
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d")
        },
        "totalHours": total_hours,
        "hoursData": list(hours_data.values())
    }

@router.get("/time-off")
async def get_time_off_report(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
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
        try:
            end_date = datetime.fromisoformat(endDate)
        except ValueError:
            raise HTTPException(400, "Invalid endDate format. Expected YYYY-MM-DD")
    
    if not startDate:
        start_date = end_date - timedelta(days=90)
    else:
        try:
            start_date = datetime.fromisoformat(startDate)
        except ValueError:
            raise HTTPException(400, "Invalid startDate format. Expected YYYY-MM-DD")
    
    # Build filter
    filter_dict = {
        "submittedAt": {
            "$gte": start_date,
            "$lte": end_date
        }
    }
    
    if status:
        filter_dict["status"] = status
    
    # Get time off requests
    requests = await db["time_off_requests"].find(filter_dict).to_list(None)
    
    # Filter by department if specified
    if department:
        filtered_requests = []
        for request in requests:
            emp_id = request["employeeId"]
            employee = None
            if ObjectId.is_valid(emp_id):
                # First, try querying by ObjectId, as this is the standard for new data
                employee = await db["users"].find_one({"_id": ObjectId(emp_id)})
                if not employee:
                    # Fallback: if no user is found, try querying by the raw string
                    employee = await db["users"].find_one({"_id": emp_id})
            else:
                # If the ID is not a valid ObjectId format, it must be a string
                employee = await db["users"].find_one({"_id": emp_id})
                
            if employee and employee.get("department") == department:
                filtered_requests.append(request)
        requests = filtered_requests
    
    # Populate employee data and calculate metrics
    time_off_data = []
    total_days = 0
    status_counts = {"pending": 0, "approved": 0, "rejected": 0}
    type_counts = {}
    
    for request in requests:
        # Get employee info using the same logic as schedules endpoint
        emp_id = request["employeeId"]
        employee = None
        if ObjectId.is_valid(emp_id):
            # First, try querying by ObjectId, as this is the standard for new data
            employee = await db["users"].find_one({"_id": ObjectId(emp_id)})
            if not employee:
                # Fallback: if no user is found, try querying by the raw string
                employee = await db["users"].find_one({"_id": emp_id})
        else:
            # If the ID is not a valid ObjectId format, it must be a string
            employee = await db["users"].find_one({"_id": emp_id})
            
        if employee:
            employee["id"] = str(employee["_id"])
            request["employee"] = UserOut(**employee)
        else:
            # Create a placeholder for missing employee
            print(f"Warning: Employee not found for ID: {emp_id}")
            request["employee"] = {
                "id": emp_id,
                "firstName": "Unknown",
                "lastName": "Employee",
                "email": "unknown@company.com",
                "role": "unknown",
                "department": "Unknown"
            }
        
        request["id"] = str(request["_id"])
        time_off_data.append(request)
        
        # Update metrics
        total_days += request.get("totalDays", 0)
        status_counts[request["status"]] = status_counts.get(request["status"], 0) + 1
        request_type = request.get("type", "other")
        type_counts[request_type] = type_counts.get(request_type, 0) + 1
    
    return {
        "dateRange": {
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d")
        },
        "summary": {
            "totalRequests": len(time_off_data),
            "totalDays": total_days,
            "statusBreakdown": status_counts,
            "typeBreakdown": type_counts
        },
        "requests": time_off_data
    }

@router.get("/summary")
async def get_reports_summary(current_user: dict = Depends(get_current_user)):
    """Get summary statistics for the reports dashboard"""
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    try:
        # Get current date for calculations
        current_date = datetime.utcnow()
        thirty_days_ago = current_date - timedelta(days=30)
        
        # Get total active employees
        total_employees = await db["users"].count_documents({"isActive": True})
        
        # Get all schedules for the last 30 days
        schedules_filter = {
            "date": {
                "$gte": thirty_days_ago.strftime("%Y-%m-%d"),
                "$lte": current_date.strftime("%Y-%m-%d")
            }
        }
        all_schedules = await db["schedules"].find(schedules_filter).to_list(None)
        
        # Calculate total hours from confirmed/completed schedules
        total_hours = 0
        total_scheduled = 0
        total_completed = 0
        
        for schedule in all_schedules:
            if schedule.get("status") in ["confirmed", "completed"]:
                try:
                    start_time = datetime.strptime(schedule["startTime"], "%H:%M")
                    end_time = datetime.strptime(schedule["endTime"], "%H:%M")
                    hours = (end_time - start_time).seconds / 3600
                    total_hours += hours
                except ValueError:
                    continue
            
            if schedule.get("status") in ["scheduled", "confirmed", "completed"]:
                total_scheduled += 1
            
            if schedule.get("status") == "completed":
                total_completed += 1
        
        # Calculate attendance rate
        average_attendance = (total_completed / total_scheduled * 100) if total_scheduled > 0 else 0
        
        # Get time-off requests count
        total_requests = await db["time_off_requests"].count_documents({
            "submittedAt": {
                "$gte": thirty_days_ago,
                "$lte": current_date
            }
        })
        
        print(f"DEBUG: Summary stats - Employees: {total_employees}, Hours: {total_hours}, Attendance: {average_attendance}%, Requests: {total_requests}")
        
        return {
            "totalEmployees": total_employees,
            "totalHours": round(total_hours),
            "averageAttendance": round(average_attendance, 1),
            "totalRequests": total_requests,
            "dateRange": {
                "startDate": thirty_days_ago.strftime("%Y-%m-%d"),
                "endDate": current_date.strftime("%Y-%m-%d")
            },
            "lastUpdated": current_date.isoformat()
        }
        
    except Exception as e:
        print(f"ERROR: Failed to generate summary stats: {e}")
        raise HTTPException(500, f"Failed to generate summary statistics: {str(e)}")

@router.get("/export/{report_type}")
async def export_report(
    report_type: str,
    format: str = Query("csv", regex="^(csv|pdf|excel)$"),
    current_user: dict = Depends(get_current_user)
):
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    if report_type not in ["attendance", "hours", "time-off"]:
        raise HTTPException(400, "Invalid report type")
    
    # For now, return a mock response
    # In a real implementation, you would generate the actual file
    return {
        "message": f"Export for {report_type} report in {format} format initiated",
        "downloadUrl": f"/api/reports/download/{report_type}.{format}",
        "expiresAt": (datetime.utcnow() + timedelta(hours=24)).isoformat()
    }

@router.get("/schedule-adherence", response_model=dict)
async def get_schedule_adherence_report(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    employee_id: Optional[str] = Query(None, description="Specific employee ID"),
    department: Optional[str] = Query(None, description="Filter by department"),
    current_user: dict = Depends(get_current_user)
):
    """Generate schedule adherence report comparing scheduled vs actual attendance"""
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        # Employees can only view their own adherence
        if employee_id and employee_id != str(current_user["_id"]):
            raise HTTPException(403, "You can only view your own schedule adherence")
        employee_id = str(current_user["_id"])
    
    try:
        db = get_db()
        
        # Default date range (last 30 days)
        if not start_date:
            start_date = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
        if not end_date:
            end_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Build aggregation pipeline
        match_conditions = {
            "date": {"$gte": start_date, "$lte": end_date}
        }
        
        if employee_id:
            match_conditions["employeeId"] = employee_id
        
        if department:
            # Get employees in department first
            employees = await db["users"].find({"department": department}).to_list(None)
            employee_ids = [str(emp["_id"]) for emp in employees]
            match_conditions["employeeId"] = {"$in": employee_ids}
        
        # Get scheduled shifts
        schedules = await db["schedules"].find(match_conditions).to_list(None)
        
        # Get attendance events for the same period
        attendance_events = await db["attendance_events"].find({
            "date": {"$gte": start_date, "$lte": end_date},
            **({"employee_id": employee_id} if employee_id else {}),
            "event_type": {"$in": ["clock_in", "clock_out"]}
        }).to_list(None)
        
        # Process adherence data
        adherence_data = []
        employee_summaries = {}
        
        for schedule in schedules:
            employee_id_key = schedule["employeeId"]
            date = schedule["date"]
            
            # Find corresponding attendance events
            daily_events = [
                event for event in attendance_events 
                if event["employee_id"] == employee_id_key and event["date"] == date
            ]
            
            # Calculate scheduled vs actual hours
            scheduled_start = datetime.strptime(f"{date}T{schedule['startTime']}", "%Y-%m-%dT%H:%M")
            scheduled_end = datetime.strptime(f"{date}T{schedule['endTime']}", "%Y-%m-%dT%H:%M")
            scheduled_hours = (scheduled_end - scheduled_start).total_seconds() / 3600
            
            # Find clock-in and clock-out events
            clock_in = next((e for e in daily_events if e["event_type"] == "clock_in"), None)
            clock_out = next((e for e in daily_events if e["event_type"] == "clock_out"), None)
            
            actual_hours = 0
            early_minutes = 0
            late_minutes = 0
            status = "absent"
            
            if clock_in and clock_out:
                actual_start = datetime.fromisoformat(clock_in["timestamp"].replace("Z", "+00:00"))
                actual_end = datetime.fromisoformat(clock_out["timestamp"].replace("Z", "+00:00"))
                actual_hours = (actual_end - actual_start).total_seconds() / 3600
                
                # Calculate early/late arrival
                arrival_diff = (actual_start - scheduled_start).total_seconds() / 60
                departure_diff = (actual_end - scheduled_end).total_seconds() / 60
                
                if arrival_diff <= -15:  # More than 15 minutes early
                    early_minutes = abs(arrival_diff)
                elif arrival_diff > 15:  # More than 15 minutes late
                    late_minutes = arrival_diff
                
                # Determine status
                if late_minutes > 30:
                    status = "late"
                elif late_minutes > 5:
                    status = "slightly_late"
                else:
                    status = "on_time"
                    
                # Check if completed full shift
                if departure_diff < -30:  # Left more than 30 min early
                    status = "early_departure"
                elif actual_hours < scheduled_hours * 0.8:  # Less than 80% of scheduled hours
                    status = "incomplete"
                    
            elif clock_in:
                status = "not_completed"  # Clocked in but didn't clock out
                
            # Get employee details
            employee = await db["users"].find_one({"_id": ObjectId(employee_id_key)})
            employee_name = f"{employee['firstName']} {employee['lastName']}" if employee else "Unknown"
            
            shift_data = {
                "employee_id": employee_id_key,
                "employee_name": employee_name,
                "department": employee.get("department") if employee else None,
                "date": date,
                "scheduled_start": schedule["startTime"],
                "scheduled_end": schedule["endTime"],
                "scheduled_hours": round(scheduled_hours, 2),
                "actual_start": clock_in["timestamp"] if clock_in else None,
                "actual_end": clock_out["timestamp"] if clock_out else None,
                "actual_hours": round(actual_hours, 2),
                "hours_difference": round(actual_hours - scheduled_hours, 2),
                "early_minutes": round(early_minutes, 1),
                "late_minutes": round(late_minutes, 1),
                "status": status,
                "location": schedule.get("location"),
                "role": schedule.get("role"),
                "shift_id": str(schedule["_id"])
            }
            
            adherence_data.append(shift_data)
            
            # Update employee summaries
            if employee_id_key not in employee_summaries:
                employee_summaries[employee_id_key] = {
                    "employee_id": employee_id_key,
                    "employee_name": employee_name,
                    "department": employee.get("department") if employee else None,
                    "total_scheduled_shifts": 0,
                    "total_attended_shifts": 0,
                    "total_scheduled_hours": 0,
                    "total_actual_hours": 0,
                    "on_time_count": 0,
                    "late_count": 0,
                    "absent_count": 0,
                    "early_departure_count": 0,
                    "incomplete_count": 0,
                    "attendance_rate": 0,
                    "punctuality_rate": 0,
                    "hours_adherence_rate": 0
                }
            
            summary = employee_summaries[employee_id_key]
            summary["total_scheduled_shifts"] += 1
            summary["total_scheduled_hours"] += scheduled_hours
            
            if status != "absent":
                summary["total_attended_shifts"] += 1
                summary["total_actual_hours"] += actual_hours
                
            if status == "on_time":
                summary["on_time_count"] += 1
            elif status in ["late", "slightly_late"]:
                summary["late_count"] += 1
            elif status == "absent":
                summary["absent_count"] += 1
            elif status == "early_departure":
                summary["early_departure_count"] += 1
            elif status == "incomplete":
                summary["incomplete_count"] += 1
        
        # Calculate summary statistics
        for summary in employee_summaries.values():
            if summary["total_scheduled_shifts"] > 0:
                summary["attendance_rate"] = round(
                    (summary["total_attended_shifts"] / summary["total_scheduled_shifts"]) * 100, 1
                )
                summary["punctuality_rate"] = round(
                    (summary["on_time_count"] / summary["total_scheduled_shifts"]) * 100, 1
                )
                
            if summary["total_scheduled_hours"] > 0:
                summary["hours_adherence_rate"] = round(
                    (summary["total_actual_hours"] / summary["total_scheduled_hours"]) * 100, 1
                )
        
        # Overall statistics
        total_shifts = len(adherence_data)
        attended_shifts = len([d for d in adherence_data if d["status"] != "absent"])
        on_time_shifts = len([d for d in adherence_data if d["status"] == "on_time"])
        
        overall_stats = {
            "total_scheduled_shifts": total_shifts,
            "total_attended_shifts": attended_shifts,
            "overall_attendance_rate": round((attended_shifts / total_shifts * 100), 1) if total_shifts > 0 else 0,
            "overall_punctuality_rate": round((on_time_shifts / total_shifts * 100), 1) if total_shifts > 0 else 0,
            "date_range": {"start_date": start_date, "end_date": end_date}
        }
        
        # Status distribution
        status_counts = {}
        for data in adherence_data:
            status = data["status"]
            status_counts[status] = status_counts.get(status, 0) + 1
        
        return {
            "success": True,
            "overall_statistics": overall_stats,
            "status_distribution": status_counts,
            "employee_summaries": list(employee_summaries.values()),
            "detailed_adherence": adherence_data,
            "report_metadata": {
                "generated_at": datetime.utcnow().isoformat(),
                "generated_by": str(current_user["_id"]),
                "filters": {
                    "start_date": start_date,
                    "end_date": end_date,
                    "employee_id": employee_id,
                    "department": department
                }
            }
        }
        
    except Exception as e:
        print(f"ERROR: Failed to generate schedule adherence report: {e}")
        raise HTTPException(500, f"Failed to generate adherence report: {str(e)}")

@router.get("/schedule-adherence/export", response_model=dict)
async def export_schedule_adherence_report(
    format: str = Query("csv", description="Export format: csv, excel"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Export schedule adherence report in various formats"""
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Manager or administrator access required")
    
    try:
        # Get the adherence report data
        report_data = await get_schedule_adherence_report(
            start_date=start_date,
            end_date=end_date,
            employee_id=employee_id,
            department=department,
            current_user=current_user
        )
        
        if format.lower() == "csv":
            # Generate CSV content
            import csv
            import io
            
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write headers
            headers = [
                'Employee Name', 'Department', 'Date', 'Scheduled Start', 'Scheduled End',
                'Scheduled Hours', 'Actual Start', 'Actual End', 'Actual Hours',
                'Hours Difference', 'Early Minutes', 'Late Minutes', 'Status', 'Location', 'Role'
            ]
            writer.writerow(headers)
            
            # Write data rows
            for record in report_data["detailed_adherence"]:
                writer.writerow([
                    record["employee_name"],
                    record["department"] or "",
                    record["date"],
                    record["scheduled_start"],
                    record["scheduled_end"],
                    record["scheduled_hours"],
                    record["actual_start"] or "",
                    record["actual_end"] or "",
                    record["actual_hours"],
                    record["hours_difference"],
                    record["early_minutes"],
                    record["late_minutes"],
                    record["status"],
                    record["location"] or "",
                    record["role"] or ""
                ])
            
            csv_content = output.getvalue()
            output.close()
            
            # Log the export
            # await log_event("schedule_adherence_report_exported", {
            #     "format": format,
            #     "date_range": f"{start_date} to {end_date}",
            #     "employee_id": employee_id,
            #     "department": department,
            #     "record_count": len(report_data["detailed_adherence"])
            # }, user_id=str(current_user["_id"]))
            
            return {
                "success": True,
                "format": format,
                "content": csv_content,
                "filename": f"schedule_adherence_{start_date}_{end_date}.csv",
                "record_count": len(report_data["detailed_adherence"])
            }
            
        else:
            raise HTTPException(400, f"Unsupported export format: {format}")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR: Failed to export schedule adherence report: {e}")
        raise HTTPException(500, f"Failed to export report: {str(e)}")
