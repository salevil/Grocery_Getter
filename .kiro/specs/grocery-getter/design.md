# Design Document: Grocery Getter

## Overview

Grocery Getter is a household-scoped grocery list and pantry manager. The system lets household members collaboratively maintain a product catalog (populated via UPC barcode scanning or manual entry), build per-store shopping lists from that catalog, and coordinate shopping trips in real time with offline resilience.

The application is a React SPA (Vite + Tailwind CSS) backed by a FastAPI/PostgreSQL API. All data is scoped to a **Household** — the central organizing unit. Real-time collaboration in Shopping Mode is delivered over WebSockets. Product metadata is auto-populated from the Open Food Facts API. Product photos are stored in an external object store (Supabase Storage or Cloudflare R2).

### Key Research Findings

- **Open Food Facts API**: Products are fetched via `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`. The response includes `product.product_name`, `product.brands`, and `product.quantity` when available. A `status: 0` in the response body indicates a product not found (HTTP 200 is still returned). The API is free, requires no authentication, and recommends a descriptive `User-Agent` header. Response times are typically under 2 seconds but can spike; a 5-second client timeout is appropriate.
- **ZXing-js**: The `@zxing/library` npm package provides `BrowserMultiFormatReader` for decoding barcodes from a live `<video>` element via `getUserMedia`. It runs entirely in the browser, requires HTTPS (or localhost) for camera access, and supports EAN-13/UPC-A formats used on grocery products. The `react-qr-barcode-scanner` wrapper simplifies React integration.
- **WebSocket broadcast**: FastAPI's `WebSocket` support (via Starlette) combined with an in-process `ConnectionManager` (a dict of `list_id → set[WebSocket]`) is sufficient for single-process deployments. Each mutation to a Shopping List triggers a broadcast to all connected clients watching that list.
- **JWT**: `python-jose[cryptography]` + `passlib[bcrypt]` is the standard FastAPI JWT stack. Tokens carry `sub` (user_id) and `household_id` claims, eliminating per-request household lookups.
- **Offline queue**: The browser's `navigator.onLine` event and a local queue (stored in `localStorage`) allow check-off actions to be deferred and replayed on reconnect.

---

## Architecture

The system follows a three-tier architecture: React SPA → FastAPI REST + WebSocket API → PostgreSQL.

```mermaid
graph TD
    subgraph Browser
        UI[React SPA]
        Scanner[ZXing BarcodeScanner]
        OfflineQ[Offline Queue\n(localStorage)]
    end

    subgraph Backend [FastAPI Backend]
        AuthSvc[Auth Service\n/api/auth]
        CatalogSvc[Catalog Service\n/api/catalog]
        ListSvc[List Service\n/api/lists]
        WSSvc[WebSocket Hub\n/ws/lists/{list_id}]
        OFFClient[Open Food Facts\nHTTP Client]
        PhotoClient[Photo Store\nHTTP Client]
    end

    subgraph Storage
        PG[(PostgreSQL)]
        PhotoStore[(Supabase Storage\nor Cloudflare R2)]
    end

    UI --> AuthSvc
    UI --> CatalogSvc
    UI --> ListSvc
    UI <-->|WebSocket| WSSvc
    Scanner --> UI
    OfflineQ --> ListSvc

    AuthSvc --> PG
    CatalogSvc --> PG
    CatalogSvc --> OFFClient
    CatalogSvc --> PhotoClient
    ListSvc --> PG
    WSSvc --> ListSvc
    PhotoClient --> PhotoStore
```

### Deployment Layout

```
/
├── frontend/          # Vite + React + Tailwind (existing scaffold)
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       ├── services/  # API client, WebSocket client
│       └── store/     # Zustand or React Context state
└── backend/           # FastAPI (existing scaffold)
    ├── main.py
    ├── routers/
    │   ├── auth.py
    │   ├── catalog.py
    │   ├── lists.py
    │   └── websocket.py
    ├── models/        # SQLAlchemy ORM models
    ├── schemas/       # Pydantic request/response schemas
    ├── services/      # Business logic
    ├── db.py          # Async SQLAlchemy engine + session
    └── requirements.txt
```

