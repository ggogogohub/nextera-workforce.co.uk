from app.db import get_db
from app.models.notification import Notification
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional, Any, List, Dict
import asyncio

class NotificationService:
    """Enhanced notification service for workforce management events"""
    
    def __init__(self):
        self.db = get_db()
    
    async def create_notification(
        self,
        user_id: str,
        title: str,
        message: str,
        type: str = "info",
        link: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
        priority: str = "normal",
        expires_at: Optional[datetime] = None,
        requires_action: bool = False
    ) -> bool:
        """
        Creates and stores a new notification for a user with enhanced options.
        """
        notification_data = {
            "userId": ObjectId(user_id),
            "title": title,
            "message": message,
            "type": type,
            "isRead": False,
            "link": link,
            "payload": payload or {},
            "priority": priority,  # "low", "normal", "high", "urgent"
            "requires_action": requires_action,
            "expires_at": expires_at,
            "createdAt": datetime.utcnow()
        }
        
        try:
            await self.db.notifications.insert_one(notification_data)
            return True
        except Exception as e:
            print(f"Error creating notification: {e}")
            return False
    
    async def create_bulk_notifications(self, notifications: List[Dict]) -> int:
        """Create multiple notifications efficiently"""
        if not notifications:
            return 0
        
        # Prepare notification documents
        notification_docs = []
        for notif in notifications:
            doc = {
                "userId": ObjectId(notif["user_id"]),
                "title": notif["title"],
                "message": notif["message"],
                "type": notif.get("type", "info"),
                "isRead": False,
                "link": notif.get("link"),
                "payload": notif.get("payload", {}),
                "priority": notif.get("priority", "normal"),
                "requires_action": notif.get("requires_action", False),
                "expires_at": notif.get("expires_at"),
                "createdAt": datetime.utcnow()
            }
            notification_docs.append(doc)
        
        try:
            result = await self.db.notifications.insert_many(notification_docs)
            return len(result.inserted_ids)
        except Exception as e:
            print(f"Error creating bulk notifications: {e}")
            return 0
    
    async def notify_schedule_published(self, schedule_ids: List[str], published_by: str) -> None:
        """Notify employees when their schedules are published"""
        # Get all affected employees
        schedule_docs = await self.db.schedules.find({
            "_id": {"$in": [ObjectId(sid) for sid in schedule_ids]}
        }).to_list(None)
        
        employee_schedules = {}
        for schedule in schedule_docs:
            emp_id = schedule["employeeId"]
            if emp_id not in employee_schedules:
                employee_schedules[emp_id] = []
            employee_schedules[emp_id].append(schedule)
        
        notifications = []
        for emp_id, schedules in employee_schedules.items():
            date_range = self._get_date_range(schedules)
            
            notifications.append({
                "user_id": emp_id,
                "title": "New Schedule Published",
                "message": f"Your schedule for {date_range} has been published and is now active.",
                "type": "schedule_update",
                "link": "/schedule",
                "priority": "high",
                "payload": {
                    "schedule_ids": [str(s["_id"]) for s in schedules],
                    "published_by": published_by,
                    "schedule_count": len(schedules)
                }
            })
        
        await self.create_bulk_notifications(notifications)
    
    async def notify_schedule_conflicts(self, conflicts: List[Dict], affected_employees: List[str]) -> None:
        """Notify managers and employees about schedule conflicts"""
        notifications = []
        
        # Notify managers
        managers = await self.db.users.find({"role": {"$in": ["manager", "administrator"]}}).to_list(None)
        for manager in managers:
            high_severity_count = len([c for c in conflicts if c.get("severity") == "high"])
            
            notifications.append({
                "user_id": str(manager["_id"]),
                "title": "Schedule Conflicts Detected",
                "message": f"{len(conflicts)} conflicts found, {high_severity_count} are high severity",
                "type": "alert",
                "link": "/schedule-management",
                "priority": "high" if high_severity_count > 0 else "normal",
                "requires_action": True,
                "payload": {
                    "conflict_count": len(conflicts),
                    "high_severity_count": high_severity_count,
                    "affected_employees": affected_employees
                }
            })
        
        # Notify affected employees
        for emp_id in affected_employees:
            emp_conflicts = [c for c in conflicts if c.get("employeeId") == emp_id]
            if emp_conflicts:
                notifications.append({
                    "user_id": emp_id,
                    "title": "Schedule Conflict Alert",
                    "message": "There are conflicts in your schedule that need attention.",
                    "type": "warning",
                    "link": "/schedule",
                    "priority": "high",
                    "payload": {
                        "conflicts": emp_conflicts
                    }
                })
        
        await self.create_bulk_notifications(notifications)
    
    async def notify_shift_swap_request(self, swap_request: Dict, requester: Dict) -> None:
        """Notify about new shift swap requests"""
        notifications = []
        
        # Notify managers
        managers = await self.db.users.find({"role": {"$in": ["manager", "administrator"]}}).to_list(None)
        for manager in managers:
            notifications.append({
                "user_id": str(manager["_id"]),
                "title": "Shift Swap Request - Pending Approval",
                "message": f"{requester['firstName']} {requester['lastName']} has requested a shift swap",
                "type": "approval_request",
                "link": f"/shift-swaps/{swap_request['_id']}",
                "priority": "normal",
                "requires_action": True,
                "payload": {
                    "swap_request_id": str(swap_request["_id"]),
                    "requester_id": swap_request["requester_id"],
                    "requester_name": f"{requester['firstName']} {requester['lastName']}"
                }
            })
        
        # Notify target employee if specified
        if swap_request.get("target_employee_id"):
            target_employee = await self.db.users.find_one({"_id": ObjectId(swap_request["target_employee_id"])})
            if target_employee:
                notifications.append({
                    "user_id": str(target_employee["_id"]),
                    "title": "Shift Swap Request",
                    "message": f"{requester['firstName']} {requester['lastName']} wants to swap shifts with you",
                    "type": "info",
                    "link": f"/shift-swaps/{swap_request['_id']}",
                    "priority": "normal",
                    "payload": {
                        "swap_request_id": str(swap_request["_id"]),
                        "requester_name": f"{requester['firstName']} {requester['lastName']}"
                    }
                })
        else:
            # Open request - notify eligible employees
            requester_shift = await self.db.schedules.find_one({"_id": ObjectId(swap_request["requester_shift_id"])})
            if requester_shift:
                eligible_employees = await self.db.users.find({
                    "department": requester_shift.get("department"),
                    "role": "employee",
                    "_id": {"$ne": ObjectId(swap_request["requester_id"])}
                }).to_list(None)
                
                for employee in eligible_employees:
                    notifications.append({
                        "user_id": str(employee["_id"]),
                        "title": "Shift Swap Opportunity",
                        "message": f"New shift swap opportunity available for {requester_shift['date']}",
                        "type": "info",
                        "link": f"/shift-swaps/{swap_request['_id']}",
                        "priority": "low",
                        "payload": {
                            "swap_request_id": str(swap_request["_id"]),
                            "shift_date": requester_shift["date"]
                        }
                    })
        
        await self.create_bulk_notifications(notifications)
    
    async def notify_time_off_request(self, time_off_request: Dict, requester: Dict) -> None:
        """Notify managers about time-off requests"""
        notifications = []
        
        managers = await self.db.users.find({"role": {"$in": ["manager", "administrator"]}}).to_list(None)
        for manager in managers:
            days = (datetime.strptime(time_off_request["endDate"], "%Y-%m-%d") - 
                   datetime.strptime(time_off_request["startDate"], "%Y-%m-%d")).days + 1
            
            notifications.append({
                "user_id": str(manager["_id"]),
                "title": "Time-Off Request - Pending Approval",
                "message": f"{requester['firstName']} {requester['lastName']} requested {days} days off",
                "type": "approval_request",
                "link": f"/time-off/{time_off_request['_id']}",
                "priority": "normal",
                "requires_action": True,
                "payload": {
                    "request_id": str(time_off_request["_id"]),
                    "requester_id": str(requester["_id"]),
                    "requester_name": f"{requester['firstName']} {requester['lastName']}",
                    "start_date": time_off_request["startDate"],
                    "end_date": time_off_request["endDate"],
                    "type": time_off_request["type"],
                    "days": days
                }
            })
        
        await self.create_bulk_notifications(notifications)
    
    async def notify_time_off_response(self, time_off_request: Dict, requester: Dict, reviewer: Dict, status: str) -> None:
        """Notify employee about time-off request response"""
        status_messages = {
            "approved": "Your time-off request has been approved",
            "rejected": "Your time-off request has been rejected"
        }
        
        await self.create_notification(
            user_id=str(requester["_id"]),
            title=f"Time-Off Request {status.title()}",
            message=status_messages.get(status, f"Your time-off request status: {status}"),
            type="success" if status == "approved" else "warning",
            link=f"/time-off/{time_off_request['_id']}",
            priority="high",
            payload={
                "request_id": str(time_off_request["_id"]),
                "status": status,
                "reviewer_name": f"{reviewer['firstName']} {reviewer['lastName']}"
            }
        )
    
    async def notify_schedule_reminder(self, employee_id: str, schedule: Dict) -> None:
        """Send upcoming shift reminders"""
        shift_date = datetime.strptime(schedule["date"], "%Y-%m-%d")
        shift_time = datetime.strptime(schedule["startTime"], "%H:%M").time()
        shift_datetime = datetime.combine(shift_date, shift_time)
        
        await self.create_notification(
            user_id=employee_id,
            title="Upcoming Shift Reminder",
            message=f"You have a shift tomorrow at {schedule['startTime']} - {schedule['location']}",
            type="info",
            link="/schedule",
            priority="normal",
            expires_at=shift_datetime,  # Expire after the shift starts
            payload={
                "schedule_id": str(schedule["_id"]),
                "shift_date": schedule["date"],
                "shift_time": schedule["startTime"],
                "location": schedule["location"],
                "role": schedule["role"]
            }
        )
    
    async def notify_attendance_issues(self, issues: List[Dict]) -> None:
        """Notify managers about attendance issues"""
        if not issues:
            return
        
        notifications = []
        managers = await self.db.users.find({"role": {"$in": ["manager", "administrator"]}}).to_list(None)
        
        for manager in managers:
            late_count = len([i for i in issues if i["type"] == "late_arrival"])
            absent_count = len([i for i in issues if i["type"] == "no_show"])
            
            notifications.append({
                "user_id": str(manager["_id"]),
                "title": "Daily Attendance Issues",
                "message": f"{late_count} late arrivals, {absent_count} no-shows today",
                "type": "alert",
                "link": "/attendance",
                "priority": "high" if absent_count > 0 else "normal",
                "requires_action": True,
                "payload": {
                    "issues": issues,
                    "late_count": late_count,
                    "absent_count": absent_count,
                    "date": datetime.now().strftime("%Y-%m-%d")
                }
            })
        
        await self.create_bulk_notifications(notifications)
    
    async def cleanup_expired_notifications(self) -> int:
        """Remove expired notifications"""
        try:
            result = await self.db.notifications.delete_many({
                "expires_at": {"$lt": datetime.utcnow()}
            })
            return result.deleted_count
        except Exception as e:
            print(f"Error cleaning up expired notifications: {e}")
            return 0
    
    def _get_date_range(self, schedules: List[Dict]) -> str:
        """Get human-readable date range for schedules"""
        if not schedules:
            return ""
        
        dates = [datetime.strptime(s["date"], "%Y-%m-%d") for s in schedules]
        min_date = min(dates)
        max_date = max(dates)
        
        if min_date == max_date:
            return min_date.strftime("%B %d")
        else:
            return f"{min_date.strftime('%B %d')} - {max_date.strftime('%B %d')}"


