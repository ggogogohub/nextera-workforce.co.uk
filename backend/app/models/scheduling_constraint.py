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

class ConstraintModel(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    
    # Core business rules
    industry_type: str = "general"  # "retail", "healthcare", "hospitality", "general"
    
    # Operating schedule
    operating_hours: List[OperatingHours] = Field(default_factory=list)
    
    # Staffing rules
    max_consecutive_days: int = 6
    min_rest_hours_between_shifts: int = 8
    max_hours_per_week: float = 40.0
    
    # Break and rest requirements
    break_rules: List[BreakRule] = Field(default_factory=list)
    
    # Skill and role matching
    skill_requirements: List[SkillRequirement] = Field(default_factory=list)
    
    # Shift patterns
    shift_templates: List[ShiftTemplate] = Field(default_factory=list)
    
    # Location and department constraints
    locations: List[str] = Field(default_factory=list)
    departments: List[str] = Field(default_factory=list)
    roles: List[str] = Field(default_factory=list)
    
    # Solver configuration
    solver_time_limit: int = 30  # seconds
    optimization_priority: str = "fairness"  # "fairness", "cost", "coverage"
    
    # Employee availability enforcement
    enforce_employee_availability: bool = True
    enforce_time_off_requests: bool = True
    allow_overtime: bool = False
    
    # Metadata
    is_default: bool = False
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ConstraintCreate(BaseModel):
    name: str
    industry_type: str = "general"
    operating_hours: List[OperatingHours] = Field(default_factory=list)
    min_employees_per_day: int = 1
    max_employees_per_day: int = 10
    max_consecutive_days: int = 6
    min_rest_hours_between_shifts: int = 8
    max_hours_per_week: float = 40.0
    break_rules: List[BreakRule] = Field(default_factory=list)
    skill_requirements: List[SkillRequirement] = Field(default_factory=list)
    shift_templates: List[ShiftTemplate] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)
    departments: List[str] = Field(default_factory=list)
    roles: List[str] = Field(default_factory=list)
    solver_time_limit: int = 30
    optimization_priority: str = "fairness"
    enforce_employee_availability: bool = True
    enforce_time_off_requests: bool = True
    allow_overtime: bool = False

class ConstraintUpdate(BaseModel):
    name: Optional[str] = None
    industry_type: Optional[str] = None
    operating_hours: Optional[List[OperatingHours]] = None
    min_employees_per_day: Optional[int] = None
    max_employees_per_day: Optional[int] = None
    max_consecutive_days: Optional[int] = None
    min_rest_hours_between_shifts: Optional[int] = None
    max_hours_per_week: Optional[float] = None
    break_rules: Optional[List[BreakRule]] = None
    skill_requirements: Optional[List[SkillRequirement]] = None
    shift_templates: Optional[List[ShiftTemplate]] = None
    locations: Optional[List[str]] = None
    departments: Optional[List[str]] = None
    roles: Optional[List[str]] = None
    solver_time_limit: Optional[int] = None
    optimization_priority: Optional[str] = None
    enforce_employee_availability: Optional[bool] = None
    enforce_time_off_requests: Optional[bool] = None
    allow_overtime: Optional[bool] = None