---

## Components and Interfaces

### Backend Components

#### Auth Service (`/api/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create user account |
| POST | `/api/auth/login` | Authenticate, return JWT |
| POST | `/api/auth/households` | Create a new household |
| POST | `/api/auth/households/invite` | Generate + send invitation |
| GET | `/api/auth/households/join/{token}` | Accept invitation |

JWT payload: `{ sub: user_id, household_id, exp }`. The `household_id` claim is `null` until the user joins a household.

#### Catalog Service (`/api/catalog`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/catalog/products` | List household products |
| POST | `/api/catalog/products` | Create product (manual or post-scan) |
| GET | `/api/catalog/products/{id}` | Get single product |
| PATCH | `/api/catalog/products/{id}` | Update product fields |
| DELETE | `/api/catalog/products/{id}` | Delete product + photo |
| GET | `/api/catalog/lookup/{upc}` | UPC → Open Food Facts lookup |
| GET | `/api/catalog/stores` | List household stores |
| POST | `/api/catalog/stores` | Create store |
| PATCH | `/api/catalog/stores/{id}` | Rename store |
| DELETE | `/api/catalog/stores/{id}` | Delete store |

#### List Service (`/api/lists`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/lists` | All shopping lists for household (grouped by store) |
| POST | `/api/lists/items` | Add item to list |
| PATCH | `/api/lists/items/{id}` | Update quantity or checked state |
| DELETE | `/api/lists/items/{id}` | Remove item |
| POST | `/api/lists/{store_id}/clear-checked` | Remove all checked items |
| POST | `/api/lists/{store_id}/reset` | Uncheck all items |

#### WebSocket Hub (`/ws/lists/{store_id}`)

Clients connect with a JWT in the query string (`?token=...`). The hub maintains an in-process `ConnectionManager`:

```python
class ConnectionManager:
    def __init__(self):
        # store_id → set of active WebSocket connections
        self.active: dict[int, set[WebSocket]] = {}

    async def connect(self, store_id: int, ws: WebSocket): ...
    async def disconnect(self, store_id: int, ws: WebSocket): ...
    async def broadcast(self, store_id: int, message: dict): ...
```

Every mutation to a list item triggers `manager.broadcast(store_id, event_payload)`. The broadcast is fire-and-forget with a per-connection timeout of 2 seconds.

### Frontend Components

| Component | Responsibility |
|-----------|---------------|
| `BarcodeScanner` | Wraps `@zxing/library` `BrowserMultiFormatReader`; emits decoded UPC strings |
| `CatalogPage` | Browse/search household product catalog |
| `ProductForm` | Create/edit product; handles photo upload |
| `ShoppingListPage` | Per-store list view; grouped sections |
| `ShoppingModePage` | Full-screen check-off UI; WebSocket-connected |
| `StoreManager` | CRUD for household stores |
| `HouseholdSetup` | Create household or accept invitation |
| `AuthPages` | Register / Login forms |

#### Frontend Services

- **`apiClient`**: Axios instance with base URL, JWT `Authorization` header injected from `localStorage`, and 401 interceptor for token expiry.
- **`wsClient`**: Manages a single `WebSocket` connection per active store list. Reconnects with exponential backoff. Feeds events into the list state.
- **`offlineQueue`**: Listens to `window.online`/`offline` events. Queues `PATCH /api/lists/items/{id}` calls when offline; drains the queue in order on reconnect.

---

## Data Models

### PostgreSQL Schema

