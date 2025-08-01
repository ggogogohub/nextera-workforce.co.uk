import hashlib
from datetime import datetime, timedelta
from typing import Optional
from app.db import get_db
from app.models.token import RefreshToken, BlacklistedToken
from app.services.auth_service import decode_refresh_token, decode_access_token
from jose import JWTError
from bson import ObjectId
import logging

# ---------------------------------------------------------------------------
# Logger – module-scoped to avoid repetitive creation at runtime
# ---------------------------------------------------------------------------
logger = logging.getLogger(__name__)

async def store_refresh_token(
    user_id: str, 
    token_id: str, 
    refresh_token: str, 
    expires_at: datetime,
    device_info: Optional[str] = None,
    ip_address: Optional[str] = None
) -> str:
    """Store refresh token in database with hashed value"""
    db = get_db()
    
    # Hash the token for security
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    
    refresh_token_doc = {
        "user_id": user_id,
        "tokenId": token_id,
        "token_hash": token_hash,
        "expires_at": expires_at,
        "created_at": datetime.utcnow(),
        "is_revoked": False,
        "device_info": device_info,
        "ip_address": ip_address
    }
    
    result = await db["refresh_tokens"].insert_one(refresh_token_doc)
    return str(result.inserted_id)

async def verify_refresh_token(refresh_token: str) -> Optional[dict]:
    """Verify refresh token and return user info if valid"""
    try:
        # Decode the token
        payload = decode_refresh_token(refresh_token)
        token_id = payload.get("jti")
        user_id = payload.get("sub")
        
        if not token_id or not user_id:
            return None
        
        # Check if token is blacklisted
        if await is_token_blacklisted(token_id):
            return None
        
        # Check if token exists in database and is not revoked
        db = get_db()
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        
        stored_token = await db["refresh_tokens"].find_one({
            "tokenId": token_id,
            "user_id": user_id,
            "token_hash": token_hash,
            "is_revoked": False,
            "expires_at": {"$gt": datetime.utcnow()}
        })
        
        if not stored_token:
            return None
        
        return payload
        
    except JWTError:
        return None

async def revoke_refresh_token(token_id: str, user_id: str) -> bool:
    """Revoke a refresh token"""
    db = get_db()
    result = await db["refresh_tokens"].update_one(
        {"tokenId": token_id, "user_id": user_id},
        {"$set": {"is_revoked": True}}
    )
    return result.modified_count > 0

async def revoke_all_user_tokens(user_id: str) -> int:
    """Revoke all refresh tokens for a user"""
    db = get_db()
    result = await db["refresh_tokens"].update_many(
        {"user_id": user_id, "is_revoked": False},
        {"$set": {"is_revoked": True}}
    )
    return result.modified_count

async def blacklist_token(
    token_id: str, 
    token_type: str, 
    user_id: str, 
    expires_at: datetime,
    reason: str = "logout"
) -> str:
    """Add token to blacklist"""
    db = get_db()
    # Use INFO so security-relevant actions are still captured but without
    # flooding the console at DEBUG.  Adjust via LOG_LEVEL if needed.
    logger.info("Blacklisting token: %s type: %s user: %s reason: %s", token_id, token_type, user_id, reason)
    
    blacklist_doc = {
        "tokenId": token_id,
        "token_type": token_type,
        "user_id": user_id,
        "blacklisted_at": datetime.utcnow(),
        "expires_at": expires_at,
        "reason": reason
    }
    
    try:
        result = await db["blacklisted_tokens"].insert_one(blacklist_doc)
        logger.debug("Token blacklisted with id: %s", result.inserted_id)
        return str(result.inserted_id)
    except Exception as e:
        logger.error("Failed to blacklist token: %s", e)
        raise

async def is_token_blacklisted(token_id: str) -> bool:
    """Check if a token is blacklisted"""
    db = get_db()
    logger.debug("Checking if token is blacklisted: %s", token_id)
    blacklisted = await db["blacklisted_tokens"].find_one({
        "tokenId": token_id,
        "expires_at": {"$gt": datetime.utcnow()}
    })
    is_blacklisted = blacklisted is not None
    logger.debug("Is token blacklisted? %s", is_blacklisted)
    return is_blacklisted

async def cleanup_expired_tokens():
    """Clean up expired tokens and blacklist entries"""
    db = get_db()
    current_time = datetime.utcnow()
    
    # Remove expired refresh tokens
    await db["refresh_tokens"].delete_many({
        "expires_at": {"$lt": current_time}
    })
    
    # Remove expired blacklist entries
    await db["blacklisted_tokens"].delete_many({
        "expires_at": {"$lt": current_time}
    })

async def get_user_active_tokens(user_id: str) -> list:
    """Get all active refresh tokens for a user"""
    db = get_db()
    tokens = await db["refresh_tokens"].find({
        "user_id": user_id,
        "is_revoked": False,
        "expires_at": {"$gt": datetime.utcnow()}
    }).to_list(None)
    
    return tokens

async def extract_token_id_from_access_token(access_token: str) -> Optional[str]:
    """Extract token ID from access token for blacklisting"""
    try:
        payload = decode_access_token(access_token)
        return payload.get("jti")  # If access tokens have jti
    except JWTError:
        return None
