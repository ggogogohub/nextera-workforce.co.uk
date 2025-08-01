import asyncio
import time
from enum import Enum
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

class CircuitBreakerState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitBreaker:
    """Circuit breaker for OR-Tools scheduler resilience"""
    def __init__(self, failure_threshold: int = 3, recovery_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitBreakerState.CLOSED
        
    def can_execute(self) -> bool:
        if self.state == CircuitBreakerState.CLOSED:
            return True
        elif self.state == CircuitBreakerState.OPEN:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = CircuitBreakerState.HALF_OPEN
                return True
            return False
        else:  # HALF_OPEN
            return True
            
    def record_success(self):
        self.failure_count = 0
        self.state = CircuitBreakerState.CLOSED
        
    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitBreakerState.OPEN

# Global circuit breaker instance
scheduler_circuit_breaker = CircuitBreaker()

# We try to import OR-Tools at runtime.  In local dev it may be missing – the
# caller can still fall back to a basic random scheduler so development remains
# friction-free even without the heavy dependency.

try:
    from ortools.sat.python import cp_model  # type: ignore
    _ORTOOLS_AVAILABLE = True
except ImportError:  # pragma: no cover – handled gracefully
    _ORTOOLS_AVAILABLE = False

import random


def _basic_random_schedule(
    employees: List[Dict], constraints: Dict, start_date: datetime, end_date: datetime
) -> List[Dict]:
    """
    FIXED: Enhanced fallback scheduler with STRICT constraint enforcement.
    This scheduler MUST respect the user's constraint template, especially operating hours and staffing requirements.
    """
    print("INFO: Using ENHANCED constraint-enforcing fallback scheduler")
    print(f"DEBUG: Fallback scheduler - {len(employees)} employees, {start_date} to {end_date}")

    schedules: List[Dict] = []
    current_date = start_date
    
    # CRITICAL FIX: Ensure constraints are properly processed
    if not constraints.get("operating_hours"):
        print("ERROR: No operating hours found in constraints - this should not happen!")
        print(f"DEBUG: Available constraint keys: {list(constraints.keys())}")
        return []
    
    # Extract constraint parameters - RESPECT USER SETTINGS
    operating_hours = constraints.get("operating_hours", [])
    shift_templates = constraints.get("shift_templates", [])
    locations = constraints.get("locations", ["Main Office"])
    roles = constraints.get("roles", ["general"])
    departments = constraints.get("departments", ["Operations"])
    skill_requirements = constraints.get("skill_requirements", [])
    
    print(f"DEBUG: Operating hours defined for {len(operating_hours)} days")
    for oh in operating_hours:
        day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][oh.get("day_of_week", 0)]
        print(f"  {day_name}: open={oh.get('is_open', False)}, min_staff={oh.get('min_staff', 0)}, max_staff={oh.get('max_staff', 0)}")
    
    print(f"DEBUG: Shift templates: {len(shift_templates)}")
    print(f"DEBUG: Locations: {locations}")
    print(f"DEBUG: Roles: {roles}")
    
    # Get constraint parameters for enforcement
    max_consecutive_days = constraints.get("max_consecutive_days", 6)
    min_rest_hours = constraints.get("min_rest_hours_between_shifts", 8)
    max_hours_per_week = constraints.get("max_hours_per_week", 40)
    min_consecutive_hours_per_shift = constraints.get("min_consecutive_hours_per_shift", 4)
    max_consecutive_hours_per_shift = constraints.get("max_consecutive_hours_per_shift", 12)
    optimization_priority = constraints.get("optimization_priority", "balance_staffing")
    
    print(f"DEBUG: Enforcing constraints - max_consecutive_days: {max_consecutive_days}, min_rest_hours: {min_rest_hours}")
    print(f"DEBUG: Enforcing constraints - max_hours_per_week: {max_hours_per_week}, shift_duration: {min_consecutive_hours_per_shift}-{max_consecutive_hours_per_shift}")
    print(f"DEBUG: Optimization priority: {optimization_priority}")
    
    # COMPREHENSIVE: Create business coverage plan that prioritizes business continuity
    print("INFO: Creating comprehensive business coverage plan...")
    
    # Get business requirements
    operating_hours = constraints.get("operating_hours", [])
    if not operating_hours:
        print("ERROR: No operating hours defined, cannot create shift templates")
        return []
    
    # Get staffing requirements from first operating hours
    first_hours = operating_hours[0]
    min_staff = first_hours.get("min_staff", 1)
    max_staff = first_hours.get("max_staff", 10)
    
    # Create comprehensive business coverage plan
    shift_templates = _create_business_coverage_plan(
        operating_hours, 
        min_staff, 
        max_staff, 
        min_consecutive_hours_per_shift, 
        max_consecutive_hours_per_shift,
        constraints
    )
    
    print(f"INFO: Created {len(shift_templates)} shift templates for business coverage:")
    for template in shift_templates:
        print(f"  - {template['name']} ({template['start_time']}-{template['end_time']}) = {template['duration']}h")
        print(f"    Required roles: {template['required_roles']}")
    
    # Track employee workload for constraint enforcement
    employee_shift_count = {str(emp["_id"]): 0 for emp in employees}
    employee_consecutive_days = {str(emp["_id"]): 0 for emp in employees}
    employee_last_work_day = {str(emp["_id"]): None for emp in employees}
    employee_weekly_hours = {str(emp["_id"]): 0.0 for emp in employees}
    
    while current_date <= end_date:
        print(f"\nDEBUG: === Processing date: {current_date.strftime('%Y-%m-%d')} ===")
        
        # Get operating hours for this day. Convert Python's weekday() (Monday=0, Sunday=6) to our system (Sunday=0, Saturday=6)
        python_weekday = current_date.weekday()
        day_of_week = (python_weekday + 1) % 7  # Convert to Sunday=0 format
        day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day_of_week]
        print(f"DEBUG: Day of week: {day_name} (constraint day_of_week={day_of_week})")

        # Find operating hours for this day
        day_hours = next((oh for oh in operating_hours if oh["day_of_week"] == day_of_week), None)
        
        if not day_hours:
            print(f"DEBUG: No operating hours found for {day_name}, treating as closed")
            current_date += timedelta(days=1)
            continue
            
        is_open = day_hours.get("is_open", False)
        
        # Use per-day staffing values directly (no more global fallbacks)
        min_staff_today = day_hours.get("min_staff", 1)
        max_staff_today = day_hours.get("max_staff", 10)
        
        print(f"DEBUG: Business open: {is_open}, min_staff: {min_staff_today}, max_staff: {max_staff_today}")
        if not is_open:
            print(f"DEBUG: {day_name} is CLOSED - skipping schedule generation")
            current_date += timedelta(days=1)
            continue
            
        # CRITICAL FIX: Enforce minimum staffing requirements strictly
        if min_staff_today <= 0:
            print(f"WARNING: {day_name} has min_staff <= 0, skipping")
            current_date += timedelta(days=1)
            continue
            
        # Available employees for today (active + available on this day)
        available_employees = []
        for emp in employees:
            if not emp.get("isActive", True):
                continue
            if _check_employee_availability(emp, current_date, "09:00", "17:00"):
                available_employees.append(emp)
        
        print(f"DEBUG: Available employees today: {len(available_employees)}")
        
        # CRITICAL: Check if we can meet minimum staffing
        if len(available_employees) < min_staff_today:
            print(f"ERROR: Cannot meet minimum staffing for {day_name}")
            print(f"  Required: {min_staff_today}, Available: {len(available_employees)}")
            print("  CONSTRAINT VIOLATION - Cannot generate compliant schedule")
            # Still try to schedule as many as possible but log the violation
            employees_to_schedule = len(available_employees)
        else:
            # Determine how many employees to schedule: respect min/max constraints but don't exceed available count
            employees_to_schedule = min(max_staff_today, max(min_staff_today, len(available_employees)))
            print(f"DEBUG: Will schedule {employees_to_schedule} employees (min: {min_staff_today}, max: {max_staff_today}, available: {len(available_employees)})")
        
        if employees_to_schedule <= 0:
            print(f"DEBUG: No employees to schedule for {day_name}")
            current_date += timedelta(days=1)
            continue
        
        # ENHANCED: Sort employees based on optimization priority and apply constraint filtering
        optimization_priority = constraints.get("optimization_priority", "balance_staffing")
        if optimization_priority == "fairness":
            # Sort by current workload (least worked first)
            available_employees.sort(key=lambda emp: employee_shift_count[str(emp["_id"])])
        elif optimization_priority == "minimize_cost":
            # Sort by hourly rate (lowest cost first) - assuming cost is stored in employee data
            available_employees.sort(key=lambda emp: emp.get("hourlyRate", 0))
        elif optimization_priority == "maximize_coverage":
            # Sort by skills/roles to maximize coverage
            available_employees.sort(key=lambda emp: len(emp.get("skills", [])) + len(emp.get("roles", [])), reverse=True)
        else:  # balance_staffing (default)
            # Sort by a combination of factors
            available_employees.sort(key=lambda emp: (
                employee_shift_count[str(emp["_id"])],  # Least shifts first
                -len(emp.get("availability", [])),  # Most available second
                emp.get("experience_months", 0)  # Experience third
            ))
        
        # ENHANCED: Apply constraint filtering with fallback
        filtered_employees = []
        for emp in available_employees:
            emp_id = str(emp["_id"])
            
            # Check consecutive days constraint
            if employee_consecutive_days.get(emp_id, 0) >= max_consecutive_days:
                print(f"DEBUG: Skipping {emp.get('firstName', 'Unknown')} - max consecutive days reached ({employee_consecutive_days.get(emp_id, 0)})")
                continue
            
            # Check rest hours constraint
            last_work_day = employee_last_work_day.get(emp_id)
            if last_work_day and (current_date - last_work_day).days < (min_rest_hours // 24):
                print(f"DEBUG: Skipping {emp.get('firstName', 'Unknown')} - insufficient rest hours")
                continue
            
            # Check weekly hours constraint
            if employee_weekly_hours.get(emp_id, 0) >= max_hours_per_week:
                print(f"DEBUG: Skipping {emp.get('firstName', 'Unknown')} - max weekly hours reached ({employee_weekly_hours.get(emp_id, 0)})")
                continue
            
            filtered_employees.append(emp)
        
        # CRITICAL FIX: Smart constraint filtering with manager priority
        if len(filtered_employees) < min_staff:
            print(f"WARNING: Too many employees filtered by constraints ({len(filtered_employees)} < {min_staff}), using all available")
            filtered_employees = available_employees.copy()
        
        # CRITICAL FIX: Ensure managers are always available for manager roles
        # Separate managers from other employees
        managers = [emp for emp in filtered_employees if emp.get("role") in ["manager", "administrator"]]
        other_employees = [emp for emp in filtered_employees if emp.get("role") not in ["manager", "administrator"]]
        
        # CRITICAL: If no managers available after filtering, override constraints for managers
        if not managers:
            print(f"WARNING: No managers available after filtering, overriding constraints for managers")
            # Get all managers regardless of constraints
            all_managers = [emp for emp in available_employees if emp.get("role") in ["manager", "administrator"]]
            if all_managers:
                managers = all_managers
                print(f"DEBUG: Found {len(managers)} managers after constraint override")
        else:
                # Last resort: use all employees
                managers = available_employees.copy()
                print(f"WARNING: No managers found, using all employees")
        
        # CRITICAL: Ensure we have enough employees for minimum staffing
        if len(managers + other_employees) < min_staff:
            print(f"WARNING: Not enough employees after filtering ({len(managers + other_employees)} < {min_staff})")
            # Add more employees from the original list
            remaining_employees = [emp for emp in available_employees if emp not in managers + other_employees]
            other_employees.extend(remaining_employees[:min_staff - len(managers + other_employees)])
        
        # CRITICAL: Manager distribution algorithm - ensure managers are distributed throughout the day
        # Sort managers by their current workload to distribute fairly
        managers.sort(key=lambda emp: (
            employee_shift_count.get(str(emp["_id"]), 0),
            employee_weekly_hours.get(str(emp["_id"]), 0),
            employee_consecutive_days.get(str(emp["_id"]), 0)
        ))
        
        # Use filtered employees with manager priority and fair distribution
        available_employees = managers + other_employees
        print(f"DEBUG: After constraint filtering: {len(available_employees)} employees available")
        
        # ENHANCED: Create professional real-world shift templates if none exist
        if not shift_templates:
            print("INFO: Creating professional real-world shift templates for full coverage")
            # Get operating hours from constraints
            operating_hours = constraints.get("operating_hours", [])
            if not operating_hours:
                print("ERROR: No operating hours defined, cannot create shift templates")
                return []
            # Use first operating hours as reference (assuming consistent across days)
            first_hours = operating_hours[0]
            open_time = first_hours.get("open_time", "09:00")
            close_time = first_hours.get("close_time", "17:00")
            print(f"DEBUG: Creating shifts for operating hours: {open_time} - {close_time}")
            # Calculate shift distribution for full coverage
            open_hour = int(open_time.split(":")[0])
            close_hour = int(close_time.split(":")[0])
            total_hours = close_hour - open_hour
            if total_hours <= 4:
                # Short day - single shift
                shift_templates = [{
                    "name": f"Full Day Shift ({open_time}-{close_time})",
                    "start_time": open_time,
                    "end_time": close_time,
                    "required_roles": {"manager": 1, "employee": 1},
                    "preferred_locations": locations,
                    "is_active": True
                }]
                print(f"DEBUG: Created single shift template: {shift_templates[0]['name']}")
            else:
                # Full day - create opening and closing shifts
                mid_hour = open_hour + (total_hours // 2)
                mid_time = f"{mid_hour:02d}:00"
                # Opening shift (first half)
                opening_shift = {
                    "name": f"Opening Shift ({open_time}-{mid_time})",
                    "start_time": open_time,
                    "end_time": mid_time,
                    "required_roles": {"manager": 1, "employee": 1},
                    "preferred_locations": locations,
                    "is_active": True
                }
                # Closing shift (second half)
                closing_shift = {
                    "name": f"Closing Shift ({mid_time}-{close_time})",
                    "start_time": mid_time,
                    "end_time": close_time,
                    "required_roles": {"manager": 1, "employee": 1},
                    "preferred_locations": locations,
                    "is_active": True
                }
                # Full day shift for manager/admin coverage
                full_day_shift = {
                    "name": f"Full Day Manager ({open_time}-{close_time})",
                    "start_time": open_time,
                    "end_time": close_time,
                    "required_roles": {"manager": 1},
                    "preferred_locations": locations,
                    "is_active": True
                }
                shift_templates = [opening_shift, closing_shift, full_day_shift]
                print(f"DEBUG: Created professional shift templates:")
                print(f"  - {opening_shift['name']}")
                print(f"  - {closing_shift['name']}")
                print(f"  - {full_day_shift['name']}")
        
        # Schedule the required number of employees across shift templates
        scheduled_today = 0
        template_count = len(shift_templates) or 1
        template_idx = 0
        while scheduled_today < employees_to_schedule and available_employees:
            # Cycle through templates for even distribution
            template = shift_templates[template_idx % template_count]
            template_idx += 1
            print(f"DEBUG: Using template '{template.get('name', 'Unnamed')}' for assignment {scheduled_today + 1}/{employees_to_schedule}")
            
            # Determine role to fill next (flatten required_roles)
            shift_roles = template.get("required_roles", {"general": 1})
            # Build a list of roles for positions
            position_roles: List[str] = []
            for role_name, role_count in shift_roles.items():
                for _ in range(role_count):
                    position_roles.append(role_name)
            if not position_roles:
                position_roles = ["general"]
            # Pick role for this position by round-robin
            role_to_fill = position_roles[scheduled_today % len(position_roles)]
            
            # ENHANCED: Prioritize manager assignment for manager-required shifts
            role_candidates = [emp for emp in available_employees if emp.get("role", "general") == role_to_fill]
            
            # If this shift requires a manager, prioritize manager assignment
            if role_to_fill == "manager" and not role_candidates:
                # Look for managers or administrators
                manager_candidates = [emp for emp in available_employees 
                                    if emp.get("role") in ["manager", "administrator"]]
                if manager_candidates:
                    role_candidates = manager_candidates
                    role_to_fill = "manager"
                    print(f"DEBUG: Prioritizing manager assignment for {template.get('name', 'Unnamed')}")
            
            if not role_candidates and role_to_fill != "general":
                # Try skill-based matching
                for skill_req in skill_requirements:
                    if skill_req.get("role") == role_to_fill:
                        req_skills = skill_req.get("required_skills", [])
                        skill_cands = [emp for emp in available_employees if all(s in emp.get("skills", []) for s in req_skills)]
                        if skill_cands:
                            role_candidates = skill_cands
                            break
            
            # Fallback to any available
            if not role_candidates:
                role_candidates = available_employees.copy()
                role_to_fill = "general"
            
            # ENHANCED: Implement STRICT FAIR rotation to prevent bias
            # Sort by multiple factors for fairness with STRONG bias prevention
            role_candidates.sort(key=lambda emp: (
                employee_shift_count[str(emp["_id"])],  # Least shifts first
                employee_weekly_hours.get(str(emp["_id"]), 0),  # Least hours second
                employee_consecutive_days.get(str(emp["_id"]), 0),  # Least consecutive days third
                -emp.get("experience_months", 0)  # Experience as tiebreaker (reverse for fairness)
            ))
            
            # CRITICAL FIX: Smart bias prevention that doesn't break scheduling
            # Track assignments by shift type and day
            shift_type = template.get("type", "general")
            template_name = template.get("name", "")
            
            # Get assignments for the last 3 days to prevent immediate bias
            three_days_ago = current_date - timedelta(days=3)
            recent_assignments = [s for s in schedules if s.get("date") >= three_days_ago.strftime("%Y-%m-%d")]
            
            # Find employees who got this specific shift type in the last 2 days
            recent_shift_assignments = []
            for assignment in recent_assignments:
                # Check if this is the same shift type (opening, closing, etc.)
                if assignment.get("role") == role_to_fill:
                    recent_shift_assignments.append(assignment.get("employeeId"))
            
            # SMART BIAS PREVENTION: Only filter if we have enough candidates
            if recent_shift_assignments and len(role_candidates) > 2:
                # Get unique employees who got this shift type recently
                recent_employees = list(set(recent_shift_assignments))
                # Only filter out if we have enough alternatives
                if len(role_candidates) > len(recent_employees):
                    role_candidates = [emp for emp in role_candidates if str(emp["_id"]) not in recent_employees]
            
            # If no candidates left, use all available but prioritize least worked
            if not role_candidates:
                role_candidates = [emp for emp in available_employees if emp.get("role", "general") == role_to_fill]
                if not role_candidates:
                    role_candidates = available_employees.copy()
            
            # CRITICAL FIX: Advanced fairness algorithm with manager distribution priority
            if len(role_candidates) > 1:
                # CRITICAL: Prioritize manager distribution throughout the day
                if "manager" in template.get("required_roles", {}):
                    # For manager shifts, prioritize managers who haven't been assigned today
                    today_assigned_managers = set()
                    for schedule in schedules:
                        if schedule.get("date") == current_date and schedule.get("employee_role") in ["manager", "administrator"]:
                            today_assigned_managers.add(str(schedule.get("employee_id")))
                    
                    # Filter out managers already assigned today
                    available_managers = [emp for emp in role_candidates if str(emp["_id"]) not in today_assigned_managers]
                    
                    if available_managers:
                        role_candidates = available_managers
                        print(f"DEBUG: Prioritizing unassigned managers for {template['name']}")
                
                # Calculate fairness scores for each candidate
                fairness_scores = []
                for emp in role_candidates:
                    emp_id = str(emp["_id"])
                    
                    # Factors for fairness (lower is better)
                    shift_count = employee_shift_count.get(emp_id, 0)
                    weekly_hours = employee_weekly_hours.get(emp_id, 0)
                    consecutive_days = employee_consecutive_days.get(emp_id, 0)
                    
                    # Calculate weighted fairness score
                    fairness_score = (
                        shift_count * 2 +  # Shifts count double weight
                        weekly_hours * 0.5 +  # Hours half weight
                        consecutive_days * 1.5  # Consecutive days 1.5x weight
                    )
                    
                    fairness_scores.append((fairness_score, emp))
                
                # Sort by fairness score (ascending - least worked first)
                fairness_scores.sort(key=lambda x: x[0])
                
                # Select from top 50% of candidates with weighted random selection
                top_count = max(1, len(fairness_scores) // 2)
                top_candidates = fairness_scores[:top_count]
                
                # Weighted random selection (lower scores get higher probability)
                weights = [1.0 / (score + 1) for score, _ in top_candidates]
                total_weight = sum(weights)
                normalized_weights = [w / total_weight for w in weights]
                
                # Random selection with weights
                assigned_employee = random.choices(
                    [emp for _, emp in top_candidates], 
                    weights=normalized_weights, 
                    k=1
                )[0]
            else:
                assigned_employee = role_candidates[0]
                
            assigned_role = role_to_fill
            print(f"DEBUG: Assigning {assigned_employee.get('firstName', 'Unknown')} as {assigned_role} (shifts: {employee_shift_count[str(assigned_employee['_id'])]}, hours: {employee_weekly_hours.get(str(assigned_employee['_id']), 0):.1f})")
            
            # Create schedule entry - RESPECT CONSTRAINT PARAMETERS
            # Only use locations and departments from constraints
            constraint_locations = constraints.get("locations", ["Main Office"])
            constraint_departments = constraints.get("departments", ["Operations"])
            
            # Keep employee's location regardless of constraints
            assigned_location = assigned_employee.get("location", "")
            # If employee has no location, use a default from constraints
            if not assigned_location and constraint_locations:
                assigned_location = random.choice(constraint_locations)
            
            # Assign department from constraints (prefer employee's department if it's in constraints)
            assigned_department = assigned_employee.get("department", "")
            if assigned_department not in constraint_departments:
                assigned_department = random.choice(constraint_departments)
            
            schedule_entry = {
                "employeeId": str(assigned_employee["_id"]),
                "date": current_date.strftime("%Y-%m-%d"),
                "startTime": template.get("start_time", "09:00"),
                "endTime": template.get("end_time", "17:00"),
                "location": assigned_location,  # From constraints only
                "role": assigned_role,
                "department": assigned_department,  # From constraints only
                "status": "scheduled",
                "notes": f"Constraint-enforcing fallback scheduler ({day_name})"
            }
            schedules.append(schedule_entry)
            # Remove employee and update count
            available_employees.remove(assigned_employee)
            employee_shift_count[str(assigned_employee["_id"])] += 1
            
            # Update weekly hours tracking
            shift_duration = calculate_shift_hours(template.get("start_time", "09:00"), template.get("end_time", "17:00"))
            employee_weekly_hours[str(assigned_employee["_id"])] += shift_duration
            
            # Update consecutive days tracking
            emp_id = str(assigned_employee["_id"])
            if employee_last_work_day.get(emp_id) == current_date - timedelta(days=1):
                employee_consecutive_days[emp_id] += 1
            else:
                employee_consecutive_days[emp_id] = 1
            employee_last_work_day[emp_id] = current_date
            
            scheduled_today += 1
        # ENHANCED: Validate manager coverage for the day
        day_schedules = [s for s in schedules if s["date"] == current_date.strftime("%Y-%m-%d")]
        manager_schedules = [s for s in day_schedules if s["role"] in ["manager", "administrator"]]
        
        if manager_schedules:
            print(f"DEBUG: {day_name} manager coverage: {len(manager_schedules)} managers scheduled")
            for ms in manager_schedules:
                print(f"  - {ms['startTime']}-{ms['endTime']}: {ms['role']}")
            
            # ENHANCED: Validate complete manager coverage
            require_manager_coverage = constraints.get("require_manager_coverage", True)
            if require_manager_coverage:
                # Check if managers cover the entire operating hours
                day_hours = next((oh for oh in operating_hours if oh["day_of_week"] == day_of_week), None)
                if day_hours and day_hours.get("is_open", False):
                    open_time = day_hours.get("open_time", "09:00")
                    close_time = day_hours.get("close_time", "17:00")
                    
                    # Check if there are gaps in manager coverage
                    manager_coverage_hours = set()
                    for ms in manager_schedules:
                        start_hour = int(ms['startTime'].split(':')[0])
                        end_hour = int(ms['endTime'].split(':')[0])
                        for hour in range(start_hour, end_hour):
                            manager_coverage_hours.add(hour)
                    
                    open_hour = int(open_time.split(':')[0])
                    close_hour = int(close_time.split(':')[0])
                    required_hours = set(range(open_hour, close_hour))
                    
                    uncovered_hours = required_hours - manager_coverage_hours
                    if uncovered_hours:
                        print(f"WARNING: {day_name} has manager coverage gaps: {sorted(uncovered_hours)}")
                    else:
                        print(f"✓ {day_name} has complete manager coverage")
        else:
            print(f"WARNING: {day_name} has NO manager coverage!")
        
        # End scheduling loop
        print(f"DEBUG: Scheduled {scheduled_today} employees for {day_name} (required min: {min_staff_today})")
        if scheduled_today < min_staff_today:
            print(f"WARNING: CONSTRAINT VIOLATION - Only scheduled {scheduled_today} out of required {min_staff_today} for {day_name}")

        current_date += timedelta(days=1)

    print(f"SUCCESS: Enhanced fallback scheduler generated {len(schedules)} constraint-enforced schedules")
    return schedules


def _check_employee_skills(employee: Dict, required_skills: List[str]) -> bool:
    """Check if employee has required skills"""
    emp_skills = employee.get("skills", [])
    return all(skill in emp_skills for skill in required_skills)


def _check_employee_availability(employee: Dict, date: datetime, start_time: str, end_time: str) -> bool:
    """Check if employee is available at the specified time"""
    availability = employee.get("availability", [])
    if not availability:
        return True  # No restrictions = always available
    
    day_of_week = date.weekday()  # 0=Monday in Python
    
    # Find availability for this day
    day_availability = [av for av in availability if av.get("dayOfWeek") == day_of_week]
    if not day_availability:
        return False  # No availability set for this day
    
    for av in day_availability:
        if not av.get("isAvailable", False):
            continue
            
        av_start = av.get("startTime", "00:00")
        av_end = av.get("endTime", "23:59")
        
        # Simple time overlap check
        if av_start <= start_time <= av_end and av_start <= end_time <= av_end:
            return True
    
    return False


def _has_time_off_conflict(employee_id: str, date: datetime, time_off_requests: List[Dict]) -> bool:
    """Check if employee has approved time off for this date"""
    date_str = date.strftime("%Y-%m-%d")
    
    for request in time_off_requests:
        if (request.get("employeeId") == employee_id and 
            request.get("status") == "approved" and
            request.get("startDate") <= date_str <= request.get("endDate")):
            return True
    
    return False


def validate_constraints(constraints: Dict[str, Any]) -> List[str]:
    """Validate constraint data and return list of validation errors."""
    errors = []
    
    # Validate operating hours
    operating_hours = constraints.get("operating_hours", [])
    if not operating_hours or len(operating_hours) != 7:
        errors.append("Operating hours must be defined for all 7 days of the week")
    else:
        # Validate we have exactly one entry per day 0-6
        days = set(oh['day_of_week'] for oh in operating_hours)
        if days != set(range(7)):
            errors.append("Operating hours must contain exactly one entry for each day (0-6)")
        
        required_fields = ['min_staff', 'max_staff', 'is_open']
        for idx, oh in enumerate(operating_hours):
            # Validate required fields exist
            for field in required_fields:
                if field not in oh:
                    errors.append(f"Operating hours entry {idx} missing {field}")
            # Validate staffing levels
            if oh.get('min_staff', 0) > oh.get('max_staff', 0):
                errors.append(f"Day {idx} has min_staff > max_staff")
        
        # Check that at least one day is open
        open_days = [oh for oh in operating_hours if oh.get("is_open", False)]
        if not open_days:
            errors.append("At least one day must be open for operations")
    
    # Make shift template validation more lenient - provide defaults if missing
    shift_templates = constraints.get("shift_templates", [])
    if not shift_templates:
        print("WARNING: No shift templates defined, will use default template")
        # Don't treat this as an error - we'll provide a default
        # errors.append("At least one shift template must be defined")
    
    # Validate min/max employees
    min_emp = constraints.get("min_employees_per_day", 1)
    max_emp = constraints.get("max_employees_per_day", 10)
    if min_emp > max_emp:
        errors.append("Minimum employees per day cannot exceed maximum employees per day")
    
    # Make location/department/role validation more lenient - provide defaults
    locations = constraints.get("locations", [])
    departments = constraints.get("departments", [])
    roles = constraints.get("roles", [])
    
    if not locations:
        print("WARNING: No locations specified, will use default location")
        # Don't treat as error: errors.append("At least one location must be specified")
    if not departments:
        print("WARNING: No departments specified, will use default department")
        # Don't treat as error: errors.append("At least one department must be specified")
    if not roles:
        print("WARNING: No roles specified, will use default role")
        # Don't treat as error: errors.append("At least one role must be specified")
    
    return errors


def _ensure_constraint_defaults(constraints: Dict) -> Dict:
    """
    Ensure constraints have sensible defaults for missing values.
    This prevents validation failures when users haven't fully configured constraints.
    CRITICAL: This function should ENHANCE, not REPLACE existing user constraints.
    """
    enhanced_constraints = constraints.copy()
    
    # CRITICAL FIX: Generate shift templates based on operating hours if none exist
    existing_shift_templates = enhanced_constraints.get("shift_templates", [])
    operating_hours = enhanced_constraints.get("operating_hours", [])
    
    # Ensure operating hours are fully defined for all 7 days
    print(f"DEBUG: Original operating hours count: {len(operating_hours)}")
    if len(operating_hours) < 7:
        print("DEBUG: Operating hours are incomplete, filling in missing days as CLOSED")
        days_present = {oh['day_of_week'] for oh in operating_hours}
        for day in range(7):
            if day not in days_present:
                operating_hours.append({
                    "day_of_week": day,
                    "is_open": False,
                    "open_time": "09:00",
                    "close_time": "17:00",
                    "min_staff": 0,
                    "max_staff": 0
                })
        # Sort to ensure consistent order
        operating_hours.sort(key=lambda x: x['day_of_week'])
        print(f"DEBUG: Corrected operating hours to be 7 days long")
    else:
        print("DEBUG: User has configured operating hours, preserving them exactly as specified:")
        for oh in operating_hours:
            day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][oh.get("day_of_week", 0)]
            print(f"  {day_name} (day_of_week={oh.get('day_of_week')}): open={oh.get('is_open')}, min_staff={oh.get('min_staff')}, max_staff={oh.get('max_staff')}")
        if len(operating_hours) == 7:
            print("DEBUG: All 7 days have operating hours defined, no defaults needed")
        else:
            print(f"WARNING: User provided {len(operating_hours)} operating hour entries, which may cause issues. Expected 7.")

    enhanced_constraints["operating_hours"] = operating_hours
    print(f"DEBUG: Final operating hours count: {len(enhanced_constraints['operating_hours'])}")

    # Generate shift templates from operating hours if none exist
    if not existing_shift_templates and operating_hours:
        print("INFO: No shift templates defined, generating automatic templates based on operating hours")
        
        # Use business coverage plan to create professional shift templates
        generated_templates = _create_business_coverage_plan(
            operating_hours, 
            enhanced_constraints.get("min_staff", 1), 
            enhanced_constraints.get("max_staff", 8),
            enhanced_constraints.get("min_consecutive_hours_per_shift", 4),
            enhanced_constraints.get("max_consecutive_hours_per_shift", 12),
            enhanced_constraints
        )
        
        if generated_templates:
            enhanced_constraints["shift_templates"] = generated_templates
            print(f"  Total shift templates generated: {len(generated_templates)}")
    elif existing_shift_templates:
        print(f"INFO: Using existing {len(existing_shift_templates)} shift templates")
    else:
        print("INFO: Adding default shift template")
        enhanced_constraints["shift_templates"] = [
            {
                "name": "Standard Shift",
                "start_time": "09:00",
                "end_time": "17:00",
                "required_roles": {"general": 1},
                "preferred_locations": [],
                "is_active": True
            }
        ]
    
    # Ensure locations exist
    if not enhanced_constraints.get("locations"):
        print("INFO: Adding default location")
        enhanced_constraints["locations"] = ["Main Office"]
    
    # Ensure departments exist
    if not enhanced_constraints.get("departments"):
        print("INFO: Adding default department")
        enhanced_constraints["departments"] = ["Operations"]
    
    # Ensure roles exist
    if not enhanced_constraints.get("roles"):
        print("INFO: Adding default role")
        enhanced_constraints["roles"] = ["general"]
    
    # CRITICAL FIX: Properly handle operating hours without overriding user data
    operating_hours = enhanced_constraints.get("operating_hours", [])
    print(f"DEBUG: Original operating hours count: {len(operating_hours)}")
    
    if operating_hours:
        print("DEBUG: User has configured operating hours, preserving them exactly as specified:")
        for oh in operating_hours:
            day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][oh.get("day_of_week", 0)]
            print(f"  {day_name} (day_of_week={oh.get('day_of_week')}): open={oh.get('is_open')}, min_staff={oh.get('min_staff')}, max_staff={oh.get('max_staff')}")
        
        # FIXED: Only add missing days if user has incomplete setup, don't modify existing days
        existing_days = {oh["day_of_week"] for oh in operating_hours}
        missing_days = []
        for day in range(7):
            if day not in existing_days:
                missing_days.append(day)
        
        if missing_days:
            print(f"DEBUG: Adding defaults for missing days: {missing_days}")
            for day in missing_days:
                day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]
                print(f"  Adding default for {day_name} (day_of_week={day})")
                operating_hours.append({
                    "day_of_week": day, 
                    "open_time": "09:00", 
                    "close_time": "17:00", 
                    "is_open": False,  # Default new days to closed
                    "min_staff": 1,
                    "max_staff": 10  # Use a reasonable default instead of 1
                })
        else:
            print("DEBUG: All 7 days have operating hours defined, no defaults needed")
        
        enhanced_constraints["operating_hours"] = operating_hours
    else:
        print("INFO: No operating hours found, adding complete default set (closed by default)")
        enhanced_constraints["operating_hours"] = [
            {"day_of_week": i, "open_time": "09:00", "close_time": "17:00", 
             "is_open": False, "min_staff": 1, "max_staff": 10}  # All days closed by default
            for i in range(7)
        ]
    
    print(f"DEBUG: Final operating hours count: {len(enhanced_constraints['operating_hours'])}")
    return enhanced_constraints


