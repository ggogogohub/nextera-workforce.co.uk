import asyncio
from datetime import datetime, timedelta
from app.services.token_service import cleanup_expired_tokens
from app.utils.logger import log_event
import logging

logger = logging.getLogger(__name__)

class TokenCleanupService:
    def __init__(self, cleanup_interval_hours: int = 24):
        self.cleanup_interval_hours = cleanup_interval_hours
        self.is_running = False
        self.task = None

    async def start(self):
        """Start the token cleanup background task"""
        if self.is_running:
            return
        
        self.is_running = True
        self.task = asyncio.create_task(self._cleanup_loop())
        logger.info("Token cleanup service started")

    async def stop(self):
        """Stop the token cleanup background task"""
        if not self.is_running:
            return
        
        self.is_running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("Token cleanup service stopped")

    async def _cleanup_loop(self):
        """Main cleanup loop"""
        while self.is_running:
            try:
                await cleanup_expired_tokens()
                await log_event("token_cleanup_completed", {
                    "timestamp": datetime.utcnow().isoformat()
                })
                logger.info("Token cleanup completed successfully")
            except Exception as e:
                logger.error(f"Error during token cleanup: {e}")
                await log_event("token_cleanup_error", {
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })
            
            # Wait for the next cleanup interval
            await asyncio.sleep(self.cleanup_interval_hours * 3600)

# Global instance
token_cleanup_service = TokenCleanupService()

async def start_token_cleanup():
    """Start the token cleanup service"""
    await token_cleanup_service.start()

async def stop_token_cleanup():
    """Stop the token cleanup service"""
    await token_cleanup_service.stop()
