# Implementation Plan: Grocery Getter

## Overview

Build the Grocery Getter application on top of the existing Hello World scaffold (`/frontend` Vite + React + Tailwind, `/backend` FastAPI). Tasks are ordered by dependency: database and auth foundation first, then catalog and store management, then shopping lists, then real-time WebSocket collaboration, then the React frontend, and finally integration wiring. Property-based tests use Hypothesis (Python backend) and fast-check (JS frontend).

---

## Tasks

- [x] 1. Backend foundation — dependencies, database, and project structure
  - [x] 1.1 Expand `backend/requirements.txt` and install all backend dependencies
    - Add `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `python-jose[cryptography]`, `passlib[bcrypt]`, `httpx`, `python-multipart`, `boto3` (or `supabase`), `hypothesis`, `pytest`, `pytest-asyncio`, `anyio[trio]`
    - Pin all versions
    - _Requirements: 1.1, 4.3, 11.1_

  - [x] 1.2 Create async SQLAlchemy engine and session factory in `backend/db.py`
    - Configure `create_async_engine` with `DATABASE_URL` from environment
    - Expose `AsyncSession` dependency for FastAPI routes
    - _Requirements: 1.1, 2.1_

  - [x] 1.3 Create SQLAlchemy ORM models in `backend/models/`
    - Implement `User`, `Household`, `Invitation`, `Store`, `Product`, `ListItem` models matching the schema in the design document
    - Add `updated_at` server-default triggers via `onupdate`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

  - [x] 1.4 Create Alembic migration for the initial schema
    - Run `alembic init` and configure `env.py` to use the async engine
    - Generate and apply the initial migration that creates all six tables
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

  - [x] 1.5 Register routers and update `backend/main.py`
    - Add `routers/auth.py`, `routers/catalog.py`, `routers/lists.py`, `routers/websocket.py` as stub modules
    - Include each router in `main.py` with its prefix
    - Keep the existing `/api/hello` route intact
    - _Requirements: 1.1_

- [x] 2. Auth service — registration, login, households, and invitations
  - [x] 2.1 Implement Pydantic schemas in `backend/schemas/auth.py`
    - `RegisterRequest`, `LoginRequest`, `TokenResponse`, `HouseholdCreate`, `InviteRequest`
    - _Requirements: 1.1, 1.2, 2.1, 2.3_

  - [x] 2.2 Implement JWT utilities in `backend/services/auth_service.py`
    - `hash_password`, `verify_password` (bcrypt via passlib)
    - `create_access_token(sub, household_id)` — 24-hour expiry, encodes `sub` and `household_id` claims
    - `decode_token(token)` — raises `HTTPException(401)` on invalid/expired token
    - `get_current_user` FastAPI dependency that reads `Authorization: Bearer` header
    - _Requirements: 1.2, 1.5, 1.7, 1.8, 13.4_

  - [x] 2.3 Implement `POST /api/auth/register` and `POST /api/auth/login` in `backend/routers/auth.py`
    - Register: validate email uniqueness and password ≥ 8 chars; hash password; return JWT
    - Login: verify credentials; return JWT; return generic error on bad credentials (Req 1.6)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 2.4 Write property tests for auth validation (`backend/tests/test_auth_properties.py`)
    - **Property 1: Password length validation** — arbitrary strings shorter than 8 chars are rejected; strings ≥ 8 chars with valid email are accepted
    - **Property 2: Session token authenticates all protected requests** — any valid token passes; any expired/malformed token returns 401
    - **Property 4: JWT household claim** — token issued after household join contains correct `household_id`
    - **Validates: Requirements 1.1, 1.4, 1.7, 1.8, 13.4**

  - [x] 2.5 Implement household creation and invitation endpoints
    - `POST /api/auth/households` — create household, assign requesting user as first member
    - `POST /api/auth/households/invite` — generate UUID token, store `Invitation` row, send email (stub `send_email` function)
    - `GET /api/auth/households/join/{token}` — validate token not used/expired; add user to household; return new JWT with `household_id`
    - Enforce one-household-per-user constraint
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.6 Implement `get_current_household_user` dependency
    - Wraps `get_current_user`; raises `HTTPException(403)` if `household_id` claim is null
    - Used by all catalog and list routes to enforce Requirement 2.6 and 13.x
    - _Requirements: 2.6, 13.1, 13.2, 13.3_

- [x] 3. Checkpoint — auth layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Catalog service — stores
  - [x] 4.1 Implement Pydantic schemas in `backend/schemas/catalog.py`
    - `StoreCreate`, `StoreUpdate`, `StoreResponse`, `ProductCreate`, `ProductUpdate`, `ProductResponse`, `UpcLookupResponse`
    - _Requirements: 4.1, 5.1_

  - [x] 4.2 Implement store CRUD in `backend/routers/catalog.py`
    - `POST /api/catalog/stores` — enforce unique name per household (409 on conflict)
    - `GET /api/catalog/stores` — list stores for household
    - `PATCH /api/catalog/stores/{id}` — rename store; update reflected on products and list items
    - `DELETE /api/catalog/stores/{id}` — delete store; set `store_id = null` on all products that referenced it
    - All routes use `get_current_household_user`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 4.3 Write property tests for store management (`backend/tests/test_catalog_properties.py`)
    - **Property 5: Store name uniqueness within a household** — duplicate names in same household return error; same name in different household is allowed
    - **Property 6: Store deletion unsets product references** — after deletion, no product has a non-null `store_id` pointing to the deleted store
    - **Validates: Requirements 5.2, 5.3, 5.5**

- [x] 5. Catalog service — products and UPC lookup
  - [x] 5.1 Implement Open Food Facts HTTP client in `backend/services/off_client.py`
    - `async def lookup_upc(upc: str) -> dict | None`
    - `GET https://world.openfoodfacts.org/api/v2/product/{upc}.json` with descriptive `User-Agent`
    - 5-second timeout; return `None` on timeout, network error, or `status: 0` response
    - Extract `product_name`, `brands`, `quantity` fields; treat absent fields as `None`
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 5.2 Write property tests for Open Food Facts field extraction (`backend/tests/test_catalog_properties.py`)
    - **Property 11: OFF field extraction** — for any response shape with a product object, present fields are extracted; absent fields are null; no exception raised
    - **Validates: Requirements 3.4, 12.2**

  - [x] 5.3 Implement photo upload service in `backend/services/photo_service.py`
    - `async def upload_photo(file: UploadFile) -> str` — validates JPEG/PNG and ≤ 5 MB; uploads to Photo Store; returns URL
    - `async def delete_photo(url: str)` — deletes object from Photo Store
    - Raise `HTTPException(413)` for oversized files, `HTTPException(415)` for wrong format, `HTTPException(502)` on upload failure
    - _Requirements: 4.3, 11.1, 11.2, 11.3_

  - [ ]* 5.4 Write property tests for photo validation (`backend/tests/test_catalog_properties.py`)
    - **Property 12: Photo upload round-trip** — valid JPEG/PNG ≤ 5 MB uploads successfully and returns non-null URL (mock storage)
    - **Property 13: Photo format and size validation** — files not JPEG/PNG or > 5 MB are rejected before any upload attempt
    - **Validates: Requirements 4.3, 11.1, 11.2**

  - [x] 5.5 Implement product CRUD and UPC lookup endpoints in `backend/routers/catalog.py`
    - `GET /api/catalog/lookup/{upc}` — call `off_client.lookup_upc`; if UPC already in household catalog, return existing product with `exists: true`
    - `POST /api/catalog/products` — create product; if photo provided, call `photo_service.upload_photo`
    - `GET /api/catalog/products` — list all products for household
    - `GET /api/catalog/products/{id}` — get single product (403 if different household)
    - `PATCH /api/catalog/products/{id}` — update fields; handle photo replacement
    - `DELETE /api/catalog/products/{id}` — delete product, cascade list items (via FK), delete photo via `photo_service.delete_photo`
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 13.1, 13.3_

  - [ ]* 5.6 Write property tests for product deletion cascade (`backend/tests/test_catalog_properties.py`)
    - **Property 14: Product deletion cascades to list items and photos** — after deletion, no list items reference the product and no photo remains in the store (mock storage)
    - **Validates: Requirements 4.6, 11.4**