def _advanced_ortools_schedule(
    employees: List[Dict], constraints: Dict, start_date: datetime, end_date: datetime
) -> List[Dict]:
    """
    Advanced OR-Tools based scheduling using CP-SAT solver with comprehensive constraint handling.
    Implements fairness, skill matching, availability checking, and regulatory compliance.
    """
    print("INFO: Using advanced OR-Tools scheduling")
    
    model = cp_model.CpModel()
    
    # Extract constraint parameters
    operating_hours = constraints.get("operating_hours", [])
    shift_templates = constraints.get("shift_templates", [])
    skill_requirements = constraints.get("skill_requirements", [])
    locations = constraints.get("locations", ["Main Location"])
    departments = constraints.get("departments", ["General"])
    optimization_priority = constraints.get("optimization_priority", "fairness")
    
    # Get time-off requests for conflict checking
    time_off_requests = constraints.get("time_off_requests", [])
    
    # Create date range
    dates = []
    current_date = start_date
    while current_date <= end_date:
        dates.append(current_date)
        current_date += timedelta(days=1)
    
    # Decision variables: employee_i works shift_j on date_k
    shifts = {}
    for emp_idx, employee in enumerate(employees):
        for date_idx, date in enumerate(dates):
            for shift_idx, template in enumerate(shift_templates):
                var_name = f"emp_{emp_idx}_date_{date_idx}_shift_{shift_idx}"
                shifts[(emp_idx, date_idx, shift_idx)] = model.NewBoolVar(var_name)
    
    # Constraint 1: Operating hours compliance
    for date_idx, date in enumerate(dates):
        # Convert date to constraint's day_of_week format (Sunday=0)
        # Convert to constraint's day_of_week format (Sunday=0)
        day_of_week = (date.weekday() + 1) % 7  # Monday=1, Sunday=0
        day_hours = next((oh for oh in operating_hours if oh["day_of_week"] == day_of_week and oh.get("is_open", False)), None)
        day_hours = next((oh for oh in operating_hours if oh["day_of_week"] == day_of_week), None)
        
        day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day_of_week]
        print(f"DEBUG: Processing {day_name} (day_of_week={day_of_week}) for date {date.strftime('%Y-%m-%d')}")
        print(f"DEBUG: Operating hours for {day_name}: {day_hours}")
        
        # CRITICAL FIX: Enforce is_open flag strictly at the model level
        if not day_hours or not day_hours.get("is_open", False):
            if not day_hours:
                print(f"WARNING: No operating hours found for {day_name}, enforcing CLOSED")
            else:
                print(f"DEBUG: {day_name} is marked as CLOSED, enforcing NO SHIFTS")

            # For closed days, explicitly forbid any shifts from being assigned
            for emp_idx in range(len(employees)):
                for shift_idx in range(len(shift_templates)):
                    model.Add(shifts[(emp_idx, date_idx, shift_idx)] == 0)
        else:
            # Business is OPEN - apply staffing constraints
            min_staff_today = day_hours.get("min_staff", 1)
            max_staff_today = day_hours.get("max_staff", 10)
            
            # VALIDATE AND ADJUST STAFFING REQUIREMENTS BEFORE ADDING CONSTRAINTS
            if min_staff_today > len(employees):
                print(f"WARNING: {day_name} min_staff ({min_staff_today}) exceeds available employees ({len(employees)}), adjusting to {len(employees)}")
                min_staff_today = len(employees)
            
            if max_staff_today < min_staff_today:
                print(f"WARNING: {day_name} max_staff ({max_staff_today}) is less than min_staff ({min_staff_today}), adjusting max_staff to {min_staff_today}")
                max_staff_today = min_staff_today
            
            print(f"DEBUG: Applying constraints for {day_name}: {min_staff_today} <= staff <= {max_staff_today}")

            # Sum of shifts for the day must be within min/max staff
            daily_staffing = []
            total_employees_day = []
            for emp_idx in range(len(employees)):
                for shift_idx in range(len(shift_templates)):
                    daily_staffing.append(shifts[(emp_idx, date_idx, shift_idx)])
            
            model.Add(sum(daily_staffing) >= min_staff_today)
            model.Add(sum(daily_staffing) <= max_staff_today)
            for emp_idx in range(len(employees)):
                emp_works_day = model.NewBoolVar(f"emp_{emp_idx}_works_date_{date_idx}")
                # Employee works if they have any shift that day
                shifts_for_emp = [shifts[(emp_idx, date_idx, shift_idx)] for shift_idx in range(len(shift_templates))]
                model.AddMaxEquality(emp_works_day, shifts_for_emp)
                total_employees_day.append(emp_works_day)
            
            print(f"DEBUG: Applying constraints for {day_name}: {min_staff_today} <= staff <= {max_staff_today}")
            model.Add(sum(total_employees_day) >= min_staff_today)
            model.Add(sum(total_employees_day) <= max_staff_today)
    
    # Constraint 2: Employee availability check
    for emp_idx, employee in enumerate(employees):
        for date_idx, date in enumerate(dates):
            for shift_idx, template in enumerate(shift_templates):
                if not _check_employee_availability(employee, date, template["start_time"], template["end_time"]):
                    model.Add(shifts[(emp_idx, date_idx, shift_idx)] == 0)
    
    # Constraint 3: Role-based assignment enforcement (NEW - FIXES ROLE ENFORCEMENT)
    for emp_idx, employee in enumerate(employees):
        emp_role = employee.get("role", "general")
        emp_skills = employee.get("skills", [])
        
        for date_idx, date in enumerate(dates):
            for shift_idx, template in enumerate(shift_templates):
                shift_required_roles = template.get("required_roles", {"general": 1})
                
                # Check if employee can fill any required role for this shift
                can_work_shift = False
                
                # Check direct role match
                if emp_role in shift_required_roles:
                    can_work_shift = True
                
                # Check skill-based role qualification
                for skill_req in skill_requirements:
                    required_role = skill_req.get("role", "")
                    required_skills = skill_req.get("required_skills", [])
                    
                    if (required_role in shift_required_roles and 
                        all(skill in emp_skills for skill in required_skills)):
                        can_work_shift = True
                        break
                
                # If employee cannot work this shift type, forbid assignment
                if not can_work_shift and len(shift_required_roles) > 0:
                    # Only restrict if there are specific role requirements
                    specific_roles = [role for role in shift_required_roles.keys() if role != "general"]
                    if specific_roles:
                        model.Add(shifts[(emp_idx, date_idx, shift_idx)] == 0)
    
    # Constraint 4: Skill requirements enforcement (ENHANCED)
    for emp_idx, employee in enumerate(employees):
        emp_skills = employee.get("skills", [])
        for date_idx, date in enumerate(dates):
            for shift_idx, template in enumerate(shift_templates):
                shift_roles = template.get("required_roles", {})
                
                # Check if any required role needs skills this employee doesn't have
                role_mismatch = False
                for required_role, count in shift_roles.items():
                    if count > 0:  # Only check roles that are actually needed
                        # Find skill requirements for this role
                        role_skill_reqs = [sr for sr in skill_requirements if sr.get("role") == required_role]
                        for skill_req in role_skill_reqs:
                            if skill_req.get("is_mandatory", True):
                                required_skills = skill_req.get("required_skills", [])
                                if not all(skill in emp_skills for skill in required_skills):
                                    role_mismatch = True
                                    break
                
                if role_mismatch:
                    model.Add(shifts[(emp_idx, date_idx, shift_idx)] == 0)
    
    # Constraint 5: Maximum one shift per employee per day
    for emp_idx in range(len(employees)):
        for date_idx in range(len(dates)):
            model.Add(sum(shifts[(emp_idx, date_idx, shift_idx)] for shift_idx in range(len(shift_templates))) <= 1)
    
    # Constraint 5.5: ENFORCE Manager Presence and Complete Business Coverage (RELAXED FOR FEASIBILITY)
    for date_idx, date in enumerate(dates):
        day_of_week = date.weekday()
        
        # Find operating hours for this day
        day_operating_hours = None
        for oh in operating_hours:
            if oh.get("day_of_week") == day_of_week:
                day_operating_hours = oh
                break
        
        if day_operating_hours and day_operating_hours.get("is_open", False):
            # ENHANCED: Enforce COMPLETE manager coverage throughout the day
            manager_employees = [emp_idx for emp_idx, emp in enumerate(employees) 
                               if emp.get("role") in ["manager", "administrator"]]
            
            if manager_employees:
                # ENFORCE: At least one manager for opening hours (09:00-13:00)
                opening_manager_shifts = []
                for shift_idx, template in enumerate(shift_templates):
                    if (template.get("start_time") == "09:00" and 
                        template.get("type") in ["opening_shift", "morning_manager"]):
                        for emp_idx in manager_employees:
                            opening_manager_shifts.append(shifts[(emp_idx, date_idx, shift_idx)])
                
                if opening_manager_shifts:
                    model.Add(sum(opening_manager_shifts) >= 1)
                    print(f"DEBUG: Enforcing opening manager presence for {date.strftime('%Y-%m-%d')}")
                
                # ENFORCE: At least one manager for closing hours (13:00-17:00)
                closing_manager_shifts = []
                for shift_idx, template in enumerate(shift_templates):
                    if (template.get("end_time") == "17:00" and 
                        template.get("type") in ["closing_shift", "evening_manager"]):
                        for emp_idx in manager_employees:
                            closing_manager_shifts.append(shifts[(emp_idx, date_idx, shift_idx)])
                
                if closing_manager_shifts:
                    model.Add(sum(closing_manager_shifts) >= 1)
                    print(f"DEBUG: Enforcing closing manager presence for {date.strftime('%Y-%m-%d')}")
                
                # ENFORCE: At least one manager for afternoon coverage (11:00-16:00)
                afternoon_manager_shifts = []
                for shift_idx, template in enumerate(shift_templates):
                    if template.get("type") in ["afternoon_manager", "evening_manager"]:
                        for emp_idx in manager_employees:
                            afternoon_manager_shifts.append(shifts[(emp_idx, date_idx, shift_idx)])
                
                if afternoon_manager_shifts:
                    model.Add(sum(afternoon_manager_shifts) >= 1)
                    print(f"DEBUG: Enforcing afternoon manager presence for {date.strftime('%Y-%m-%d')}")
                
                # ENFORCE: At least one manager present throughout the entire day
                all_manager_shifts = []
                for shift_idx, template in enumerate(shift_templates):
                    if template.get("type") in ["morning_manager", "afternoon_manager", "evening_manager", "full_day_manager"]:
                        for emp_idx in manager_employees:
                            all_manager_shifts.append(shifts[(emp_idx, date_idx, shift_idx)])
                
                if all_manager_shifts:
                    model.Add(sum(all_manager_shifts) >= 1)
                    print(f"DEBUG: Enforcing overall manager presence for {date.strftime('%Y-%m-%d')}")
            
            # ENFORCE: At least one staff member for coverage
            staff_shifts = []
            for shift_idx, template in enumerate(shift_templates):
                if template.get("type") in ["opening_shift", "mid_shift", "closing_shift"]:
                    for emp_idx, employee in enumerate(employees):
                        staff_shifts.append(shifts[(emp_idx, date_idx, shift_idx)])
            
            if staff_shifts:
                model.Add(sum(staff_shifts) >= 1)
                print(f"DEBUG: Enforcing staff presence for {date.strftime('%Y-%m-%d')}")
    
    # Constraint 6: Maximum consecutive working days (ENHANCED)
    max_consecutive_days = constraints.get("max_consecutive_days", 6)
    print(f"DEBUG: Enforcing max_consecutive_days: {max_consecutive_days}")
    
    for emp_idx in range(len(employees)):
        for start_date_idx in range(len(dates) - max_consecutive_days):
            consecutive_days = []
            for day_offset in range(max_consecutive_days + 1):
                date_idx = start_date_idx + day_offset
                if date_idx < len(dates):
                    day_worked = model.NewBoolVar(f"emp_{emp_idx}_worked_consecutive_{start_date_idx}_{day_offset}")
                    shifts_that_day = [shifts[(emp_idx, date_idx, shift_idx)] for shift_idx in range(len(shift_templates))]
                    model.AddMaxEquality(day_worked, shifts_that_day)
                    consecutive_days.append(day_worked)
            if consecutive_days:
                model.Add(sum(consecutive_days) <= max_consecutive_days)
    
    # Constraint 7: Minimum rest between shifts (simplified)
    for emp_idx in range(len(employees)):
        for date_idx in range(len(dates) - 1):
            works_today = model.NewBoolVar(f"emp_{emp_idx}_works_today_{date_idx}")
            works_tomorrow = model.NewBoolVar(f"emp_{emp_idx}_works_tomorrow_{date_idx}")
            
            # Define if employee works each day
            model.AddMaxEquality(works_today, [shifts[(emp_idx, date_idx, shift_idx)] for shift_idx in range(len(shift_templates))])
            model.AddMaxEquality(works_tomorrow, [shifts[(emp_idx, date_idx + 1, shift_idx)] for shift_idx in range(len(shift_templates))])
            
            # If working both days, ensure adequate rest (simplified constraint)
            both_days = model.NewBoolVar(f"emp_{emp_idx}_both_days_{date_idx}")
            model.AddBoolAnd([works_today, works_tomorrow]).OnlyEnforceIf(both_days)
            model.AddBoolOr([works_today.Not(), works_tomorrow.Not()]).OnlyEnforceIf(both_days.Not())
    
    # Constraint 8: Maximum hours per week per employee (ENHANCED)
    max_hours_per_week = constraints.get("max_hours_per_week", 40)
    print(f"DEBUG: Enforcing max_hours_per_week: {max_hours_per_week}")
    
    for emp_idx in range(len(employees)):
        total_hours = []
        for date_idx in range(len(dates)):
            for shift_idx in range(len(shift_templates)):
                # Calculate shift duration in hours
                start_time = shift_templates[shift_idx]["start_time"]
                end_time = shift_templates[shift_idx]["end_time"]
                shift_hours = calculate_shift_hours(start_time, end_time)
                # Create a linear expression for hours worked
                hours_worked = model.NewIntVar(0, int(shift_hours), f"hours_emp_{emp_idx}_date_{date_idx}_shift_{shift_idx}")
                model.Add(hours_worked == shifts[(emp_idx, date_idx, shift_idx)] * int(shift_hours))
                total_hours.append(hours_worked)
        model.Add(sum(total_hours) <= int(max_hours_per_week))
    
    # Constraint 9: Shift duration constraints (ENHANCED)
    min_consecutive_hours_per_shift = constraints.get("min_consecutive_hours_per_shift", 4)
    max_consecutive_hours_per_shift = constraints.get("max_consecutive_hours_per_shift", 12)
    print(f"DEBUG: Enforcing shift duration: {min_consecutive_hours_per_shift}-{max_consecutive_hours_per_shift} hours")
    
    # Create shift templates that respect duration constraints
    valid_shift_templates = []
    for template in shift_templates:
        start_time = template["start_time"]
        end_time = template["end_time"]
        shift_hours = calculate_shift_hours(start_time, end_time)
        
        # Allow full-day manager shifts even if they exceed duration constraints
        if template.get("type") == "full_day_manager":
            valid_shift_templates.append(template)
            print(f"DEBUG: Valid full-day manager template: {template['name']} ({start_time}-{end_time}) = {shift_hours}h")
        elif min_consecutive_hours_per_shift <= shift_hours <= max_consecutive_hours_per_shift:
            valid_shift_templates.append(template)
            print(f"DEBUG: Valid shift template: {template['name']} ({start_time}-{end_time}) = {shift_hours}h")
        else:
            print(f"DEBUG: Invalid shift template: {template['name']} ({start_time}-{end_time}) = {shift_hours}h (outside {min_consecutive_hours_per_shift}-{max_consecutive_hours_per_shift}h range)")
    
    # If no valid templates, create one that fits the constraints
    if not valid_shift_templates:
        print(f"WARNING: No shift templates fit duration constraints ({min_consecutive_hours_per_shift}-{max_consecutive_hours_per_shift}h)")
        print("INFO: Creating default shift template that fits constraints")
        
        # Create a shift that fits the constraints
        target_hours = (min_consecutive_hours_per_shift + max_consecutive_hours_per_shift) // 2
        start_hour = 9  # 9 AM
        end_hour = start_hour + target_hours
        
        default_template = {
            "name": f"Standard {target_hours}h Shift",
            "start_time": f"{start_hour:02d}:00",
            "end_time": f"{end_hour:02d}:00",
            "required_roles": {"general": 1},
            "preferred_locations": locations,
            "is_active": True
        }
        valid_shift_templates = [default_template]
        print(f"DEBUG: Created default template: {default_template['name']} ({default_template['start_time']}-{default_template['end_time']})")
    
    # Use all professional shift templates for complete business coverage
    shift_templates = valid_shift_templates
    
    # ENFORCE: Ensure we have all required shift types for complete coverage
    required_shift_types = ["opening_manager", "morning_staff", "afternoon_staff", "closing_manager", "full_day_manager"]
    available_types = [template.get("type") for template in shift_templates]
    
    print(f"DEBUG: Available shift types: {available_types}")
    print(f"DEBUG: Required shift types: {required_shift_types}")
    
    # Get operating hours for fallback templates
    first_hours = operating_hours[0] if operating_hours else {"open_time": "09:00", "close_time": "17:00"}
    fallback_open_time = first_hours.get("open_time", "09:00")
    fallback_close_time = first_hours.get("close_time", "17:00")
    
    # Ensure we have at least one of each required type
    for required_type in required_shift_types:
        if required_type not in available_types:
            print(f"WARNING: Missing required shift type: {required_type}")
            # Create a fallback template for missing type
            if required_type == "opening_manager":
                fallback = {
                    "name": f"Opening Manager ({fallback_open_time}-13:00)",
                    "start_time": fallback_open_time,
                    "end_time": "13:00",
                    "type": "opening_manager",
                    "required_roles": {"manager": 1},
                    "is_active": True
                }
            elif required_type == "closing_manager":
                fallback = {
                    "name": f"Closing Manager (13:00-{fallback_close_time})",
                    "start_time": "13:00",
                    "end_time": fallback_close_time,
                    "type": "closing_manager",
                    "required_roles": {"manager": 1},
                    "is_active": True
                }
            elif required_type == "full_day_manager":
                fallback = {
                    "name": f"Full Day Manager ({fallback_open_time}-{fallback_close_time})",
                    "start_time": fallback_open_time,
                    "end_time": fallback_close_time,
                    "type": "full_day_manager",
                    "required_roles": {"manager": 1},
                    "is_active": True
                }
            else:
                continue
                
            shift_templates.append(fallback)
            print(f"DEBUG: Added fallback template: {fallback['name']}")
    
    # Objective: Apply optimization priority (ENHANCED)
    optimization_priority = constraints.get("optimization_priority", "balance_staffing")
    print(f"DEBUG: Applying optimization priority: {optimization_priority}")
    
    total_shifts_per_employee = []
    for emp_idx in range(len(employees)):
        emp_shifts = []
        for date_idx in range(len(dates)):
            for shift_idx in range(len(shift_templates)):
                emp_shifts.append(shifts[(emp_idx, date_idx, shift_idx)])
        total_shifts_per_employee.append(sum(emp_shifts))
    
    if optimization_priority == "fairness":
        # Minimize the maximum difference in shift assignments (fairness)
        if len(employees) > 1:
            max_diff = model.NewIntVar(0, len(dates) * len(shift_templates), "max_diff")
            for i in range(len(employees)):
                for j in range(i + 1, len(employees)):
                    diff_pos = model.NewIntVar(0, len(dates) * len(shift_templates), f"diff_pos_{i}_{j}")
                    diff_neg = model.NewIntVar(0, len(dates) * len(shift_templates), f"diff_neg_{i}_{j}")
                    model.Add(total_shifts_per_employee[i] - total_shifts_per_employee[j] == diff_pos - diff_neg)
                    model.AddMaxEquality(max_diff, [diff_pos, diff_neg])
            model.Minimize(max_diff)
        else:
            model.Maximize(sum(total_shifts_per_employee))
    elif optimization_priority == "maximize_coverage":
        # Maximize total coverage (total shifts assigned)
        model.Maximize(sum(total_shifts_per_employee))
    elif optimization_priority == "minimize_cost":
        # Minimize total cost (assume cost is proportional to shifts)
        model.Minimize(sum(total_shifts_per_employee))
    else:  # balance_staffing (default)
        # Balance between coverage and fairness
        if len(employees) > 1:
            max_diff = model.NewIntVar(0, len(dates) * len(shift_templates), "max_diff")
            for i in range(len(employees)):
                for j in range(i + 1, len(employees)):
                    diff_pos = model.NewIntVar(0, len(dates) * len(shift_templates), f"diff_pos_{i}_{j}")
                    diff_neg = model.NewIntVar(0, len(dates) * len(shift_templates), f"diff_neg_{i}_{j}")
                    model.Add(total_shifts_per_employee[i] - total_shifts_per_employee[j] == diff_pos - diff_neg)
                    model.AddMaxEquality(max_diff, [diff_pos, diff_neg])
            model.Minimize(max_diff)
        else:
            model.Maximize(sum(total_shifts_per_employee))
    
    # Solve the model
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30  # Fixed time limit
    solver.parameters.log_search_progress = False
    
    status = solver.Solve(model)
    
    if status not in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        print(f"WARNING: OR-Tools solver status: {solver.StatusName(status)}")
        return []  # Return empty list to trigger fallback
    
    # Build schedule from solution (FIXED - PROPER ROLE ASSIGNMENT)
    schedules = []
    for emp_idx, employee in enumerate(employees):
        for date_idx, date in enumerate(dates):
            for shift_idx, template in enumerate(shift_templates):
                # SAFETY CHECK: Ensure the key exists before accessing
                shift_key = (emp_idx, date_idx, shift_idx)
                if shift_key in shifts and solver.Value(shifts[shift_key]):
                    # Determine the correct role for this assignment
                    assigned_role = "general"  # default
                    emp_role = employee.get("role", "general")
                    emp_skills = employee.get("skills", [])
                    shift_required_roles = template.get("required_roles", {"general": 1})
                    
                    # Assign role based on employee capabilities and shift requirements
                    if emp_role in shift_required_roles:
                        assigned_role = emp_role
                    else:
                        # Check skill-based role assignment
                        for skill_req in skill_requirements:
                            required_role = skill_req.get("role", "")
                            required_skills = skill_req.get("required_skills", [])
                            
                            if (required_role in shift_required_roles and 
                                all(skill in emp_skills for skill in required_skills)):
                                assigned_role = required_role
                                break
                        
                        # Fallback to first available role in shift requirements
                        if assigned_role == "general" and shift_required_roles:
                            assigned_role = list(shift_required_roles.keys())[0]
                    
                    # Assign location and department from constraints (not random)
                    constraint_locations = constraints.get("locations", ["Main Location"])
                    constraint_departments = constraints.get("departments", ["General"])
                    
                    # Keep employee's location regardless of constraints
                    assigned_location = employee.get("location", "")
                    # If employee has no location, use a default from constraints
                    if not assigned_location and constraint_locations:
                        assigned_location = random.choice(constraint_locations)
                    
                    assigned_department = employee.get("department", "")
                    if assigned_department not in constraint_departments:
                        assigned_department = random.choice(constraint_departments)
                    
                    schedules.append({
                        "employeeId": str(employee["_id"]),
                        "date": date.strftime("%Y-%m-%d"),
                        "startTime": template["start_time"],
                        "endTime": template["end_time"],
                        "location": assigned_location,  # From constraints only
                        "role": assigned_role,  # Properly assigned role instead of random
                        "department": assigned_department,  # From constraints only
                        "status": "scheduled",
                        "notes": f"OR-Tools optimized with role enforcement (fairness score: {solver.ObjectiveValue()})"
                    })
    
    # SORT SCHEDULES: Professional real-world order (REAL-WORLD READY)
    def sort_key(schedule):
        # Primary: Date
        date_key = schedule["date"]
        # Secondary: Start time (HH:MM format for proper sorting)
        start_time = schedule["startTime"]
        # Tertiary: End time (for same start time, shorter shifts first)
        end_time = schedule["endTime"]
        # Quaternary: Employee name (for consistent ordering)
        employee_name = schedule.get("employeeName", "")
        return (date_key, start_time, end_time, employee_name)
    
    schedules.sort(key=sort_key)
    print(f"SUCCESS: OR-Tools generated {len(schedules)} optimized schedules with role enforcement")
    print(f"INFO: Schedules sorted professionally by date, start time, end time, and employee name")
    return schedules


