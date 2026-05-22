"""
Async SQLAlchemy engine, session factory, and FastAPI dependency for database access.

The engine is created lazily — importing this module does not require the database
to be running or DATABASE_URL to point to a live server.
"""

import os
import ssl
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# Read DATABASE_URL from the environment; fall back to a sensible local default.
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://localhost/grocery_getter",
)

# Build connect_args — Supabase (and most cloud PostgreSQL) requires SSL
connect_args = {}
if "supabase.co" in DATABASE_URL or os.getenv("DB_SSL", "").lower() == "true":
    ssl_context = ssl.create_default_context()
    connect_args["ssl"] = ssl_context

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=connect_args,
)

# Session factory — `expire_on_commit=False` prevents lazy-load errors after commit
# in async contexts where the session may already be closed.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base class for all ORM models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an AsyncSession for the duration of a request
    and ensures the session is closed afterwards.

    Usage::

        @router.get("/items")
        async def list_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        yield session
