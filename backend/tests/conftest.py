# tests/conftest.py
import os
import pytest
from fastapi.testclient import TestClient
from dotenv import load_dotenv
from app.db import init_db
from main import app
import aioredis
from unittest.mock import AsyncMock

# Set environment variables for testing
os.environ["SECRET_KEY"] = "testing_secret_key_for_development_only"

# Mock Redis for tests
class MockRedis:
    async def get(self, key):
        return "0"
    
    async def incr(self, key):
        return 1
    
    async def expire(self, key, seconds):
        return True
    
    def pipeline(self):
        return self
        
    # Make these methods synchronous for pipeline operations
    def incr(self, key):
        return 1
        
    def expire(self, key, seconds):
        return True

    async def execute(self):
        return [1, True]

# Patch aioredis.from_url to return our mock
original_from_url = aioredis.from_url
aioredis.from_url = AsyncMock(return_value=MockRedis())

load_dotenv()
init_db(app)

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c
        
    # Restore original function after tests
    aioredis.from_url = original_from_url