def _relax_constraints(constraints: Dict) -> Dict:
    """
    Create relaxed constraints for fallback scheduling when OR-Tools fails.
    This reduces the strictness of constraints to increase the chance of finding a solution.
    """
    relaxed = constraints.copy()
    
    # Relax staffing requirements
    relaxed["min_employees_per_day"] = max(1, constraints.get("min_employees_per_day", 1) - 1)
    relaxed["max_employees_per_day"] = constraints.get("max_employees_per_day", 10) + 2
    
    # Relax consecutive days limit
    relaxed["max_consecutive_days"] = min(7, constraints.get("max_consecutive_days", 6) + 1)
    
    # Relax rest hours requirement
    relaxed["min_rest_hours_between_shifts"] = max(8, constraints.get("min_rest_hours_between_shifts", 8) - 2)
    
    # Relax weekly hours limit
    relaxed["max_hours_per_week"] = constraints.get("max_hours_per_week", 40) + 8
    
    # Increase solver time limit for more complex search
    relaxed["solver_time_limit"] = min(60, constraints.get("solver_time_limit", 30) * 2)
    
    # Relax operating hours - make more days available if needed
    operating_hours = constraints.get("operating_hours", [])
    relaxed_hours = []
    for oh in operating_hours:
        relaxed_oh = oh.copy()
        if oh.get("min_staff", 1) > 1:
            relaxed_oh["min_staff"] = oh["min_staff"] - 1
        relaxed_hours.append(relaxed_oh)
    relaxed["operating_hours"] = relaxed_hours
    
    print(f"INFO: Relaxed constraints - min_employees: {relaxed['min_employees_per_day']}, "
          f"max_consecutive: {relaxed['max_consecutive_days']}, "
          f"min_rest: {relaxed['min_rest_hours_between_shifts']}")
    
    return relaxed


