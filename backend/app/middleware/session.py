from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
import time

class SessionMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, timeout: int = 1800):
        super().__init__(app)
        self.timeout = timeout
        self.sessions = {}

    async def dispatch(self, request: Request, call_next):
        session_id = request.cookies.get("session_id")
        now = time.time()
        if session_id in self.sessions and now - self.sessions[session_id] > self.timeout:
            response = JSONResponse(status_code=401, content={"success": False, "error": {"code": "SESSION_EXPIRED", "message": "Session expired"}})
            return response
        response = await call_next(request)
        if session_id:
            self.sessions[session_id] = now
        return response
