import os
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB Setup
client = None
db = None

def init_db(app):
    global client, db
    MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/employee_scheduling")
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client.get_default_database()
    app.state.db = db

def get_db():
    return db
