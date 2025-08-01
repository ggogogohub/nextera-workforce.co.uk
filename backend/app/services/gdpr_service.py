"""
GDPR Compliance Service
Implements privacy by design principles and data subject rights as required by GDPR.
Provides data access, portability, erasure, and consent management.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from bson import ObjectId
from app.db import get_db
import json
import zipfile
import io
import logging

logger = logging.getLogger(__name__)

class GDPRService:
    """
    Service for handling GDPR compliance requirements including:
    - Right to Access (Article 15)
    - Right to Portability (Article 20)
    - Right to Erasure/Deletion (Article 17)
    - Right to Rectification (Article 16)
    - Privacy by Design principles
    """
    
    def __init__(self):
        self.db = None
    
    def _ensure_db_connection(self):
        """Ensure database connection is established"""
        if self.db is None:
            self.db = get_db()
        
        # Collections that contain personal data
        self.personal_data_collections = [
            "users",
            "schedules", 
            "time_off_requests",
            "messages",
            "notifications",
            "attendance_events",
            "shift_swap_requests",
            "audit_logs"
        ]
    
    async def get_user_data_export(self, user_id: str) -> Dict[str, Any]:
        """
        Article 15 & 20: Right to Access and Data Portability
        Export all personal data for a user in a structured format
        """
        try:
            self._ensure_db_connection()
            if self.db is None:
                raise Exception("Database connection not available")
            
            user_oid = ObjectId(user_id)
            export_data = {
                "export_timestamp": datetime.utcnow().isoformat(),
                "user_id": user_id,
                "data_categories": {}
            }
            
            # Export user profile data
            user = await self.db["users"].find_one({"_id": user_oid})
            if user:
                # Remove sensitive fields from export
                user_data = {k: v for k, v in user.items() if k not in ['password', 'passwordHash']}
                user_data["_id"] = str(user_data["_id"])
                export_data["data_categories"]["profile"] = user_data
            
            # Export schedules
            schedules = await self.db["schedules"].find({"employeeId": user_id}).to_list(None)
            export_data["data_categories"]["schedules"] = [
                {**schedule, "_id": str(schedule["_id"])} if "_id" in schedule else schedule
                for schedule in schedules
            ]
            
            # Export time-off requests
            time_off = await self.db["time_off_requests"].find({"employeeId": user_id}).to_list(None)
            export_data["data_categories"]["time_off_requests"] = [
                {**request, "_id": str(request["_id"])} if "_id" in request else request
                for request in time_off
            ]
            
            # Export attendance events
            attendance = await self.db["attendance_events"].find({"employee_id": user_oid}).to_list(None)
            export_data["data_categories"]["attendance_events"] = [
                {**event, "_id": str(event["_id"]), "employee_id": str(event["employee_id"])}
                if "_id" in event else event
                for event in attendance
            ]
            
            # Export messages (sent and received)
            sent_messages = await self.db["messages"].find({"senderId": user_id}).to_list(None)
            received_messages = await self.db["messages"].find({"recipientId": user_id}).to_list(None)
            export_data["data_categories"]["messages"] = {
                "sent": [{**msg, "_id": str(msg["_id"])} if "_id" in msg else msg for msg in sent_messages],
                "received": [{**msg, "_id": str(msg["_id"])} if "_id" in msg else msg for msg in received_messages]
            }
            
            # Export notifications
            notifications = await self.db["notifications"].find({"userId": user_id}).to_list(None)
            export_data["data_categories"]["notifications"] = [
                {**notif, "_id": str(notif["_id"])} if "_id" in notif else notif
                for notif in notifications
            ]
            
            # Export shift swap requests
            shift_swaps = await self.db["shift_swap_requests"].find({
                "$or": [
                    {"requesterId": user_id},
                    {"targetEmployeeId": user_id}
                ]
            }).to_list(None)
            export_data["data_categories"]["shift_swap_requests"] = [
                {**swap, "_id": str(swap["_id"])} if "_id" in swap else swap
                for swap in shift_swaps
            ]
            
            # Export audit logs related to this user
            audit_logs = await self.db["audit_logs"].find({"userId": user_id}).to_list(None)
            export_data["data_categories"]["audit_logs"] = [
                {**log, "_id": str(log["_id"])} if "_id" in log else log
                for log in audit_logs
            ]
            
            return export_data
            
        except Exception as e:
            logger.error(f"Error exporting user data for {user_id}: {e}")
            raise Exception(f"Failed to export user data: {e}")
    
    async def create_data_export_package(self, user_id: str) -> bytes:
        """
        Create a downloadable ZIP package with all user data
        """
        export_data = await self.get_user_data_export(user_id)
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add main data export as JSON
            zip_file.writestr(
                f"personal_data_export_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
                json.dumps(export_data, indent=2, default=str)
            )
            
            # Add GDPR information document
            gdpr_info = {
                "title": "Your Personal Data Export",
                "description": "This package contains all personal data we have stored about you as required by GDPR Article 15 (Right to Access) and Article 20 (Right to Data Portability).",
                "data_categories_included": list(export_data["data_categories"].keys()),
                "export_date": export_data["export_timestamp"],
                "your_rights": {
                    "rectification": "You have the right to request correction of inaccurate data",
                    "erasure": "You have the right to request deletion of your personal data",
                    "restrict_processing": "You have the right to restrict how we process your data",
                    "object": "You have the right to object to processing of your data",
                    "portability": "You have the right to receive your data in a portable format"
                },
                "contact": "For questions about your data or to exercise your rights, contact your system administrator."
            }
            zip_file.writestr("GDPR_Information.json", json.dumps(gdpr_info, indent=2))
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    async def delete_user_data(self, user_id: str, deletion_reason: str = "User request") -> Dict[str, Any]:
        """
        Article 17: Right to Erasure (Right to be Forgotten)
        Permanently delete all personal data for a user
        """
        try:
            self._ensure_db_connection()
            if self.db is None:
                return {
                    "success": False,
                    "message": "Database connection not available",
                    "deletion_log": None
                }
            
            user_oid = ObjectId(user_id)
            deletion_log = {
                "user_id": user_id,
                "deletion_timestamp": datetime.utcnow().isoformat(),
                "deletion_reason": deletion_reason,
                "deleted_collections": [],
                "anonymized_collections": []
            }
            
            # 1. Delete from users collection
            user_result = await self.db["users"].delete_one({"_id": user_oid})
            if user_result.deleted_count > 0:
                deletion_log["deleted_collections"].append("users")
            
            # 2. Delete schedules
            schedule_result = await self.db["schedules"].delete_many({"employeeId": user_id})
            if schedule_result.deleted_count > 0:
                deletion_log["deleted_collections"].append(f"schedules ({schedule_result.deleted_count} records)")
            
            # 3. Delete time-off requests
            timeoff_result = await self.db["time_off_requests"].delete_many({"employeeId": user_id})
            if timeoff_result.deleted_count > 0:
                deletion_log["deleted_collections"].append(f"time_off_requests ({timeoff_result.deleted_count} records)")
            
            # 4. Delete attendance events
            attendance_result = await self.db["attendance_events"].delete_many({"employee_id": user_oid})
            if attendance_result.deleted_count > 0:
                deletion_log["deleted_collections"].append(f"attendance_events ({attendance_result.deleted_count} records)")
            
            # 5. Delete notifications
            notif_result = await self.db["notifications"].delete_many({"userId": user_id})
            if notif_result.deleted_count > 0:
                deletion_log["deleted_collections"].append(f"notifications ({notif_result.deleted_count} records)")
            
            # 6. Anonymize messages instead of deleting (to preserve conversation context)
            # Update messages sent by this user
            sent_message_update = await self.db["messages"].update_many(
                {"senderId": user_id},
                {"$set": {
                    "senderId": "deleted_user",
                    "sender": {
                        "id": "deleted_user",
                        "firstName": "[Deleted]",
                        "lastName": "[User]", 
                        "email": "deleted@privacy.local",
                        "isActive": False,
                        "anonymized": True
                    },
                    "anonymized": True,
                    "anonymized_date": datetime.utcnow()
                }}
            )
            
            # Update messages received by this user
            received_message_update = await self.db["messages"].update_many(
                {"recipientId": user_id},
                {"$set": {
                    "recipientId": "deleted_user",
                    "recipient": {
                        "id": "deleted_user", 
                        "firstName": "[Deleted]",
                        "lastName": "[User]",
                        "email": "deleted@privacy.local",
                        "isActive": False,
                        "anonymized": True
                    },
                    "anonymized": True,
                    "anonymized_date": datetime.utcnow()
                }}
            )
            
            total_anonymized = sent_message_update.modified_count + received_message_update.modified_count
            if total_anonymized > 0:
                deletion_log["anonymized_collections"].append(f"messages ({total_anonymized} records)")
            
            # 7. Delete shift swap requests
            swap_result = await self.db["shift_swap_requests"].delete_many({
                "$or": [{"requesterId": user_id}, {"targetEmployeeId": user_id}]
            })
            if swap_result.deleted_count > 0:
                deletion_log["deleted_collections"].append(f"shift_swap_requests ({swap_result.deleted_count} records)")
            
            # 8. Create deletion audit log
            await self.db["audit_logs"].insert_one({
                "action": "gdpr_data_deletion",
                "user_id": user_id,
                "timestamp": datetime.utcnow(),
                "details": deletion_log,
                "ip_address": "system",
                "user_agent": "GDPR Service"
            })
            
            return {
                "success": True,
                "message": "User data successfully deleted",
                "deletion_log": deletion_log
            }
            
        except Exception as e:
            logger.error(f"Error deleting user data for {user_id}: {e}")
            return {
                "success": False,
                "message": f"Failed to delete user data: {e}",
                "deletion_log": None
            }
    
    async def get_data_processing_activities(self, user_id: str) -> Dict[str, Any]:
        """
        Article 13/14: Information about data processing activities
        """
        return {
            "data_controller": {
                "organization": "NextEra Workforce Management System",
                "contact": "privacy@nextera.local"
            },
            "processing_purposes": {
                "workforce_management": "Managing work schedules, attendance, and time-off",
                "communication": "Internal messaging and notifications",
                "analytics": "Workforce analytics and reporting for business operations",
                "compliance": "Meeting regulatory and audit requirements"
            },
            "legal_basis": {
                "employment_contract": "Processing necessary for employment relationship",
                "legitimate_interest": "Business operations and workforce management"
            },
            "data_categories": {
                "identification": ["name", "email", "employee_id"],
                "contact": ["phone_number", "emergency_contact"],
                "employment": ["role", "department", "skills", "availability"],
                "activity": ["schedules", "attendance", "time_off", "messages"]
            },
            "retention_periods": {
                "active_employment": "Duration of employment",
                "post_employment": "7 years for legal compliance",
                "anonymized_analytics": "Indefinite (anonymized data)"
            },
            "your_rights": {
                "access": "Request copy of your personal data",
                "rectification": "Request correction of inaccurate data",
                "erasure": "Request deletion of your data",
                "restrict": "Request restriction of processing",
                "portability": "Request data in portable format",
                "object": "Object to processing based on legitimate interest"
            }
        }
    
    async def anonymize_user_data(self, user_id: str) -> Dict[str, Any]:
        """
        Alternative to deletion: Anonymize data while preserving analytics value
        """
        try:
            self._ensure_db_connection()
            if self.db is None:
                return {
                    "success": False,
                    "message": "Database connection not available"
                }
            
            user_oid = ObjectId(user_id)
            anonymization_log = {
                "user_id": user_id,
                "anonymization_timestamp": datetime.utcnow().isoformat(),
                "anonymized_collections": []
            }
            
            # Generate anonymous identifier
            anon_id = f"anon_{datetime.now().strftime('%Y%m%d')}_{hash(user_id) % 10000:04d}"
            
            # Anonymize user profile and mark as inactive
            await self.db["users"].update_one(
                {"_id": user_oid},
                {"$set": {
                    "firstName": "Anonymous",
                    "lastName": "User",
                    "email": f"{anon_id}@anonymized.local",
                    "phoneNumber": None,
                    "emergencyContact": None,
                    "isActive": False,  # Mark anonymized users as inactive to exclude from scheduling
                    "anonymized": True,
                    "anonymization_date": datetime.utcnow(),
                    "original_id": user_id
                }}
            )
            anonymization_log["anonymized_collections"].append("users")
            
            # Anonymize schedules (keep for analytics but remove personal identifiers)
            await self.db["schedules"].update_many(
                {"employeeId": user_id},
                {"$set": {
                    "employeeId": anon_id,
                    "anonymized": True
                }}
            )
            anonymization_log["anonymized_collections"].append("schedules")
            
            # Delete personal communications and requests
            await self.db["messages"].delete_many({"$or": [{"senderId": user_id}, {"recipientId": user_id}]})
            await self.db["time_off_requests"].delete_many({"employeeId": user_id})
            await self.db["notifications"].delete_many({"userId": user_id})
            
            return {
                "success": True,
                "message": "User data successfully anonymized",
                "anonymous_id": anon_id,
                "anonymization_log": anonymization_log
            }
            
        except Exception as e:
            logger.error(f"Error anonymizing user data for {user_id}: {e}")
            return {
                "success": False,
                "message": f"Failed to anonymize user data: {e}"
            }

# Global service instance
gdpr_service = GDPRService() 