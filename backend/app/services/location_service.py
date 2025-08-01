import math
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from app.db import get_db
from app.models.location import Location, LocationCreate, LocationUpdate
from app.models.attendance import ClockEvent, ClockEventCreate, AttendanceStatus
from bson import ObjectId

def calculate_distance(coord1: Dict[str, float], coord2: Dict[str, float]) -> float:
    """
    Calculate the great circle distance between two points on earth in meters
    using the Haversine formula.
    
    Args:
        coord1: {"lat": float, "lng": float}
        coord2: {"lat": float, "lng": float}
    
    Returns:
        Distance in meters
    """
    lat1, lon1 = coord1["lat"], coord1["lng"]
    lat2, lon2 = coord2["lat"], coord2["lng"]
    
    # Convert latitude and longitude from degrees to radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Radius of earth in meters
    earth_radius = 6371000
    
    return c * earth_radius

async def validate_location_proximity(
    employee_gps: Dict[str, float], 
    location_id: str
) -> Tuple[bool, float, Optional[Location]]:
    """
    Validate if employee GPS coordinates are within the allowed radius of a work location.
    
    Args:
        employee_gps: {"lat": float, "lng": float}
        location_id: MongoDB ObjectId string
    
    Returns:
        Tuple of (is_valid, distance_in_meters, location_object)
    """
    db = get_db()
    
    try:
        # Get location from database
        location_doc = await db["locations"].find_one({"_id": ObjectId(location_id)})
        if not location_doc:
            return False, float('inf'), None
        
        location_doc["_id"] = str(location_doc["_id"])
        location = Location(**location_doc)
        
        # Calculate distance
        distance = calculate_distance(employee_gps, location.coordinates)
        
        # Check if within radius
        is_valid = distance <= location.radius_meters
        
        return is_valid, distance, location
        
    except Exception as e:
        print(f"Error validating location proximity: {e}")
        return False, float('inf'), None

async def find_nearest_location(employee_gps: Dict[str, float]) -> Optional[Tuple[Location, float]]:
    """
    Find the nearest work location to the employee's current position.
    
    Args:
        employee_gps: {"lat": float, "lng": float}
    
    Returns:
        Tuple of (nearest_location, distance_in_meters) or None
    """
    db = get_db()
    
    try:
        locations_cursor = db["locations"].find({"is_active": True})
        locations = await locations_cursor.to_list(None)
        
        if not locations:
            return None
        
        nearest_location = None
        min_distance = float('inf')
        
        for location_doc in locations:
            location_doc["_id"] = str(location_doc["_id"])
            location = Location(**location_doc)
            
            distance = calculate_distance(employee_gps, location.coordinates)
            
            if distance < min_distance:
                min_distance = distance
                nearest_location = location
        
        return (nearest_location, min_distance) if nearest_location else None
        
    except Exception as e:
        print(f"Error finding nearest location: {e}")
        return None

async def get_employee_current_shift(employee_id: str, current_time: datetime) -> Optional[Dict]:
    """
    Get the employee's current or upcoming shift for today.
    
    Args:
        employee_id: MongoDB ObjectId string
        current_time: Current datetime
    
    Returns:
        Schedule dict or None
    """
    db = get_db()
    
    try:
        today_str = current_time.strftime("%Y-%m-%d")
        
        # Find today's schedule for the employee
        schedule = await db["schedules"].find_one({
            "employeeId": employee_id,
            "date": today_str,
            "status": {"$in": ["scheduled", "confirmed"]}
        })
        
        if schedule:
            schedule["_id"] = str(schedule["_id"])
            return schedule
        
        return None
        
    except Exception as e:
        print(f"Error getting employee current shift: {e}")
        return None

async def get_location_for_schedule(schedule_id: str) -> Optional[str]:
    """
    Get the location ID associated with a specific schedule.
    
    Args:
        schedule_id: MongoDB ObjectId string
    
    Returns:
        Location ID string or None
    """
    db = get_db()
    
    try:
        schedule = await db["schedules"].find_one({"_id": ObjectId(schedule_id)})
        if schedule and "location" in schedule:
            # First, try to find location by name
            location = await db["locations"].find_one({
                "name": schedule["location"],
                "is_active": True
            })
            
            if location:
                return str(location["_id"])
        
        # If no specific location found, return the first active location
        default_location = await db["locations"].find_one({"is_active": True})
        if default_location:
            return str(default_location["_id"])
        
        return None
        
    except Exception as e:
        print(f"Error getting location for schedule: {e}")
        return None

async def create_clock_event(
    employee_id: str,
    event_data: ClockEventCreate,
    location_id: str,
    distance: float,
    is_valid: bool
) -> Optional[ClockEvent]:
    """
    Create a new clock event record.
    
    Args:
        employee_id: MongoDB ObjectId string
        event_data: ClockEventCreate object
        location_id: MongoDB ObjectId string
        distance: Distance from location in meters
        is_valid: Whether the clock event is within allowed radius
    
    Returns:
        ClockEvent object or None
    """
    db = get_db()
    
    try:
        clock_event_doc = {
            "employee_id": employee_id,
            "schedule_id": event_data.schedule_id,
            "event_type": event_data.event_type,
            "timestamp": datetime.utcnow(),
            "location_id": location_id,
            "gps_coordinates": event_data.gps_coordinates,
            "distance_from_location": distance,
            "is_valid": is_valid,
            "notes": event_data.notes,
            "created_at": datetime.utcnow()
        }
        
        result = await db["clock_events"].insert_one(clock_event_doc)
        clock_event_doc["_id"] = str(result.inserted_id)
        
        return ClockEvent(**clock_event_doc)
        
    except Exception as e:
        print(f"Error creating clock event: {e}")
        return None

async def get_employee_attendance_status(employee_id: str) -> AttendanceStatus:
    """
    Get current attendance status for an employee.
    
    Args:
        employee_id: MongoDB ObjectId string
    
    Returns:
        AttendanceStatus object
    """
    db = get_db()
    
    try:
        # Get today's date
        today = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Get last clock event for today
        last_event = await db["clock_events"].find_one(
            {
                "employee_id": employee_id,
                "timestamp": {
                    "$gte": datetime.strptime(today, "%Y-%m-%d"),
                    "$lt": datetime.strptime(today, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
                }
            },
            sort=[("timestamp", -1)]
        )
        
        # Get current shift
        current_shift = await get_employee_current_shift(employee_id, datetime.utcnow())
        
        # Determine if clocked in
        is_clocked_in = False
        if last_event and last_event["event_type"] == "clock_in":
            is_clocked_in = True
        
        # Calculate total hours today
        total_hours_today = await calculate_daily_hours(employee_id, today)
        
        # Convert last event if exists
        last_clock_event = None
        if last_event:
            last_event["_id"] = str(last_event["_id"])
            last_clock_event = ClockEvent(**last_event)
        
        return AttendanceStatus(
            is_clocked_in=is_clocked_in,
            current_shift=current_shift,
            last_clock_event=last_clock_event,
            total_hours_today=total_hours_today
        )
        
    except Exception as e:
        print(f"Error getting attendance status: {e}")
        return AttendanceStatus(
            is_clocked_in=False,
            current_shift=None,
            last_clock_event=None,
            total_hours_today=0.0
        )

async def calculate_daily_hours(employee_id: str, date_str: str) -> float:
    """
    Calculate total hours worked by employee on a specific date.
    
    Args:
        employee_id: MongoDB ObjectId string
        date_str: Date in YYYY-MM-DD format
    
    Returns:
        Total hours worked as float
    """
    db = get_db()
    
    try:
        start_of_day = datetime.strptime(date_str, "%Y-%m-%d")
        end_of_day = start_of_day.replace(hour=23, minute=59, second=59)
        
        # Get all clock events for the day
        events_cursor = db["clock_events"].find({
            "employee_id": employee_id,
            "timestamp": {"$gte": start_of_day, "$lte": end_of_day}
        }).sort("timestamp", 1)
        
        events = await events_cursor.to_list(None)
        
        total_hours = 0.0
        clock_in_time = None
        
        for event in events:
            if event["event_type"] == "clock_in" and event["is_valid"]:
                clock_in_time = event["timestamp"]
            elif event["event_type"] == "clock_out" and event["is_valid"] and clock_in_time:
                hours_worked = (event["timestamp"] - clock_in_time).total_seconds() / 3600
                total_hours += hours_worked
                clock_in_time = None
        
        return round(total_hours, 2)
        
    except Exception as e:
        print(f"Error calculating daily hours: {e}")
        return 0.0 