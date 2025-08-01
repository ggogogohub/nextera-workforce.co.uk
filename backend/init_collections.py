#!/usr/bin/env python3
"""
Initialize MongoDB collections for token management system
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta

async def init_collections():
    # Connect to MongoDB
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongodb_url)
    db = client["employee_scheduling"]
    
    print("🔧 Initializing MongoDB collections for token management...")
    
    # Create blacklisted_tokens collection with TTL index
    try:
        await db.create_collection("blacklisted_tokens")
        print("✅ Created blacklisted_tokens collection")
    except Exception as e:
        if "already exists" in str(e):
            print("ℹ️  blacklisted_tokens collection already exists")
        else:
            print(f"❌ Error creating blacklisted_tokens collection: {e}")
    
    # Create TTL index on blacklisted_tokens
    try:
        await db["blacklisted_tokens"].create_index(
            "expiresAt", 
            expireAfterSeconds=0,
            name="ttl_index"
        )
        print("✅ Created TTL index on blacklisted_tokens.expiresAt")
    except Exception as e:
        print(f"ℹ️  TTL index on blacklisted_tokens: {e}")
    
    # Create index on tokenId for fast lookups
    try:
        await db["blacklisted_tokens"].create_index(
            "tokenId", 
            unique=True,
            name="tokenId_index"
        )
        print("✅ Created unique index on blacklisted_tokens.tokenId")
    except Exception as e:
        print(f"ℹ️  Index on tokenId: {e}")
    
    # Create refresh_tokens collection with TTL index
    try:
        await db.create_collection("refresh_tokens")
        print("✅ Created refresh_tokens collection")
    except Exception as e:
        if "already exists" in str(e):
            print("ℹ️  refresh_tokens collection already exists")
        else:
            print(f"❌ Error creating refresh_tokens collection: {e}")
    
    # Create TTL index on refresh_tokens
    try:
        await db["refresh_tokens"].create_index(
            "expiresAt", 
            expireAfterSeconds=0,
            name="ttl_index"
        )
        print("✅ Created TTL index on refresh_tokens.expiresAt")
    except Exception as e:
        print(f"ℹ️  TTL index on refresh_tokens: {e}")
    
    # Create index on tokenId for fast lookups
    try:
        await db["refresh_tokens"].create_index(
            "tokenId", 
            unique=True,
            name="tokenId_index"
        )
        print("✅ Created unique index on refresh_tokens.tokenId")
    except Exception as e:
        print(f"ℹ️  Index on tokenId: {e}")
    
    # Create index on userId for user token lookups
    try:
        await db["refresh_tokens"].create_index(
            "userId",
            name="userId_index"
        )
        print("✅ Created index on refresh_tokens.userId")
    except Exception as e:
        print(f"ℹ️  Index on userId: {e}")
    
    # Verify collections exist
    collections = await db.list_collection_names()
    print(f"\n📋 Available collections: {collections}")
    
    # Show indexes
    print("\n🔍 Indexes on blacklisted_tokens:")
    async for index in db["blacklisted_tokens"].list_indexes():
        print(f"   - {index}")
    
    print("\n🔍 Indexes on refresh_tokens:")
    async for index in db["refresh_tokens"].list_indexes():
        print(f"   - {index}")
    
    print("\n✅ MongoDB collections initialized successfully!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(init_collections())
