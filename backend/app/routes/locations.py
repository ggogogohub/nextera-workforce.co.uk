from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from app.models.location import Location, LocationCreate, LocationUpdate
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.get("/", response_model=List[Location])
async def list_locations(
    is_active: Optional[bool] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Get all workplace locations"""
    db = get_db()
    
    # Build filter
    filter_dict = {}
    if is_active is not None:
        filter_dict["is_active"] = is_active
    
    locations_cursor = db["locations"].find(filter_dict).sort("name", 1)
    locations = await locations_cursor.to_list(None)
    
    location_list = []
    for location_doc in locations:
        location_doc["_id"] = str(location_doc["_id"])
        location_list.append(Location(**location_doc))
    
    return location_list

@router.post("/", response_model=Location, status_code=201)
async def create_location(
    location_data: LocationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new workplace location (Admin/Manager only)"""
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions to create locations")
    
    # Validate coordinates
    if not isinstance(location_data.coordinates, dict) or \
       "lat" not in location_data.coordinates or \
       "lng" not in location_data.coordinates:
        raise HTTPException(400, "Invalid coordinates format. Expected: {lat: float, lng: float}")
    
    # Check for duplicate location names
    existing_location = await db["locations"].find_one({
        "name": location_data.name,
        "is_active": True
    })
    if existing_location:
        raise HTTPException(400, f"Location with name '{location_data.name}' already exists")
    
    # Create location document
    location_dict = location_data.dict()
    location_dict.update({
        "is_active": True,
        "created_by": str(current_user["_id"]),
        "created_at": datetime.utcnow()
    })
    
    result = await db["locations"].insert_one(location_dict)
    new_location = await db["locations"].find_one({"_id": result.inserted_id})
    
    new_location["_id"] = str(new_location["_id"])
    
    await log_event("location_created", {
        "location_id": str(result.inserted_id),
        "name": location_data.name,
        "created_by": str(current_user["_id"])
    })
    
    return Location(**new_location)

@router.get("/{location_id}", response_model=Location)
async def get_location(
    location_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific workplace location"""
    db = get_db()
    
    try:
        location = await db["locations"].find_one({"_id": ObjectId(location_id)})
        if not location:
            raise HTTPException(404, "Location not found")
        
        location["_id"] = str(location["_id"])
        return Location(**location)
        
    except Exception as e:
        if "ObjectId" in str(e):
            raise HTTPException(400, "Invalid location ID format")
        raise HTTPException(500, f"Error retrieving location: {str(e)}")

@router.put("/{location_id}", response_model=Location)
async def update_location(
    location_id: str,
    location_update: LocationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a workplace location (Admin/Manager only)"""
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions to update locations")
    
    try:
        # Check if location exists
        existing_location = await db["locations"].find_one({"_id": ObjectId(location_id)})
        if not existing_location:
            raise HTTPException(404, "Location not found")
        
        # Build update dictionary
        update_dict = location_update.dict(exclude_unset=True)
        if update_dict:
            update_dict["updated_at"] = datetime.utcnow()
            
            # Validate coordinates if provided
            if "coordinates" in update_dict:
                coords = update_dict["coordinates"]
                if not isinstance(coords, dict) or "lat" not in coords or "lng" not in coords:
                    raise HTTPException(400, "Invalid coordinates format. Expected: {lat: float, lng: float}")
            
            # Check for duplicate names if name is being updated
            if "name" in update_dict:
                duplicate_check = await db["locations"].find_one({
                    "_id": {"$ne": ObjectId(location_id)},
                    "name": update_dict["name"],
                    "is_active": True
                })
                if duplicate_check:
                    raise HTTPException(400, f"Location with name '{update_dict['name']}' already exists")
            
            # Update the location
            await db["locations"].update_one(
                {"_id": ObjectId(location_id)}, 
                {"$set": update_dict}
            )
        
        # Return updated location
        updated_location = await db["locations"].find_one({"_id": ObjectId(location_id)})
        updated_location["_id"] = str(updated_location["_id"])
        
        await log_event("location_updated", {
            "location_id": location_id,
            "updated_by": str(current_user["_id"]),
            "changes": update_dict
        })
        
        return Location(**updated_location)
        
    except HTTPException:
        raise
    except Exception as e:
        if "ObjectId" in str(e):
            raise HTTPException(400, "Invalid location ID format")
        raise HTTPException(500, f"Error updating location: {str(e)}")

@router.delete("/{location_id}", status_code=204)
async def delete_location(
    location_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a workplace location (Administrator only)"""
    db = get_db()
    
    # Check permissions - only administrators can delete locations
    if current_user.get("role") != "administrator":
        raise HTTPException(403, "Only administrators can delete locations")
    
    try:
        # Check if location exists
        existing_location = await db["locations"].find_one({"_id": ObjectId(location_id)})
        if not existing_location:
            raise HTTPException(404, "Location not found")
        
        # Check if location is being used in active schedules
        active_schedules = await db["schedules"].count_documents({
            "location": existing_location["name"],
            "status": {"$in": ["scheduled", "confirmed"]},
            "date": {"$gte": datetime.utcnow().strftime("%Y-%m-%d")}
        })
        
        if active_schedules > 0:
            raise HTTPException(400, f"Cannot delete location. It is referenced in {active_schedules} active schedules.")
        
        # Soft delete by setting is_active to False instead of hard delete
        await db["locations"].update_one(
            {"_id": ObjectId(location_id)},
            {
                "$set": {
                    "is_active": False,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        await log_event("location_deleted", {
            "location_id": location_id,
            "name": existing_location["name"],
            "deleted_by": str(current_user["_id"])
        })
        
    except HTTPException:
        raise
    except Exception as e:
        if "ObjectId" in str(e):
            raise HTTPException(400, "Invalid location ID format")
        raise HTTPException(500, f"Error deleting location: {str(e)}")

@router.get("/{location_id}/nearby", response_model=dict)
async def check_location_proximity(
    location_id: str,
    lat: float = Query(..., description="Employee's current latitude"),
    lng: float = Query(..., description="Employee's current longitude"),
    current_user: dict = Depends(get_current_user)
):
    """Check if employee is within proximity of a specific location"""
    from app.services.location_service import validate_location_proximity
    
    employee_gps = {"lat": lat, "lng": lng}
    is_valid, distance, location = await validate_location_proximity(employee_gps, location_id)
    
    return {
        "is_within_radius": is_valid,
        "distance_meters": round(distance, 2),
        "location": location.dict() if location else None,
        "message": f"You are {round(distance, 1)}m from {location.name}" if location else "Location not found"
    }

@router.get("/nearest/find", response_model=dict)
async def find_nearest_location_endpoint(
    lat: float = Query(..., description="Employee's current latitude"),
    lng: float = Query(..., description="Employee's current longitude"),
    current_user: dict = Depends(get_current_user)
):
    """Find the nearest workplace location to employee's current position"""
    from app.services.location_service import find_nearest_location
    
    employee_gps = {"lat": lat, "lng": lng}
    result = await find_nearest_location(employee_gps)
    
    if result:
        nearest_location, distance = result
        return {
            "nearest_location": nearest_location.dict(),
            "distance_meters": round(distance, 2),
            "is_within_radius": distance <= nearest_location.radius_meters,
            "message": f"Nearest location: {nearest_location.name} ({round(distance, 1)}m away)"
        }
    else:
        return {
            "nearest_location": None,
            "distance_meters": None,
            "is_within_radius": False,
            "message": "No active locations found"
        } 