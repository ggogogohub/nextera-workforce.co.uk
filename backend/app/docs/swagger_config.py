from fastapi.openapi.utils import get_openapi
from fastapi import FastAPI

def custom_openapi(app: FastAPI):
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="ShiftSync API",
        version="1.0.0",
        description="Auto-generated API documentation for ShiftSync backend.",
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema
