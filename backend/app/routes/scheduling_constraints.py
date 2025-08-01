from fastapi import APIRouter, HTTPException, Depends
from app.schemas.scheduling_constraint import ConstraintCreate, ConstraintOut, ConstraintUpdate, IndustryTemplate
from app.models.scheduling_constraint import get_industry_template, INDUSTRY_TEMPLATES
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from bson import ObjectId
from datetime import datetime
from typing import List

router = APIRouter()

@router.get("/", response_model=List[ConstraintOut])
async def list_constraints(current_user: dict = Depends(get_current_user)):
    """Get all scheduling constraint templates"""
    db = get_db()
    
    # Get all constraints
    docs = await db['scheduling_constraints'].find().sort("created_at", -1).to_list(None)
    
    constraints = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        constraints.append(ConstraintOut(**doc))
    
    return constraints

@router.get("/industry-templates", response_model=List[IndustryTemplate])
async def get_industry_templates(current_user: dict = Depends(get_current_user)):
    """Get industry-specific constraint templates"""
    templates = []
    
    for industry_type, template_data in INDUSTRY_TEMPLATES.items():
        templates.append(IndustryTemplate(
            industry_type=industry_type,
            template=template_data
        ))
    
    return templates

@router.get("/industry-templates/{industry_type}", response_model=IndustryTemplate)
async def get_industry_template_by_type(
    industry_type: str,
    current_user: dict = Depends(get_current_user)
):
    """Get specific industry template"""
    template_data = get_industry_template(industry_type)
    
    if not template_data and industry_type not in INDUSTRY_TEMPLATES:
        raise HTTPException(404, f"Industry template '{industry_type}' not found")
    
    return IndustryTemplate(
        industry_type=industry_type,
        template=template_data
    )

