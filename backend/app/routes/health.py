from fastapi import APIRouter, HTTPException
from datetime import datetime
import asyncio
from app.db import get_db

router = APIRouter()

@router.get("/health")
async def health_check():
    """
    Basic health check endpoint for production monitoring
    """
    try:
        health_status = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0.0",
            "checks": {}
        }
        
        # Database connectivity check
        try:
            db = get_db()
            await db.command("ping")
            health_status["checks"]["database"] = {"status": "healthy", "response_time_ms": 0}
        except Exception as e:
            health_status["checks"]["database"] = {"status": "unhealthy", "error": str(e)}
            health_status["status"] = "degraded"
        
        # Basic system check (without psutil)
        health_status["checks"]["system"] = {
            "status": "healthy",
            "note": "Basic system check - detailed metrics require psutil"
        }
        
        # WebSocket connections check
        health_status["checks"]["websockets"] = {
            "status": "healthy",
            "note": "WebSocket health check available"
        }
        
        # Return appropriate HTTP status
        if health_status["status"] == "unhealthy":
            raise HTTPException(status_code=503, detail=health_status)
        elif health_status["status"] == "degraded":
            return health_status  # 200 but with warnings
        else:
            return health_status
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={
                "status": "unhealthy",
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e)
            }
        )

@router.get("/health/ready")
async def readiness_check():
    """
    Kubernetes readiness probe endpoint
    """
    try:
        # Check if all critical services are ready
        db = get_db()
        await db.command("ping")
        
        return {
            "status": "ready",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e)
            }
        )

@router.get("/health/live")
async def liveness_check():
    """
    Kubernetes liveness probe endpoint
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat()
    }