- [x] 6. Checkpoint — catalog and store layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. List service — shopping list CRUD
  - [x] 7.1 Implement Pydantic schemas in `backend/schemas/lists.py`
    - `ListItemCreate`, `ListItemUpdate`, `ListItemResponse`, `ShoppingListResponse` (grouped by store)
    - `WsEvent` with the literal event types from the design
    - _Requirements: 6.1, 7.1, 8.2_

  - [x] 7.2 Implement list item CRUD in `backend/routers/lists.py`
    - `GET /api/lists` — fetch all list items for household, grouped by `store_id` (null → "Unassigned"); include product details
    - `POST /api/lists/items` — add item; if item for same product already exists, increment quantity (Req 6.3); default quantity 1
    - `PATCH /api/lists/items/{id}` — update `quantity` or `checked`; broadcast WS event after persist
    - `DELETE /api/lists/items/{id}` — remove item; broadcast WS event
    - `POST /api/lists/{store_id}/clear-checked` — delete all checked items for store; broadcast
    - `POST /api/lists/{store_id}/reset` — set all items for store to `checked = false`; broadcast
    - All routes use `get_current_household_user`
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 10.1, 10.2, 10.3_

  - [ ]* 7.3 Write property tests for list deduplication and grouping (`backend/tests/test_list_properties.py`)
    - **Property 7: Add-to-list deduplication and quantity accumulation** — any sequence of add operations for the same product yields exactly one list item with quantity equal to the sum
    - **Property 8: List item grouping invariant** — fetched list items always appear in the section matching their product's preferred store; updating a product's store moves its items
    - **Property 15: List reset idempotence** — reset on any list state produces all-unchecked; second reset leaves list unchanged
    - **Validates: Requirements 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 10.2**

