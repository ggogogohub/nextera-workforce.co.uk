from fastapi import APIRouter, HTTPException, Depends, Query, Request # Added Request
from typing import List, Optional
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.auth_service import hash_password
from app.db import get_db
from app.utils.logger import log_event
from app.utils.auth import get_current_user
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.get("/", response_model=dict)
async def list_users(
    # request: Request, # Temporarily remove direct request access
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=500), # Increased le to 500
    search: Optional[str] = None,
    role: Optional[str] = None,
    department: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    try:
        db = get_db()
        
        # print(f"Request query params: {request.query_params}") # DEBUG

        filter_dict = {"anonymized": {"$ne": True}}  # Exclude anonymized users by default
        if search:
            filter_dict["$or"] = [
                {"firstName": {"$regex": search, "$options": "i"}},
                {"lastName": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}}
            ]
        if role:
            filter_dict["role"] = role
        if department:
            filter_dict["department"] = department
        
        total = await db["users"].count_documents(filter_dict)
        
        skip = (page - 1) * limit
        
        # No sorting applied for now to ensure basic fetch works
        users_cursor = db["users"].find(filter_dict).skip(skip).limit(limit)
        users = await users_cursor.to_list(None)
        
        # Convert to UserOut format
        user_list = []
        for user_doc in users: # Renamed to user_doc to avoid confusion with UserOut model
            try:
                user_doc["_id"] = str(user_doc["_id"]) # Convert ObjectId to string for the aliased field
                user_list.append(UserOut(**user_doc))
            except Exception as validation_error:
                print(f"Error converting user document to UserOut: {validation_error}")
                print(f"User document: {user_doc}")
                # Skip this user document if validation fails
                continue
        
        return {
            "items": user_list,
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": (total + limit - 1) // limit
        }
    except Exception as e:
        print(f"Error in list_users endpoint: {e}")
        print(f"Query parameters: page={page}, limit={limit}, search={search}, role={role}, department={department}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/", response_model=UserOut, status_code=201)
async def create_user(
    user: UserCreate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    existing = await db["users"].find_one({"email": user.email})
    if existing:
        raise HTTPException(400, "Email already in use")
    
    user_dict = user.dict(exclude={"password"})
    user_dict["hashed_password"] = hash_password(user.password)
    user_dict["createdAt"] = datetime.utcnow()
    user_dict["isActive"] = True
    
    res = await db["users"].insert_one(user_dict)
    new_user = await db["users"].find_one({"_id": res.inserted_id})
    await log_event("user_created", {"user_id": str(res.inserted_id)})
    
    new_user["_id"] = str(new_user["_id"]) # Convert ObjectId to string for the aliased field
    return UserOut(**new_user)

@router.get("/me", response_model=UserOut)
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    user_data_for_model = current_user.copy()
    # Ensure the field Pydantic uses for 'id' (which is '_id' due to alias) is a string
    user_data_for_model["_id"] = str(user_data_for_model["_id"])
    return UserOut(**user_data_for_model)

@router.put("/me", response_model=UserOut)
async def update_current_user_profile(
    user_update: UserUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    update_dict = user_update.dict(exclude_unset=True)
    update_dict["updatedAt"] = datetime.utcnow()
    
    await db["users"].update_one(
        {"_id": current_user["_id"]}, 
        {"$set": update_dict}
    )
    
    updated = await db["users"].find_one({"_id": current_user["_id"]})
    await log_event("profile_updated", {"user_id": str(current_user["_id"])})
    
    updated["_id"] = str(updated["_id"])
    return UserOut(**updated)

@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except:
        raise HTTPException(400, "Invalid user ID")
    
    user = await db["users"].find_one({"_id": oid})
    if not user:
        raise HTTPException(404, "User not found")
    
    user["id"] = str(user["_id"])
    return UserOut(**user)

@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    user_update: UserUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except:
        raise HTTPException(400, "Invalid user ID")
    
    existing = await db["users"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "User not found")
    
    update_dict = user_update.dict(exclude_unset=True)
    update_dict["updatedAt"] = datetime.utcnow()
    
    await db["users"].update_one({"_id": oid}, {"$set": update_dict})
    updated = await db["users"].find_one({"_id": oid})
    await log_event("user_updated", {"user_id": user_id})
    
    updated["_id"] = str(updated["_id"]) # Convert ObjectId to string for the aliased field
    return UserOut(**updated)

@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except:
        raise HTTPException(400, "Invalid user ID")
    
    res = await db["users"].delete_one({"_id": oid})
    if res.deleted_count == 0:
        raise HTTPException(404, "User not found")
    await log_event("user_deleted", {"user_id": user_id})
