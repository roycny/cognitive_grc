"""
Centralized rate-limiter configuration.

Import `limiter` from here in any router to apply per-endpoint limits:

    from app.rate_limit import limiter

    @router.get("/example")
    @limiter.limit("10/minute")
    async def example(request: Request):
        ...
"""

import os
from slowapi import Limiter
from slowapi.util import get_remote_address

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute"],     # global fallback for all routes
    storage_uri=REDIS_URL,            # backed by Redis for multi-worker support
)