```sql
-- Users
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    household_id INT REFERENCES households(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Households
CREATE TABLE households (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invitations
CREATE TABLE invitations (
    id          SERIAL PRIMARY KEY,
    household_id INT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    email       TEXT NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT false,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stores
CREATE TABLE stores (
    id           SERIAL PRIMARY KEY,
    household_id INT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (household_id, name)
);

-- Products (catalog)
CREATE TABLE products (
    id           SERIAL PRIMARY KEY,
    household_id INT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    upc          TEXT,
    name         TEXT NOT NULL,
    brand        TEXT,
    quantity     TEXT,          -- e.g. "500g", "12 fl oz"
    store_id     INT REFERENCES stores(id) ON DELETE SET NULL,
    photo_url    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shopping list items
CREATE TABLE list_items (
    id           SERIAL PRIMARY KEY,
    household_id INT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    product_id   INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id     INT REFERENCES stores(id) ON DELETE SET NULL,
    quantity     INT NOT NULL DEFAULT 1,
    checked      BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (household_id, product_id)   -- one active entry per product
);
```

### Pydantic Schemas (representative)

```python
class ProductCreate(BaseModel):
    name: str
    brand: str | None = None
    quantity: str | None = None
    store_id: int | None = None
    upc: str | None = None

class ProductResponse(BaseModel):
    id: int
    upc: str | None
    name: str
    brand: str | None
    quantity: str | None
    store_id: int | None
    photo_url: str | None

class ListItemResponse(BaseModel):
    id: int
    product: ProductResponse
    store_id: int | None
    quantity: int
    checked: bool

class WsEvent(BaseModel):
    event: Literal["item_checked", "item_unchecked", "item_added",
                   "item_removed", "item_qty_changed", "list_cleared", "list_reset"]
    item_id: int | None
    payload: dict
```

### JWT Claims

