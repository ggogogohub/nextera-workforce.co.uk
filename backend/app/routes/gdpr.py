"""
GDPR Compliance API Routes
Provides endpoints for data subject rights as required by GDPR
"""

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from typing import Dict, Any
from datetime import datetime
from app.utils.auth import get_current_user
from app.services.gdpr_service import gdpr_service
import io
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["GDPR Compliance"])

@router.get("/my-data", response_model=Dict[str, Any])
async def get_my_personal_data(
    current_user: dict = Depends(get_current_user)
):
    """
    Article 15: Right to Access
    Get all personal data for the current user
    """
    try:
        user_id = str(current_user["_id"])
        data = await gdpr_service.get_user_data_export(user_id)
        return {
            "success": True,
            "message": "Personal data retrieved successfully",
            "data": data
        }
    except Exception as e:
        logger.error(f"Error retrieving personal data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve personal data: {e}")

@router.get("/export-data")
async def export_personal_data(
    current_user: dict = Depends(get_current_user)
):
    """
    Article 20: Right to Data Portability
    Download all personal data as a ZIP package
    """
    try:
        user_id = str(current_user["_id"])
        zip_data = await gdpr_service.create_data_export_package(user_id)
        
        filename = f"personal_data_export_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        
        return StreamingResponse(
            io.BytesIO(zip_data),
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Error exporting personal data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export personal data: {e}")

@router.delete("/delete-my-data")
async def request_data_deletion(
    current_user: dict = Depends(get_current_user)
):
    """
    Article 17: Right to Erasure (Right to be Forgotten)
    Request deletion of all personal data
    """
    try:
        user_id = str(current_user["_id"])
        result = await gdpr_service.delete_user_data(user_id, "User self-service request")
        
        if result["success"]:
            return {
                "success": True,
                "message": "Your personal data has been permanently deleted",
                "deletion_log": result["deletion_log"]
            }
        else:
            raise HTTPException(status_code=500, detail=result["message"])
            
    except Exception as e:
        logger.error(f"Error deleting personal data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete personal data: {e}")

@router.get("/data-processing-info")
async def get_data_processing_information(
    current_user: dict = Depends(get_current_user)
):
    """
    Article 13/14: Information about Data Processing
    Get information about how personal data is processed
    """
    try:
        user_id = str(current_user["_id"])
        info = await gdpr_service.get_data_processing_activities(user_id)
        return {
            "success": True,
            "message": "Data processing information retrieved",
            "processing_info": info
        }
    except Exception as e:
        logger.error(f"Error retrieving processing info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve processing information: {e}")

@router.post("/anonymize-my-data")
async def request_data_anonymization(
    current_user: dict = Depends(get_current_user)
):
    """
    Alternative to deletion: Anonymize data while preserving analytics
    """
    try:
        user_id = str(current_user["_id"])
        result = await gdpr_service.anonymize_user_data(user_id)
        
        if result["success"]:
            return {
                "success": True,
                "message": "Your personal data has been anonymized",
                "anonymous_id": result["anonymous_id"],
                "anonymization_log": result["anonymization_log"]
            }
        else:
            raise HTTPException(status_code=500, detail=result["message"])
            
    except Exception as e:
        logger.error(f"Error anonymizing personal data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to anonymize personal data: {e}")

# Admin-only endpoints for managing data requests
@router.delete("/admin/delete-user/{user_id}")
async def admin_delete_user_data(
    user_id: str,
    deletion_reason: str = "Admin request",
    current_user: dict = Depends(get_current_user)
):
    """
    Admin endpoint to delete user data for compliance requests
    """
    # Check admin permissions
    if current_user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Administrator access required")
    
    try:
        result = await gdpr_service.delete_user_data(user_id, deletion_reason)
        
        if result["success"]:
            return {
                "success": True,
                "message": f"User data for {user_id} has been permanently deleted",
                "deletion_log": result["deletion_log"]
            }
        else:
            raise HTTPException(status_code=500, detail=result["message"])
            
    except Exception as e:
        logger.error(f"Error deleting user data (admin): {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user data: {e}")

@router.get("/admin/export-user/{user_id}")
async def admin_export_user_data(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Admin endpoint to export user data for compliance requests
    """
    # Check admin permissions
    if current_user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Administrator access required")
    
    try:
        zip_data = await gdpr_service.create_data_export_package(user_id)
        
        filename = f"admin_export_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        
        return StreamingResponse(
            io.BytesIO(zip_data),
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Error exporting user data (admin): {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export user data: {e}") 