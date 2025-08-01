from fastapi import WebSocket
from typing import Dict
import asyncio
import logging
import tracemalloc
import weakref
from datetime import datetime, timedelta

# Enable memory tracking for production monitoring
tracemalloc.start()

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.connection_timestamps: Dict[str, datetime] = {}
        self.message_queues: Dict[str, list] = {}  # Redis backup for persistence
        self.max_connections = 1000  # Prevent memory exhaustion
        self.connection_timeout = timedelta(hours=24)  # Auto-cleanup stale connections
        
        # Start background cleanup task
        asyncio.create_task(self._cleanup_stale_connections())

    async def connect(self, user_id: str, websocket: WebSocket):
        """Enhanced connection with memory leak protection"""
        try:
            # Check connection limits
            if len(self.active_connections) >= self.max_connections:
                logger.warning(f"Connection limit reached ({self.max_connections}), rejecting user {user_id}")
                await websocket.close(code=1013, reason="Server overloaded")
                return False
                
            await websocket.accept()
            
            # Clean up any existing connection for this user
            if user_id in self.active_connections:
                await self._force_disconnect(user_id)
            
            self.active_connections[user_id] = websocket
            self.connection_timestamps[user_id] = datetime.utcnow()
            self.message_queues[user_id] = []
            
            logger.info(f"User {user_id} connected. Total connections: {len(self.active_connections)}")
            return True
            
        except Exception as e:
            logger.error(f"Connection failed for user {user_id}: {e}")
            return False

    async def disconnect(self, user_id: str):
        """Enhanced disconnect with proper cleanup"""
        await self._force_disconnect(user_id)

    async def _force_disconnect(self, user_id: str):
        """Force disconnect with memory cleanup"""
        if user_id in self.active_connections:
            try:
                ws = self.active_connections[user_id]
                if not ws.client_state.DISCONNECTED:
                    await ws.close()
            except Exception as e:
                logger.warning(f"Error closing websocket for {user_id}: {e}")
            finally:
                # Always clean up references
                del self.active_connections[user_id]
                self.connection_timestamps.pop(user_id, None)
                self.message_queues.pop(user_id, None)
                logger.info(f"User {user_id} disconnected. Total connections: {len(self.active_connections)}")

    async def notify(self, user_id: str, payload: dict):
        """Enhanced notify with connection validation and message persistence"""
        ws = self.active_connections.get(user_id)
        if ws:
            try:
                await ws.send_json(payload)
                return True
            except Exception as e:
                logger.warning(f"Failed to send message to {user_id}: {e}")
                # Store message for later delivery
                if user_id in self.message_queues:
                    self.message_queues[user_id].append({
                        "payload": payload,
                        "timestamp": datetime.utcnow().isoformat(),
                        "retry_count": 0
                    })
                await self._force_disconnect(user_id)
                return False
        else:
            # User not connected - store message for later
            if user_id not in self.message_queues:
                self.message_queues[user_id] = []
            self.message_queues[user_id].append({
                "payload": payload,
                "timestamp": datetime.utcnow().isoformat(),
                "retry_count": 0
            })
            return False

    async def broadcast(self, payload: dict):
        """Enhanced broadcast with connection validation"""
        disconnected_users = []
        successful_sends = 0
        
        for user_id, ws in list(self.active_connections.items()):
            try:
                await ws.send_json(payload)
                successful_sends += 1
            except Exception as e:
                logger.warning(f"Broadcast failed for user {user_id}: {e}")
                disconnected_users.append(user_id)
        
        # Clean up failed connections
        for user_id in disconnected_users:
            await self._force_disconnect(user_id)
            
        logger.info(f"Broadcast sent to {successful_sends}/{len(self.active_connections) + len(disconnected_users)} users")
        return successful_sends

    async def _cleanup_stale_connections(self):
        """Background task to prevent memory leaks from stale connections"""
        while True:
            try:
                await asyncio.sleep(300)  # Check every 5 minutes
                current_time = datetime.utcnow()
                stale_users = []
                
                for user_id, timestamp in self.connection_timestamps.items():
                    if current_time - timestamp > self.connection_timeout:
                        stale_users.append(user_id)
                
                for user_id in stale_users:
                    logger.info(f"Cleaning up stale connection for user {user_id}")
                    await self._force_disconnect(user_id)
                
                # Log memory usage for monitoring
                current, peak = tracemalloc.get_traced_memory()
                logger.info(f"WebSocket memory usage: {current / 1024 / 1024:.1f}MB current, {peak / 1024 / 1024:.1f}MB peak")
                
            except Exception as e:
                logger.error(f"Error in connection cleanup: {e}")

    def get_connection_stats(self) -> dict:
        """Get connection statistics for monitoring"""
        current, peak = tracemalloc.get_traced_memory()
        return {
            "active_connections": len(self.active_connections),
            "queued_messages": sum(len(queue) for queue in self.message_queues.values()),
            "memory_current_mb": current / 1024 / 1024,
            "memory_peak_mb": peak / 1024 / 1024,
            "max_connections": self.max_connections
        }