```json
{
  "sub": "42",
  "household_id": 7,
  "exp": 1700000000
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Password length validation

*For any* string shorter than 8 characters submitted as a registration password, the Auth Service SHALL reject the request with an error, and no user account SHALL be created. *For any* string of 8 or more characters submitted as a registration password alongside a valid email, the Auth Service SHALL accept the request.

**Validates: Requirements 1.1, 1.4**

---

### Property 2: Session token authenticates all protected requests

*For any* valid session token issued by the Auth Service, every API request bearing that token SHALL be authenticated successfully until the token's expiry time. *For any* expired or malformed token, every API request bearing it SHALL be rejected with a 401 response.

**Validates: Requirements 1.7, 1.8**

---

### Property 3: Household data isolation

*For any* authenticated user who is a member of household A, every request to read or modify catalog or list data belonging to a different household B SHALL be rejected with an authorization error. The response SHALL be identical regardless of whether the target resource actually exists in household B, ensuring no information leakage.

**Validates: Requirements 13.1, 13.2, 13.3**

---

### Property 4: JWT token contains household membership claim

*For any* user who belongs to a household, the session token issued upon login SHALL contain a `household_id` claim equal to that user's household ID, so that downstream services can enforce data scoping without an additional database lookup.

**Validates: Requirements 13.4**

---

### Property 5: Store name uniqueness within a household

*For any* household, attempting to create a store whose name (case-sensitive) matches an existing store in that same household SHALL return an error, and no duplicate store SHALL be created. Stores in different households MAY share names.

**Validates: Requirements 5.2, 5.3**

---

### Property 6: Store deletion unsets product references

*For any* store that is deleted, all products in the household that referenced that store as their preferred store SHALL have their `store_id` set to null after the deletion. No product SHALL reference a non-existent store.

**Validates: Requirements 5.5**

---

### Property 7: Add-to-list deduplication and quantity accumulation

*For any* sequence of add-to-list operations for the same product in the same household, the resulting shopping list SHALL contain exactly one list item for that product, with a quantity equal to the sum of all quantities specified across all add operations.

**Validates: Requirements 6.2, 6.3**

---

### Property 8: List item grouping invariant

*For any* list item, the store section it appears in when the shopping list is fetched SHALL equal the preferred store of its associated product. When a product's preferred store is updated, all active list items for that product SHALL appear in the new store's section on the next fetch. Products with no preferred store SHALL appear in the "Unassigned" section.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

---

### Property 9: Real-time broadcast delivery

*For any* mutation to a list item (check, uncheck, add, remove, quantity change, clear-checked, reset) performed by any household member, all other household members connected to that store's WebSocket channel SHALL receive an event reflecting the updated state within 2 seconds of the mutation being persisted.

**Validates: Requirements 8.2, 8.3, 8.4, 10.3**

---

### Property 10: Offline queue replay correctness

*For any* sequence of check-off actions performed while the device has no network connectivity, replaying the queued actions on reconnect SHALL produce the same final list item states as if those exact actions had been performed online in the same order.

**Validates: Requirements 8.6**

---

### Property 11: Open Food Facts field extraction

*For any* Open Food Facts API response that contains a product object, the Catalog Service SHALL extract the `product_name`, `brands`, and `quantity` fields when they are present in the response, and SHALL treat absent fields as null rather than raising an error.

**Validates: Requirements 3.4, 12.2**

---

### Property 12: Photo upload round-trip

*For any* product photo submitted in JPEG or PNG format with a file size ≤ 5 MB, the Catalog Service SHALL upload it to the Photo Store, associate the returned URL with the product record, and return a non-null `photo_url` when the product is subsequently fetched.

**Validates: Requirements 4.3, 11.1**

---

### Property 13: Photo format and size validation

*For any* file submitted as a product photo that is either not in JPEG or PNG format, or exceeds 5 MB in size, the Catalog Service SHALL reject the request with an appropriate error before attempting any upload to the Photo Store.

**Validates: Requirements 11.2**

---

### Property 14: Product deletion cascades to list items and photos

*For any* product that is deleted from the catalog, all list items referencing that product SHALL be removed from all shopping lists, and any associated photo SHALL be deleted from the Photo Store. No orphaned list items or orphaned photos SHALL remain after a product deletion.

**Validates: Requirements 4.6, 11.4**

---

### Property 15: List reset idempotence

*For any* shopping list in any state (all checked, all unchecked, mixed), applying the "reset list" operation SHALL result in all list items being unchecked. Applying the reset operation a second time to an already-reset list SHALL leave the list unchanged.

**Validates: Requirements 10.2**

---

## Error Handling

### Authentication Errors

- **401 Unauthorized**: Returned for missing, malformed, or expired tokens. Response body: `{ "detail": "Not authenticated" }`.
- **403 Forbidden**: Returned when a valid token lacks access to the requested resource. Response body: `{ "detail": "Access denied" }` — never reveals whether the resource exists (Requirement 13.3).
- **400 Bad Request**: Registration with duplicate email or short password. Error message describes the constraint without leaking account existence for login failures (Requirement 1.6).

### Catalog Errors

- **404 Not Found**: Product or store not found within the user's household.
- **409 Conflict**: Duplicate store name within a household (Requirement 5.3).
- **422 Unprocessable Entity**: Missing required fields (e.g., product name).
- **503 Service Unavailable**: Open Food Facts API unreachable — frontend falls back to manual entry form with a user-visible message (Requirement 3.6).
- **504 Gateway Timeout**: Open Food Facts lookup exceeds 5 seconds — same fallback as 503 (Requirement 12.5).

### Photo Upload Errors

- **413 Request Entity Too Large**: Photo exceeds 5 MB (Requirement 11.2).
- **415 Unsupported Media Type**: Photo is not JPEG or PNG (Requirement 11.2).
- **502 Bad Gateway**: Photo Store upload failed — product is not saved when a photo was explicitly provided (Requirement 11.3).

### List Errors

- **404 Not Found**: List item not found within the user's household.
- **409 Conflict**: Attempting to add a product that already has a list item (handled by quantity increment, not an error — Requirement 6.3).

### WebSocket Errors

- Clients that fail to receive a broadcast within 2 seconds are disconnected and removed from the hub.
- The frontend reconnects with exponential backoff (1 s, 2 s, 4 s, max 30 s).
- While disconnected, the offline queue captures mutations (Requirement 8.6).

### Offline Queue

- Queue entries are stored in `localStorage` as `{ url, method, body, timestamp }`.
- On reconnect, entries are replayed in insertion order.
- If a replay request returns a 4xx error (e.g., item was deleted by another member), the entry is discarded and the UI is refreshed.

---

## Testing Strategy

### Unit Tests

**Backend** (pytest):
- Auth service: registration validation, login, token generation/verification, invitation lifecycle.
- Catalog service: product CRUD, store uniqueness enforcement, Open Food Facts response parsing (mocked HTTP), photo upload/delete (mocked storage client).
- List service: add-to-list deduplication logic, grouping by store, clear/reset operations.
- Authorization middleware: household scoping enforcement.

**Frontend** (Vitest + Testing Library):
- `BarcodeScanner` component: renders viewfinder, emits decoded UPC.
- `offlineQueue`: enqueue, drain, error discard.
- `ProductForm`: validation, photo file type/size rejection.
- `ShoppingListPage`: grouping by store, unassigned section.

### Property-Based Tests

Property-based testing is applicable here because the core business logic (list deduplication, store grouping, auth validation, data scoping) involves pure functions with large input spaces where edge cases matter.

**Library**: [Hypothesis](https://hypothesis.readthedocs.io/) for Python backend; [fast-check](https://fast-check.dev/) for TypeScript/JavaScript frontend.

**Minimum iterations**: 100 per property test.

**Tag format**: `# Feature: grocery-getter, Property {N}: {property_text}`

