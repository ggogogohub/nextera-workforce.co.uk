import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.schemas.user import UserOut
import json

async def debug_user_schema():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['employee_scheduling']
    
    print("🔍 Debugging User Schema")
    print("=" * 40)
    
    # Get the admin user
    user = await db['users'].find_one({'email': 'admin@company.com'})
    if user:
        print("Raw user data from database:")
        print(json.dumps(user, indent=2, default=str))
        
        print("\nTrying to create UserOut schema...")
        
        # Add the id field as expected by the schema
        user["id"] = str(user["_id"])
        
        try:
            user_out = UserOut(**user)
            print("✅ UserOut schema created successfully")
            print(f"User ID: {user_out.id}")
            print(f"Email: {user_out.email}")
        except Exception as e:
            print(f"❌ UserOut schema creation failed: {e}")
            print(f"Error type: {type(e)}")
            
            # Check which fields are missing or invalid
            required_fields = ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'createdAt']
            print("\nChecking required fields:")
            for field in required_fields:
                if field in user:
                    print(f"  ✅ {field}: {user[field]} ({type(user[field])})")
                else:
                    print(f"  ❌ {field}: MISSING")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(debug_user_schema())
