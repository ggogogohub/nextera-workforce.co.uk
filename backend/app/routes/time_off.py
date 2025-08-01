
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.schemas.timeoff import TimeOffCreate, TimeOffOut, TimeOffUpdate, TimeOffReview
from app.schemas.user import UserOut
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.get("/", response_model=dict)
async def get_time_off_requests(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    employeeId: Optional[str] = None,
    status: Optional[str] = None,
    type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    collection_name = "timeoff" # Standardize collection name
    
    # Build filter
    filter_dict = {}
    if employeeId:
        filter_dict["employeeId"] = employeeId
    if status:
        filter_dict["status"] = status
    if type:
        filter_dict["type"] = type
    
    # If user is employee, only show their requests
    if current_user.get("role") == "employee":
        filter_dict["employeeId"] = str(current_user["_id"])
    
    # Get total count
    total = await db[collection_name].count_documents(filter_dict)
    
    # Get paginated results
    skip = (page - 1) * limit
    requests_cursor = db[collection_name].find(filter_dict).skip(skip).limit(limit)
    requests = await requests_cursor.to_list(None)
    
    # Populate employee data and convert to TimeOffOut format
    request_list = []
    for request in requests:
        # Get employee data
        if request.get("employeeId"): # Check if employeeId exists
            try:
                employee_obj_id = ObjectId(request["employeeId"])
                employee = await db["users"].find_one({"_id": employee_obj_id})
                if employee:
                    employee["_id"] = str(employee["_id"])
                    request["employee"] = UserOut(**employee)
                else:
                    request["employee"] = None # Or some default, or log a warning
            except Exception as e:
                # Log error if ObjectId conversion fails or other db issue
                print(f"Error fetching employee {request.get('employeeId')} for request {request.get('_id')}: {e}")
                request["employee"] = None
        else:
            request["employee"] = None # Handle missing employeeId

        request["_id"] = str(request["_id"]) # Ensure _id is a string for TimeOffOut
        request_list.append(TimeOffOut(**request))
    
    return {
        "items": request_list,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": (total + limit - 1) // limit
    }

@router.post("/", response_model=TimeOffOut, status_code=201)
async def create_time_off_request(
    time_off: TimeOffCreate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    collection_name = "timeoff" # Standardize collection name
    
    # Calculate total days
    start_date = datetime.fromisoformat(time_off.startDate)
    end_date = datetime.fromisoformat(time_off.endDate)
    total_days = (end_date - start_date).days + 1
    
    time_off_dict = time_off.dict()
    time_off_dict["employeeId"] = str(current_user["_id"])
    time_off_dict["status"] = "pending"
    time_off_dict["submittedAt"] = datetime.utcnow()
    time_off_dict["totalDays"] = total_days
    
    res = await db[collection_name].insert_one(time_off_dict)
    new_request = await db[collection_name].find_one({"_id": res.inserted_id})
    
    # Populate employee data
    employee = await db["users"].find_one({"_id": current_user["_id"]})
    employee["id"] = str(employee["_id"])
    new_request["employee"] = UserOut(**employee)
    new_request["_id"] = str(new_request["_id"]) # Ensure the aliased field is a string
    # new_request["id"] is not strictly necessary if _id is correctly stringified for Pydantic
    
    await log_event("time_off_request_created", {"request_id": str(res.inserted_id)})
    return TimeOffOut(**new_request)

@router.get("/{request_id}", response_model=TimeOffOut)
async def get_time_off_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(request_id)
    except:
        raise HTTPException(400, "Invalid request ID")
    
    collection_name = "timeoff" # Standardize collection name
    request = await db[collection_name].find_one({"_id": oid})
    if not request:
        raise HTTPException(404, "Time off request not found")
    
    # Check permissions
    if current_user.get("role") == "employee" and request["employeeId"] != str(current_user["_id"]):
        raise HTTPException(403, "Access denied")
    
    # Populate employee data
    employee = await db["users"].find_one({"_id": ObjectId(request["employeeId"])})
    if employee:
        employee["id"] = str(employee["_id"])
        request["employee"] = UserOut(**employee)
    
    request["_id"] = str(request["_id"]) # Ensure _id is a string for TimeOffOut
    return TimeOffOut(**request)

@router.put("/{request_id}", response_model=TimeOffOut)
async def update_time_off_request(
    request_id: str,
    time_off_update: TimeOffUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(request_id)
    except:
        raise HTTPException(400, "Invalid request ID")
    
    collection_name = "timeoff" # Standardize collection name
    existing = await db[collection_name].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Time off request not found")
    
    # Check permissions
    if current_user.get("role") == "employee" and existing["employeeId"] != str(current_user["_id"]):
        raise HTTPException(403, "Access denied")
    
    # Only allow updates if status is pending
    if existing["status"] != "pending":
        raise HTTPException(400, "Cannot update non-pending request")
    
    update_dict = time_off_update.dict(exclude_unset=True)
    
    # Recalculate total days if dates changed
    if "startDate" in update_dict or "endDate" in update_dict:
        start_date = datetime.fromisoformat(update_dict.get("startDate", existing["startDate"]))
        end_date = datetime.fromisoformat(update_dict.get("endDate", existing["endDate"]))
        update_dict["totalDays"] = (end_date - start_date).days + 1
    
    await db[collection_name].update_one({"_id": oid}, {"$set": update_dict})
    updated = await db[collection_name].find_one({"_id": oid})
    
    # Populate employee data
    employee = await db["users"].find_one({"_id": ObjectId(updated["employeeId"])})
    if employee:
        employee["id"] = str(employee["_id"])
        updated["employee"] = UserOut(**employee)
    
    updated["_id"] = str(updated["_id"]) # Ensure _id is a string for TimeOffOut
    await log_event("time_off_request_updated", {"request_id": request_id}) # Added await
    return TimeOffOut(**updated)

@router.post("/{request_id}/review", response_model=TimeOffOut)
async def review_time_off_request(
    request_id: str,
    review: TimeOffReview,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions")
    
    try:
        oid = ObjectId(request_id)
    except:
        raise HTTPException(400, "Invalid request ID")
    
    collection_name = "timeoff" # Standardize collection name
    existing = await db[collection_name].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Time off request not found")
    
    if existing["status"] != "pending":
        raise HTTPException(400, "Request has already been reviewed")
    
    update_dict = {
        "status": review.status,
        "reviewedAt": datetime.utcnow(),
        "reviewedBy": str(current_user["_id"]),
        "reviewerNotes": review.notes
    }
    
    await db[collection_name].update_one({"_id": oid}, {"$set": update_dict})
    updated = await db[collection_name].find_one({"_id": oid})
    
    # Populate employee data
    employee = await db["users"].find_one({"_id": ObjectId(updated["employeeId"])})
    if employee:
        employee["id"] = str(employee["_id"])
        updated["employee"] = UserOut(**employee)
    
    updated["_id"] = str(updated["_id"]) # Ensure _id is a string for TimeOffOut
    await log_event("time_off_request_reviewed", { # Added await
        "request_id": request_id,
        "status": review.status,
        "reviewer_id": str(current_user["_id"])
    })
    return TimeOffOut(**updated)

@router.delete("/{request_id}", status_code=204)
async def delete_time_off_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(request_id)
    except:
        raise HTTPException(400, "Invalid request ID")
    
    collection_name = "timeoff" # Standardize collection name
    existing = await db[collection_name].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Time off request not found")
    
    # Check permissions
    if current_user.get("role") == "employee" and existing["employeeId"] != str(current_user["_id"]):
        raise HTTPException(403, "Access denied")
    
    res = await db[collection_name].delete_one({"_id": oid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Time off request not found")
    await log_event("time_off_request_deleted", {"request_id": request_id}) # Added await
