
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from app.models.shift_swap import ShiftSwapRequest, ShiftSwapCreate, ShiftSwapUpdate, ShiftSwapResponse, ShiftSwapEligibility, check_swap_eligibility, SwapStatus
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from app.services.notification_service import create_notification
from bson import ObjectId
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/", response_model=List[ShiftSwapRequest])
async def list_shift_swap_requests(
    status: Optional[SwapStatus] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Get shift swap requests - employees see their own, managers see all"""
    db = get_db()
    
    # Build filter based on user role
    filter_dict = {}
    
    if current_user.get("role") in ["manager", "administrator"]:
        # Managers can see all requests
        if status:
            filter_dict["status"] = status
    else:
        # Employees see requests they created or were invited to respond to
        user_id = str(current_user["_id"])
        filter_dict = {
            "$or": [
                {"requester_id": user_id},
                {"target_employee_id": user_id},
                {"responses.employee_id": user_id}
            ]
        }
        if status:
            filter_dict["status"] = status
    
    requests = await db["shift_swap_requests"].find(filter_dict).sort("created_at", -1).to_list(None)
    
    # Convert ObjectId to string and add user details
    for request in requests:
        request["_id"] = str(request["_id"])
        
        # Add requester details
        if request.get("requester_id"):
            requester = await db["users"].find_one({"_id": ObjectId(request["requester_id"])})
            if requester:
                request["requester"] = {
                    "id": str(requester["_id"]),
                    "firstName": requester["firstName"],
                    "lastName": requester["lastName"],
                    "email": requester["email"]
                }
        
        # Add target employee details if specified
        if request.get("target_employee_id"):
            target = await db["users"].find_one({"_id": ObjectId(request["target_employee_id"])})
            if target:
                request["target_employee"] = {
                    "id": str(target["_id"]),
                    "firstName": target["firstName"],
                    "lastName": target["lastName"],
                    "email": target["email"]
                }
        
        # Add shift details
        if request.get("requester_shift_id"):
            shift = await db["schedules"].find_one({"_id": ObjectId(request["requester_shift_id"])})
            if shift:
                request["requester_shift"] = {
                    "id": str(shift["_id"]),
                    "date": shift["date"],
                    "startTime": shift["startTime"],
                    "endTime": shift["endTime"],
                    "location": shift["location"],
                    "role": shift["role"]
                }
    
    return [ShiftSwapRequest(**req) for req in requests]

@router.post("/", response_model=ShiftSwapRequest, status_code=201)
async def create_shift_swap_request(
    swap_request: ShiftSwapCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new shift swap request"""
    db = get_db()
    user_id = str(current_user["_id"])
    
    # Verify the requester owns the shift they want to swap
    requester_shift = await db["schedules"].find_one({
        "_id": ObjectId(swap_request.requester_shift_id),
        "employeeId": user_id
    })
    
    if not requester_shift:
        raise HTTPException(404, "Shift not found or you don't have permission to swap it")
    
    # Check if shift is in the future
    shift_date = datetime.strptime(requester_shift["date"], "%Y-%m-%d")
    if shift_date <= datetime.now():
        raise HTTPException(400, "Cannot swap shifts in the past")
    
    # Check if there's already an active swap request for this shift
    existing_request = await db["shift_swap_requests"].find_one({
        "requester_shift_id": swap_request.requester_shift_id,
        "status": {"$in": ["pending", "approved"]}
    })
    
    if existing_request:
        raise HTTPException(400, "A swap request for this shift is already active")
    
    # If target employee specified, verify the target shift
    if swap_request.target_employee_id and swap_request.target_shift_id:
        target_shift = await db["schedules"].find_one({
            "_id": ObjectId(swap_request.target_shift_id),
            "employeeId": swap_request.target_employee_id
        })
        
        if not target_shift:
            raise HTTPException(404, "Target shift not found")
        
        # Check swap eligibility
        eligibility = check_swap_eligibility(requester_shift, target_shift)
        if not eligibility.is_eligible:
            raise HTTPException(400, f"Shifts are not eligible for swap: {'; '.join(eligibility.reasons)}")
    
    # Create the swap request
    request_doc = swap_request.dict()
    request_doc.update({
        "requester_id": user_id,
        "status": SwapStatus.PENDING,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(days=7),  # Expire in 7 days
        "responses": [],
        "notifications_sent": []
    })
    
    result = await db["shift_swap_requests"].insert_one(request_doc)
    
    # Create notifications
    notifications_to_send = []
    
    # Notify managers
    managers = await db["users"].find({"role": {"$in": ["manager", "administrator"]}}).to_list(None)
    for manager in managers:
        notifications_to_send.append({
            "user_id": str(manager["_id"]),
            "title": "New Shift Swap Request",
            "message": f"{current_user['firstName']} {current_user['lastName']} has requested a shift swap",
            "type": "approval_request",
            "link": f"/shift-swaps/{str(result.inserted_id)}"
        })
    
    # If specific target employee, notify them
    if swap_request.target_employee_id:
        notifications_to_send.append({
            "user_id": swap_request.target_employee_id,
            "title": "Shift Swap Request",
            "message": f"{current_user['firstName']} {current_user['lastName']} wants to swap shifts with you",
            "type": "info",
            "link": f"/shift-swaps/{str(result.inserted_id)}"
        })
    else:
        # Open request - notify eligible employees in same department/role
        eligible_employees = await db["users"].find({
            "department": requester_shift.get("department"),
            "role": "employee",
            "_id": {"$ne": ObjectId(user_id)}
        }).to_list(None)
        
        for employee in eligible_employees:
            notifications_to_send.append({
                "user_id": str(employee["_id"]),
                "title": "Shift Swap Opportunity",
                "message": f"New shift swap opportunity available for {requester_shift['date']}",
                "type": "info",
                "link": f"/shift-swaps/{str(result.inserted_id)}"
            })
    
    # Send all notifications
    for notification in notifications_to_send:
        try:
            await create_notification(**notification)
        except Exception as e:
            print(f"Failed to send notification: {e}")
    
    # Log the event
    await log_event("shift_swap_requested", {
        "swap_request_id": str(result.inserted_id),
        "requester_id": user_id,
        "requester_shift_id": swap_request.requester_shift_id,
        "target_employee_id": swap_request.target_employee_id,
        "target_shift_id": swap_request.target_shift_id
    })
    
    # Return the created request
    new_request = await db["shift_swap_requests"].find_one({"_id": result.inserted_id})
    new_request["_id"] = str(new_request["_id"])
    
    return ShiftSwapRequest(**new_request)

@router.get("/eligible-partners/{shift_id}")
async def get_eligible_swap_partners(
    shift_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Find employees with shifts eligible for swapping"""
    db = get_db()
    
    # Get the shift to swap
    source_shift = await db["schedules"].find_one({"_id": ObjectId(shift_id)})
    if not source_shift:
        raise HTTPException(404, "Shift not found")
    
    # Verify user owns this shift
    if source_shift["employeeId"] != str(current_user["_id"]):
        raise HTTPException(403, "You don't own this shift")
    
    # Find potential swap partners - shifts in same time period, different employees
    source_date = datetime.strptime(source_shift["date"], "%Y-%m-%d")
    date_range_start = (source_date - timedelta(days=7)).strftime("%Y-%m-%d")
    date_range_end = (source_date + timedelta(days=7)).strftime("%Y-%m-%d")
    
    potential_shifts = await db["schedules"].find({
        "date": {"$gte": date_range_start, "$lte": date_range_end},
        "employeeId": {"$ne": str(current_user["_id"])},
        "status": "confirmed",
        "_id": {"$ne": ObjectId(shift_id)}
    }).to_list(None)
    
    eligible_partners = []
    
    for shift in potential_shifts:
        # Check if there's already a swap request for this shift
        existing_request = await db["shift_swap_requests"].find_one({
            "requester_shift_id": str(shift["_id"]),
            "status": {"$in": ["pending", "approved"]}
        })
        
        if existing_request:
            continue
        
        # Check eligibility
        eligibility = check_swap_eligibility(source_shift, shift)
        
        # Get employee details
        employee = await db["users"].find_one({"_id": ObjectId(shift["employeeId"])})
        
        eligible_partners.append({
            "shift": {
                "id": str(shift["_id"]),
                "date": shift["date"],
                "startTime": shift["startTime"],
                "endTime": shift["endTime"],
                "location": shift["location"],
                "role": shift["role"],
                "department": shift["department"]
            },
            "employee": {
                "id": str(employee["_id"]),
                "firstName": employee["firstName"],
                "lastName": employee["lastName"],
                "department": employee.get("department")
            },
            "eligibility": eligibility.dict()
        })
    
    return {"eligible_partners": eligible_partners}

@router.post("/{request_id}/respond", response_model=ShiftSwapRequest)
async def respond_to_swap_request(
    request_id: str,
    response: ShiftSwapResponse,
    current_user: dict = Depends(get_current_user)
):
    """Employee responds to a shift swap request"""
    db = get_db()
    
    # Get the swap request
    swap_request = await db["shift_swap_requests"].find_one({"_id": ObjectId(request_id)})
    if not swap_request:
        raise HTTPException(404, "Swap request not found")
    
    if swap_request["status"] != SwapStatus.PENDING:
        raise HTTPException(400, "This swap request is no longer active")
    
    # Verify the user owns the shift they're offering
    offered_shift = await db["schedules"].find_one({
        "_id": ObjectId(response.shift_id),
        "employeeId": str(current_user["_id"])
    })
    
    if not offered_shift:
        raise HTTPException(404, "Shift not found or you don't own it")
    
    # Check if user already responded
    existing_response = next(
        (r for r in swap_request.get("responses", []) if r["employee_id"] == str(current_user["_id"])),
        None
    )
    
    if existing_response:
        raise HTTPException(400, "You have already responded to this request")
    
    # Add response to the request
    new_response = {
        "employee_id": str(current_user["_id"]),
        "shift_id": response.shift_id,
        "accepted": response.accepted,
        "notes": response.notes,
        "responded_at": datetime.utcnow().isoformat()
    }
    
    await db["shift_swap_requests"].update_one(
        {"_id": ObjectId(request_id)},
        {
            "$push": {"responses": new_response},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    # Notify the requester
    requester = await db["users"].find_one({"_id": ObjectId(swap_request["requester_id"])})
    if requester:
        action = "accepted" if response.accepted else "declined"
        await create_notification(
            user_id=str(requester["_id"]),
            title=f"Shift Swap Response - {action.title()}",
            message=f"{current_user['firstName']} {current_user['lastName']} has {action} your shift swap request",
            type="info",
            link=f"/shift-swaps/{request_id}"
        )
    
    # Log the event
    await log_event("shift_swap_response", {
        "swap_request_id": request_id,
        "responder_id": str(current_user["_id"]),
        "accepted": response.accepted,
        "shift_id": response.shift_id
    })
    
    # Return updated request
    updated_request = await db["shift_swap_requests"].find_one({"_id": ObjectId(request_id)})
    updated_request["_id"] = str(updated_request["_id"])
    
    return ShiftSwapRequest(**updated_request)

@router.post("/{request_id}/review", response_model=ShiftSwapRequest)
async def review_swap_request(
    request_id: str,
    review: ShiftSwapUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Manager approves or rejects a shift swap request"""
    db = get_db()
    
    # Check manager permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Only managers can review swap requests")
    
    # Get the swap request
    swap_request = await db["shift_swap_requests"].find_one({"_id": ObjectId(request_id)})
    if not swap_request:
        raise HTTPException(404, "Swap request not found")
    
    if swap_request["status"] != SwapStatus.PENDING:
        raise HTTPException(400, "This swap request has already been reviewed")
    
    # Update the request
    update_data = {
        "status": review.status,
        "reviewed_by": str(current_user["_id"]),
        "reviewed_at": datetime.utcnow(),
        "review_notes": review.review_notes,
        "updated_at": datetime.utcnow()
    }
    
    if review.status == SwapStatus.APPROVED:
        # If approved, set final swap details
        if review.final_swap_partner_id and review.final_swap_shift_id:
            update_data["final_swap_partner_id"] = review.final_swap_partner_id
            update_data["final_swap_shift_id"] = review.final_swap_shift_id
            
            # Execute the swap by updating the schedules
            try:
                # Swap the employeeId fields
                await db["schedules"].update_one(
                    {"_id": ObjectId(swap_request["requester_shift_id"])},
                    {"$set": {"employeeId": review.final_swap_partner_id}}
                )
                
                await db["schedules"].update_one(
                    {"_id": ObjectId(review.final_swap_shift_id)},
                    {"$set": {"employeeId": swap_request["requester_id"]}}
                )
                
                update_data["status"] = SwapStatus.COMPLETED
                
            except Exception as e:
                raise HTTPException(500, f"Failed to execute swap: {str(e)}")
    
    await db["shift_swap_requests"].update_one(
        {"_id": ObjectId(request_id)},
        {"$set": update_data}
    )
    
    # Send notifications
    notifications = []
    
    # Notify requester
    requester = await db["users"].find_one({"_id": ObjectId(swap_request["requester_id"])})
    if requester:
        status_msg = "approved" if review.status == SwapStatus.APPROVED else "rejected"
        notifications.append({
            "user_id": str(requester["_id"]),
            "title": f"Shift Swap Request {status_msg.title()}",
            "message": f"Your shift swap request has been {status_msg}",
            "type": "info" if review.status == SwapStatus.APPROVED else "warning",
            "link": f"/shift-swaps/{request_id}"
        })
    
    # If approved, notify swap partner
    if review.status == SwapStatus.APPROVED and review.final_swap_partner_id:
        partner = await db["users"].find_one({"_id": ObjectId(review.final_swap_partner_id)})
        if partner:
            notifications.append({
                "user_id": str(partner["_id"]),
                "title": "Shift Swap Approved",
                "message": f"Your shift swap with {requester['firstName']} {requester['lastName']} has been approved",
                "type": "success",
                "link": f"/shift-swaps/{request_id}"
            })
    
    # Send notifications
    for notification in notifications:
        try:
            await create_notification(**notification)
        except Exception as e:
            print(f"Failed to send notification: {e}")
    
    # Log the event
    await log_event("shift_swap_reviewed", {
        "swap_request_id": request_id,
        "reviewer_id": str(current_user["_id"]),
        "status": review.status,
        "final_swap_partner_id": review.final_swap_partner_id
    })
    
    # Return updated request
    updated_request = await db["shift_swap_requests"].find_one({"_id": ObjectId(request_id)})
    updated_request["_id"] = str(updated_request["_id"])
    
    return ShiftSwapRequest(**updated_request)

@router.delete("/{request_id}", status_code=204)
async def cancel_swap_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a shift swap request"""
    db = get_db()
    
    # Get the swap request
    swap_request = await db["shift_swap_requests"].find_one({"_id": ObjectId(request_id)})
    if not swap_request:
        raise HTTPException(404, "Swap request not found")
    
    # Check permissions - only requester or manager can cancel
    if (swap_request["requester_id"] != str(current_user["_id"]) and 
        current_user.get("role") not in ["manager", "administrator"]):
        raise HTTPException(403, "You don't have permission to cancel this request")
    
    if swap_request["status"] not in [SwapStatus.PENDING]:
        raise HTTPException(400, "Cannot cancel a request that has been processed")
    
    # Update status to cancelled
    await db["shift_swap_requests"].update_one(
        {"_id": ObjectId(request_id)},
        {"$set": {
            "status": SwapStatus.CANCELLED,
            "updated_at": datetime.utcnow()
        }}
    )
    
    # Log the event
    await log_event("shift_swap_cancelled", {
        "swap_request_id": request_id,
        "cancelled_by": str(current_user["_id"])
    })
