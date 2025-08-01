from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict, Any

class OperatingHours(BaseModel):
    """Operating hours for a specific day of the week"""
    day_of_week: int  # 0-6 (Sunday-Saturday) 
    open_time: str    # HH:MM format
    close_time: str   # HH:MM format
    is_open: bool = True
    min_staff: int = 1
    max_staff: Optional[int] = None

class BreakRule(BaseModel):
    """Break requirements based on hours worked"""
    type: str  # "short_break", "meal_break", "rest_period"
    duration_minutes: int
    required_after_hours: float  # e.g., 4.0 for "every 4 hours"
    is_paid: bool = True

class SkillRequirement(BaseModel):
    """Skill requirements for specific roles"""
    role: str
    required_skills: List[str]
    minimum_experience_months: Optional[int] = None
    is_mandatory: bool = True

class ShiftTemplate(BaseModel):
    """Template for shift patterns"""
    name: str  # e.g., "Morning Shift", "Evening Shift"
    start_time: str  # HH:MM
    end_time: str    # HH:MM
    required_roles: Dict[str, int]  # role -> count
    preferred_locations: List[str]
    is_active: bool = True

# Legacy constraint parameters for backward compatibility
class ConstraintParameters(BaseModel):
    maxEmployeesPerDay: Optional[int] = None
    maxConsecutiveDays: Optional[int] = None
    shiftTimes: Optional[List[Dict[str, str]]] = None
    locations: Optional[List[str]] = None
    roles: Optional[List[str]] = None
    departments: Optional[List[str]] = None
    minConsecutiveHoursPerShift: Optional[int] = None
    maxConsecutiveHoursPerShift: Optional[int] = None
    employeeAvailability: Optional[Dict[str, Dict[str, List[str]]]] = None

class ConstraintCreate(BaseModel):
    name: str
    industry_type: str = "general"
    operating_hours: List[OperatingHours] = Field(default_factory=list)
    max_consecutive_days: int = 6
    min_rest_hours_between_shifts: int = 8
    max_hours_per_week: float = 40.0
    min_consecutive_hours_per_shift: int = 4
    max_consecutive_hours_per_shift: int = 12
    break_rules: List[BreakRule] = Field(default_factory=list)
    skill_requirements: List[SkillRequirement] = Field(default_factory=list)
    shift_templates: List[ShiftTemplate] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)
    departments: List[str] = Field(default_factory=list)
    roles: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    optimization_priority: str = "balance_staffing"
    require_manager_coverage: bool = True
    enforce_employee_availability: bool = True
    enforce_time_off_requests: bool = True
    allow_overtime: bool = False
    
    # For backward compatibility
    parameters: Optional[ConstraintParameters] = None

class ConstraintUpdate(BaseModel):
    name: Optional[str] = None
    operating_hours: Optional[List[OperatingHours]] = None
    max_consecutive_days: Optional[int] = None
    min_rest_hours_between_shifts: Optional[int] = None
    max_hours_per_week: Optional[float] = None
    min_consecutive_hours_per_shift: Optional[int] = None
    max_consecutive_hours_per_shift: Optional[int] = None
    break_rules: Optional[List[BreakRule]] = None
    skill_requirements: Optional[List[SkillRequirement]] = None
    shift_templates: Optional[List[ShiftTemplate]] = None
    locations: Optional[List[str]] = None
    departments: Optional[List[str]] = None
    roles: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    optimization_priority: Optional[str] = None
    require_manager_coverage: Optional[bool] = None
    enforce_employee_availability: Optional[bool] = None
    enforce_time_off_requests: Optional[bool] = None
    allow_overtime: Optional[bool] = None

class ConstraintOut(BaseModel):
    id: str = Field(..., alias="_id")
    name: str
    operating_hours: List[OperatingHours] = Field(default_factory=list)
    max_consecutive_days: int = 6
    min_rest_hours_between_shifts: int = 8
    max_hours_per_week: float = 40.0
    min_consecutive_hours_per_shift: int = 4
    max_consecutive_hours_per_shift: int = 12
    break_rules: List[BreakRule] = Field(default_factory=list)
    skill_requirements: List[SkillRequirement] = Field(default_factory=list)
    shift_templates: List[ShiftTemplate] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)
    departments: List[str] = Field(default_factory=list)
    roles: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    optimization_priority: str = "balance_staffing"
    require_manager_coverage: bool = True
    enforce_employee_availability: bool = True
    enforce_time_off_requests: bool = True
    allow_overtime: bool = False
    is_default: bool = False
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class IndustryTemplate(BaseModel):
    """Industry template response"""
    industry_type: str
    template: Dict[str, Any]
