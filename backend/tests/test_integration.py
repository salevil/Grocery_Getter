"""
Integration test: full shopping trip flow.

Uses an in-memory SQLite database (via aiosqlite) so no live PostgreSQL
instance is required.  Each test function gets a fresh database via the
function-scoped fixture.

Requirements covered: 1.1, 2.1, 4.1, 5.1, 6.1, 7.1, 8.1, 10.1
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Import Base and all models so metadata is fully populated before create_all
from backend.db import Base, get_db
import backend.models  # noqa: F401 — registers all ORM models on Base.metadata
from backend.main import app

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SQLITE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Create a fresh in-memory SQLite database for each test."""
    engine = create_async_engine(SQLITE_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession):
    """
    Return an AsyncClient wired to the FastAPI app with the DB dependency
    overridden to use the in-memory SQLite session.
    """

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Full shopping trip integration test
# ---------------------------------------------------------------------------


async def test_full_shopping_trip(client: AsyncClient):
    """
    End-to-end flow:
      1. Register a user → get JWT                    (Req 1.1)
      2. Create a household                           (Req 2.1)
      3. Add a store                                  (Req 4.1)
      4. Create a product (manual entry, no photo)    (Req 5.1)
      5. Add the product to the shopping list         (Req 6.1)
      6. Verify the list contains the item in the
         correct store section                        (Req 7.1)
      7. Check off the item (PATCH checked=True)      (Req 8.1)
      8. Clear checked items                          (Req 10.1)
      9. Verify the list is empty after clearing
    """

    # ------------------------------------------------------------------
    # 1. Register a user → get JWT
    # ------------------------------------------------------------------
    resp = await client.post(
        "/api/auth/register",
        json={"email": "shopper@example.com", "password": "securepass123"},
    )
    assert resp.status_code == 201, resp.text
    token_no_household = resp.json()["access_token"]

    # ------------------------------------------------------------------
    # 2. Create a household
    # ------------------------------------------------------------------
    resp = await client.post(
        "/api/auth/households",
        json={"name": "Test Household"},
        headers=auth_headers(token_no_household),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    household_id = data["household"]["id"]
    token = data["token"]["access_token"]  # JWT now includes household_id

    assert household_id is not None

    # ------------------------------------------------------------------
    # 3. Add a store
    # ------------------------------------------------------------------
    resp = await client.post(
        "/api/catalog/stores",
        json={"name": "Whole Foods"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    store_id = resp.json()["id"]

    # ------------------------------------------------------------------
    # 4. Create a product (manual entry, no photo) via multipart form
    # ------------------------------------------------------------------
    resp = await client.post(
        "/api/catalog/products",
        data={
            "name": "Organic Oat Milk",
            "brand": "Oatly",
            "quantity": "1L",
            "store_id": str(store_id),
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    product = resp.json()
    product_id = product["id"]
    assert product["name"] == "Organic Oat Milk"
    assert product["store_id"] == store_id

    # ------------------------------------------------------------------
    # 5. Add the product to the shopping list
    # ------------------------------------------------------------------
    resp = await client.post(
        "/api/lists/items",
        json={"product_id": product_id, "quantity": 2},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    list_item = resp.json()
    item_id = list_item["id"]
    assert list_item["product_id"] == product_id
    assert list_item["quantity"] == 2
    assert list_item["checked"] is False

    # ------------------------------------------------------------------
    # 6. Verify the list contains the item in the correct store section
    # ------------------------------------------------------------------
    resp = await client.get("/api/lists", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    shopping_list = resp.json()

    sections = shopping_list["sections"]
    assert len(sections) == 1, f"Expected 1 section, got {len(sections)}: {sections}"

    section = sections[0]
    assert section["store_id"] == store_id
    assert section["store_name"] == "Whole Foods"
    assert len(section["items"]) == 1
    assert section["items"][0]["id"] == item_id

    # ------------------------------------------------------------------
    # 7. Check off the item (PATCH checked=True)
    # ------------------------------------------------------------------
    resp = await client.patch(
        f"/api/lists/items/{item_id}",
        json={"checked": True},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    updated_item = resp.json()
    assert updated_item["checked"] is True

    # ------------------------------------------------------------------
    # 8. Clear checked items for the store
    # ------------------------------------------------------------------
    resp = await client.post(
        f"/api/lists/{store_id}/clear-checked",
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    clear_result = resp.json()
    assert clear_result["cleared"] == 1

    # ------------------------------------------------------------------
    # 9. Verify the list is empty after clearing
    # ------------------------------------------------------------------
    resp = await client.get("/api/lists", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    shopping_list_after = resp.json()

    # All sections should be empty (no items remain)
    total_items = sum(len(s["items"]) for s in shopping_list_after["sections"])
    assert total_items == 0, (
        f"Expected 0 items after clearing, got {total_items}: "
        f"{shopping_list_after['sections']}"
    )


# ---------------------------------------------------------------------------
# WebSocket integration test: two-client real-time sync
# Requirements: 8.2, 8.3, 8.4
# ---------------------------------------------------------------------------

import asyncio
from starlette.testclient import TestClient


@pytest.fixture(scope="function")
def sync_db_engine():
    """
    Create a fresh in-memory SQLite engine synchronously (via asyncio.run).
    Yields the engine so the TestClient fixture can build a session factory.
    """

    async def _setup():
        engine = create_async_engine(SQLITE_URL, echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return engine

    async def _teardown(engine):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    engine = asyncio.run(_setup())
    yield engine
    asyncio.run(_teardown(engine))


@pytest.fixture(scope="function")
def sync_client(sync_db_engine):
    """
    Return a synchronous starlette TestClient wired to the FastAPI app with
    the DB dependency overridden to use the in-memory SQLite engine.

    Both WebSocket connections and REST calls go through the same app instance,
    so the ConnectionManager's in-process state is shared correctly.
    """
    session_factory = async_sessionmaker(
        bind=sync_db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app, raise_server_exceptions=True) as tc:
        yield tc

    app.dependency_overrides.clear()


def test_two_client_websocket_sync(sync_client: TestClient):
    """
    Two WebSocket clients connect to the same store channel.
    When client 1 checks off a list item via REST, client 2 should receive
    an ``item_checked`` WebSocket event within 2 seconds.

    Validates: Requirements 8.2, 8.3, 8.4
    """
    client = sync_client

    # ------------------------------------------------------------------
    # 1. Register a user → get JWT (no household yet)
    # ------------------------------------------------------------------
    resp = client.post(
        "/api/auth/register",
        json={"email": "ws_tester@example.com", "password": "securepass123"},
    )
    assert resp.status_code == 201, resp.text
    token_no_household = resp.json()["access_token"]

    # ------------------------------------------------------------------
    # 2. Create a household → get household-scoped JWT
    # ------------------------------------------------------------------
    resp = client.post(
        "/api/auth/households",
        json={"name": "WS Test Household"},
        headers={"Authorization": f"Bearer {token_no_household}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    token = data["token"]["access_token"]

    # ------------------------------------------------------------------
    # 3. Add a store
    # ------------------------------------------------------------------
    resp = client.post(
        "/api/catalog/stores",
        json={"name": "WS Store"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    store_id = resp.json()["id"]

    # ------------------------------------------------------------------
    # 4. Create a product
    # ------------------------------------------------------------------
    resp = client.post(
        "/api/catalog/products",
        data={
            "name": "Test Product",
            "brand": "Brand",
            "quantity": "1",
            "store_id": str(store_id),
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    product_id = resp.json()["id"]

    # ------------------------------------------------------------------
    # 5. Add the product to the shopping list
    # ------------------------------------------------------------------
    resp = client.post(
        "/api/lists/items",
        json={"product_id": product_id, "quantity": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    item_id = resp.json()["id"]

    # ------------------------------------------------------------------
    # 6. Open two WebSocket connections to the store channel
    # ------------------------------------------------------------------
    ws_url = f"/ws/lists/{store_id}?token={token}"

    with client.websocket_connect(ws_url) as ws1, \
         client.websocket_connect(ws_url) as ws2:

        # ----------------------------------------------------------------
        # 7. Client 1 checks off the item via REST
        # ----------------------------------------------------------------
        resp = client.patch(
            f"/api/lists/items/{item_id}",
            json={"checked": True},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["checked"] is True

        # ----------------------------------------------------------------
        # 8. Client 2 should receive the broadcast within 2 seconds
        # ----------------------------------------------------------------
        msg = ws2.receive_json()
        assert msg["event"] == "item_checked", (
            f"Expected event='item_checked', got: {msg}"
        )
        assert msg["item_id"] == item_id, (
            f"Expected item_id={item_id}, got: {msg}"
        )
