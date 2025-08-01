from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from enum import Enum

class SwapStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    COMPLETED = "completed"

class ShiftSwapRequest(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    
    # Requester information
    requester_id: str
    requester_shift_id: str
    
    # Target employee and shift (optional - could be open request)
    target_employee_id: Optional[str] = None
    target_shift_id: Optional[str] = None
    
    # Request details
    reason: str
    preferred_date_range: Optional[dict] = None  # {"start": "2024-01-15", "end": "2024-01-20"}
    
    # Approval workflow
    status: SwapStatus = SwapStatus.PENDING
    reviewed_by: Optional[str] = None  # Manager who reviewed
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    
    # Responses from potential swap partners
    responses: List[dict] = Field(default_factory=list)  # [{"employee_id": "...", "shift_id": "...", "responded_at": "...", "accepted": bool}]
    
    # Final swap details (when approved)
    final_swap_partner_id: Optional[str] = None
    final_swap_shift_id: Optional[str] = None
    
    # Metadata
    created_at: datetime
    updated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None  # Auto-expire after X days
    
    # Notification tracking
    notifications_sent: List[dict] = Field(default_factory=list)  # Track who was notified
    
    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ShiftSwapCreate(BaseModel):
    requester_shift_id: str
    target_employee_id: Optional[str] = None
    target_shift_id: Optional[str] = None
    reason: str
    preferred_date_range: Optional[dict] = None

class ShiftSwapUpdate(BaseModel):
    status: Optional[SwapStatus] = None
    review_notes: Optional[str] = None
    final_swap_partner_id: Optional[str] = None
    final_swap_shift_id: Optional[str] = None

class ShiftSwapResponse(BaseModel):
    """Employee response to a swap request"""
    employee_id: str
    shift_id: str
    accepted: bool
    notes: Optional[str] = None

class ShiftSwapEligibility(BaseModel):
    """Check if employees are eligible for shift swap"""
    is_eligible: bool
    reasons: List[str] = Field(default_factory=list)
    suggestions: List[dict] = Field(default_factory=list)

# Helper functions for shift swap logic
def check_swap_eligibility(requester_schedule: dict, target_schedule: dict) -> ShiftSwapEligibility:
    """Check if two schedules can be swapped"""
    reasons = []
    suggestions = []
    
    # Check basic requirements
    if requester_schedule["date"] == target_schedule["date"]:
        reasons.append("Cannot swap shifts on the same day")
    
    # Check role compatibility
    if requester_schedule["role"] != target_schedule["role"]:
        if requester_schedule["role"] not in ["manager", "supervisor"]:  # Managers can fill any role
            reasons.append(f"Role mismatch: {requester_schedule['role']} vs {target_schedule['role']}")
    
    # Check location compatibility
    if requester_schedule["location"] != target_schedule["location"]:
        suggestions.append({
            "type": "location_change",
            "message": f"Swap would require location change: {requester_schedule['location']} ↔ {target_schedule['location']}"
        })
    
    # Check department compatibility
    if requester_schedule["department"] != target_schedule["department"]:
        reasons.append(f"Department mismatch: {requester_schedule['department']} vs {target_schedule['department']}")
    
    return ShiftSwapEligibility(
        is_eligible=len(reasons) == 0,
        reasons=reasons,
        suggestions=suggestions
    ) 