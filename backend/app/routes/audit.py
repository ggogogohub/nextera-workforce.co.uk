"""
Audit Log API Routes
Provides endpoints for viewing audit logs and security monitoring (admin only)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from app.utils.auth import get_current_user
from app.services.audit_service import audit_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Audit Logs"])

@router.get("/logs", response_model=List[Dict[str, Any]])
async def get_audit_logs(
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    start_date: Optional[datetime] = Query(None, description="Start date for filtering"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering"),
    ip_address: Optional[str] = Query(None, description="Filter by IP address"),
    severity: Optional[str] = Query(None, description="Filter by severity level"),
    limit: int = Query(100, ge=1, le=1000, description="Number of logs to return"),
    skip: int = Query(0, ge=0, description="Number of logs to skip"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get audit logs (Administrator only)
    """
    # Check admin permissions
    if current_user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Administrator access required")
    
    try:
        logs = await audit_service.get_audit_logs(
            user_id=user_id,
            event_type=event_type,
            start_date=start_date,
            end_date=end_date,
            ip_address=ip_address,
            severity=severity,
            limit=limit,
            skip=skip
        )
        
        return logs
        
    except Exception as e:
        logger.error(f"Error retrieving audit logs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve audit logs: {e}")

@router.get("/login-statistics")
async def get_login_statistics(
    start_date: Optional[datetime] = Query(None, description="Start date for statistics"),
    end_date: Optional[datetime] = Query(None, description="End date for statistics"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get login statistics for security monitoring (Administrator only)
    """
    # Check admin permissions
    if current_user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Administrator access required")
    
    try:
        stats = await audit_service.get_login_statistics(start_date, end_date)
        return {
            "success": True,
            "statistics": stats
        }
        
    except Exception as e:
        logger.error(f"Error retrieving login statistics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve statistics: {e}")

@router.get("/suspicious-activity")
async def get_suspicious_activity(
    current_user: dict = Depends(get_current_user)
):
    """
    Detect and return suspicious authentication patterns (Administrator only)
    """
    # Check admin permissions
    if current_user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Administrator access required")
    
    try:
        suspicious_events = await audit_service.detect_suspicious_activity()
        return {
            "success": True,
            "suspicious_events": suspicious_events,
            "count": len(suspicious_events)
        }
        
    except Exception as e:
        logger.error(f"Error detecting suspicious activity: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to detect suspicious activity: {e}")

@router.get("/my-activity")
async def get_my_activity(
    limit: int = Query(50, ge=1, le=200, description="Number of logs to return"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get audit logs for the current user's own activities
    """
    try:
        user_id = str(current_user["_id"])
        logs = await audit_service.get_audit_logs(
            user_id=user_id,
            limit=limit,
            skip=0
        )
        
        return {
            "success": True,
            "activities": logs,
            "user_id": user_id
        }
        
    except Exception as e:
        logger.error(f"Error retrieving user activity: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve activity: {e}")

@router.get("/event-types")
async def get_audit_event_types(
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of available audit event types for filtering
    """
    # Check admin permissions for full list
    if current_user.get("role") != "administrator":
        # Return limited list for non-admins
        return {
            "success": True,
            "event_types": [
                "login_success",
                "login_failure", 
                "logout",
                "profile_update",
                "data_access"
            ]
        }
    
    # Return full list for administrators
    from app.services.audit_service import AuditEventType
    return {
        "success": True,
        "event_types": [event_type.value for event_type in AuditEventType]
    }

@router.get("/security-summary")
async def get_security_summary(
    current_user: dict = Depends(get_current_user)
):
    """
    Get security summary dashboard data (Administrator only)
    """
    # Check admin permissions
    if current_user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Administrator access required")
    
    try:
        # Get last 24 hours of activity
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=1)
        
        # Get recent statistics
        login_stats = await audit_service.get_login_statistics(start_date, end_date)
        suspicious_events = await audit_service.detect_suspicious_activity()
        
        # Get recent failed login attempts
        failed_logins = await audit_service.get_audit_logs(
            event_type="login_failure",
            start_date=start_date,
            end_date=end_date,
            limit=10
        )
        
        # Get recent successful logins
        successful_logins = await audit_service.get_audit_logs(
            event_type="login_success",
            start_date=start_date,
            end_date=end_date,
            limit=10
        )
        
        return {
            "success": True,
            "summary": {
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                },
                "login_statistics": login_stats,
                "suspicious_activity_count": len(suspicious_events),
                "recent_failed_logins": failed_logins,
                "recent_successful_logins": successful_logins,
                "alerts": [
                    {
                        "type": "suspicious_activity",
                        "count": len(suspicious_events),
                        "severity": "high" if len(suspicious_events) > 0 else "low"
                    },
                    {
                        "type": "failed_logins",
                        "count": len(failed_logins),
                        "severity": "medium" if len(failed_logins) > 10 else "low"
                    }
                ]
            }
        }
        
    except Exception as e:
        logger.error(f"Error generating security summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate security summary: {e}") 