@router.post("/", response_model=ConstraintOut, status_code=201)
async def create_constraint(
    constraint: ConstraintCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new scheduling constraint template"""
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions to create constraint templates")
    
    # Check for duplicate names
    existing = await db['scheduling_constraints'].find_one({"name": constraint.name})
    if existing:
        raise HTTPException(400, f"Constraint template with name '{constraint.name}' already exists")
    
    # Convert to dict - new format is flat, not nested under parameters
    doc = constraint.dict(exclude_unset=True)
    
    # Handle backward compatibility with old parameters format if it exists
    if hasattr(constraint, 'parameters') and constraint.parameters:
        # Convert old format to new format - this is for backward compatibility only
        params = constraint.parameters
        if params.maxEmployeesPerDay:
            doc["max_employees_per_day"] = params.maxEmployeesPerDay
        if params.maxConsecutiveDays:
            doc["max_consecutive_days"] = params.maxConsecutiveDays
        if params.solverTimeLimit:
            doc["solver_time_limit"] = params.solverTimeLimit
        if params.locations:
            doc["locations"] = params.locations
        if params.roles:
            doc["roles"] = params.roles
        if params.departments:
            doc["departments"] = params.departments
        if params.shiftTimes:
            # Convert old shift times to new shift templates
            shift_templates = []
            for i, shift in enumerate(params.shiftTimes):
                shift_templates.append({
                    "name": f"Shift {i+1}",
                    "start_time": shift.get("start", "09:00"),
                    "end_time": shift.get("end", "17:00"),
                    "required_roles": {"general": 1},
                    "preferred_locations": [],
                    "is_active": True
                })
            doc["shift_templates"] = shift_templates
        # Remove the parameters key since we've flattened it
        doc.pop("parameters", None)
    
    # Add metadata
    doc.update({
        "is_default": False,
        "created_by": str(current_user["_id"]),
        "created_at": datetime.utcnow(),
        "updated_at": None
    })
    
    try:
        result = await db['scheduling_constraints'].insert_one(doc)
        new_doc = await db['scheduling_constraints'].find_one({'_id': result.inserted_id})
        
        if new_doc:
            new_doc["_id"] = str(new_doc["_id"])
            
            await log_event("constraint_created", {
                "constraint_id": str(result.inserted_id),
                "constraint_name": constraint.name,
                "created_by": str(current_user["_id"])
            })
            
            return ConstraintOut(**new_doc)
            
    except Exception as e:
        raise HTTPException(500, f"Failed to create constraint template: {str(e)}")
    
    raise HTTPException(500, "Failed to create constraint template")

@router.get("/{constraint_id}", response_model=ConstraintOut)
async def get_constraint(
    constraint_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific constraint template"""
    db = get_db()
    
    try:
        constraint = await db['scheduling_constraints'].find_one({"_id": ObjectId(constraint_id)})
        if not constraint:
            raise HTTPException(404, "Constraint template not found")
        
        constraint["_id"] = str(constraint["_id"])
        return ConstraintOut(**constraint)
        
    except Exception as e:
        if "ObjectId" in str(e):
            raise HTTPException(400, "Invalid constraint ID format")
        raise HTTPException(500, f"Error retrieving constraint: {str(e)}")

@router.put("/{constraint_id}", response_model=ConstraintOut)
async def update_constraint(
    constraint_id: str,
    constraint: ConstraintUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing constraint template"""
    db = get_db()
    
    # Check permissions
    if current_user.get("role") not in ["manager", "administrator"]:
        raise HTTPException(403, "Insufficient permissions to update constraint templates")
    
    try:
        # Check if constraint exists
        existing = await db['scheduling_constraints'].find_one({"_id": ObjectId(constraint_id)})
        if not existing:
            raise HTTPException(404, "Constraint template not found")
        
        # Prepare update data
        update_data = constraint.dict(exclude_unset=True)
        if update_data:
            update_data["updated_at"] = datetime.utcnow()
            
            # Check for duplicate names if name is being updated
            if "name" in update_data and update_data["name"] != existing["name"]:
                duplicate = await db['scheduling_constraints'].find_one({
                    "_id": {"$ne": ObjectId(constraint_id)},
                    "name": update_data["name"]
                })
                if duplicate:
                    raise HTTPException(400, f"Constraint template with name '{update_data['name']}' already exists")
            
            # Update the constraint
            result = await db['scheduling_constraints'].update_one(
                {"_id": ObjectId(constraint_id)}, 
                {"$set": update_data}
            )
            
            if result.matched_count == 0:
                raise HTTPException(404, "Constraint template not found")
        
        # Return updated constraint
        updated_constraint = await db['scheduling_constraints'].find_one({"_id": ObjectId(constraint_id)})
        updated_constraint["_id"] = str(updated_constraint["_id"])
        
        await log_event("constraint_updated", {
            "constraint_id": constraint_id,
            "updated_by": str(current_user["_id"]),
            "changes": update_data
        })
        
        return ConstraintOut(**updated_constraint)
        
    except HTTPException:
        raise
    except Exception as e:
        if "ObjectId" in str(e):
            raise HTTPException(400, "Invalid constraint ID format")
        raise HTTPException(500, f"Error updating constraint: {str(e)}")

@router.delete("/{constraint_id}", status_code=204)
async def delete_constraint(
    constraint_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a constraint template"""
    db = get_db()
    
    # Check permissions  
    if current_user.get("role") != "administrator":
        raise HTTPException(403, "Only administrators can delete constraint templates")
    
    try:
        # Check if constraint exists
        existing = await db['scheduling_constraints'].find_one({"_id": ObjectId(constraint_id)})
        if not existing:
            raise HTTPException(404, "Constraint template not found")
        
        # Check if constraint is being used in any schedules
        schedules_using_constraint = await db['schedules'].count_documents({
            "constraint_id": constraint_id,
            "status": {"$in": ["scheduled", "confirmed"]}
        })
        
        if schedules_using_constraint > 0:
            raise HTTPException(400, f"Cannot delete constraint template. It is being used by {schedules_using_constraint} active schedules.")
        
        # Delete the constraint
        result = await db['scheduling_constraints'].delete_one({"_id": ObjectId(constraint_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(404, "Constraint template not found")
        
        await log_event("constraint_deleted", {
            "constraint_id": constraint_id,
            "constraint_name": existing["name"],
            "deleted_by": str(current_user["_id"])
        })
        
    except HTTPException:
        raise
    except Exception as e:
        if "ObjectId" in str(e):
            raise HTTPException(400, "Invalid constraint ID format")
        raise HTTPException(500, f"Error deleting constraint: {str(e)}")
