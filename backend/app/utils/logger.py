import logging
from datetime import datetime
from app.db import get_db
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

async def log_event(
    action: str, 
    details: Optional[Dict[str, Any]] = None, 
    user_id: Optional[str] = None,
    ip_address: Optional[str] = None
):
    """
    Log an event to both the application logger and the database
    """
    try:
        # Log to application logger
        log_message = f"Action: {action}"
        if user_id:
            log_message += f" | User: {user_id}"
        if details:
            log_message += f" | Details: {details}"
        
        logger.info(log_message)
        
        # Log to database
        db = get_db()
        log_entry = {
            "action": action,
            "details": details or {},
            "userId": user_id,
            "timestamp": datetime.utcnow(),
            "ipAddress": ip_address
        }
        
        await db["activity_logs"].insert_one(log_entry)
        
    except Exception as e:
        # Don't let logging errors break the application
        logger.error(f"Failed to log event: {e}")

def log_error(message: str, error: Exception, user_id: Optional[str] = None):
    """
    Log an error with context
    """
    error_message = f"Error: {message} | Exception: {str(error)}"
    if user_id:
        error_message += f" | User: {user_id}"
    
    logger.error(error_message)

def log_warning(message: str, user_id: Optional[str] = None):
    """
    Log a warning
    """
    warning_message = f"Warning: {message}"
    if user_id:
        warning_message += f" | User: {user_id}"
    
    logger.warning(warning_message)

def log_debug(message: str, details: Optional[Dict[str, Any]] = None):
    """
    Log debug information
    """
    debug_message = f"Debug: {message}"
    if details:
        debug_message += f" | Details: {details}"
    
    logger.debug(debug_message)

# Event type constants for consistency
class EventTypes:
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    USER_REGISTERED = "user_registered"
    USER_CREATED = "user_created"
    USER_UPDATED = "user_updated"
    USER_DELETED = "user_deleted"
    
    SCHEDULE_CREATED = "schedule_created"
    SCHEDULE_UPDATED = "schedule_updated"
    SCHEDULE_DELETED = "schedule_deleted"
    SCHEDULES_GENERATED = "schedules_generated"
    
    TIME_OFF_REQUEST_CREATED = "time_off_request_created"
    TIME_OFF_REQUEST_UPDATED = "time_off_request_updated"
    TIME_OFF_REQUEST_REVIEWED = "time_off_request_reviewed"
    TIME_OFF_REQUEST_DELETED = "time_off_request_deleted"
    
    MESSAGE_SENT = "message_sent"
    MESSAGE_READ = "message_read"
    MESSAGE_ACKNOWLEDGED = "message_acknowledged"
    MESSAGE_DELETED = "message_deleted"
    
    PROFILE_UPDATED = "profile_updated"
    PASSWORD_CHANGED = "password_changed"
    PASSWORD_RESET = "password_reset"
    PREFERENCES_UPDATED = "preferences_updated"
    
    ROLE_UPDATED = "role_updated"
    TEAM_MEMBER_ADDED = "team_member_added"
    TEAM_MEMBER_REMOVED = "team_member_removed"
    
    AUTH_FAILED = "auth_failed"
    AUTH_SUCCESS = "auth_success"
    
    SYSTEM_ERROR = "system_error"
    SYSTEM_WARNING = "system_warning"
