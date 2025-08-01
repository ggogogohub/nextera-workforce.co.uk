import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_users():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['employee_scheduling']
    
    users = await db['users'].find({}).to_list(None)
    print('Users in database:')
    for user in users:
        print(f'  - ID: {user["_id"]}, Email: {user["email"]}')
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_users())
