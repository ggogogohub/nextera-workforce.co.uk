import os # os needs to be imported before dotenv for getenv to work as expected in some cases
from dotenv import load_dotenv
load_dotenv() # Load .env file at the very beginning

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import init_db
from app.routes import (
    auth, users, schedules, time_off, messages, analytics,
    dashboard, roles, teams, reports, profile, notifications,
    scheduling_constraints, locations, attendance, gdpr, audit, shift_swaps, health
)
from app.services.token_cleanup import start_token_cleanup, stop_token_cleanup
import logging
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.middleware.error_handler import ErrorHandlerMiddleware


app = FastAPI(
    title="Employee Scheduling System API",
    description="A comprehensive API for employee scheduling, time-off management, and workforce analytics",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    await start_token_cleanup()
    logging.info("Application startup completed")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup services on shutdown"""
    await stop_token_cleanup()
    logging.info("Application shutdown completed")

# CORS configuration—explicit origin list is mandatory when allow_credentials=True.
# Multiple origins can be provided via the CORS_ORIGINS environment variable, comma-separated.
cors_origins_str = os.getenv("CORS_ORIGINS", "http://localhost:8080")
cors_origins = [origin.strip() for origin in cors_origins_str.split(",")]
print(f"DEBUG: Configuring CORS for origins: {cors_origins}") # DEBUG LINE

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins, # Use the processed list
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Basic IP rate limiting (configurable via RATE_LIMIT / RATE_LIMIT_WINDOW env vars)
app.add_middleware(RateLimiterMiddleware)

# Add error handler middleware (after CORS so errors get CORS headers)
app.add_middleware(ErrorHandlerMiddleware)

# Initialize Database
init_db(app)

# Include health check routes (comprehensive monitoring)
app.include_router(health.router, tags=["Health"])

@app.get("/")
async def root():
    return {
        "message": "Welcome to Employee Scheduling System API",
        "docs": "/docs",
        "health": "/health"
    }

# Include routers with proper /api prefix
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(schedules.router, prefix="/api/schedules", tags=["Schedules"])
app.include_router(time_off.router, prefix="/api/time-off", tags=["Time Off"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(roles.router, prefix="/api/roles", tags=["Roles"])
app.include_router(teams.router, prefix="/api/teams", tags=["Teams"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
# Scheduling constraints (AI roster templates)
app.include_router(scheduling_constraints.router, prefix="/api/scheduling-constraints", tags=["Scheduling Constraints"])
app.include_router(locations.router, prefix="/api/locations", tags=["Locations"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["Attendance"])
app.include_router(gdpr.router, prefix="/api/gdpr", tags=["GDPR Compliance"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit Logs"])
app.include_router(shift_swaps.router, prefix="/api/shift-swaps", tags=["Shift Swaps"])

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
