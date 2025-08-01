from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from app.schemas.schedule import ScheduleCreate, ScheduleOut, ScheduleUpdate, ScheduleGenerate
from app.schemas.user import UserOut
from app.services.scheduler import generate_schedule
from app.services.notification_service import create_schedule_update_notification
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from bson import ObjectId
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/", response_model=dict)
async def list_schedules(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=500),
    employeeId: Optional[str] = Query(None, alias="employeeId"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    department: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    filter_dict = {}
    if employeeId:
        filter_dict["employeeId"] = employeeId
    if start_date and end_date:
        filter_dict["date"] = {"$gte": start_date, "$lte": end_date}
    if department:
        filter_dict["department"] = department
    if status:
        filter_dict["status"] = status
    
    # Role-based filtering enforcement
    if current_user.get("role") == "employee":
        # Force filter to current user's ID
        filter_dict["employeeId"] = str(current_user["_id"])
        # And only show them confirmed or completed schedules
        if not status:
            filter_dict["status"] = {"$in": ["confirmed", "completed", "cancelled"]}

    total = await db["schedules"].count_documents(filter_dict)
    skip = (page - 1) * limit
    schedules_cursor = db["schedules"].find(filter_dict).sort("date", 1).skip(skip).limit(limit)
    schedules = await schedules_cursor.to_list(None)
    
    schedule_list = []
    for schedule_doc in schedules:
        employee_data_for_schedule = None
        employee_id_str = schedule_doc.get("employeeId")

        if employee_id_str:
            employee_db_doc = None
            if ObjectId.is_valid(employee_id_str):
                # First, try querying by ObjectId, as this is the standard for new data
                employee_db_doc = await db["users"].find_one({"_id": ObjectId(employee_id_str)})
                if not employee_db_doc:
                    # Fallback: if no user is found, try querying by the raw string.
                    # This handles edge cases or seeded data where an ID might be a valid
                    # ObjectId hex string but is stored as a string.
                    employee_db_doc = await db["users"].find_one({"_id": employee_id_str})
            else:
                # If the ID is not a valid ObjectId format, it must be a string (e.g., from seed data)
                employee_db_doc = await db["users"].find_one({"_id": employee_id_str})
            
            if employee_db_doc:
                employee_db_doc["_id"] = str(employee_db_doc["_id"])
                employee_data_for_schedule = UserOut(**employee_db_doc)

        schedule_doc["_id"] = str(schedule_doc["_id"])
        schedule_doc["employee"] = employee_data_for_schedule
        schedule_list.append(ScheduleOut(**schedule_doc))
    
    return {
        "items": schedule_list,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": (total + limit - 1) // limit
    }

@router.post("/", response_model=ScheduleOut, status_code=201)
async def create_schedule(
    schedule: ScheduleCreate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    employee_id_str = schedule.employeeId
    employee = None
    
    # Attempt to find the employee by ObjectId first (standard case)
    if ObjectId.is_valid(employee_id_str):
        employee = await db["users"].find_one({"_id": ObjectId(employee_id_str)})
    
    # If not found by ObjectId, try finding by string _id (for seeded/legacy data)
    if not employee:
        employee = await db["users"].find_one({"_id": employee_id_str})

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    schedule_dict = schedule.dict()
    schedule_dict["status"] = "scheduled"
    schedule_dict["createdAt"] = datetime.utcnow()
    
    res = await db["schedules"].insert_one(schedule_dict)
    new_schedule = await db["schedules"].find_one({"_id": res.inserted_id})
    
    employee["_id"] = str(employee["_id"])
    new_schedule["employee"] = UserOut(**employee)
    new_schedule["_id"] = str(new_schedule["_id"])
    
    await create_schedule_update_notification(
        employee_id=schedule.employeeId,
        schedule_id=str(new_schedule["_id"]),
        changes=f"A new shift on {schedule.date} from {schedule.startTime} to {schedule.endTime} has been added."
    )
    
    await log_event("schedule_created", {"schedule_id": str(res.inserted_id)})
    return ScheduleOut(**new_schedule)

@router.post("/publish", status_code=200)
async def publish_schedules(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = get_db()
    schedule_ids_str = data.get("schedule_ids", [])
    if not schedule_ids_str:
        raise HTTPException(status_code=400, detail="No schedule IDs provided for publishing")

    object_ids_to_publish = [ObjectId(id_str) for id_str in schedule_ids_str]

    result = await db["schedules"].update_many(
        {"_id": {"$in": object_ids_to_publish}, "status": "scheduled"},
        {"$set": {"status": "confirmed", "updatedAt": datetime.utcnow()}}
    )

    if result.modified_count > 0:
        published_schedules = await db["schedules"].find({"_id": {"$in": object_ids_to_publish}}).to_list(None)
        
        notifications_to_send = {}
        for schedule in published_schedules:
            emp_id = str(schedule["employeeId"])
            if emp_id not in notifications_to_send:
                notifications_to_send[emp_id] = []
            
            schedule_details = f"- {schedule['date']}: {schedule['startTime']} to {schedule['endTime']}"
            notifications_to_send[emp_id].append(schedule_details)

        for emp_id, details_list in notifications_to_send.items():
            changes_summary = "\n".join(details_list)
            await create_schedule_update_notification(
                employee_id=emp_id,
                schedule_id=str(published_schedules[0]["_id"]),
                changes=f"Your upcoming schedule has been confirmed:\n{changes_summary}"
            )
            
    await log_event("schedules_published", {"count": result.modified_count, "publisher_id": str(current_user["_id"])})

    return {"message": f"{result.modified_count} schedules published successfully."}

@router.get("/{schedule_id}", response_model=ScheduleOut)
async def get_schedule(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(schedule_id)
    except Exception:
        raise HTTPException(400, "Invalid schedule ID")
    
    schedule = await db["schedules"].find_one({"_id": oid})
    if not schedule:
        raise HTTPException(404, "Schedule not found")
    
    employee = await db["users"].find_one({"_id": ObjectId(schedule["employeeId"])})
    if employee:
        employee["_id"] = str(employee["_id"])
        schedule["employee"] = UserOut(**employee)
    
    schedule["_id"] = str(schedule["_id"])
    return ScheduleOut(**schedule)

@router.put("/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    schedule_id: str,
    schedule_update: ScheduleUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(schedule_id)
    except Exception:
        raise HTTPException(400, "Invalid schedule ID")
    
    existing = await db["schedules"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Schedule not found")
    
    update_dict = schedule_update.dict(exclude_unset=True)
    update_dict["updatedAt"] = datetime.utcnow()
    
    await db["schedules"].update_one({"_id": oid}, {"$set": update_dict})
    updated = await db["schedules"].find_one({"_id": oid})
    
    employee = await db["users"].find_one({"_id": ObjectId(updated["employeeId"])})
    if employee:
        employee["_id"] = str(employee["_id"])
        updated["employee"] = UserOut(**employee)
    
    updated["_id"] = str(updated["_id"])
    
    await create_schedule_update_notification(
        employee_id=updated["employeeId"],
        schedule_id=schedule_id,
        changes=f"Your shift on {updated['date']} has been modified."
    )
    
    await log_event("schedule_updated", {"schedule_id": schedule_id})
    return ScheduleOut(**updated)

@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(schedule_id)
    except Exception:
        raise HTTPException(400, "Invalid schedule ID")
    
    res = await db["schedules"].delete_one({"_id": oid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Schedule not found")
    await log_event("schedule_deleted", {"schedule_id": schedule_id})

@router.post("/generate", response_model=list[ScheduleOut])
async def generate_schedules(
    generate_request: ScheduleGenerate,
    current_user: dict = Depends(get_current_user)
):
    print("--- SCHEDULE GENERATION ENDPOINT HIT ---")
    db = get_db()
    
    try:
        # Add debugging logs
        print(f"DEBUG: ===== SCHEDULE GENERATION REQUEST =====")
        print(f"DEBUG: User: {current_user.get('email', 'Unknown')}")
        print(f"DEBUG: Request: {generate_request}")
        
        start_date = datetime.fromisoformat(generate_request.startDate)
        end_date = datetime.fromisoformat(generate_request.endDate)
        
        print(f"DEBUG: Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        
    except Exception as e:
        print(f"ERROR: Date parsing failed: {e}")
        raise HTTPException(400, f"Invalid date format: {e}")
    
    try:
        constraints_oid = ObjectId(generate_request.constraintsId)
        print(f"DEBUG: Constraints ID: {constraints_oid}")
    except Exception as e:
        print(f"ERROR: Invalid constraints ID: {e}")
        raise HTTPException(400, f"Invalid constraints ID: {e}")
    
    try:
        constraints = await db["scheduling_constraints"].find_one({"_id": constraints_oid})
        if not constraints:
            print(f"ERROR: Constraints not found for ID: {constraints_oid}")
            raise HTTPException(404, "Scheduling constraints not found")
        
        print(f"DEBUG: Found constraints: '{constraints.get('name', 'Unknown')}'")
        
        # Log constraint details for debugging
        operating_hours = constraints.get("operating_hours", [])
        print(f"DEBUG: Constraint has {len(operating_hours)} operating hour entries")
        for oh in operating_hours[:3]:  # Show first 3 for brevity
            day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][oh.get("day_of_week", 0)]
            print(f"  Sample: {day_name}: open={oh.get('is_open')}, min_staff={oh.get('min_staff')}, max_staff={oh.get('max_staff')}")
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR: Database error fetching constraints: {e}")
        raise HTTPException(500, f"Database error: {e}")
    
    try:
        # Fetch ALL active, non-anonymized employees, regardless of role.
        # The scheduler will filter/select by role requirements later.
        employees = await db["users"].find({
            "isActive": True,
            "anonymized": {"$ne": True}
        }).to_list(None)
        print(f"DEBUG: Found {len(employees)} active, non-anonymized employees")
        
        if len(employees) == 0:
            print("WARNING: No active employees available for scheduling")
            return []  # No employees to schedule
            
    except Exception as e:
        print(f"ERROR: Database error fetching employees: {e}")
        raise HTTPException(500, f"Database error: {e}")
    
    try:
        print("DEBUG: ===== CALLING SCHEDULE GENERATION =====")
        generated_schedules = generate_schedule(employees, constraints, start_date, end_date)
        print(f"DEBUG: Schedule generation completed - {len(generated_schedules)} schedules generated")
        
        if len(generated_schedules) == 0:
            print("WARNING: Schedule generation returned 0 schedules")
            print("POSSIBLE CAUSES:")
            print("  1. Constraint template requirements cannot be met with available employees")
            print("  2. All days are marked as closed in operating hours")
            print("  3. Employee availability conflicts with operating hours")
            print("  4. Min staffing requirements exceed available employees")
            # Still return empty list but with better logging
            return []
        
    except Exception as e:
        print(f"ERROR: Schedule generation failed with exception: {e}")
        import traceback
        traceback.print_exc()
        # Instead of completely failing, return empty list with error info
        print("RECOMMENDATION: Check constraint template settings and employee availability")
        return []
    
    schedule_list = []
    if generated_schedules:
        try:
            print("DEBUG: Inserting schedules into database...")
            # Prepare for bulk insert
            schedules_to_insert = []
            for schedule_data in generated_schedules:
                schedule_dict = {
                    "employeeId": schedule_data["employeeId"],
                    "date": schedule_data["date"],
                    "startTime": schedule_data["startTime"],
                    "endTime": schedule_data["endTime"],
                    "location": schedule_data.get("location", "Main Office"),
                    "role": schedule_data.get("role", "General"),
                    "department": schedule_data.get("department", "General"),
                    "status": "scheduled",
                    "createdAt": datetime.utcnow()
                }
                schedules_to_insert.append(schedule_dict)

            result = await db["schedules"].insert_many(schedules_to_insert)
            print(f"DEBUG: Inserted {len(result.inserted_ids)} schedules")
            
            # Fetch the newly inserted documents to return them with IDs
            new_schedules = await db["schedules"].find({"_id": {"$in": result.inserted_ids}}).to_list(None)
            
            for new_schedule in new_schedules:
                employee_data_for_schedule = None
                employee_id_str = new_schedule.get("employeeId")

                if employee_id_str:
                    employee_db_doc = None
                    if ObjectId.is_valid(employee_id_str):
                        # First, try querying by ObjectId, as this is the standard for new data
                        employee_db_doc = await db["users"].find_one({"_id": ObjectId(employee_id_str)})
                        if not employee_db_doc:
                            # Fallback: if no user is found, try querying by the raw string.
                            # This handles edge cases or seeded data where an ID might be a valid
                            # ObjectId hex string but is stored as a string.
                            employee_db_doc = await db["users"].find_one({"_id": employee_id_str})
                    else:
                        # If the ID is not a valid ObjectId format, it must be a string (e.g., from seed data)
                        employee_db_doc = await db["users"].find_one({"_id": employee_id_str})

                    if employee_db_doc:
                        employee_db_doc["_id"] = str(employee_db_doc["_id"])
                        employee_data_for_schedule = UserOut(**employee_db_doc)
                    else:
                        print(f"Warning: Employee not found for ID: {employee_id_str}")

                new_schedule["_id"] = str(new_schedule["_id"])
                new_schedule["employee"] = employee_data_for_schedule
                schedule_list.append(ScheduleOut(**new_schedule))
                
        except Exception as e:
            print(f"ERROR: Database insertion failed: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(500, f"Failed to save schedules: {e}")

    await log_event("schedules_generated", {"count": len(schedule_list)})
    print(f"DEBUG: Returning {len(schedule_list)} schedules")
    return schedule_list

@router.post("/validate", response_model=dict)
async def validate_schedule_batch(
    schedule_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Validate a batch of schedules against constraints"""
    from app.services.scheduler import detect_schedule_conflicts, validate_schedule_constraints, calculate_schedule_metrics
    
    schedules = schedule_data.get("schedules", [])
    constraints = schedule_data.get("constraints", {})
    
    if not schedules:
        raise HTTPException(400, "No schedules provided for validation")
    
    # Run conflict detection
    conflicts = detect_schedule_conflicts(schedules)
    
    # Validate each schedule
    validated_schedules = []
    for schedule in schedules:
        validation = validate_schedule_constraints(schedule, constraints)
        schedule["validation"] = validation
        validated_schedules.append(schedule)
    
    # Calculate metrics
    metrics = calculate_schedule_metrics(validated_schedules)
    
    return {
        "success": True,
        "conflicts": conflicts,
        "metrics": metrics,
        "validated_schedules": validated_schedules,
        "summary": {
            "total_schedules": len(schedules),
            "conflict_count": len(conflicts),
            "high_severity_conflicts": len([c for c in conflicts if c.get("severity") == "high"]),
            "average_quality_score": metrics.get("scheduleQualityScore", 0),
            "overall_health": "good" if len(conflicts) == 0 else "warning" if len([c for c in conflicts if c.get("severity") == "high"]) == 0 else "critical"
        }
    }

@router.get("/{schedule_id}/conflicts")
async def check_schedule_conflicts(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check for conflicts with a specific schedule"""
    from app.services.scheduler import detect_schedule_conflicts
    
    db = get_db()
    
    # Get the specific schedule
    schedule = await db["schedules"].find_one({"_id": ObjectId(schedule_id)})
    if not schedule:
        raise HTTPException(404, "Schedule not found")
    
    # Get all schedules for the same employee within a reasonable time window
    employee_id = schedule["employeeId"]
    schedule_date = datetime.strptime(schedule["date"], "%Y-%m-%d")
    start_range = (schedule_date - timedelta(days=7)).strftime("%Y-%m-%d")
    end_range = (schedule_date + timedelta(days=7)).strftime("%Y-%m-%d")
    
    related_schedules = await db["schedules"].find({
        "employeeId": employee_id,
        "date": {"$gte": start_range, "$lte": end_range}
    }).to_list(None)
    
    # Convert ObjectIds to strings
    for s in related_schedules:
        s["_id"] = str(s["_id"])
    
    # Detect conflicts
    conflicts = detect_schedule_conflicts(related_schedules)
    
    # Filter conflicts that involve this specific schedule
    relevant_conflicts = [
        c for c in conflicts
        if any(cs.get("_id") == schedule_id or str(cs.get("_id")) == schedule_id 
               for cs in c.get("conflictingSchedules", []))
    ]
    
    return {
        "success": True,
        "schedule_id": schedule_id,
        "conflicts": relevant_conflicts,
        "conflict_count": len(relevant_conflicts),
        "has_high_severity": any(c.get("severity") == "high" for c in relevant_conflicts)
    }

@router.post("/apply-auto-fixes")
async def apply_auto_fixes(
    fix_request: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Apply automatic fixes to scheduling constraints based on conflict analysis.
    """
    db = get_db()
    
    try:
        constraints_id = fix_request.get("constraints_id")
        conflict_analysis = fix_request.get("conflict_analysis", {})
        
        if not constraints_id:
            raise HTTPException(400, "Missing constraints_id")
        
        constraints_oid = ObjectId(constraints_id)
        
        # Get current constraints
        constraints = await db["scheduling_constraints"].find_one({"_id": constraints_oid})
        if not constraints:
            raise HTTPException(404, "Scheduling constraints not found")
        
        # Import the auto-fix function
        from ..services.scheduler import apply_suggested_fixes
        
        # Apply auto-fixes
        fix_result = apply_suggested_fixes(constraints, conflict_analysis)
        
        if isinstance(fix_result, dict) and "constraints" in fix_result:
            # New enhanced format
            fixed_constraints = fix_result["constraints"]
            applied_fixes = fix_result.get("applied_fixes", [])
            fix_count = fix_result.get("fix_count", 0)
        else:
            # Legacy format fallback
            fixed_constraints = fix_result
            applied_fixes = []
            fix_count = 0
        
        # Update constraints in database
        if fix_count > 0:
            await db["scheduling_constraints"].update_one(
                {"_id": constraints_oid},
                {"$set": fixed_constraints}
            )
        
        return {
            "success": True,
            "message": f"Applied {fix_count} automatic fixes",
            "applied_fixes": applied_fixes,
            "fix_count": fix_count,
            "updated_constraints": fixed_constraints
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR: Auto-fix application failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"Auto-fix application failed: {str(e)}"
        }

@router.post("/analyze-conflicts")
async def analyze_scheduling_conflicts(
    generate_request: ScheduleGenerate,
    current_user: dict = Depends(get_current_user)
):
    """
    Enhanced conflict analysis endpoint with premium UX support.
    Analyzes scheduling constraints and provides detailed conflict resolution suggestions.
    """
    db = get_db()
    
    try:
        start_date = datetime.fromisoformat(generate_request.startDate)
        end_date = datetime.fromisoformat(generate_request.endDate)
        constraints_oid = ObjectId(generate_request.constraintsId)
        
        # Get constraints
        constraints = await db["scheduling_constraints"].find_one({"_id": constraints_oid})
        if not constraints:
            raise HTTPException(404, "Scheduling constraints not found")
        
        # Get active employees
        employees = await db["users"].find({
            "isActive": True,
            "anonymized": {"$ne": True}
        }).to_list(None)
        
        # Import the conflict detection function
        from ..services.scheduler import detect_scheduling_conflicts, _ensure_constraint_defaults
        
        # Enhance constraints with defaults
        enhanced_constraints = _ensure_constraint_defaults(constraints)
        
        # Run enhanced conflict analysis
        conflict_analysis = detect_scheduling_conflicts(enhanced_constraints, employees, start_date, end_date)
        
        # Check if auto-fixes are available
        auto_fix_available = any(s.get("auto_fixable", False) for s in conflict_analysis.get("suggestions", []))
        
        # Prepare response with enhanced data
        response_data = {
            "success": True,
            "data": {
                "constraint_name": constraints.get("name", "Unknown"),
                "date_range": {
                    "start": start_date.strftime("%Y-%m-%d"),
                    "end": end_date.strftime("%Y-%m-%d")
                },
                "total_employees": len(employees),
                "conflict_count": conflict_analysis.get("conflict_count", 0),
                "has_critical_conflicts": conflict_analysis.get("has_critical_conflicts", False),
                "conflicts": conflict_analysis.get("conflicts", []),
                "suggestions": conflict_analysis.get("suggestions", []),
                "can_proceed": not conflict_analysis.get("has_critical_conflicts", False),
                "critical_count": conflict_analysis.get("critical_count", 0),
                "warning_count": conflict_analysis.get("warning_count", 0),
                "auto_fix_available": auto_fix_available,
                "analysis_summary": {
                    "total_conflicts": len(conflict_analysis.get("conflicts", [])),
                    "critical_conflicts": conflict_analysis.get("critical_count", 0),
                    "warning_conflicts": conflict_analysis.get("warning_count", 0),
                    "auto_fixable_suggestions": len([s for s in conflict_analysis.get("suggestions", []) if s.get("auto_fixable", False)]),
                    "manual_suggestions": len([s for s in conflict_analysis.get("suggestions", []) if not s.get("auto_fixable", False)]),
                    "employee_count": len(employees),
                    "date_range_days": (end_date - start_date).days + 1
                }
            }
        }
        
        # Add constraint template info for context
        response_data["data"]["constraint_template"] = {
            "id": str(constraints_oid),
            "name": constraints.get("name", "Unknown"),
            "description": constraints.get("description", "")
        }
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR: Conflict analysis failed: {e}")
        return {
            "success": False,
            "message": f"Conflict analysis failed: {str(e)}"
        }