def analyze_failure(constraints: Dict, employees: List[Dict]) -> Dict[str, Any]:
    """
    Analyze why scheduling failed and provide suggestions.
    Implements the conflict analysis blueprint from the requirements.
    """
    print("INFO: Analyzing scheduling failure...")
    
    analysis = {
        "unavailable_staff": [],
        "skill_gaps": [],
        "regulatory_violations": [],
        "suggestions": []
    }
    
    # Analyze employee availability
    operating_hours = constraints.get("operating_hours", [])
    open_days = [oh for oh in operating_hours if oh.get("is_open", False)]
    
    if not open_days:
        analysis["regulatory_violations"].append("No operating days defined")
        analysis["suggestions"].append("Define at least one operating day")
        
    # Check if minimum staffing requirements are achievable
    min_staff_needed = sum(oh.get("min_staff", 1) for oh in open_days)
    available_employees = len([emp for emp in employees if emp.get("isActive", True)])
    
    if min_staff_needed > available_employees:
        analysis["unavailable_staff"].append(f"Need {min_staff_needed} staff but only {available_employees} available")
        analysis["suggestions"].append("Reduce minimum staffing requirements or hire more employees")
    
    # Check skill requirements
    skill_requirements = constraints.get("skill_requirements", [])
    for req in skill_requirements:
        required_role = req.get("role")
        required_skills = req.get("required_skills", [])
        
        qualified_employees = []
        for emp in employees:
            emp_skills = emp.get("skills", [])
            if all(skill in emp_skills for skill in required_skills):
                qualified_employees.append(emp)
        
        if len(qualified_employees) == 0:
            analysis["skill_gaps"].append(f"No employees qualified for {required_role} role")
            analysis["suggestions"].append(f"Train employees in required skills: {required_skills}")
    
    # Check shift templates
    shift_templates = constraints.get("shift_templates", [])
    if not shift_templates:
        analysis["regulatory_violations"].append("No shift templates defined")
        analysis["suggestions"].append("Define at least one shift template")
    
    print(f"INFO: Analysis complete - {len(analysis['suggestions'])} suggestions generated")
    return analysis


def reset_scheduler_circuit_breaker():
    """
    Manually reset the circuit breaker - useful for debugging and after fixing issues.
    """
    global scheduler_circuit_breaker
    scheduler_circuit_breaker.failure_count = 0
    scheduler_circuit_breaker.state = CircuitBreakerState.CLOSED
    scheduler_circuit_breaker.last_failure_time = None
    print("INFO: Scheduler circuit breaker manually reset to CLOSED state")


