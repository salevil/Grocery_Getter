"""Catalog router — store and product endpoints."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db import get_db
from backend.models.list_item import ListItem
from backend.models.product import Product
from backend.models.product_upc import ProductUpc
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

    1. Check product_upcs table for a known UPC link scoped to this household.
    2. Check legacy Product.upc column.
    3. Query Open Food Facts for prefill data + off_categories.
    4. Score unchecked list items by fuzzy word overlap with the scanned name.
       Return up to 3 candidates with score > 0 as category_candidates.
    5. If OFF returns nothing: found=False, prefill=None, category_candidates=None.
    """
    # --- Step 1: check product_upcs table ---
    upc_result = await db.execute(
        select(ProductUpc)
        .join(Product, ProductUpc.product_id == Product.id)
        .where(
            ProductUpc.upc == upc,
            Product.household_id == current_user.household_id,
        )
        .options(selectinload(ProductUpc.product))
    )
    upc_row = upc_result.scalar_one_or_none()
    if upc_row is not None:
        return UpcLookupResponse(
            found=True,
            product=ProductResponse.model_validate(upc_row.product),
            prefill=None,
            category_candidates=None,
        )

    # --- Step 2: check legacy Product.upc column ---
    legacy_result = await db.execute(
        select(Product).where(
            Product.household_id == current_user.household_id,
            Product.upc == upc,
        )
    )
    existing: Product | None = legacy_result.scalar_one_or_none()
    if existing is not None:
        return UpcLookupResponse(
            found=True,
            product=ProductResponse.model_validate(existing),
            prefill=None,
            category_candidates=None,
        )

    # --- Step 3: query Open Food Facts ---
    off_data = await off_client.lookup_upc(upc)
    if off_data is None:
        return UpcLookupResponse(found=False, product=None, prefill=None, category_candidates=None)

    prefill = {
        "name": off_data.get("name"),
        "brand": off_data.get("brand"),
        "quantity": off_data.get("quantity"),
    }

    # --- Step 4: fuzzy-match against unchecked list items ---
    off_name: str = off_data.get("name") or ""
    off_categories: list[str] = off_data.get("off_categories") or []

    # Words from the OFF product name that are meaningful (≥4 chars)
    off_name_words = {w.lower() for w in off_name.split() if len(w) >= 4}

    # Normalised OFF category tags (strip "en:" prefix, lowercase)
    off_cat_tags = {t.lower().removeprefix("en:") for t in off_categories}

    # Load all unchecked list items for this household, with their products
    items_result = await db.execute(
        select(ListItem)
        .join(Product, ListItem.product_id == Product.id)
        .where(
            ListItem.household_id == current_user.household_id,
            ListItem.checked.is_(False),
        )
        .options(selectinload(ListItem.product))
    )
    list_items = items_result.scalars().all()

    scored: list[dict] = []
    for li in list_items:
        if li.product is None:
            continue
        score = 0
        item_name_lower = li.product.name.lower()

        # +2 for each meaningful word from the OFF name that appears in the item name
        for word in off_name_words:
            if word in item_name_lower:
                score += 2

        # +1 if the product's category (lowercased) overlaps with any OFF tag
        if li.product.category:
            item_cat_lower = li.product.category.lower()
            for tag in off_cat_tags:
                # Compare stripped tag words against our category string
                tag_words = {w for w in tag.replace("-", " ").split() if len(w) >= 4}
                if any(tw in item_cat_lower for tw in tag_words):
                    score += 1
                    break

        if score > 0:
            scored.append({
                "list_item_id": li.id,
                "product_id": li.product.id,
                "product_name": li.product.name,
                "score": score,
            })

    # Sort by score descending, take top 3
    scored.sort(key=lambda x: x["score"], reverse=True)
    category_candidates = scored[:3] if scored else None

    return UpcLookupResponse(
        found=False,
        product=None,
        prefill=prefill,
        category_candidates=category_candidates,
    )


# ---------------------------------------------------------------------------
# Save UPC link for a product
# ---------------------------------------------------------------------------


class UpcLinkBody(BaseModel):
    upc: str
    source: str = "manual"


@router.post("/products/{product_id}/upcs")
async def add_product_upc(
    product_id: int,
    body: UpcLinkBody,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Link a UPC to a product (e.g. after a category-match confirmation).

    Uses ON CONFLICT DO NOTHING so duplicate scans are safe.
    """
    # Verify product belongs to this household
    prod_result = await db.execute(select(Product).where(Product.id == product_id))
    product: Product | None = prod_result.scalar_one_or_none()
    if product is None or product.household_id != current_user.household_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    stmt = (
        pg_insert(ProductUpc)
        .values(product_id=product_id, upc=body.upc, source=body.source)
        .on_conflict_do_nothing(constraint="uq_product_upcs_product_id_upc")
    )
    await db.execute(stmt)
    await db.commit()

    return {"ok": True}


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
    category: str | None = Form(None),
    photo: UploadFile | None = File(None),
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> ProductResponse:
    """Create a new product in the household catalog."""
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
        category=category,
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


@router.post("/products/{product_id}/photo", response_model=ProductResponse)
async def upload_product_photo(
    product_id: int,
    photo: UploadFile = File(...),
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> ProductResponse:
    """Upload or replace the photo for an existing product."""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product: Product | None = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if product.household_id != current_user.household_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Delete old photo if exists
    if product.photo_url:
        await photo_service.delete_photo(product.photo_url)

    product.photo_url = await photo_service.upload_photo(photo)
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