# Global service instance
notification_service = NotificationService()

# Legacy function wrappers for backward compatibility
async def create_notification(
    user_id: str,
    title: str,
    message: str,
    type: str = "info",
    link: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> bool:
    """Legacy wrapper for backward compatibility"""
    return await notification_service.create_notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        link=link,
        payload=payload
    )

async def create_schedule_update_notification(employee_id: str, schedule_id: str, changes: str) -> None:
    """Legacy wrapper for schedule updates"""
    await notification_service.create_notification(
        user_id=employee_id,
        title="Schedule Updated",
        message=f"Your schedule has been updated. {changes}",
        type="schedule_update",
        link="/schedule",
        payload={
            "schedule_id": schedule_id,
            "changes": changes
        }
    )

# Scheduled notification tasks
async def send_daily_shift_reminders():
    """Send reminders for tomorrow's shifts"""
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    db = get_db()
    tomorrow_schedules = await db.schedules.find({
        "date": tomorrow,
        "status": "confirmed"
    }).to_list(None)
    
    for schedule in tomorrow_schedules:
        await notification_service.notify_schedule_reminder(
            employee_id=schedule["employeeId"],
            schedule=schedule
        )

async def cleanup_old_notifications():
    """Daily cleanup of expired notifications"""
    deleted_count = await notification_service.cleanup_expired_notifications()
    print(f"Cleaned up {deleted_count} expired notifications")