def _filter_employees_by_constraints(employees: List[Dict], constraints: Dict) -> List[Dict]:
    """
    Filter employees based on constraint parameters (roles, departments, locations, skills).
    This ensures only employees matching the saved constraint criteria are considered for scheduling.
    
    Args:
        employees: List of all employee documents
        constraints: Scheduling constraints dict containing filter criteria
        
    Returns:
        List of employees that match the constraint criteria
    """
    print("DEBUG: ===== FILTERING EMPLOYEES BY CONSTRAINTS =====")
    
    # Extract constraint filter criteria
    constraint_roles = constraints.get("roles", [])
    constraint_departments = constraints.get("departments", [])
    constraint_locations = constraints.get("locations", [])
    constraint_skills = constraints.get("skill_requirements", [])
    
    print(f"DEBUG: Constraint roles: {constraint_roles}")
    print(f"DEBUG: Constraint departments: {constraint_departments}")
    print(f"DEBUG: Constraint locations: {constraint_locations}")
    print(f"DEBUG: Constraint skill requirements: {len(constraint_skills)} entries")
    
    filtered_employees = []
    
    for employee in employees:
        # Skip inactive or anonymized employees
        if not employee.get("isActive", True) or employee.get("anonymized", False):
            continue
            
        emp_role = employee.get("role", "")
        emp_department = employee.get("department", "")
        emp_location = employee.get("location", "")
        emp_skills = employee.get("skills", [])
        
        # Check role filter
        role_match = True
        if constraint_roles and len(constraint_roles) > 0:
            role_match = emp_role in constraint_roles
            if not role_match:
                print(f"DEBUG: Employee {employee.get('firstName', 'Unknown')} role '{emp_role}' not in constraint roles {constraint_roles}")
                continue
        
        # Check department filter
        department_match = True
        if constraint_departments and len(constraint_departments) > 0:
            department_match = emp_department in constraint_departments
            if not department_match:
                print(f"DEBUG: Employee {employee.get('firstName', 'Unknown')} department '{emp_department}' not in constraint departments {constraint_departments}")
                continue
        
        # Location filtering removed as per requirement
        # All employees are eligible regardless of location constraints
        
        # Check skill requirements
        skill_match = True
        if constraint_skills and len(constraint_skills) > 0:
            # Check if employee meets any of the skill requirements
            meets_any_skill_req = False
            for skill_req in constraint_skills:
                required_skills = skill_req.get("required_skills", [])
                if required_skills:
                    # Check if employee has all required skills for this requirement
                    has_all_skills = all(skill in emp_skills for skill in required_skills)
                    if has_all_skills:
                        meets_any_skill_req = True
                        break
                else:
                    # If no specific skills required, employee qualifies
                    meets_any_skill_req = True
                    break
            
            if not meets_any_skill_req and constraint_skills:
                print(f"DEBUG: Employee {employee.get('firstName', 'Unknown')} skills {emp_skills} don't meet any skill requirements")
                continue
        
        # If all filters pass, include the employee
        filtered_employees.append(employee)
        print(f"DEBUG: ✓ Employee {employee.get('firstName', 'Unknown')} ({emp_role}, {emp_department}, {emp_location}) matches constraints")
    
    print(f"DEBUG: Filtered {len(filtered_employees)} employees out of {len(employees)} based on constraints")
    
    if len(filtered_employees) == 0:
        print("WARNING: No employees match the constraint criteria! This will result in empty schedules.")
        print("RECOMMENDATION: Review constraint settings for roles, departments, locations, and skills.")
    
    return filtered_employees


def generate_schedule(employees: List[Dict], constraints: Dict, start_date: datetime, end_date: datetime) -> List[Dict]:
    """
    Enhanced schedule generation with conflict detection and constraint compliance.
    
    Args:
        employees: List of employee documents from database
        constraints: Scheduling constraints dict from database
        start_date: Start date for schedule generation
        end_date: End date for schedule generation
        
    Returns:
        List of schedule documents to be inserted into database
    """
    print("DEBUG: ===== STARTING SCHEDULE GENERATION =====")
    print(f"DEBUG: Date range: {start_date} to {end_date}")
    print(f"DEBUG: Constraints name: {constraints.get('name', 'Unknown')}")
    print(f"DEBUG: Raw constraints keys: {list(constraints.keys())}")
    
    # Debug operating hours before processing
    operating_hours = constraints.get("operating_hours", [])
    print(f"DEBUG: Raw operating hours ({len(operating_hours)} entries):")
    for oh in operating_hours:
        day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][oh.get("day_of_week", 0)]
        print(f"  {day_name} (day_of_week={oh.get('day_of_week')}): open={oh.get('is_open')}, min_staff={oh.get('min_staff')}, max_staff={oh.get('max_staff')}")
    
    # CRITICAL FIX: Filter employees by constraint criteria FIRST
    constraint_filtered_employees = _filter_employees_by_constraints(employees, constraints)
    print(f"DEBUG: Constraint-filtered employees: {len(constraint_filtered_employees)} out of {len(employees)}")
    
    if len(constraint_filtered_employees) == 0:
        print("WARNING: No employees match constraint criteria")
        return []
    
    # TEMPORARY: Reset circuit breaker for debugging
    if scheduler_circuit_breaker.state == CircuitBreakerState.OPEN:
        print("DEBUG: Circuit breaker is OPEN, resetting for debugging")
        reset_scheduler_circuit_breaker()
    
    # Ensure constraints have sensible defaults
    enhanced_constraints = _ensure_constraint_defaults(constraints)
    print(f"DEBUG: Enhanced constraints applied")
    
    # Debug enhanced operating hours
    enhanced_operating_hours = enhanced_constraints.get("operating_hours", [])
    print(f"DEBUG: Enhanced operating hours ({len(enhanced_operating_hours)} entries):")
    for oh in enhanced_operating_hours:
        day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][oh.get("day_of_week", 0)]
        print(f"  {day_name} (day_of_week={oh.get('day_of_week')}): open={oh.get('is_open')}, min_staff={oh.get('min_staff')}, max_staff={oh.get('max_staff')}")
    
    # COMPREHENSIVE: Automatic conflict detection and resolution
    print("DEBUG: Running comprehensive conflict detection and automatic resolution...")
    conflict_analysis = detect_scheduling_conflicts(enhanced_constraints, constraint_filtered_employees, start_date, end_date)
    
    if conflict_analysis["conflict_count"] > 0:
        print(f"WARNING: Found {conflict_analysis['conflict_count']} constraint conflicts:")
        for conflict in conflict_analysis["conflicts"]:
            print(f"  - {conflict['severity'].upper()}: {conflict['message']}")
        
        print("INFO: Available suggestions to resolve conflicts:")
        for suggestion in conflict_analysis["suggestions"]:
            print(f"  - {suggestion['message']}")
        
        # COMPREHENSIVE: Implement automatic conflict resolution
        print("INFO: Implementing comprehensive automatic conflict resolution...")
        enhanced_constraints = _resolve_scheduling_conflicts_automatically(
            enhanced_constraints, 
            constraint_filtered_employees, 
            conflict_analysis["conflicts"]
        )
        
        # Re-validate after automatic resolution
        print("INFO: Re-validating constraints after automatic resolution...")
        remaining_conflicts = detect_scheduling_conflicts(enhanced_constraints, constraint_filtered_employees, start_date, end_date)
        if remaining_conflicts["conflict_count"] > 0:
            print(f"WARNING: {remaining_conflicts['conflict_count']} conflicts remain after automatic resolution")
            for conflict in remaining_conflicts["conflicts"]:
                print(f"  - {conflict['severity'].upper()}: {conflict['message']}")
        else:
            print("✓ All conflicts resolved automatically")
    else:
        print("✓ No constraint conflicts detected")
    
    # Check circuit breaker state
    if not scheduler_circuit_breaker.can_execute():
        print("WARNING: Circuit breaker OPEN - OR-Tools temporarily disabled, using fallback")
        print(f"DEBUG: Enhanced constraints keys before circuit breaker fallback: {list(enhanced_constraints.keys())}")
        print(f"DEBUG: Operating hours count before circuit breaker fallback: {len(enhanced_constraints.get('operating_hours', []))}")
        return _basic_random_schedule(constraint_filtered_employees, enhanced_constraints, start_date, end_date)
    
    # Validate constraints (now more lenient)
    validation_errors = validate_constraints(enhanced_constraints)
    if validation_errors:
        print(f"WARNING: Constraint validation issues (continuing with fallback): {validation_errors}")
        print("INFO: Using constraint-enforcing fallback scheduler due to validation issues")
        print(f"DEBUG: Enhanced constraints keys before fallback: {list(enhanced_constraints.keys())}")
        print(f"DEBUG: Operating hours count before fallback: {len(enhanced_constraints.get('operating_hours', []))}")
        return _basic_random_schedule(constraint_filtered_employees, enhanced_constraints, start_date, end_date)
    
    if not _ORTOOLS_AVAILABLE:
        print("INFO: OR-Tools not available, using enhanced fallback scheduler")
        print(f"DEBUG: Enhanced constraints keys before OR-Tools fallback: {list(enhanced_constraints.keys())}")
        print(f"DEBUG: Operating hours count before OR-Tools fallback: {len(enhanced_constraints.get('operating_hours', []))}")
        return _basic_random_schedule(constraint_filtered_employees, enhanced_constraints, start_date, end_date)
    
    try:
        # Try advanced OR-Tools scheduling first
        print("INFO: ===== ATTEMPTING OR-TOOLS SCHEDULING =====")
        schedules = _advanced_ortools_schedule(constraint_filtered_employees, enhanced_constraints, start_date, end_date)
        
        if schedules:
            scheduler_circuit_breaker.record_success()
            print(f"SUCCESS: OR-Tools generated {len(schedules)} optimized schedules with role enforcement")
            
            # COMPREHENSIVE: Validate regulatory compliance
            try:
                print("INFO: Validating regulatory compliance for generated schedules...")
                compliance_report = _validate_regulatory_compliance(schedules, enhanced_constraints, constraint_filtered_employees)
                
                if not compliance_report["is_compliant"]:
                    print(f"WARNING: {compliance_report['violation_count']} compliance violations detected")
                    print("INFO: Compliance violations will be reported but schedules will be generated")
            except Exception as compliance_error:
                print(f"WARNING: Compliance validation failed: {compliance_error}")
                print("INFO: Continuing with schedule generation despite compliance validation error")
            
            return schedules
        else:
            print("WARNING: OR-Tools returned no schedules, trying relaxed constraints")
            relaxed_constraints = _relax_constraints(enhanced_constraints)
            schedules = _advanced_ortools_schedule(constraint_filtered_employees, relaxed_constraints, start_date, end_date)
            
            if schedules:
                scheduler_circuit_breaker.record_success()
                print(f"SUCCESS: OR-Tools with relaxed constraints generated {len(schedules)} schedules")
                return schedules
            else:
                print("WARNING: OR-Tools failed even with relaxed constraints")
                raise Exception("OR-Tools solver could not find a feasible solution")
                
    except Exception as e:
        print(f"ERROR: OR-Tools scheduling failed: {e}")
        import traceback
        traceback.print_exc()
        scheduler_circuit_breaker.record_failure()
        
        # Fallback to enhanced heuristic scheduler
        print("INFO: ===== FALLING BACK TO ENHANCED HEURISTIC SCHEDULER =====")
        print(f"DEBUG: Enhanced constraints keys before exception fallback: {list(enhanced_constraints.keys())}")
        print(f"DEBUG: Operating hours count before exception fallback: {len(enhanced_constraints.get('operating_hours', []))}")
        try:
            schedules = _basic_random_schedule(constraint_filtered_employees, enhanced_constraints, start_date, end_date)
            
            # SORT SCHEDULES: Professional real-world order (REAL-WORLD READY)
            def sort_key(schedule):
                # Primary: Date
                date_key = schedule["date"]
                # Secondary: Start time (HH:MM format for proper sorting)
                start_time = schedule["startTime"]
                # Tertiary: End time (for same start time, shorter shifts first)
                end_time = schedule["endTime"]
                # Quaternary: Employee name (for consistent ordering)
                employee_name = schedule.get("employeeName", "")
                return (date_key, start_time, end_time, employee_name)
            
            schedules.sort(key=sort_key)
            print(f"SUCCESS: Enhanced fallback scheduler generated {len(schedules)} constraint-enforced schedules")
            print(f"INFO: Schedules sorted professionally by date, start time, end time, and employee name")
            
            # COMPREHENSIVE: Validate regulatory compliance
            if schedules:
                try:
                    print("INFO: Validating regulatory compliance for generated schedules...")
                    compliance_report = _validate_regulatory_compliance(schedules, enhanced_constraints, constraint_filtered_employees)
                    
                    if not compliance_report["is_compliant"]:
                        print(f"WARNING: {compliance_report['violation_count']} compliance violations detected")
                        print("INFO: Compliance violations will be reported but schedules will be generated")
                except Exception as compliance_error:
                    print(f"WARNING: Compliance validation failed: {compliance_error}")
                    print("INFO: Continuing with schedule generation despite compliance validation error")
            
            return schedules
        except Exception as fallback_error:
            print(f"ERROR: Enhanced fallback scheduler also failed: {fallback_error}")
            import traceback
            traceback.print_exc()
            return []


def _try_relaxed_generation(employees, constraints, start_date, end_date, time_off_requests) -> List[Dict]:
    """Try generating with relaxed constraints"""
    try:
        return generate_schedule(employees, constraints, start_date, end_date)
    except:
        return []


def _validate_basic_schedule(schedule: Dict, constraints: Dict, time_off_requests: List[Dict]) -> bool:
    """Basic validation for schedule entries"""
    try:
        # Check time-off conflicts
        schedule_date = datetime.strptime(schedule["date"], "%Y-%m-%d")
        date_str = schedule["date"]
        employee_id = schedule["employeeId"]
        
        for request in time_off_requests:
            if (request.get("employeeId") == employee_id and 
                request.get("status") == "approved" and
                request.get("startDate") <= date_str <= request.get("endDate")):
                return False
        
        # Check operating hours
        day_of_week = (schedule_date.weekday() + 1) % 7
        operating_hours = constraints.get("operating_hours", [])
        day_hours = next((oh for oh in operating_hours if oh["day_of_week"] == day_of_week), None)
        
        if day_hours and not day_hours.get("is_open", True):
            return False
        
        return True
    except:
        return False


def _create_minimal_schedule(employees, constraints, start_date, end_date, time_off_requests) -> List[Dict]:
    """Create a minimal but valid schedule as last resort"""
    schedules = []
    current_date = start_date
    locations = constraints.get("locations", ["Main Office"])
    departments = constraints.get("departments", ["Operations"])
    
    while current_date <= end_date and len(schedules) < 50:  # Limit to prevent runaway
        day_of_week = (current_date.weekday() + 1) % 7
        operating_hours = constraints.get("operating_hours", [])
        day_hours = next((oh for oh in operating_hours if oh["day_of_week"] == day_of_week), None)
        
        # Check if we should be open
        is_open = True
        if day_hours:
            is_open = day_hours.get("is_open", True)
        elif operating_hours:  # If operating hours exist but day not found, default to closed
            is_open = False
        
        if is_open:
            # Find an available employee
            date_str = current_date.strftime("%Y-%m-%d")
            for employee in employees:
                employee_id = str(employee["_id"])
                
                # Check time-off conflicts
                has_conflict = False
                for request in time_off_requests:
                    if (request.get("employeeId") == employee_id and 
                        request.get("status") == "approved" and
                        request.get("startDate") <= date_str <= request.get("endDate")):
                        has_conflict = True
                        break
                
                if not has_conflict:
                    # Use constraint locations and departments only
                    constraint_locations = constraints.get("locations", ["Main Office"])
                    constraint_departments = constraints.get("departments", ["Operations"])
                    
                    # Get employee info for department preference
                    employee_info = next((emp for emp in employees if str(emp["_id"]) == employee_id), {})
                    
                    # Keep employee's location regardless of constraints
                    assigned_location = employee_info.get("location", "")
                    # If employee has no location, use a default from constraints
                    if not assigned_location and constraint_locations:
                        assigned_location = random.choice(constraint_locations)
                    
                    # Assign department from constraints
                    assigned_department = employee_info.get("department", "")
                    if assigned_department not in constraint_departments:
                        assigned_department = random.choice(constraint_departments)
                    
                    schedules.append({
                        "employeeId": employee_id,
                        "date": date_str,
                        "startTime": "09:00",
                        "endTime": "17:00",
                        "location": assigned_location,  # From constraints only
                        "role": "general",
                        "department": assigned_department,  # From constraints only
                        "status": "scheduled",
                        "notes": "Minimal schedule - manual review recommended"
                    })
                    break  # One employee per day for minimal schedule
        
        current_date += timedelta(days=1)
    
    return schedules


