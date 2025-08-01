"""
Authentication and Activity Audit Service
Provides comprehensive logging and tracking of user activities for security and compliance.
Implements audit trail requirements for authentication and user actions.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from bson import ObjectId
from app.db import get_db
import logging
from enum import Enum

logger = logging.getLogger(__name__)

class AuditEventType(str, Enum):
    """Enumeration of audit event types"""
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILURE = "login_failure"
    LOGOUT = "logout"
    PASSWORD_CHANGE = "password_change"
    PASSWORD_RESET_REQUEST = "password_reset_request"
    PASSWORD_RESET_COMPLETE = "password_reset_complete"
    PROFILE_UPDATE = "profile_update"
    ROLE_CHANGE = "role_change"
    ACCOUNT_LOCKED = "account_locked"
    ACCOUNT_UNLOCKED = "account_unlocked"
    DATA_ACCESS = "data_access"
    DATA_EXPORT = "data_export"
    DATA_DELETION = "data_deletion"
    ADMIN_ACTION = "admin_action"
    PERMISSION_DENIED = "permission_denied"
    SESSION_TIMEOUT = "session_timeout"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"

class AuditSeverity(str, Enum):
    """Severity levels for audit events"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class AuditService:
    """
    Service for comprehensive audit logging and activity tracking
    """
    
    def __init__(self):
        self.db = None
        self.collection = None
    
    def _ensure_db_connection(self):
        """Ensure database connection is established"""
        if self.db is None:
            self.db = get_db()
            if self.db is not None:
                self.collection = self.db["audit_logs"]
    
    async def log_event(
        self,
        event_type: AuditEventType,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        severity: AuditSeverity = AuditSeverity.LOW,
        resource_id: Optional[str] = None,
        resource_type: Optional[str] = None
    ) -> str:
        """
        Log an audit event
        """
        try:
            self._ensure_db_connection()
            if self.collection is None:
                logger.error("Database connection not available for audit logging")
                return ""
            audit_entry = {
                "event_type": event_type.value,
                "timestamp": datetime.utcnow(),
                "user_id": user_id,
                "user_email": user_email,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "details": details or {},
                "severity": severity.value,
                "resource_id": resource_id,
                "resource_type": resource_type,
                "session_id": details.get("session_id") if details else None
            }
            
            result = await self.collection.insert_one(audit_entry)
            audit_id = str(result.inserted_id)
            
            # Log critical events to application logger as well
            if severity in [AuditSeverity.HIGH, AuditSeverity.CRITICAL]:
                logger.warning(
                    f"Critical audit event: {event_type.value} - User: {user_email or user_id} - "
                    f"IP: {ip_address} - Details: {details}"
                )
            
            return audit_id
            
        except Exception as e:
            logger.error(f"Error logging audit event: {e}")
            # Don't raise exception to avoid breaking main application flow
            return ""
    
    async def log_authentication_success(
        self,
        user_id: str,
        user_email: str,
        ip_address: str,
        user_agent: str,
        session_id: str
    ) -> str:
        """Log successful authentication"""
        return await self.log_event(
            event_type=AuditEventType.LOGIN_SUCCESS,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "session_id": session_id,
                "login_method": "password"
            },
            severity=AuditSeverity.LOW
        )
    
    async def log_authentication_failure(
        self,
        email: str,
        ip_address: str,
        user_agent: str,
        failure_reason: str
    ) -> str:
        """Log failed authentication attempt"""
        return await self.log_event(
            event_type=AuditEventType.LOGIN_FAILURE,
            user_email=email,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "failure_reason": failure_reason,
                "login_method": "password"
            },
            severity=AuditSeverity.MEDIUM
        )
    
    async def log_logout(
        self,
        user_id: str,
        user_email: str,
        ip_address: str,
        session_id: str,
        logout_type: str = "manual"
    ) -> str:
        """Log user logout"""
        return await self.log_event(
            event_type=AuditEventType.LOGOUT,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip_address,
            details={
                "session_id": session_id,
                "logout_type": logout_type  # manual, timeout, forced
            },
            severity=AuditSeverity.LOW
        )
    
    async def log_password_change(
        self,
        user_id: str,
        user_email: str,
        ip_address: str,
        changed_by_admin: bool = False
    ) -> str:
        """Log password change"""
        return await self.log_event(
            event_type=AuditEventType.PASSWORD_CHANGE,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip_address,
            details={
                "changed_by_admin": changed_by_admin
            },
            severity=AuditSeverity.MEDIUM
        )
    
    async def log_data_access(
        self,
        user_id: str,
        user_email: str,
        ip_address: str,
        resource_type: str,
        resource_id: str,
        action: str
    ) -> str:
        """Log data access events"""
        return await self.log_event(
            event_type=AuditEventType.DATA_ACCESS,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip_address,
            resource_type=resource_type,
            resource_id=resource_id,
            details={
                "action": action  # read, create, update, delete
            },
            severity=AuditSeverity.LOW
        )
    
    async def log_admin_action(
        self,
        admin_user_id: str,
        admin_email: str,
        ip_address: str,
        action: str,
        target_user_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> str:
        """Log administrative actions"""
        return await self.log_event(
            event_type=AuditEventType.ADMIN_ACTION,
            user_id=admin_user_id,
            user_email=admin_email,
            ip_address=ip_address,
            details={
                "action": action,
                "target_user_id": target_user_id,
                **(details or {})
            },
            severity=AuditSeverity.HIGH
        )
    
    async def log_permission_denied(
        self,
        user_id: str,
        user_email: str,
        ip_address: str,
        attempted_action: str,
        resource_type: str
    ) -> str:
        """Log unauthorized access attempts"""
        return await self.log_event(
            event_type=AuditEventType.PERMISSION_DENIED,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip_address,
            details={
                "attempted_action": attempted_action,
                "resource_type": resource_type
            },
            severity=AuditSeverity.HIGH
        )
    
    async def get_audit_logs(
        self,
        user_id: Optional[str] = None,
        event_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        ip_address: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 100,
        skip: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Retrieve audit logs with filtering
        """
        try:
            self._ensure_db_connection()
            if self.collection is None:
                logger.error("Database connection not available for audit log retrieval")
                return []
            
            # Build query filter
            query_filter = {}
            
            if user_id:
                query_filter["user_id"] = user_id
            
            if event_type:
                query_filter["event_type"] = event_type
            
            if ip_address:
                query_filter["ip_address"] = ip_address
            
            if severity:
                query_filter["severity"] = severity
            
            if start_date or end_date:
                timestamp_filter = {}
                if start_date:
                    timestamp_filter["$gte"] = start_date
                if end_date:
                    timestamp_filter["$lte"] = end_date
                query_filter["timestamp"] = timestamp_filter
            
            # Execute query
            cursor = self.collection.find(query_filter) \
                .sort("timestamp", -1) \
                .skip(skip) \
                .limit(limit)
            
            logs = await cursor.to_list(None)
            
            # Convert ObjectId to string
            for log in logs:
                log["_id"] = str(log["_id"])
                if log.get("timestamp"):
                    log["timestamp"] = log["timestamp"].isoformat()
            
            return logs
            
        except Exception as e:
            logger.error(f"Error retrieving audit logs: {e}")
            return []
    
    async def get_login_statistics(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get login statistics for security monitoring
        """
        try:
            self._ensure_db_connection()
            if self.collection is None:
                logger.error("Database connection not available for login statistics")
                return {"error": "Database connection not available"}
            
            if not start_date:
                start_date = datetime.utcnow() - timedelta(days=30)
            if not end_date:
                end_date = datetime.utcnow()
            
            # Aggregate login statistics
            pipeline = [
                {
                    "$match": {
                        "timestamp": {"$gte": start_date, "$lte": end_date},
                        "event_type": {"$in": ["login_success", "login_failure"]}
                    }
                },
                {
                    "$group": {
                        "_id": {
                            "event_type": "$event_type",
                            "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}
                        },
                        "count": {"$sum": 1}
                    }
                },
                {
                    "$group": {
                        "_id": "$_id.date",
                        "successful_logins": {
                            "$sum": {"$cond": [{"$eq": ["$_id.event_type", "login_success"]}, "$count", 0]}
                        },
                        "failed_logins": {
                            "$sum": {"$cond": [{"$eq": ["$_id.event_type", "login_failure"]}, "$count", 0]}
                        }
                    }
                },
                {"$sort": {"_id": 1}}
            ]
            
            results = await self.collection.aggregate(pipeline).to_list(None)
            
            return {
                "period": {
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat()
                },
                "daily_stats": results,
                "total_successful": sum(day.get("successful_logins", 0) for day in results),
                "total_failed": sum(day.get("failed_logins", 0) for day in results)
            }
            
        except Exception as e:
            logger.error(f"Error getting login statistics: {e}")
            return {"error": str(e)}
    
    async def detect_suspicious_activity(self) -> List[Dict[str, Any]]:
        """
        Detect potentially suspicious authentication patterns
        """
        try:
            self._ensure_db_connection()
            if self.collection is None:
                logger.error("Database connection not available for suspicious activity detection")
                return []
            
            suspicious_events = []
            
            # Check for multiple failed logins from same IP
            failed_login_pipeline = [
                {
                    "$match": {
                        "event_type": "login_failure",
                        "timestamp": {"$gte": datetime.utcnow() - timedelta(hours=1)}
                    }
                },
                {
                    "$group": {
                        "_id": "$ip_address",
                        "count": {"$sum": 1},
                        "emails": {"$addToSet": "$user_email"}
                    }
                },
                {
                    "$match": {"count": {"$gte": 5}}
                }
            ]
            
            failed_attempts = await self.collection.aggregate(failed_login_pipeline).to_list(None)
            
            for attempt in failed_attempts:
                suspicious_events.append({
                    "type": "multiple_failed_logins",
                    "ip_address": attempt["_id"],
                    "failed_count": attempt["count"],
                    "targeted_emails": attempt["emails"],
                    "severity": "high",
                    "detected_at": datetime.utcnow().isoformat()
                })
            
            # Check for logins from multiple locations for same user
            location_pipeline = [
                {
                    "$match": {
                        "event_type": "login_success",
                        "timestamp": {"$gte": datetime.utcnow() - timedelta(hours=24)}
                    }
                },
                {
                    "$group": {
                        "_id": "$user_id",
                        "ip_addresses": {"$addToSet": "$ip_address"},
                        "count": {"$sum": 1}
                    }
                },
                {
                    "$match": {
                        "$expr": {"$gte": [{"$size": "$ip_addresses"}, 3]}
                    }
                }
            ]
            
            multi_location = await self.collection.aggregate(location_pipeline).to_list(None)
            
            for user in multi_location:
                suspicious_events.append({
                    "type": "multiple_location_logins",
                    "user_id": user["_id"],
                    "ip_addresses": user["ip_addresses"],
                    "login_count": user["count"],
                    "severity": "medium",
                    "detected_at": datetime.utcnow().isoformat()
                })
            
            return suspicious_events
            
        except Exception as e:
            logger.error(f"Error detecting suspicious activity: {e}")
            return []

# Global service instance
audit_service = AuditService() 