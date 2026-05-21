"""Pydantic v2 schemas for the Catalog Service.

Covers stores (create/update/response) and products (create/update/response),
plus the UPC lookup response that wraps Open Food Facts prefill data.
"""

from pydantic import BaseModel, ConfigDict, field_validator


# ---------------------------------------------------------------------------
# Store schemas
# ---------------------------------------------------------------------------


class StoreCreate(BaseModel):
    """Request body for POST /api/catalog/stores."""

    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if len(v) < 1:
            raise ValueError("Store name must not be empty.")
        return v


class StoreUpdate(BaseModel):
    """Request body for PATCH /api/catalog/stores/{id}."""

    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if len(v) < 1:
            raise ValueError("Store name must not be empty.")
        return v


class StoreResponse(BaseModel):
    """Response body representing a Store resource."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    household_id: int


# ---------------------------------------------------------------------------
# Product schemas
# ---------------------------------------------------------------------------


class ProductCreate(BaseModel):
    """Request body for POST /api/catalog/products."""

    name: str
    brand: str | None = None
    quantity: str | None = None
    store_id: int | None = None
    upc: str | None = None


class ProductUpdate(BaseModel):
    """Request body for PATCH /api/catalog/products/{id}.

    All fields are optional so callers can patch individual attributes.
    """

    name: str | None = None
    brand: str | None = None
    quantity: str | None = None
    store_id: int | None = None
    upc: str | None = None


class ProductResponse(BaseModel):
    """Response body representing a Product resource."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    upc: str | None
    name: str
    brand: str | None
    quantity: str | None
    store_id: int | None
    photo_url: str | None
    household_id: int


# ---------------------------------------------------------------------------
# UPC lookup schema
# ---------------------------------------------------------------------------


class UpcLookupResponse(BaseModel):
    """Response body for GET /api/catalog/lookup/{upc}.

    ``found`` is True when the product already exists in the household catalog.
    ``product`` is populated when ``found`` is True.
    ``prefill`` contains name/brand/quantity sourced from Open Food Facts when
    the barcode was recognised externally but is not yet in the catalog.
    """

    found: bool
    product: ProductResponse | None = None
    prefill: dict | None = None