| Property | Test Location | Library | What Varies |
|----------|--------------|---------|-------------|
| 1 — Password length | `backend/tests/test_auth_properties.py` | Hypothesis | Arbitrary strings of varying length |
| 2 — Token authentication | `backend/tests/test_auth_properties.py` | Hypothesis | Random user IDs, household IDs, expiry times |
| 3 — Household isolation | `backend/tests/test_auth_properties.py` | Hypothesis | Random household pairs, resource types, existence |
| 4 — JWT household claim | `backend/tests/test_auth_properties.py` | Hypothesis | Random users with various household memberships |
| 5 — Store name uniqueness | `backend/tests/test_catalog_properties.py` | Hypothesis | Random store names, case variants |
| 6 — Store deletion cascade | `backend/tests/test_catalog_properties.py` | Hypothesis | Random stores with varying numbers of products |
| 7 — Add-to-list deduplication | `backend/tests/test_list_properties.py` | Hypothesis | Random products, quantities, add sequences |
| 8 — List grouping invariant | `backend/tests/test_list_properties.py` | Hypothesis | Random products, store assignments, updates |
| 9 — Real-time broadcast | `backend/tests/test_ws_properties.py` | Hypothesis + asyncio | Random mutations, N connected clients |
| 10 — Offline queue replay | `frontend/src/tests/offlineQueue.property.test.js` | fast-check | Random action sequences, network drop timing |
| 11 — OFF field extraction | `backend/tests/test_catalog_properties.py` | Hypothesis | Random OFF API response shapes, missing fields |
| 12 — Photo round-trip | `backend/tests/test_catalog_properties.py` | Hypothesis | Random valid image metadata, mock storage |
| 13 — Photo validation | `backend/tests/test_catalog_properties.py` | Hypothesis | Random file types, sizes above/below 5 MB |
| 14 — Product deletion cascade | `backend/tests/test_catalog_properties.py` | Hypothesis | Random products with varying list items and photos |
| 15 — List reset idempotence | `backend/tests/test_list_properties.py` | Hypothesis | Random lists with mixed checked/unchecked states |

### Integration Tests

- End-to-end: register → create household → add store → scan UPC → add to list → check off (using a test PostgreSQL database).
- WebSocket: connect two clients, check off item from one, verify the other receives the event within 2 seconds.
- Open Food Facts: live smoke test against the real API with a known UPC (run in CI with network access).
- Photo storage: upload a test image to the configured Photo Store, verify URL is returned and accessible.

### Smoke Tests

- Backend starts and `/api/hello` returns 200.
- Database migrations apply cleanly to a fresh schema.
- Photo Store credentials are valid and the bucket is accessible.
- Open Food Facts API is reachable.