- [x] 8. WebSocket hub — real-time collaboration
  - [x] 8.1 Implement `ConnectionManager` in `backend/services/ws_manager.py`
    - `connect(store_id, ws)`, `disconnect(store_id, ws)`, `broadcast(store_id, message)` as described in the design
    - `broadcast` is fire-and-forget with a 2-second per-connection timeout; failed connections are removed
    - _Requirements: 8.2, 8.3, 8.4, 10.3_

  - [x] 8.2 Implement WebSocket endpoint in `backend/routers/websocket.py`
    - `GET /ws/lists/{store_id}?token=...` — validate JWT from query param; register connection; forward incoming messages to list service; disconnect on close
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 8.3 Write property tests for real-time broadcast (`backend/tests/test_ws_properties.py`)
    - **Property 9: Real-time broadcast delivery** — for any list mutation, all N connected mock WebSocket clients receive the event within 2 seconds
    - **Validates: Requirements 8.2, 8.3, 8.4, 10.3**

- [x] 9. Checkpoint — backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Frontend foundation — dependencies, routing, and API client
  - [x] 10.1 Install frontend dependencies
    - Add `axios`, `react-router-dom`, `@zxing/library`, `fast-check` to `package.json` via pnpm
    - Add `zustand` for global state (auth token, household context)
    - _Requirements: 1.7, 3.1, 8.6_

  - [x] 10.2 Create `frontend/src/services/apiClient.js`
    - Axios instance with `baseURL` pointing to the FastAPI backend
    - Request interceptor: inject `Authorization: Bearer <token>` from `localStorage`
    - Response interceptor: on 401, clear token and redirect to `/login`
    - _Requirements: 1.7, 1.8, 13.1_

  - [x] 10.3 Create `frontend/src/services/wsClient.js`
    - Manages a single `WebSocket` per active store list
    - Reconnects with exponential backoff (1 s, 2 s, 4 s, max 30 s)
    - Exposes `connect(storeId, token, onEvent)`, `disconnect()`, `send(message)`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 10.4 Create `frontend/src/services/offlineQueue.js`
    - Listens to `window.online` / `window.offline` events
    - `enqueue(request)` — stores `{ url, method, body, timestamp }` in `localStorage`
    - `drain()` — replays queued requests in order on reconnect; discards entries that return 4xx
    - _Requirements: 8.6_

  - [ ]* 10.5 Write property tests for offline queue (`frontend/src/tests/offlineQueue.property.test.js`)
    - **Property 10: Offline queue replay correctness** — any sequence of check-off actions queued offline, when replayed, produces the same final states as performing them online in the same order (fast-check)
    - **Validates: Requirements 8.6**

  - [x] 10.6 Set up React Router in `frontend/src/main.jsx` and create page stubs
    - Routes: `/login`, `/register`, `/household/setup`, `/catalog`, `/stores`, `/lists`, `/lists/:storeId/shop`
    - Wrap app in auth guard: redirect unauthenticated users to `/login`
    - _Requirements: 1.7, 2.6_

  - [x] 10.7 Create Zustand store in `frontend/src/store/authStore.js`
    - State: `token`, `userId`, `householdId`
    - Actions: `login(token)`, `logout()` — persist token to `localStorage`
    - _Requirements: 1.7, 13.4_

