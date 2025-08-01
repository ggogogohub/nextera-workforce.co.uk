import traceback
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import ValidationError
from fastapi.exceptions import HTTPException

class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)

        except ValidationError as ve:
            return JSONResponse(
                status_code=422,
                content={
                    "success": False,
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": str(ve),
                        "details": ve.errors()
                    }
                },
            )

        except HTTPException as he:
            return JSONResponse(
                status_code=he.status_code,
                content={
                    "success": False,
                    "error": {
                        "code": "HTTP_EXCEPTION",
                        "message": he.detail
                    }
                },
            )

        except Exception as e:
            # ✅ TEMP: Print full traceback to console for debugging
            print("\n🔥 INTERNAL SERVER ERROR 🔥")
            traceback.print_exc()
            print("Exception message:", str(e), "\n")

            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "An internal error occurred."
                    }
                },
            )
