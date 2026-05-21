"""Pydantic v2 schemas for the List Service.

Covers list item CRUD (create/update/response), the grouped shopping list
response (sectioned by store), and the WebSocket event envelope.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from backend.schemas.catalog import ProductResponse


# ---------------------------------------------------------------------------
# List item schemas
# ---------------------------------------------------------------------------


class ListItemCreate(BaseModel):
    """Request body for POST /api/lists/items."""

    product_id: int
    quantity: int = 1


class ListItemUpdate(BaseModel):
    """Request body for PATCH /api/lists/items/{id}.

    All fields are optional so callers can patch individual attributes.
    """

    quantity: int | None = None
    checked: bool | None = None


class ListItemResponse(BaseModel):
    """Response body representing a single list item."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    store_id: int | None
    quantity: int
    checked: bool
    product: ProductResponse


# ---------------------------------------------------------------------------
# Shopping list response schemas
# ---------------------------------------------------------------------------


class StoreListSection(BaseModel):
    """A group of list items belonging to the same store (or unassigned)."""

    store_id: int | None
    store_name: str | None
    items: list[ListItemResponse]


class ShoppingListResponse(BaseModel):
    """Full shopping list response, grouped into per-store sections.

    Contains one section per store that has items, plus an optional
    "Unassigned" section (store_id=None) for products with no preferred store.
    """

    sections: list[StoreListSection]


# ---------------------------------------------------------------------------
# WebSocket event schema
# ---------------------------------------------------------------------------


class WsEvent(BaseModel):
    """Envelope for WebSocket broadcast events.

    ``event`` identifies the mutation type.
    ``item_id`` is the affected list item (None for bulk operations such as
    list_cleared and list_reset).
    ``payload`` carries any additional data the frontend may need.
    """

    event: Literal[
        "item_checked",
        "item_unchecked",
        "item_added",
        "item_removed",
        "item_qty_changed",
        "list_cleared",
        "list_reset",
    ]
    item_id: int | None = None
    payload: dict = {}