- [x] 11. Frontend — auth pages
  - [x] 11.1 Implement `frontend/src/pages/RegisterPage.jsx`
    - Form: email, password (≥ 8 chars client-side validation), submit
    - On success: store token, redirect to `/household/setup`
    - Display server errors (duplicate email, short password)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 11.2 Implement `frontend/src/pages/LoginPage.jsx`
    - Form: email, password, submit
    - On success: store token, redirect to `/lists`
    - Display generic auth error (do not distinguish email vs password)
    - _Requirements: 1.5, 1.6_

  - [x] 11.3 Implement `frontend/src/pages/HouseholdSetupPage.jsx`
    - Two flows: "Create household" (name input) and "Join via invitation link" (token from URL param)
    - On household creation: call `POST /api/auth/households`, refresh token, redirect to `/catalog`
    - On invitation accept: call `GET /api/auth/households/join/{token}`, refresh token, redirect to `/catalog`
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

- [x] 12. Frontend — barcode scanner component
  - [x] 12.1 Implement `frontend/src/components/BarcodeScanner.jsx`
    - Use `@zxing/library` `BrowserMultiFormatReader` with a `<video>` element
    - Request camera via `getUserMedia`; display live viewfinder
    - On successful decode: call `onScan(upc)` prop; stop scanning
    - Handle camera permission denied gracefully with user-visible message
    - _Requirements: 3.1, 3.2, 9.1_

- [x] 13. Frontend — catalog and store management pages
  - [x] 13.1 Implement `frontend/src/pages/CatalogPage.jsx`
    - List all household products with name, brand, photo thumbnail, preferred store
    - "Add product" button → opens `ProductForm` in create mode
    - "Scan barcode" button → opens `BarcodeScanner`; on scan, calls `GET /api/catalog/lookup/{upc}`; routes to `ProductForm` pre-filled or shows existing product
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 4.4_

  - [x] 13.2 Implement `frontend/src/components/ProductForm.jsx`
    - Fields: name (required), brand, quantity/weight, preferred store (dropdown), photo (file input)
    - Client-side photo validation: JPEG/PNG only, ≤ 5 MB; display error before upload
    - Submit calls `POST /api/catalog/products` (create) or `PATCH /api/catalog/products/{id}` (edit)
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 11.2_

  - [x] 13.3 Implement `frontend/src/pages/StoreManagerPage.jsx`
    - List stores; inline rename; delete with confirmation
    - "Add store" form with name input; display 409 conflict error
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 14. Frontend — shopping list page
  - [x] 14.1 Implement `frontend/src/pages/ShoppingListPage.jsx`
    - Fetch `GET /api/lists`; render one section per store (plus "Unassigned")
    - Each section lists items with product name, quantity, checked state toggle
    - "Add item" flow: browse catalog or scan barcode → `POST /api/lists/items`
    - Remove item button → `DELETE /api/lists/items/{id}`
    - Quantity stepper → `PATCH /api/lists/items/{id}`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4_

