import asyncio
import os
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import pool

from alembic import context

# Alembic Config object — provides access to values in alembic.ini.
config = context.config

# Set up Python logging from the ini file.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Import Base and all models so Alembic can detect the full schema.
# ---------------------------------------------------------------------------
from backend.db import Base  # noqa: E402
import backend.models  # noqa: E402, F401  — registers all ORM models on Base.metadata

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Resolve the database URL.
# Priority: DATABASE_URL env var → alembic.ini sqlalchemy.url fallback.
# ---------------------------------------------------------------------------
def get_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    # Fall back to whatever is in alembic.ini (may still contain the
    # %(DATABASE_URL)s placeholder if the env var is not set).
    return config.get_main_option("sqlalchemy.url")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no live DB connection required).

    Alembic emits SQL to stdout / a file rather than executing it directly.
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations using an async engine (required for asyncpg)."""
    url = get_url()
    connectable = create_async_engine(url, poolclass=pool.NullPool)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online migrations — runs the async coroutine."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
