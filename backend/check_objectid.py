from bson import ObjectId
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_objectid():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['employee_scheduling']
    
    # Check actual ObjectId format
    user = await db['users'].find_one({'email': 'admin@company.com'})
    if user:
        print(f'Actual ObjectId: {user["_id"]}')
        print(f'ObjectId type: {type(user["_id"])}')
        print(f'ObjectId as string: {str(user["_id"])}')
        print(f'String length: {len(str(user["_id"]))}')
        
        # Test if the hardcoded ID is valid
        test_id = '60f7b3b3b3b3b3b3b3b3b3b1'
        print(f'Test ID: {test_id}')
        print(f'Test ID length: {len(test_id)}')
        
        try:
            oid = ObjectId(test_id)
            print(f'Test ID as ObjectId: {oid}')
        except Exception as e:
            print(f'Test ID ObjectId error: {e}')
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_objectid())