# Industry-specific constraint templates
INDUSTRY_TEMPLATES = {
    "retail": {
        "operating_hours": [
            {"day_of_week": i, "open_time": "09:00", "close_time": "21:00", "is_open": True, "min_staff": 2}
            for i in range(1, 6)  # Monday-Friday
        ] + [
            {"day_of_week": 0, "open_time": "10:00", "close_time": "18:00", "is_open": True, "min_staff": 1},  # Sunday
            {"day_of_week": 6, "open_time": "09:00", "close_time": "22:00", "is_open": True, "min_staff": 3},  # Saturday
        ],
        "break_rules": [
            {"type": "short_break", "duration_minutes": 15, "required_after_hours": 4.0, "is_paid": True},
            {"type": "meal_break", "duration_minutes": 30, "required_after_hours": 6.0, "is_paid": False},
        ],
        "shift_templates": [
            {
                "name": "Opening Shift", "start_time": "08:00", "end_time": "16:00",
                "required_roles": {"cashier": 1, "sales_associate": 1}, "preferred_locations": [], "is_active": True
            },
            {
                "name": "Closing Shift", "start_time": "13:00", "end_time": "21:00", 
                "required_roles": {"cashier": 1, "sales_associate": 2}, "preferred_locations": [], "is_active": True
            }
        ],
        "roles": ["cashier", "sales_associate", "manager", "stock_clerk"],
        "max_consecutive_days": 5,
        "min_rest_hours_between_shifts": 10
    },
    "healthcare": {
        "operating_hours": [
            {"day_of_week": i, "open_time": "00:00", "close_time": "23:59", "is_open": True, "min_staff": 3}
            for i in range(7)  # 24/7 operation
        ],
        "break_rules": [
            {"type": "short_break", "duration_minutes": 15, "required_after_hours": 4.0, "is_paid": True},
            {"type": "meal_break", "duration_minutes": 45, "required_after_hours": 6.0, "is_paid": True},
            {"type": "rest_period", "duration_minutes": 30, "required_after_hours": 8.0, "is_paid": True},
        ],
        "shift_templates": [
            {
                "name": "Day Shift", "start_time": "07:00", "end_time": "19:00",
                "required_roles": {"nurse": 3, "doctor": 1}, "preferred_locations": [], "is_active": True
            },
            {
                "name": "Night Shift", "start_time": "19:00", "end_time": "07:00",
                "required_roles": {"nurse": 2, "doctor": 1}, "preferred_locations": [], "is_active": True
            }
        ],
        "skill_requirements": [
            {"role": "nurse", "required_skills": ["CPR", "First Aid"], "minimum_experience_months": 6, "is_mandatory": True},
            {"role": "doctor", "required_skills": ["Medical License"], "minimum_experience_months": 24, "is_mandatory": True},
        ],
        "roles": ["nurse", "doctor", "technician", "admin"],
        "max_consecutive_days": 6,
        "min_rest_hours_between_shifts": 12,
        "max_hours_per_week": 48.0
    },
    "hospitality": {
        "operating_hours": [
            {"day_of_week": i, "open_time": "06:00", "close_time": "23:00", "is_open": True, "min_staff": 2}
            for i in range(7)
        ],
        "break_rules": [
            {"type": "short_break", "duration_minutes": 20, "required_after_hours": 5.0, "is_paid": True},
            {"type": "meal_break", "duration_minutes": 30, "required_after_hours": 6.0, "is_paid": False},
        ],
        "shift_templates": [
            {
                "name": "Breakfast Shift", "start_time": "05:30", "end_time": "14:00",
                "required_roles": {"cook": 1, "server": 2}, "preferred_locations": [], "is_active": True
            },
            {
                "name": "Dinner Shift", "start_time": "14:00", "end_time": "23:30",
                "required_roles": {"cook": 2, "server": 3}, "preferred_locations": [], "is_active": True
            }
        ],
        "roles": ["server", "cook", "manager", "host", "cleaner"],
        "max_consecutive_days": 5,
        "min_rest_hours_between_shifts": 9
    }
}

# Enhanced constraint model with location support (keeping for backward compatibility)
class EnhancedConstraint(ConstraintModel):
    """Alias for backward compatibility"""
    pass

def get_industry_template(industry_type: str) -> Dict[str, Any]:
    """Get default constraint template for an industry type"""
    return INDUSTRY_TEMPLATES.get(industry_type, {
        "operating_hours": [
            {"day_of_week": i, "open_time": "09:00", "close_time": "17:00", "is_open": True, "min_staff": 1}
            for i in range(1, 6)  # Monday-Friday only
        ],
        "break_rules": [
            {"type": "short_break", "duration_minutes": 15, "required_after_hours": 4.0, "is_paid": True},
        ],
        "shift_templates": [
            {
                "name": "Standard Shift", "start_time": "09:00", "end_time": "17:00",
                "required_roles": {"general": 1}, "preferred_locations": [], "is_active": True
            }
        ],
        "roles": ["general"],
        "max_consecutive_days": 5,
        "min_rest_hours_between_shifts": 8
    })