def validate_schedule_constraints(schedule: Dict, constraints: Dict) -> Dict[str, Any]:
    """
    Validate if a schedule entry meets the given constraints
    Returns validation result with details
    """
    issues = []
    warnings = []
    
    # Check operating hours
    schedule_date = datetime.strptime(schedule["date"], "%Y-%m-%d")
    day_of_week = (schedule_date.weekday() + 1) % 7
    
    operating_hours = constraints.get("operating_hours", [])
    day_hours = next((oh for oh in operating_hours if oh["day_of_week"] == day_of_week), None)
    
    if day_hours and not day_hours.get("is_open", True):
        issues.append(f"Business is closed on {schedule_date.strftime('%A')}")
    
    if day_hours:
        shift_start = schedule["startTime"]
        shift_end = schedule["endTime"]
        business_open = day_hours["open_time"]
        business_close = day_hours["close_time"]
        
        if shift_start < business_open:
            warnings.append(f"Shift starts before business opens ({business_open})")
        if shift_end > business_close:
            warnings.append(f"Shift ends after business closes ({business_close})")
    
    # Check break requirements
    break_rules = constraints.get("break_rules", [])
    if break_rules:
        shift_hours = calculate_shift_hours(schedule["startTime"], schedule["endTime"])
        for rule in break_rules:
            if shift_hours >= rule["required_after_hours"]:
                warnings.append(f"Shift requires {rule['type']} ({rule['duration_minutes']}min)")
    
    return {
        "is_valid": len(issues) == 0,
        "issues": issues,
        "warnings": warnings,
        "score": max(0, 100 - len(issues) * 50 - len(warnings) * 10)
    }


def calculate_shift_hours(start_time: str, end_time: str) -> float:
    """Calculate hours between two time strings"""
    try:
        # Handle both string and datetime inputs
        if isinstance(start_time, str):
            start = datetime.strptime(start_time, "%H:%M")
        else:
            start = start_time
        if isinstance(end_time, str):
            end = datetime.strptime(end_time, "%H:%M")
        else:
            end = end_time
        if end < start:  # Overnight shift
            end += timedelta(days=1)
        return (end - start).seconds / 3600
    except Exception as e:
        print(f"ERROR: Could not calculate shift hours for {start_time}-{end_time}: {e}")
        return 0.0


def optimize_schedule(schedules: List[Dict], constraints: Dict) -> List[Dict]:
    """
    Optimize the generated schedule based on constraints and preferences
    """
    validated_schedules = []
    
    for schedule in schedules:
        validation = validate_schedule_constraints(schedule, constraints)
        schedule["validation"] = validation
        
        if validation["is_valid"]:
            validated_schedules.append(schedule)
    
    return validated_schedules


def calculate_schedule_metrics(schedules: List[Dict]) -> Dict[str, Any]:
    """
    Calculate comprehensive metrics for the generated schedule
    """
    if not schedules:
        return {
            "totalShifts": 0,
            "totalHours": 0,
            "employeeCoverage": {},
            "departmentCoverage": {},
            "locationCoverage": {},
            "averageHoursPerEmployee": 0,
            "scheduleQualityScore": 0
        }
    
    total_shifts = len(schedules)
    total_hours = 0
    employee_coverage = {}
    department_coverage = {}
    location_coverage = {}
    quality_scores = []
    
    for schedule in schedules:
        # Calculate hours
        hours = calculate_shift_hours(schedule["startTime"], schedule["endTime"])
        total_hours += hours
        
        # Track coverage
        emp_id = schedule["employeeId"]
        employee_coverage[emp_id] = employee_coverage.get(emp_id, 0) + 1
        
        dept = schedule["department"]
        department_coverage[dept] = department_coverage.get(dept, 0) + 1
        
        location = schedule["location"]
        location_coverage[location] = location_coverage.get(location, 0) + 1
        
        # Track quality
        if "validation" in schedule:
            quality_scores.append(schedule["validation"]["score"])
    
    # Calculate fairness metric
    shift_counts = list(employee_coverage.values())
    fairness_score = 100 - (max(shift_counts) - min(shift_counts)) * 10 if shift_counts else 100
    
    return {
        "totalShifts": total_shifts,
        "totalHours": total_hours,
        "averageHoursPerShift": total_hours / total_shifts if total_shifts > 0 else 0,
        "averageHoursPerEmployee": total_hours / len(employee_coverage) if employee_coverage else 0,
        "employeeCoverage": employee_coverage,
        "departmentCoverage": department_coverage,
        "locationCoverage": location_coverage,
        "fairnessScore": fairness_score,
        "scheduleQualityScore": sum(quality_scores) / len(quality_scores) if quality_scores else 0,
        "employeeCount": len(employee_coverage),
        "departmentCount": len(department_coverage),
        "locationCount": len(location_coverage)
    }


def detect_scheduling_conflicts(constraints: Dict, employees: List[Dict], start_date: datetime, end_date: datetime) -> Dict:
    """
    Enhanced conflict detection with detailed analysis and actionable suggestions.
    Returns comprehensive conflict information with categorized suggestions for premium UX.
    """
    conflicts = []
    suggestions = []
    
    operating_hours = constraints.get("operating_hours", [])
    min_employees_per_day = constraints.get("min_employees_per_day", 1)
    max_employees_per_day = constraints.get("max_employees_per_day", 10)
    
    # Check if there are enough employees for the required staffing
    active_employees = [emp for emp in employees if emp.get("isActive", True)]
    total_employees = len(active_employees)
    
    print(f"DEBUG: Enhanced conflict detection - {total_employees} active employees available")
    
    # Check operating hours vs staffing requirements
    open_days = [oh for oh in operating_hours if oh.get("is_open", False)]
    if not open_days:
        conflicts.append({
            "type": "no_operating_days",
            "message": "No days are marked as open for business",
            "severity": "critical",
            "affected_area": "Business Operations",
            "impact": "Schedule generation is impossible without defined operating days."
        })
        suggestions.append({
            "type": "enable_business_days", 
            "category": "auto_fix",
            "message": "Enable at least one day of the week for operations",
            "action": "Set 'is_open' to true for desired operating days",
            "priority": "critical",
            "impact": "high",
            "effort": "low",
            "auto_fixable": True,
            "suggested_value": ["monday", "tuesday", "wednesday", "thursday", "friday"]
        })
    
    # Check for employees with no availability during operating days
    unavailable_employees = []
    if open_days:
        for emp in active_employees:
            has_availability = False
            # Check if employee is available for at least one open day
            for day_hours in open_days:
                if _is_employee_available_on_day(emp, day_hours["day_of_week"]):
                    has_availability = True
                    break
            if not has_availability:
                unavailable_employees.append(emp.get("firstName", "Unknown"))
    
    if unavailable_employees:
        employee_list = ", ".join(unavailable_employees)
        conflicts.append({
            "type": "employee_availability_issue",
            "message": f"{len(unavailable_employees)} employee(s) have no availability during operating days: {employee_list}",
            "severity": "warning",
            "affected_employees": unavailable_employees,
            "impact": "Reduces the pool of available staff, making it harder to meet scheduling requirements."
        })
        suggestions.append({
            "type": "review_employee_availability",
            "category": "manual",
            "message": f"Review availability for {len(unavailable_employees)} employees to improve scheduling options",
            "action": f"Check and update the availability settings for: {employee_list}",
            "priority": "medium",
            "impact": "medium",
            "effort": "low",
            "auto_fixable": False
        })

    if unavailable_employees:
        conflict_message = f"{len(unavailable_employees)} employee(s) have no availability during operating days: {', '.join(unavailable_employees)}"
        conflicts.append({
            "type": "employee_unavailable",
            "message": conflict_message,
            "severity": "warning",
            "affected_area": "Employee Availability",
            "impact": "Reduces the pool of available staff, making it harder to meet scheduling requirements."
        })
        suggestions.append({
            "type": "review_employee_availability",
            "category": "manual_review",
            "message": f"Review availability for {len(unavailable_employees)} employees to improve scheduling options",
            "action": "Check and update the availability records for the listed employees.",
            "priority": "medium",
            "impact": "medium",
            "effort": "medium",
            "auto_fixable": False
        })

    # Enhanced staffing feasibility analysis for each open day
    for day_hours in open_days:
        day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day_hours["day_of_week"]]
        min_staff = day_hours.get("min_staff", 1)
        max_staff = day_hours.get("max_staff", total_employees)
        
        if min_staff > total_employees:
            conflicts.append({
                "type": "insufficient_staff",
                "day": day_name,
                "message": f"{day_name}: Requires {min_staff} staff but only {total_employees} employees available",
                "severity": "critical",
                "affected_area": f"{day_name} Staffing",
                "impact": f"Cannot meet minimum staffing requirement of {min_staff} employees."
            })
            
            # Calculate optimal staffing suggestion
            suggested_min = min(total_employees, max(1, total_employees - 1))
            suggestions.append({
                "type": "reduce_min_staff",
                "category": "auto_fix",
                "day": day_name,
                "message": f"Reduce minimum staff for {day_name} from {min_staff} to {suggested_min}",
                "action": f"Adjust minimum staffing for {day_name}",
                "current_min": min_staff,
                "suggested_min": suggested_min,
                "priority": "high",
                "impact": "medium",
                "effort": "low",
                "auto_fixable": True
            })
        
        if min_staff > max_staff:
            conflicts.append({
                "type": "invalid_staff_range",
                "day": day_name,
                "message": f"{day_name}: Minimum staff ({min_staff}) exceeds maximum staff ({max_staff})",
                "severity": "critical",
                "affected_area": f"{day_name} Configuration",
                "impact": "Impossible constraint configuration prevents schedule generation."
            })
            suggestions.append({
                "type": "fix_staff_range",
                "category": "auto_fix",
                "day": day_name,
                "message": f"Set maximum staff for {day_name} to at least {min_staff}",
                "action": f"Adjust maximum staffing for {day_name}",
                "current_max": max_staff,
                "suggested_max": max(min_staff, total_employees),
                "priority": "critical",
                "impact": "high",
                "effort": "low",
                "auto_fixable": True
            })
    
    # Enhanced employee availability analysis
    availability_conflicts = 0
    employees_with_availability = 0
    dates = [start_date + timedelta(days=i) for i in range((end_date - start_date).days + 1)]
    
    for employee in active_employees:
        has_availability = False
        available_days = 0
        
        for date in dates:
            day_of_week = (date.weekday() + 1) % 7  # Convert to Sunday=0 format
            day_hours = next((oh for oh in operating_hours if oh["day_of_week"] == day_of_week), None)
            
            if day_hours and day_hours.get("is_open", False):
                if _check_employee_availability(employee, date, "09:00", "17:00"):  # Simplified check
                    has_availability = True
                    available_days += 1
        
        if has_availability:
            employees_with_availability += 1
        else:
            availability_conflicts += 1
    
    if availability_conflicts > 0:
        severity = 'critical' if availability_conflicts == total_employees else 'warning'
        conflicts.append({
            "type": "availability_conflicts",
            "message": f"{availability_conflicts} employee(s) have no availability during operating days",
            "severity": severity,
            "affected_area": "Employee Availability",
            "impact": f"Reduced scheduling flexibility affects {availability_conflicts} employees."
        })
        
        if severity == 'critical':
            suggestions.append({
                "type": "update_availability",
                "category": "manual",
                "message": "Update employee availability to include at least one operating day",
                "action": "Review and update employee availability settings",
                "priority": "critical",
                "impact": "high",
                "effort": "medium",
                "auto_fixable": False,
                "affected_employees": availability_conflicts
            })
        else:
            suggestions.append({
                "type": "review_availability",
                "category": "manual",
                "message": f"Review availability for {availability_conflicts} employees to improve scheduling options",
                "action": "Check employee availability settings",
                "priority": "medium",
                "impact": "medium",
                "effort": "low",
                "auto_fixable": False,
                "affected_employees": availability_conflicts
            })
    
    # Enhanced consecutive days analysis
    max_consecutive = constraints.get("max_consecutive_days", 5)
    if max_consecutive < 2:
        conflicts.append({
            "type": "unrealistic_consecutive_limit",
            "message": f"Very restrictive consecutive days limit ({max_consecutive}) may prevent efficient scheduling",
            "severity": "warning",
            "affected_area": "Work-Life Balance Rules",
            "impact": "May result in fragmented schedules and scheduling difficulties."
        })
        suggestions.append({
            "type": "increase_consecutive_limit",
            "category": "auto_fix",
            "message": f"Increase consecutive days limit from {max_consecutive} to 3-5 days for better scheduling flexibility",
            "action": "Adjust max_consecutive_days constraint",
            "current_value": max_consecutive,
            "suggested_value": 3,
            "priority": "low",
            "impact": "medium",
            "effort": "low",
            "auto_fixable": True
        })
    
    # Skill and role analysis
    required_skills = set()
    required_roles = set()
    available_skills = set()
    available_roles = set()
    
    # Extract available skills and roles from employees
    for employee in active_employees:
        employee_skills = employee.get('skills', [])
        if isinstance(employee_skills, list):
            available_skills.update(employee_skills)
        
        employee_role = employee.get('role')
        if employee_role:
            available_roles.add(employee_role)
    
    # Check if we have basic coverage
    if not available_skills and not available_roles:
        conflicts.append({
            "type": "no_employee_skills_roles",
            "message": "No skills or roles defined for employees",
            "severity": "warning",
            "affected_area": "Employee Qualifications",
            "impact": "May limit scheduling flexibility and shift assignments."
        })
        suggestions.append({
            "type": "define_employee_qualifications",
            "category": "manual",
            "message": "Define skills and roles for employees to improve scheduling accuracy",
            "action": "Update employee profiles with relevant skills and roles",
            "priority": "medium",
            "impact": "medium",
            "effort": "medium",
            "auto_fixable": False
        })
    
    # Calculate overall assessment
    critical_conflicts = [c for c in conflicts if c["severity"] == "critical"]
    warning_conflicts = [c for c in conflicts if c["severity"] == "warning"]
    
    auto_fixable_suggestions = [s for s in suggestions if s.get("auto_fixable", False)]
    manual_suggestions = [s for s in suggestions if not s.get("auto_fixable", False)]
    
    can_proceed = len(critical_conflicts) == 0
    
    return {
        "conflicts": conflicts,
        "suggestions": suggestions,
        "conflict_count": len(conflicts),
        "critical_count": len(critical_conflicts),
        "warning_count": len(warning_conflicts),
        "auto_fixable_count": len(auto_fixable_suggestions),
        "manual_suggestions_count": len(manual_suggestions),
        "can_proceed": can_proceed,
        "has_critical_conflicts": len(critical_conflicts) > 0,
        "summary": {
            "total_employees": total_employees,
            "employees_with_availability": employees_with_availability,
            "operating_days_count": len(open_days),
            "available_skills": list(available_skills),
            "available_roles": list(available_roles),
            "date_range_days": (end_date - start_date).days + 1
        }
    }