- [x] 15. Frontend — shopping mode page
  - [x] 15.1 Implement `frontend/src/pages/ShoppingModePage.jsx`
    - Full-screen view for a specific store; connect to `wsClient` on mount, disconnect on unmount
    - Display unchecked items; tap to check/uncheck → `PATCH /api/lists/items/{id}` + optimistic UI update
    - Receive WS events and update list state in real time
    - "Scan to check off" button → opens `BarcodeScanner`; on scan, find matching item and check it off; prompt quantity confirmation
    - Offline banner when `navigator.onLine` is false; enqueue mutations via `offlineQueue`
    - "Clear checked" and "Reset list" buttons
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3_

- [x] 16. Checkpoint — frontend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Authorization middleware and data scoping
  - [x] 17.1 Add household scoping guard to all catalog and list route handlers
    - Verify that every DB query filters by `household_id` from the JWT claim
    - Return `403` (not `404`) when a resource exists but belongs to a different household
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ]* 17.2 Write property tests for household isolation (`backend/tests/test_auth_properties.py`)
    - **Property 3: Household data isolation** — for any user in household A, requests targeting household B's resources return 403 regardless of whether the resource exists
    - **Validates: Requirements 13.1, 13.2, 13.3**

- [ ] 18. Final wiring and integration
  - [x] 18.1 Wire `offlineQueue` drain into `wsClient` reconnect callback
    - On WebSocket reconnect, call `offlineQueue.drain()` before resuming normal operation
    - _Requirements: 8.6_

  - [x] 18.2 Wire product store-change to list item re-grouping
    - When `PATCH /api/catalog/products/{id}` changes `store_id`, update `store_id` on all active `list_items` for that product
    - _Requirements: 7.3_

  - [x] 18.3 Write backend integration test: full shopping trip flow
    - Register → create household → add store → create product → add to list → enter shopping mode → check off via scan → clear checked
    - Use a test PostgreSQL database (pytest fixture)
    - _Requirements: 1.1–1.8, 2.1–2.6, 3.1–3.7, 4.1–4.6, 5.1–5.5, 6.1–6.7, 7.1–7.4, 8.1–8.6, 9.1–9.4, 10.1–10.3_

  - [x] 18.4 Write WebSocket integration test: two-client real-time sync
    - Connect two async test clients to the same store's WS channel
    - Check off an item from client 1; assert client 2 receives the event within 2 seconds
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 19. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 3, 6, 9, 16, 19) ensure incremental validation at each layer boundary
- Property tests use Hypothesis (Python) and fast-check (JavaScript); minimum 100 iterations per property
- The existing `/api/hello` route and Hello World scaffold are preserved throughout
- `DATABASE_URL` and Photo Store credentials are expected as environment variables; no hardcoded secrets

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5"] },
    { "id": 3, "tasks": ["2.1", "2.2"] },
    { "id": 4, "tasks": ["2.3"] },
    { "id": 5, "tasks": ["2.4", "2.5"] },
    { "id": 6, "tasks": ["2.6", "4.1"] },
    { "id": 7, "tasks": ["4.2", "5.1"] },
    { "id": 8, "tasks": ["4.3", "5.2", "5.3"] },
    { "id": 9, "tasks": ["5.4", "5.5"] },
    { "id": 10, "tasks": ["5.6", "7.1"] },
    { "id": 11, "tasks": ["7.2"] },
    { "id": 12, "tasks": ["7.3", "8.1"] },
    { "id": 13, "tasks": ["8.2"] },
    { "id": 14, "tasks": ["8.3", "10.1"] },
    { "id": 15, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 16, "tasks": ["10.5", "10.6", "10.7"] },
    { "id": 17, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 18, "tasks": ["12.1"] },
    { "id": 19, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 20, "tasks": ["14.1"] },
    { "id": 21, "tasks": ["15.1"] },
    { "id": 22, "tasks": ["17.1"] },
    { "id": 23, "tasks": ["17.2", "18.1", "18.2"] },
    { "id": 24, "tasks": ["18.3", "18.4"] }
  ]
}
```
