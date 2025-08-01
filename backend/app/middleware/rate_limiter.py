from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, HTTPException
import os
import time
import logging

# Optional Redis support – falls back to lightweight in-memory counters if not
# available, so the application can still run in development.

logger = logging.getLogger(__name__)


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Simple IP-based rate limiter.

    Production – uses Redis for distributed rate limiting (set REDIS_URL).
    Development – falls back to in-process dictionary so devs don't have to
    run Redis locally.
    """

    _local_cache: dict[str, list[float]] = {}
    _redis_unavailable: bool = False  # Cache Redis health to avoid log spam

    async def dispatch(self, request: Request, call_next):
        # Allow disabling in development quickly
        if os.getenv("DISABLE_RATE_LIMIT", "0") == "1":
            return await call_next(request)

        # Do not rate-limit CORS pre-flight requests which are always OPTIONS
        if request.method == "OPTIONS":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"

        limit = int(os.getenv("RATE_LIMIT", "240"))  # default higher for dev ease
        window_seconds = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # seconds

        redis_url = os.getenv("REDIS_URL")

        # ------------------------------------------------------------------
        # Redis-backed strategy (preferred for multi-instance deployments)
        # ------------------------------------------------------------------
        if redis_url and not self._redis_unavailable:
            try:
                import aioredis  # Local import so project still works w/o Redis

                redis = await aioredis.from_url(redis_url)
                key = f"rate:{client_ip}"

                current = await redis.get(key)
                if current and int(current) >= limit:
                    raise HTTPException(status_code=429, detail="Too Many Requests")

                # Use pipeline (transaction) for atomicity
                tx = redis.pipeline()
                tx.incr(key)
                tx.expire(key, window_seconds)
                await tx.execute()

                return await call_next(request)

            except Exception as exc:  # noqa: broad-except (Redis down/etc.)
                if not self._redis_unavailable:
                    # Log only the first failure to keep logs clean if Redis stays down.
                    logger.warning(
                        "RateLimiter: Redis unavailable – falling back to in-memory store (%s)",
                        exc,
                    )
                # Mark Redis as unavailable for the remainder of the process lifetime.
                self._redis_unavailable = True
                # Fall through to in-memory fallback

        # ------------------------------------------------------------------
        # In-memory fallback (single-instance / development only)
        # ------------------------------------------------------------------
        now = time.time()
        window_start = now - window_seconds

        # Purge old timestamps for this IP
        timestamps = self._local_cache.get(client_ip, [])
        timestamps = [ts for ts in timestamps if ts > window_start]

        if len(timestamps) >= limit:
            raise HTTPException(status_code=429, detail="Too Many Requests")

        timestamps.append(now)
        self._local_cache[client_ip] = timestamps

        return await call_next(request)