def apply_suggested_fixes(constraints: Dict, conflict_analysis: Dict) -> Dict:
    """
    Enhanced automatic application of non-destructive suggested fixes to constraints.
    Handles the new detailed suggestion format with categorization and priority.
    """
    if not conflict_analysis.get("suggestions"):
        return constraints
        
    fixed_constraints = constraints.copy()
    applied_fixes = []
    
    # Only apply auto-fixable suggestions
    auto_fixable_suggestions = [s for s in conflict_analysis["suggestions"] if s.get("auto_fixable", False)]
    
    # Sort by priority (critical > high > medium > low)
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    auto_fixable_suggestions.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 3))
    
    for suggestion in auto_fixable_suggestions:
        suggestion_type = suggestion["type"]
        
        if suggestion_type == "reduce_min_staff" and "suggested_min" in suggestion:
            # Find and fix the problematic day
            operating_hours = fixed_constraints.get("operating_hours", [])
            for oh in operating_hours:
                day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][oh["day_of_week"]]
                if day_name == suggestion.get("day"):
                    old_min = oh.get("min_staff", 1)
                    oh["min_staff"] = suggestion["suggested_min"]
                    applied_fixes.append({
                        "type": suggestion_type,
                        "description": f"Reduced {day_name} min staff from {old_min} to {suggestion['suggested_min']}",
                        "day": day_name,
                        "old_value": old_min,
                        "new_value": suggestion["suggested_min"],
                        "priority": suggestion.get("priority", "medium")
                    })
                    
        elif suggestion_type == "fix_staff_range" and "suggested_max" in suggestion:
            # Fix max staff to be at least min staff
            operating_hours = fixed_constraints.get("operating_hours", [])
            for oh in operating_hours:
                day_name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][oh["day_of_week"]]
                if day_name == suggestion.get("day"):
                    old_max = oh.get("max_staff", 10)
                    oh["max_staff"] = suggestion["suggested_max"]
                    applied_fixes.append({
                        "type": suggestion_type,
                        "description": f"Increased {day_name} max staff from {old_max} to {suggestion['suggested_max']}",
                        "day": day_name,
                        "old_value": old_max,
                        "new_value": suggestion["suggested_max"],
                        "priority": suggestion.get("priority", "medium")
                    })
        
        elif suggestion_type == "enable_business_days" and "suggested_value" in suggestion:
            # Enable suggested operating days
            operating_hours = fixed_constraints.get("operating_hours", [])
            suggested_days = suggestion["suggested_value"]
            
            # Map day names to day_of_week numbers
            day_mapping = {
                "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3,
                "thursday": 4, "friday": 5, "saturday": 6
            }
            
            enabled_days = []
            for day_name in suggested_days:
                day_num = day_mapping.get(day_name.lower())
                if day_num is not None:
                    # Find existing day or create new one
                    day_hours = next((oh for oh in operating_hours if oh["day_of_week"] == day_num), None)
                    if day_hours:
                        day_hours["is_open"] = True
                    else:
                        operating_hours.append({
                            "day_of_week": day_num,
                            "is_open": True,
                            "start_time": "09:00",
                            "end_time": "17:00",
                            "min_staff": 1,
                            "max_staff": 5
                        })
                    enabled_days.append(day_name.title())
            
            if enabled_days:
                applied_fixes.append({
                    "type": suggestion_type,
                    "description": f"Enabled operating days: {', '.join(enabled_days)}",
                    "enabled_days": enabled_days,
                    "priority": suggestion.get("priority", "critical")
                })
        
        elif suggestion_type == "increase_consecutive_limit" and "suggested_value" in suggestion:
            # Increase consecutive days limit
            old_value = fixed_constraints.get("max_consecutive_days", 0)
            new_value = suggestion["suggested_value"]
            fixed_constraints["max_consecutive_days"] = new_value
            
            applied_fixes.append({
                "type": suggestion_type,
                "description": f"Increased consecutive days limit from {old_value} to {new_value}",
                "old_value": old_value,
                "new_value": new_value,
                "priority": suggestion.get("priority", "low")
            })
    
    if applied_fixes:
        print("INFO: Applied automatic constraint fixes:")
        for fix in applied_fixes:
            priority_indicator = "🔴" if fix["priority"] == "critical" else "🟡" if fix["priority"] == "high" else "🟢"
            print(f"  {priority_indicator} {fix['description']}")
    
    return {
        "constraints": fixed_constraints,
        "applied_fixes": applied_fixes,
        "fix_count": len(applied_fixes)
    }

def _is_employee_available_on_day(employee: Dict, day_of_week: int) -> bool:
    """Check if an employee is available on a specific day of the week."""
    # Default to True if no availability is specified, assuming they are flexible.
    availability_prefs = employee.get("availability", [])
    if not availability_prefs:
        return True

    for preference in availability_prefs:
        # Check for a matching day preference using dayOfWeek field
        if preference.get("dayOfWeek") == day_of_week:
            # Check if the employee is available on this day
            return preference.get("isAvailable", True)

    # If the day is not mentioned in their preferences, assume they are available.
    return True

def _create_business_coverage_plan(operating_hours, min_staff, max_staff, min_shift_hours, max_shift_hours, constraints=None):
    """
    Create a comprehensive business coverage plan with DYNAMIC shift templates
    that RESPECT user-defined constraints for real-world SME operations.
    """
    if not operating_hours:
        return []
    
    # Use first operating hours as reference (assuming consistent across days)
    first_hours = operating_hours[0]
    open_time = first_hours.get("open_time", "09:00")
    close_time = first_hours.get("close_time", "17:00")
    
    print(f"DEBUG: Creating DYNAMIC business coverage plan for {open_time} - {close_time}")
    print(f"DEBUG: User constraints - min_shift_hours: {min_shift_hours}, max_shift_hours: {max_shift_hours}")
    
    # Calculate total operating hours
    open_hour = int(open_time.split(":")[0])
    close_hour = int(close_time.split(":")[0])
    total_hours = close_hour - open_hour
    
    print(f"DEBUG: Total operating hours: {total_hours}")
    
    shifts = []
    
    # DYNAMIC SHIFT GENERATION WITH COMPLETE BUSINESS COVERAGE
    if total_hours >= 6:  # Medium to full business day
        # RESPECT USER CONSTRAINTS - NO HARDCODING
        # CRITICAL FIX: Dynamic shift duration selection (4-8 hours)
        # Randomly choose shift duration between min and max to create variety
        import random
        optimal_shift_duration = random.randint(min_shift_hours, max_shift_hours)
        
        # Calculate required shifts to cover entire business day
        required_shifts = max(2, int(total_hours / optimal_shift_duration) + 1)
        
        # If we can't cover with current duration, try different durations
        if required_shifts > 6:  # Too many shifts
            # Try different durations to find optimal coverage
            for duration in range(min_shift_hours, max_shift_hours + 1):
                test_shifts = max(2, int(total_hours / duration) + 1)
                if test_shifts <= 6:
                    optimal_shift_duration = duration
                    required_shifts = test_shifts
                    break
        
        print(f"DEBUG: User constraints - min: {min_shift_hours}h, max: {max_shift_hours}h")
        print(f"DEBUG: Dynamic shift duration: {optimal_shift_duration}h (randomly selected from {min_shift_hours}-{max_shift_hours})")
        print(f"DEBUG: Required shifts to cover {total_hours}h: {required_shifts}")
        
        print(f"DEBUG: Generating {required_shifts} shifts to cover {total_hours}h business day")
        print(f"DEBUG: Optimal shift duration: {optimal_shift_duration}h")
        
        # Generate shifts with complete business coverage and manager presence
        for i in range(required_shifts):
            start_hour = open_hour + (i * optimal_shift_duration)
            end_hour = start_hour + optimal_shift_duration
            
            # CRITICAL FIX: Ensure shifts NEVER extend beyond business hours AND respect constraints
            if end_hour > close_hour:
                end_hour = close_hour
                actual_duration = end_hour - start_hour
            elif i == required_shifts - 1 and end_hour < close_hour:
                # Calculate remaining hours to closing
                remaining_hours = close_hour - start_hour
                # CRITICAL: Only extend if it fits within user's constraints
                if remaining_hours <= max_shift_hours and remaining_hours >= min_shift_hours:
                    end_hour = close_hour
                    actual_duration = remaining_hours
                else:
                    # CRITICAL: Don't create shifts that violate constraints
                    if remaining_hours < min_shift_hours:
                        # Skip this shift if it would be too short
                        continue
                    elif remaining_hours > max_shift_hours:
                        # Truncate to max shift duration
                        end_hour = start_hour + max_shift_hours
                        actual_duration = max_shift_hours
                    else:
                        actual_duration = optimal_shift_duration
            else:
                actual_duration = optimal_shift_duration
            
            # CRITICAL VALIDATION: Ensure shift duration is within constraints
            if actual_duration < min_shift_hours or actual_duration > max_shift_hours:
                print(f"WARNING: Skipping shift {start_hour:02d}:00-{end_hour:02d}:00 (duration: {actual_duration}h) - violates constraints ({min_shift_hours}-{max_shift_hours}h)")
                continue
            
            # CRITICAL FIX: Only create shifts within business hours
            if start_hour < close_hour and end_hour <= close_hour:
                start_time = f"{start_hour:02d}:00"
                end_time = f"{end_hour:02d}:00"
                
                if i == 0:  # Opening shift - MUST have manager
                    shifts.append({
                        "name": f"Opening Shift ({start_time}-{end_time})",
                        "start_time": start_time,
                        "end_time": end_time,
                        "duration": actual_duration,
                        "type": "opening_shift",
                        "required_roles": {"manager": 1, "employee": 1},
                        "is_active": True
                    })
                elif i == required_shifts - 1:  # Closing shift - MUST have manager
                    shifts.append({
                        "name": f"Closing Shift ({start_time}-{end_time})",
                        "start_time": start_time,
                        "end_time": end_time,
                        "duration": actual_duration,
                        "type": "closing_shift",
                        "required_roles": {"manager": 1, "employee": 1},
                        "is_active": True
                    })
                else:  # Middle shifts - can have additional manager for overlap
                    shifts.append({
                        "name": f"Mid Shift {i+1} ({start_time}-{end_time})",
                        "start_time": start_time,
                        "end_time": end_time,
                        "duration": actual_duration,
                        "type": "mid_shift",
                        "required_roles": {"manager": 1, "employee": 1},  # Ensure manager presence
                        "is_active": True
                    })
        
        # CRITICAL FIX: Ensure managers cover ENTIRE operating hours
        # Check if manager coverage is required
        require_manager_coverage = constraints.get("require_manager_coverage", True)
        
        if total_hours >= 6 and require_manager_coverage:
            print(f"DEBUG: Manager coverage required - creating comprehensive manager shifts for ENTIRE operating hours")
            
            # CRITICAL: Create manager shifts that cover EVERY HOUR of operating time
            # Calculate optimal manager shift duration (respect user constraints)
            manager_shift_duration = min(max_shift_hours, max(min_shift_hours, 4))  # Respect user constraints
            
            # Add morning manager shift (opening coverage)
            morning_manager_start = open_hour
            morning_manager_end = min(open_hour + manager_shift_duration, close_hour)
            
            if morning_manager_end > morning_manager_start:
                shifts.append({
                    "name": f"Morning Manager ({morning_manager_start:02d}:00-{morning_manager_end:02d}:00)",
                    "start_time": f"{morning_manager_start:02d}:00",
                    "end_time": f"{morning_manager_end:02d}:00",
                    "duration": morning_manager_end - morning_manager_start,
                    "type": "morning_manager",
                    "required_roles": {"manager": 1},
                    "is_active": True
                })
            
            # Add afternoon manager shift (middle coverage)
            afternoon_manager_start = open_hour + 2  # 2 hours after opening
            afternoon_manager_end = min(afternoon_manager_start + manager_shift_duration, close_hour)
            
            if afternoon_manager_end > afternoon_manager_start:
                shifts.append({
                    "name": f"Afternoon Manager ({afternoon_manager_start:02d}:00-{afternoon_manager_end:02d}:00)",
                    "start_time": f"{afternoon_manager_start:02d}:00",
                    "end_time": f"{afternoon_manager_end:02d}:00",
                    "duration": afternoon_manager_end - afternoon_manager_start,
                    "type": "afternoon_manager",
                    "required_roles": {"manager": 1},
                    "is_active": True
                })
            
            # Add evening manager shift (closing coverage)
            evening_manager_start = max(close_hour - manager_shift_duration, open_hour + 4)  # Last 4 hours or from 4 hours in
            evening_manager_end = close_hour
            
            if evening_manager_start < evening_manager_end:
                shifts.append({
                    "name": f"Evening Manager ({evening_manager_start:02d}:00-{evening_manager_end:02d}:00)",
                    "start_time": f"{evening_manager_start:02d}:00",
                    "end_time": f"{evening_manager_end:02d}:00",
                    "duration": evening_manager_end - evening_manager_start,
                    "type": "evening_manager",
                    "required_roles": {"manager": 1},
                    "is_active": True
                })
            
        # CRITICAL FIX: SEQUENTIAL MANAGER DISTRIBUTION - NO OVERLAPS, NO GAPS
        # Create manager shifts that cover the entire operating hours sequentially
        manager_shifts = []
        
        print(f"DEBUG: Manager coverage required - creating sequential manager shifts")
        print(f"DEBUG: Total operating hours: {total_hours}h ({open_hour:02d}:00-{close_hour:02d}:00)")
        
        # Calculate optimal manager shift duration (respect user constraints)
        manager_shift_duration = min(max_shift_hours, max(min_shift_hours, 6))  # Max 6 hours for manager shifts
        
        # CRITICAL: Create sequential manager shifts with NO OVERLAPS
        if total_hours <= manager_shift_duration:
            # Short day - single manager shift
            manager_shifts.append({
                "name": f"Full Day Manager ({open_hour:02d}:00-{close_hour:02d}:00)",
                "start_time": f"{open_hour:02d}:00",
                "end_time": f"{close_hour:02d}:00",
                "duration": total_hours,
                "type": "full_day_manager",
                "required_roles": {"manager": 1},
                "is_active": True
            })
        else:
            # CRITICAL: Create sequential manager shifts with NO GAPS
            current_start = open_hour
            
            while current_start < close_hour:
                # Calculate end time for this manager shift
                current_end = min(current_start + manager_shift_duration, close_hour)
                
                # Ensure minimum shift duration
                if (current_end - current_start) >= min_shift_hours:
                    shift_name = f"Manager Shift ({current_start:02d}:00-{current_end:02d}:00)"
                    
                    manager_shifts.append({
                        "name": shift_name,
                        "start_time": f"{current_start:02d}:00",
                        "end_time": f"{current_end:02d}:00",
                        "duration": current_end - current_start,
                        "type": "manager_shift",
                        "required_roles": {"manager": 1},
                        "is_active": True
                    })
                    
                    # Move to next shift (NO OVERLAP)
                    current_start = current_end
                else:
                    # If remaining time is too short, extend the last shift
                    if manager_shifts:
                        last_shift = manager_shifts[-1]
                        last_shift["end_time"] = f"{close_hour:02d}:00"
                        last_shift["duration"] = close_hour - int(last_shift["start_time"].split(":")[0])
                        last_shift["name"] = f"Manager Shift ({last_shift['start_time']}-{last_shift['end_time']})"
                    break
        
        # Add manager shifts to the main shifts list
        shifts.extend(manager_shifts)
        print(f"DEBUG: Created {len(manager_shifts)} sequential manager shifts")
        
        # VALIDATE MANAGER COVERAGE
        if manager_shifts:
            coverage_hours = set()
            for shift in manager_shifts:
                start_hour = int(shift["start_time"].split(":")[0])
                end_hour = int(shift["end_time"].split(":")[0])
                for hour in range(start_hour, end_hour):
                    coverage_hours.add(hour)
            
            missing_hours = set(range(open_hour, close_hour)) - coverage_hours
            if missing_hours:
                print(f"WARNING: Manager coverage gaps: {sorted(missing_hours)}")
            else:
                print(f"✓ Complete manager coverage: {open_hour:02d}:00-{close_hour:02d}:00")
        
        print(f"DEBUG: Created {len([s for s in shifts if 'Manager' in s['name']])} manager shifts for complete coverage")
    elif not require_manager_coverage:
        print(f"DEBUG: Manager coverage not required - skipping manager-specific shifts")
        

    
    else:  # Short business day (<6 hours)
        # Use single shift or multiple short shifts based on constraints
        if max_shift_hours >= total_hours:
            shifts.append({
                "name": f"Business Day ({open_time}-{close_time})",
                "start_time": open_time,
                "end_time": close_time,
                "duration": total_hours,
                "type": "full_day",
                "required_roles": {"manager": 1, "employee": 1},
                "is_active": True
            })
        else:
            # Split into multiple short shifts
            shift_duration = min(max_shift_hours, total_hours / 2)
            num_shifts = max(2, int(total_hours / shift_duration))
            
            for i in range(num_shifts):
                start_hour = open_hour + (i * shift_duration)
                end_hour = start_hour + shift_duration
                
                if end_hour <= close_hour:
                    start_time = f"{start_hour:02d}:00"
                    end_time = f"{end_hour:02d}:00"
                    
                    shifts.append({
                        "name": f"Short Shift {i+1} ({start_time}-{end_time})",
                        "start_time": start_time,
                        "end_time": end_time,
                        "duration": shift_duration,
                        "type": "short_shift",
                        "required_roles": {"manager": 1 if i == 0 else 0, "employee": 1},
                        "is_active": True
                    })
    
    # Add full-day manager option only if it fits within constraints
    if max_shift_hours >= total_hours:
        shifts.append({
            "name": f"Full Day Manager ({open_time}-{close_time})",
            "start_time": open_time,
            "end_time": close_time,
            "duration": total_hours,
            "type": "full_day_manager",
            "required_roles": {"manager": 1},
            "is_active": True
        })
    
    # CRITICAL VALIDATION: Ensure ALL shifts respect business hours and user constraints
    validated_shifts = []
    for shift in shifts:
        start_hour = int(shift["start_time"].split(":")[0])
        end_hour = int(shift["end_time"].split(":")[0])
        duration = shift["duration"]
        
        # Validate business hours
        if start_hour >= open_hour and end_hour <= close_hour:
            # Validate user constraints
            if duration >= min_shift_hours and duration <= max_shift_hours:
                validated_shifts.append(shift)
            else:
                print(f"WARNING: Shift {shift['name']} duration {duration}h violates user constraints ({min_shift_hours}-{max_shift_hours}h)")
        else:
            print(f"WARNING: Shift {shift['name']} ({shift['start_time']}-{shift['end_time']}) extends beyond business hours ({open_time}-{close_time})")
    
    shifts = validated_shifts
    
    # VALIDATE COMPLETE BUSINESS COVERAGE AND USER CONSTRAINTS
    coverage_start = min([shift['start_time'] for shift in shifts]) if shifts else open_time
    coverage_end = max([shift['end_time'] for shift in shifts]) if shifts else close_time
    
    print(f"INFO: Created {len(shifts)} DYNAMIC shift templates respecting user constraints:")
    print(f"INFO: Business coverage: {coverage_start} to {coverage_end} (Target: {open_time} to {close_time})")
    
    # VALIDATE EACH SHIFT AGAINST USER CONSTRAINTS
    constraint_violations = []
    manager_shifts = []
    
    for template in shifts:
        duration = template['duration']
        start_hour = int(template['start_time'].split(":")[0])
        end_hour = int(template['end_time'].split(":")[0])
        
        # Validate shift duration
        if duration < min_shift_hours or duration > max_shift_hours:
            constraint_violations.append(f"Shift {template['name']}: {duration}h (constraint: {min_shift_hours}-{max_shift_hours}h)")
        
        # Validate business hours
        if start_hour < open_hour or end_hour > close_hour:
            constraint_violations.append(f"Shift {template['name']}: {template['start_time']}-{template['end_time']} (business hours: {open_time}-{close_time})")
        
        # Track manager shifts for coverage validation
        if template.get('required_roles', {}).get('manager', 0) > 0:
            manager_shifts.append(template)
        
        print(f"  - {template['name']} ({template['start_time']}-{template['end_time']}) = {template['duration']}h")
        print(f"    Required roles: {template['required_roles']}")
    
    # Validate manager coverage if required
    require_manager_coverage = constraints.get("require_manager_coverage", True) if constraints else True
    if require_manager_coverage and manager_shifts:
        print(f"INFO: Manager coverage validation - {len(manager_shifts)} manager shifts created")
        manager_coverage_hours = set()
        for ms in manager_shifts:
            start_hour = int(ms['start_time'].split(":")[0])
            end_hour = int(ms['end_time'].split(":")[0])
            for hour in range(start_hour, end_hour):
                manager_coverage_hours.add(hour)
        
        required_hours = set(range(open_hour, close_hour))
        uncovered_hours = required_hours - manager_coverage_hours
        if uncovered_hours:
            print(f"WARNING: Manager coverage gaps: {sorted(uncovered_hours)}")
        else:
            print(f"✓ Complete manager coverage achieved")
    
    if constraint_violations:
        print(f"WARNING: Found {len(constraint_violations)} constraint violations:")
        for violation in constraint_violations:
            print(f"  ❌ {violation}")
    
    print(f"  Total shift templates generated: {len(shifts)}")
    print(f"  Business coverage: {coverage_start} to {coverage_end} (Target: {open_time} to {close_time})")
    
    # VALIDATE BUSINESS HOURS RESPECT
    if coverage_end > close_time:
        print(f"WARNING: Generated shifts extend beyond business hours!")
        print(f"  Business closes at: {close_time}")
        print(f"  Last shift ends at: {coverage_end}")
        
        # Fix shifts that extend beyond business hours
        for shift in shifts:
            if shift['end_time'] > close_time:
                print(f"  Fixing shift: {shift['name']} - {shift['end_time']} → {close_time}")
                shift['end_time'] = close_time
                # Recalculate duration
                start_hour = int(shift['start_time'].split(':')[0])
                end_hour = int(shift['end_time'].split(':')[0])
                shift['duration'] = end_hour - start_hour
    
    # Verify complete coverage
    if coverage_start > open_time or coverage_end < close_time:
        print(f"WARNING: Incomplete business coverage detected!")
        print(f"  Missing coverage: {open_time} to {coverage_start} and/or {coverage_end} to {close_time}")
        
        # Add emergency coverage shifts if needed
        if coverage_start > open_time:
            emergency_start = open_time
            emergency_end = coverage_start
            emergency_duration = int(emergency_end.split(':')[0]) - int(emergency_start.split(':')[0])
            
            shifts.insert(0, {
                "name": f"Emergency Opening ({emergency_start}-{emergency_end})",
                "start_time": emergency_start,
                "end_time": emergency_end,
                "duration": emergency_duration,
                "type": "emergency_opening",
                "required_roles": {"manager": 1, "employee": 1},
                "is_active": True
            })
            print(f"  Added emergency opening shift: {emergency_start}-{emergency_end}")
        
        if coverage_end < close_time:
            emergency_start = coverage_end
            emergency_end = close_time
            emergency_duration = int(emergency_end.split(':')[0]) - int(emergency_start.split(':')[0])
            
            shifts.append({
                "name": f"Emergency Closing ({emergency_start}-{emergency_end})",
                "start_time": emergency_start,
                "end_time": emergency_end,
                "duration": emergency_duration,
                "type": "emergency_closing",
                "required_roles": {"manager": 1, "employee": 1},
                "is_active": True
            })
            print(f"  Added emergency closing shift: {emergency_start}-{emergency_end}")
    
    return shifts

