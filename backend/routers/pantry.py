"""Pantry router — household pantry stock management."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db import get_db
from backend.models.pantry_item import PantryItem
from backend.models.product import Product
from backend.models.user import User
from backend.schemas.catalog import ProductResponse
from backend.services.auth_service import get_current_household_user

router = APIRouter(prefix="/api/pantry", tags=["pantry"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PantryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_id: int
    quantity: int
    product: ProductResponse


class PantryAdjust(BaseModel):
    quantity: int  # absolute value to set


class PantryDelta(BaseModel):
    delta: int  # +N to add, -N to remove


# ---------------------------------------------------------------------------
# GET /api/pantry — list all pantry items for the household
# ---------------------------------------------------------------------------

@router.get("", response_model=list[PantryItemResponse])
async def list_pantry(
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> list[PantryItemResponse]:
    result = await db.execute(
        select(PantryItem)
        .where(PantryItem.household_id == current_user.household_id)
        .options(selectinload(PantryItem.product))
        .order_by(PantryItem.updated_at.desc())
    )
    items = result.scalars().all()
    return [PantryItemResponse.model_validate(i) for i in items]


# ---------------------------------------------------------------------------
# POST /api/pantry/adjust — set absolute quantity for a product
# ---------------------------------------------------------------------------

@router.post("/adjust", response_model=PantryItemResponse)
async def adjust_pantry(
    body: PantryAdjust,
    product_id: int,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> PantryItemResponse:
    """Set the pantry quantity for a product to an absolute value."""
    # Verify product belongs to household
    prod_result = await db.execute(select(Product).where(Product.id == product_id))
    product = prod_result.scalar_one_or_none()
    if product is None or product.household_id != current_user.household_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    result = await db.execute(
        select(PantryItem)
        .where(
            PantryItem.household_id == current_user.household_id,
            PantryItem.product_id == product_id,
        )
        .options(selectinload(PantryItem.product))
    )
    item = result.scalar_one_or_none()

    if item is None:
        item = PantryItem(
            household_id=current_user.household_id,
            product_id=product_id,
            quantity=max(0, body.quantity),
        )
        db.add(item)
    else:
        item.quantity = max(0, body.quantity)

    await db.commit()
    await db.refresh(item)

    # Reload with product relationship
    result2 = await db.execute(
        select(PantryItem)
        .where(PantryItem.id == item.id)
        .options(selectinload(PantryItem.product))
    )
    item = result2.scalar_one()
    return PantryItemResponse.model_validate(item)


# ---------------------------------------------------------------------------
# POST /api/pantry/delta — increment or decrement quantity
# ---------------------------------------------------------------------------

@router.post("/delta", response_model=PantryItemResponse)
async def delta_pantry(
    body: PantryDelta,
    product_id: int,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> PantryItemResponse:
    """Add or subtract from pantry quantity. Quantity never goes below 0."""
    prod_result = await db.execute(select(Product).where(Product.id == product_id))
    product = prod_result.scalar_one_or_none()
    if product is None or product.household_id != current_user.household_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    result = await db.execute(
        select(PantryItem)
        .where(
            PantryItem.household_id == current_user.household_id,
            PantryItem.product_id == product_id,
        )
        .options(selectinload(PantryItem.product))
    )
    item = result.scalar_one_or_none()

    if item is None:
        new_qty = max(0, body.delta)
        item = PantryItem(
            household_id=current_user.household_id,
            product_id=product_id,
            quantity=new_qty,
        )
        db.add(item)
    else:
        item.quantity = max(0, item.quantity + body.delta)

    await db.commit()
    await db.refresh(item)

    result2 = await db.execute(
        select(PantryItem)
        .where(PantryItem.id == item.id)
        .options(selectinload(PantryItem.product))
    )
    item = result2.scalar_one()
    return PantryItemResponse.model_validate(item)


# ---------------------------------------------------------------------------
# GET /api/pantry/suggestions — products with quantity = 0
# ---------------------------------------------------------------------------

@router.get("/suggestions", response_model=list[PantryItemResponse])
async def pantry_suggestions(
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> list[PantryItemResponse]:
    """Return pantry items that have run out (quantity = 0)."""
    result = await db.execute(
        select(PantryItem)
        .where(
            PantryItem.household_id == current_user.household_id,
            PantryItem.quantity == 0,
        )
        .options(selectinload(PantryItem.product))
    )
    items = result.scalars().all()
    return [PantryItemResponse.model_validate(i) for i in items]


# ---------------------------------------------------------------------------
# GET /api/pantry/lookup/{upc} — look up pantry item by product UPC
# ---------------------------------------------------------------------------

@router.get("/lookup/{upc}")
async def lookup_pantry_by_upc(
    upc: str,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> dict | None:
    """Find a pantry item by scanning a product UPC.
    
    Returns the pantry item if it exists, or a synthetic entry with quantity=0
    if the product is in the catalog but not yet in the pantry.
    Returns None if the product is not in the catalog at all.
    """
    prod_result = await db.execute(
        select(Product).where(
            Product.household_id == current_user.household_id,
            Product.upc == upc,
        )
    )
    product = prod_result.scalar_one_or_none()
    if product is None:
        return None

    result = await db.execute(
        select(PantryItem)
        .where(
            PantryItem.household_id == current_user.household_id,
            PantryItem.product_id == product.id,
        )
        .options(selectinload(PantryItem.product))
    )
    item = result.scalar_one_or_none()
    
    if item is not None:
        return PantryItemResponse.model_validate(item).model_dump()
    
    # Product exists in catalog but no pantry entry yet — return synthetic entry
    from backend.schemas.catalog import ProductResponse
    return {
        "id": None,
        "product_id": product.id,
        "quantity": 0,
        "product": ProductResponse.model_validate(product).model_dump(),
    }
