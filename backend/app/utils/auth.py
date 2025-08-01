from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from app.db import get_db
from app.services.token_service import is_token_blacklisted
from bson import ObjectId
import os
import logging

# ---------------------------------------------------------------------------
# Logger setup – using module namespace helps identify origin in aggregated logs
# ---------------------------------------------------------------------------
logger = logging.getLogger(__name__)

security = HTTPBearer()

SECRET_KEY = os.getenv("SECRET_KEY", "testing_secret_key_for_development_only")
ALGORITHM = "HS256"

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        token_id: str = payload.get("jti")
        token_type: str = payload.get("type")
        
        # Verbose token validation logs are helpful during development but
        # overwhelm production consoles.  Emit only at DEBUG level so they can
        # be enabled when needed via `LOG_LEVEL=debug`.
        logger.debug("Validating token with jti: %s", token_id)
        
        if user_id is None or token_id is None:
            raise credentials_exception
        
        if token_type != "access":
            raise credentials_exception
        
        # Check if token is blacklisted
        if await is_token_blacklisted(token_id):
            logger.debug("Token %s is blacklisted", token_id)
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
    
    db = get_db()
    # Try to find user by string ID first (current database format)
    user = await db["users"].find_one({"_id": user_id})
    
    # If not found, try ObjectId format as fallback
    if user is None:
        try:
            user = await db["users"].find_one({"_id": ObjectId(user_id)})
        except:
            pass
    
    if user is None:
        raise credentials_exception
    
    if not user.get("isActive", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    return user

async def get_current_user_for_logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Identical to get_current_user, but omits the isActive check.
    This allows a user who has just been deactivated to still have their tokens blacklisted.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials for logout",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        token_id: str = payload.get("jti")
        token_type: str = payload.get("type")
        
        # Verbose token validation logs are helpful during development but
        # overwhelm production consoles.  Emit only at DEBUG level so they can
        # be enabled when needed via `LOG_LEVEL=debug`.
        logger.debug("Validating token for logout with jti: %s", token_id)
        
        if user_id is None or token_id is None:
            raise credentials_exception
        
        if token_type != "access": # Logout should still be initiated with an access token
            raise credentials_exception
            
        # Check if token is blacklisted (e.g. if logout is called multiple times)
        if await is_token_blacklisted(token_id):
            logger.debug("Token %s for logout is already blacklisted", token_id)
            raise credentials_exception # Or a more specific error like "Already logged out"
            
    except JWTError:
        raise credentials_exception
    
    db = get_db()
    user = await db["users"].find_one({"_id": user_id})
    if user is None:
        try: # Fallback for ObjectId, though user_id from token should be string
            user = await db["users"].find_one({"_id": ObjectId(user_id)})
        except:
            pass # If ObjectId conversion fails or still not found, will be caught below
            
    if user is None:
        raise credentials_exception
    
    # CRITICAL DIFFERENCE: No isActive check here
    # if not user.get("isActive", True):
    #     raise HTTPException(
    #         status_code=status.HTTP_403_FORBIDDEN,
    #         detail="User account is inactive"
    #     )
            
    return user

def verify_role(required_roles: list):
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    return role_checker

# Role-specific dependencies
def require_admin(current_user: dict = Depends(get_current_user)):
    return verify_role(["administrator"])(current_user)

def require_manager_or_admin(current_user: dict = Depends(get_current_user)):
    return verify_role(["manager", "administrator"])(current_user)

def require_employee_or_above(current_user: dict = Depends(get_current_user)):
    return verify_role(["employee", "manager", "administrator"])(current_user)