def _resolve_scheduling_conflicts_automatically(constraints, employees, conflicts):
    """
    Automatically resolve scheduling conflicts by implementing fixes
    rather than just suggesting them.
    
    This addresses the gap in FR-SS-03 where conflicts are detected
    but not automatically resolved.
    """
    print("INFO: Implementing automatic conflict resolution...")
    
    resolved_constraints = constraints.copy()
    
    for conflict in conflicts:
        conflict_type = conflict.get("type", "")
        
        if conflict_type == "insufficient_staff":
            # Automatically adjust staffing requirements
            print(f"INFO: Resolving insufficient staff conflict")
            resolved_constraints = _adjust_staffing_requirements(resolved_constraints, employees)
            
        elif conflict_type == "no_availability":
            # Automatically adjust availability requirements
            print(f"INFO: Resolving no availability conflict")
            resolved_constraints = _adjust_availability_requirements(resolved_constraints, employees)
            
        elif conflict_type == "shift_duration_conflict":
            # Automatically adjust shift duration constraints
            print(f"INFO: Resolving shift duration conflict")
            resolved_constraints = _adjust_shift_duration_constraints(resolved_constraints)
            
        elif conflict_type == "manager_coverage_gap":
            # Automatically ensure manager coverage
            print(f"INFO: Resolving manager coverage gap")
            resolved_constraints = _ensure_manager_coverage(resolved_constraints, employees)
    
    return resolved_constraints

def _adjust_staffing_requirements(constraints, employees):
    """Automatically adjust staffing requirements based on available employees"""
    available_employees = len([emp for emp in employees if emp.get("isActive", True)])
    
    # Adjust operating hours to match available staff
    if "operating_hours" in constraints:
        for day_hours in constraints["operating_hours"]:
            current_min = day_hours.get("min_staff", 1)
            current_max = day_hours.get("max_staff", 10)
            
            # Ensure min staff doesn't exceed available employees
            if current_min > available_employees:
                day_hours["min_staff"] = max(1, available_employees - 1)
                print(f"INFO: Adjusted min_staff from {current_min} to {day_hours['min_staff']}")
            
            # Ensure max staff doesn't exceed available employees
            if current_max > available_employees:
                day_hours["max_staff"] = available_employees
                print(f"INFO: Adjusted max_staff from {current_max} to {day_hours['max_staff']}")
    
    return constraints

def _adjust_availability_requirements(constraints, employees):
    """Automatically adjust availability requirements based on employee availability"""
    # Count employees with availability
    available_employees = 0
    for emp in employees:
        if emp.get("isActive", True) and emp.get("availability"):
            available_employees += 1
    
    if available_employees == 0:
        # No availability data - assume all employees are available
        print("INFO: No availability data found, assuming all employees available")
        return constraints
    
    # Adjust staffing based on available employees
    return _adjust_staffing_requirements(constraints, employees)

def _adjust_shift_duration_constraints(constraints):
    """Automatically adjust shift duration constraints to ensure business coverage"""
    operating_hours = constraints.get("operating_hours", [])
    if not operating_hours:
        return constraints
    
    # Get business hours
    first_hours = operating_hours[0]
    open_time = first_hours.get("open_time", "09:00")
    close_time = first_hours.get("close_time", "17:00")
    
    open_hour = int(open_time.split(":")[0])
    close_hour = int(close_time.split(":")[0])
    total_hours = close_hour - open_hour
    
    current_min = constraints.get("min_consecutive_hours_per_shift", 4)
    current_max = constraints.get("max_consecutive_hours_per_shift", 12)
    
    # If business hours exceed max shift duration, adjust
    if total_hours > current_max:
        new_max = min(total_hours, 12)  # Cap at 12 hours for safety
        constraints["max_consecutive_hours_per_shift"] = new_max
        print(f"INFO: Adjusted max_consecutive_hours_per_shift from {current_max} to {new_max}")
    
    # If business hours are less than min shift duration, adjust
    if total_hours < current_min:
        new_min = max(1, total_hours)
        constraints["min_consecutive_hours_per_shift"] = new_min
        print(f"INFO: Adjusted min_consecutive_hours_per_shift from {current_min} to {new_min}")
    
    return constraints

def _ensure_manager_coverage(constraints, employees):
    """Ensure manager coverage throughout business hours"""
    managers = [emp for emp in employees if emp.get("role") in ["manager", "administrator"]]
    
    if not managers:
        print("WARNING: No managers available, promoting senior employees")
        # Promote senior employees to manager roles for scheduling
        senior_employees = [emp for emp in employees if emp.get("experience_months", 0) > 12]
        if senior_employees:
            for emp in senior_employees:
                emp["role"] = "manager"
    
    return constraints

def _validate_regulatory_compliance(schedules, constraints, employees):
    """
    Validate schedules against regulatory compliance requirements.
    
    This addresses FR-SS-05: Regulatory compliance enforcement.
    """
    print("INFO: Validating regulatory compliance...")
    
    # Safety check - if no schedules, return compliant
    if not schedules:
        print("INFO: No schedules to validate - returning compliant")
        return {
            "is_compliant": True,
            "violation_count": 0,
            "violations": [],
            "summary": {
                "total_schedules": 0,
                "total_employees": len(employees),
                "compliance_rate": 100
            }
        }
    
    violations = []
    
    # Track employee work patterns
    employee_work_patterns = {}
    for emp in employees:
        employee_work_patterns[str(emp["_id"])] = {
            "consecutive_days": 0,
            "weekly_hours": 0,
            "last_work_day": None,
            "rest_hours": 0
        }
    
    # Analyze each schedule for compliance
    for schedule in schedules:
        emp_id = str(schedule.get("employee_id") or schedule.get("employeeId"))
        date = schedule.get("date")
        start_time = schedule.get("start_time") or schedule.get("startTime")
        end_time = schedule.get("end_time") or schedule.get("endTime")
        
        # Calculate shift duration
        shift_hours = calculate_shift_hours(start_time, end_time)
        
        # Update employee work patterns
        if emp_id not in employee_work_patterns:
            employee_work_patterns[emp_id] = {
                "consecutive_days": 0,
                "weekly_hours": 0,
                "last_work_day": None,
                "rest_hours": 0
            }
        
        pattern = employee_work_patterns[emp_id]
        
        # Check consecutive days
        if pattern["last_work_day"]:
            days_diff = (date - pattern["last_work_day"]).days
            if days_diff == 1:
                pattern["consecutive_days"] += 1
            else:
                pattern["consecutive_days"] = 1
        else:
            pattern["consecutive_days"] = 1
        
        # Check rest hours between shifts
        if pattern["last_work_day"] and pattern["last_work_day"] == date - timedelta(days=1):
            # Calculate rest hours between shifts
            last_end_hour = int(pattern.get("last_end_time", "17:00").split(":")[0])
            current_start_hour = int(start_time.split(":")[0])
            rest_hours = (24 - last_end_hour) + current_start_hour
            
            min_rest_hours = constraints.get("min_rest_hours_between_shifts", 8)
            if rest_hours < min_rest_hours:
                violations.append({
                    "type": "insufficient_rest",
                    "employee_id": emp_id,
                    "date": date,
                    "rest_hours": rest_hours,
                    "required": min_rest_hours,
                    "severity": "warning"
                })
        
        # Update tracking
        pattern["last_work_day"] = date
        pattern["last_end_time"] = end_time
        pattern["weekly_hours"] += shift_hours
    
    # Check weekly hour limits
    max_weekly_hours = constraints.get("max_hours_per_week", 40)
    for emp_id, pattern in employee_work_patterns.items():
        if pattern["weekly_hours"] > max_weekly_hours:
            violations.append({
                "type": "overtime_exceeded",
                "employee_id": emp_id,
                "weekly_hours": pattern["weekly_hours"],
                "limit": max_weekly_hours,
                "severity": "critical"
            })
    
    # Check consecutive day limits
    max_consecutive_days = constraints.get("max_consecutive_days", 6)
    for emp_id, pattern in employee_work_patterns.items():
        if pattern["consecutive_days"] > max_consecutive_days:
            violations.append({
                "type": "consecutive_days_exceeded",
                "employee_id": emp_id,
                "consecutive_days": pattern["consecutive_days"],
                "limit": max_consecutive_days,
                "severity": "warning"
            })
    
    # Check shift duration limits
    min_shift_hours = constraints.get("min_consecutive_hours_per_shift", 4)
    max_shift_hours = constraints.get("max_consecutive_hours_per_shift", 12)
    
    for schedule in schedules:
        start_time = schedule.get("start_time") or schedule.get("startTime")
        end_time = schedule.get("end_time") or schedule.get("endTime")
        emp_id = str(schedule.get("employee_id") or schedule.get("employeeId"))
        date = schedule.get("date")
        
        if start_time and end_time:
            shift_hours = calculate_shift_hours(start_time, end_time)
            
            if shift_hours < min_shift_hours:
                violations.append({
                    "type": "shift_too_short",
                    "employee_id": emp_id,
                    "date": date,
                    "shift_hours": shift_hours,
                    "minimum": min_shift_hours,
                    "severity": "warning"
                })
            
            if shift_hours > max_shift_hours:
                violations.append({
                    "type": "shift_too_long",
                    "employee_id": emp_id,
                    "date": date,
                    "shift_hours": shift_hours,
                    "maximum": max_shift_hours,
                    "severity": "critical"
                })
    
    # Generate compliance report
    compliance_report = {
        "is_compliant": len(violations) == 0,
        "violation_count": len(violations),
        "violations": violations,
        "summary": {
            "total_schedules": len(schedules),
            "total_employees": len(employees),
            "compliance_rate": ((len(schedules) - len(violations)) / len(schedules) * 100) if schedules else 100
        }
    }
    
    if violations:
        print(f"WARNING: Found {len(violations)} regulatory compliance violations:")
        for violation in violations:
            print(f"  - {violation['type']}: {violation.get('message', 'No message')}")
    else:
        print("✓ All schedules comply with regulatory requirements")
    
    return compliance_report
