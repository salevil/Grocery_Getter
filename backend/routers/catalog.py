"""Catalog router — store and product endpoints."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_db
from backend.models.list_item import ListItem
from backend.models.product import Product
from backend.models.store import Store
from backend.models.user import User
from backend.schemas.catalog import (
    ProductResponse,
    ProductUpdate,
    StoreCreate,
    StoreResponse,
    StoreUpdate,
    UpcLookupResponse,
)
from backend.services import off_client, photo_service
from backend.services.auth_service import get_current_household_user

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/health")
async def catalog_health() -> dict:
    """Health check for the catalog router."""
    return {"status": "ok", "router": "catalog"}


# ---------------------------------------------------------------------------
# Store CRUD
# ---------------------------------------------------------------------------


@router.post(
    "/stores",
    response_model=StoreResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_store(
    body: StoreCreate,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> StoreResponse:
    """Create a new store scoped to the current user's household.

    Returns 409 if a store with the same name already exists in the household.
    """
    # Check for duplicate name within the household
    result = await db.execute(
        select(Store).where(
            Store.household_id == current_user.household_id,
            Store.name == body.name,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A store with this name already exists",
        )

    store = Store(household_id=current_user.household_id, name=body.name)
    db.add(store)
    await db.commit()
    await db.refresh(store)
    return StoreResponse.model_validate(store)


@router.get("/stores", response_model=list[StoreResponse])
async def list_stores(
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> list[StoreResponse]:
    """Return all stores belonging to the current user's household."""
    result = await db.execute(
        select(Store).where(Store.household_id == current_user.household_id)
    )
    stores = result.scalars().all()
    return [StoreResponse.model_validate(s) for s in stores]


@router.patch("/stores/{store_id}", response_model=StoreResponse)
async def update_store(
    store_id: int,
    body: StoreUpdate,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> StoreResponse:
    """Rename a store.

    - 404 if the store does not exist.
    - 403 if the store belongs to a different household.
    - 409 if the new name conflicts with another store in the household.
    """
    result = await db.execute(select(Store).where(Store.id == store_id))
    store: Store | None = result.scalar_one_or_none()

    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    if store.household_id != current_user.household_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Check for name conflict with a *different* store in the same household
    conflict_result = await db.execute(
        select(Store).where(
            Store.household_id == current_user.household_id,
            Store.name == body.name,
            Store.id != store_id,
        )
    )
    if conflict_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A store with this name already exists",
        )

    store.name = body.name
    await db.commit()
    await db.refresh(store)
    return StoreResponse.model_validate(store)


@router.delete("/stores/{store_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_store(
    store_id: int,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a store.

    The DB FK ``ON DELETE SET NULL`` will automatically unset ``store_id`` on
    any products and list items that referenced this store.

    - 404 if the store does not exist.
    - 403 if the store belongs to a different household.
    """
    result = await db.execute(select(Store).where(Store.id == store_id))
    store: Store | None = result.scalar_one_or_none()

    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    if store.household_id != current_user.household_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await db.delete(store)
    await db.commit()


# ---------------------------------------------------------------------------
# UPC Lookup
# ---------------------------------------------------------------------------


@router.get("/lookup/{upc}", response_model=UpcLookupResponse)
async def lookup_upc(
    upc: str,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> UpcLookupResponse:
    """Look up a UPC barcode.

    1. Check if the UPC already exists in the household catalog.
       - If yes: return ``found=True`` with the existing product.
    2. Query Open Food Facts for the UPC.
       - If found: return ``found=False`` with prefill data.
    3. If neither source has the product: return ``found=False, prefill=None``.
    """
    # Check household catalog first
    result = await db.execute(
        select(Product).where(
            Product.household_id == current_user.household_id,
            Product.upc == upc,
        )
    )
    existing: Product | None = result.scalar_one_or_none()
    if existing is not None:
        return UpcLookupResponse(
            found=True,
            product=ProductResponse.model_validate(existing),
            prefill=None,
        )

    # Query Open Food Facts
    off_data = await off_client.lookup_upc(upc)
    if off_data is not None:
        return UpcLookupResponse(
            found=False,
            product=None,
            prefill={
                "name": off_data.get("name"),
                "brand": off_data.get("brand"),
                "quantity": off_data.get("quantity"),
            },
        )

    # Not found anywhere
    return UpcLookupResponse(found=False, product=None, prefill=None)


# ---------------------------------------------------------------------------
# Product CRUD
# ---------------------------------------------------------------------------


@router.post(
    "/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_product(
    name: str = Form(...),
    brand: str | None = Form(None),
    quantity: str | None = Form(None),
    store_id: int | None = Form(None),
    upc: str | None = Form(None),
    photo: UploadFile | None = File(None),
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> ProductResponse:
    """Create a new product in the household catalog.

    Accepts multipart/form-data so that an optional photo can be uploaded
    alongside the product fields in a single request.
    If a photo is provided it is uploaded to the Photo Store and the
    returned URL is stored on the product.
    """
    photo_url: str | None = None
    if photo is not None and photo.filename:
        photo_url = await photo_service.upload_photo(photo)

    product = Product(
        household_id=current_user.household_id,
        name=name,
        brand=brand,
        quantity=quantity,
        store_id=store_id,
        upc=upc,
        photo_url=photo_url,
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return ProductResponse.model_validate(product)


@router.get("/products", response_model=list[ProductResponse])
async def list_products(
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProductResponse]:
    """Return all products belonging to the current user's household."""
    result = await db.execute(
        select(Product).where(Product.household_id == current_user.household_id)
    )
    products = result.scalars().all()
    return [ProductResponse.model_validate(p) for p in products]


@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> ProductResponse:
    """Return a single product.

    - 404 if the product does not exist.
    - 403 if the product belongs to a different household (never reveal existence).
    """
    result = await db.execute(select(Product).where(Product.id == product_id))
    product: Product | None = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if product.household_id != current_user.household_id:
        # Return 403 without revealing the resource exists (Req 13.3)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return ProductResponse.model_validate(product)


@router.patch("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    body: ProductUpdate,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> ProductResponse:
    """Update one or more fields on an existing product.

    Only fields explicitly provided (non-None) in the request body are updated.

    - 404 if the product does not exist.
    - 403 if the product belongs to a different household.
    """
    result = await db.execute(select(Product).where(Product.id == product_id))
    product: Product | None = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if product.household_id != current_user.household_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(product, field, value)

    # When store_id changes, cascade the new store_id to all active list items
    # for this product in the same household (Req 7.3)
    if "store_id" in update_data:
        await db.execute(
            update(ListItem)
            .where(
                ListItem.household_id == current_user.household_id,
                ListItem.product_id == product_id,
            )
            .values(store_id=update_data["store_id"])
        )

    await db.commit()
    await db.refresh(product)
    return ProductResponse.model_validate(product)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: int,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a product from the household catalog.

    - Deletes the associated photo from the Photo Store (best-effort).
    - DB cascade removes all List_Items that reference this product.
    - 404 if the product does not exist.
    - 403 if the product belongs to a different household.
    """
    result = await db.execute(select(Product).where(Product.id == product_id))
    product: Product | None = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if product.household_id != current_user.household_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Best-effort photo deletion — errors are logged inside delete_photo, not raised
    if product.photo_url:
        await photo_service.delete_photo(product.photo_url)

    await db.delete(product)
    await db.commit()
