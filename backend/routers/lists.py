"""List Service router — shopping list CRUD endpoints."""

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db import get_db
from backend.models.list_item import ListItem
from backend.models.product import Product
from backend.models.store import Store
from backend.models.user import User
from backend.schemas.lists import (
    ListItemCreate,
    ListItemResponse,
    ListItemUpdate,
    ShoppingListResponse,
    StoreListSection,
    WsEvent,
)
from backend.services import ws_manager
from backend.services.auth_service import get_current_household_user

router = APIRouter(prefix="/api/lists", tags=["lists"])


# ---------------------------------------------------------------------------
# GET /api/lists
# ---------------------------------------------------------------------------


@router.get("", response_model=ShoppingListResponse)
async def get_shopping_list(
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> ShoppingListResponse:
    """Return all list items for the household, grouped by store.

    Items with no store are placed in an "Unassigned" section (store_id=None).
    """
    result = await db.execute(
        select(ListItem)
        .where(ListItem.household_id == current_user.household_id)
        .options(selectinload(ListItem.product))
    )
    items: list[ListItem] = list(result.scalars().all())

    # Collect unique store IDs (excluding None)
    store_ids = {item.store_id for item in items if item.store_id is not None}

    # Fetch store names in one query
    store_names: dict[int, str] = {}
    if store_ids:
        stores_result = await db.execute(
            select(Store).where(Store.id.in_(store_ids))
        )
        for store in stores_result.scalars().all():
            store_names[store.id] = store.name

    # Group items by store_id
    grouped: dict[int | None, list[ListItem]] = defaultdict(list)
    for item in items:
        grouped[item.store_id].append(item)

    # Build sections — assigned stores first, then unassigned
    sections: list[StoreListSection] = []

    for store_id, store_items in grouped.items():
        if store_id is None:
            continue  # handle unassigned last
        sections.append(
            StoreListSection(
                store_id=store_id,
                store_name=store_names.get(store_id),
                items=[ListItemResponse.model_validate(i) for i in store_items],
            )
        )

    # Unassigned section
    if None in grouped:
        sections.append(
            StoreListSection(
                store_id=None,
                store_name="Unassigned",
                items=[ListItemResponse.model_validate(i) for i in grouped[None]],
            )
        )

    return ShoppingListResponse(sections=sections)


# ---------------------------------------------------------------------------
# POST /api/lists/items
# ---------------------------------------------------------------------------


@router.post(
    "/items",
    response_model=ListItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_list_item(
    body: ListItemCreate,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> ListItemResponse:
    """Add a product to the shopping list.

    If a list item for the same product already exists in this household,
    increment its quantity instead of creating a duplicate (Req 6.3).
    """
    # Load and verify the product belongs to this household
    product_result = await db.execute(
        select(Product).where(Product.id == body.product_id)
    )
    product: Product | None = product_result.scalar_one_or_none()

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )
    if product.household_id != current_user.household_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )

    # Check for an existing list item for this (household, product) pair
    existing_result = await db.execute(
        select(ListItem)
        .where(
            ListItem.household_id == current_user.household_id,
            ListItem.product_id == body.product_id,
        )
        .options(selectinload(ListItem.product))
    )
    existing: ListItem | None = existing_result.scalar_one_or_none()

    if existing is not None:
        # Increment quantity
        existing.quantity += body.quantity
        await db.commit()
        await db.refresh(existing)
        # Reload with product relationship
        refreshed_result = await db.execute(
            select(ListItem)
            .where(ListItem.id == existing.id)
            .options(selectinload(ListItem.product))
        )
        item = refreshed_result.scalar_one()
        event = WsEvent(
            event="item_qty_changed",
            item_id=item.id,
            payload={"quantity": item.quantity},
        )
        store_id_for_broadcast = item.store_id
    else:
        # Create new list item
        item = ListItem(
            household_id=current_user.household_id,
            product_id=body.product_id,
            store_id=product.store_id,
            quantity=body.quantity,
            checked=False,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        # Reload with product relationship
        refreshed_result = await db.execute(
            select(ListItem)
            .where(ListItem.id == item.id)
            .options(selectinload(ListItem.product))
        )
        item = refreshed_result.scalar_one()
        event = WsEvent(
            event="item_added",
            item_id=item.id,
            payload={},
        )
        store_id_for_broadcast = item.store_id

    # Broadcast — use store_id if set, otherwise skip (no WS channel for unassigned)
    if store_id_for_broadcast is not None:
        await ws_manager.manager.broadcast(store_id_for_broadcast, event.model_dump())

    return ListItemResponse.model_validate(item)


# ---------------------------------------------------------------------------
# PATCH /api/lists/items/{id}
# ---------------------------------------------------------------------------


@router.patch("/items/{item_id}", response_model=ListItemResponse)
async def update_list_item(
    item_id: int,
    body: ListItemUpdate,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> ListItemResponse:
    """Update quantity and/or checked state of a list item."""
    result = await db.execute(
        select(ListItem)
        .where(ListItem.id == item_id)
        .options(selectinload(ListItem.product))
    )
    item: ListItem | None = result.scalar_one_or_none()

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="List item not found"
        )
    if item.household_id != current_user.household_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )

    checked_changed = body.checked is not None and body.checked != item.checked
    qty_changed = body.quantity is not None and body.quantity != item.quantity

    if body.quantity is not None:
        item.quantity = body.quantity
    if body.checked is not None:
        item.checked = body.checked

    await db.commit()
    await db.refresh(item)

    # Reload with product relationship after refresh
    refreshed_result = await db.execute(
        select(ListItem)
        .where(ListItem.id == item.id)
        .options(selectinload(ListItem.product))
    )
    item = refreshed_result.scalar_one()

    # Determine broadcast event
    if checked_changed:
        event_type = "item_checked" if item.checked else "item_unchecked"
    elif qty_changed:
        event_type = "item_qty_changed"
    else:
        event_type = "item_qty_changed"  # fallback for no-op patches

    event = WsEvent(
        event=event_type,
        item_id=item.id,
        payload={"quantity": item.quantity, "checked": item.checked},
    )

    if item.store_id is not None:
        await ws_manager.manager.broadcast(item.store_id, event.model_dump())

    return ListItemResponse.model_validate(item)


# ---------------------------------------------------------------------------
# DELETE /api/lists/items/{id}
# ---------------------------------------------------------------------------


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_list_item(
    item_id: int,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a list item from the shopping list."""
    result = await db.execute(
        select(ListItem).where(ListItem.id == item_id)
    )
    item: ListItem | None = result.scalar_one_or_none()

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="List item not found"
        )
    if item.household_id != current_user.household_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )

    store_id = item.store_id
    await db.delete(item)
    await db.commit()

    event = WsEvent(event="item_removed", item_id=item_id, payload={})
    if store_id is not None:
        await ws_manager.manager.broadcast(store_id, event.model_dump())


# ---------------------------------------------------------------------------
# POST /api/lists/{store_id}/clear-checked
# ---------------------------------------------------------------------------


@router.post("/{store_id}/clear-checked")
async def clear_checked_items(
    store_id: int,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete all checked items for a given store in this household."""
    # Find items to delete so we know the count
    result = await db.execute(
        select(ListItem).where(
            ListItem.household_id == current_user.household_id,
            ListItem.store_id == store_id,
            ListItem.checked.is_(True),
        )
    )
    items_to_delete = result.scalars().all()
    count = len(items_to_delete)

    if count > 0:
        await db.execute(
            delete(ListItem).where(
                ListItem.household_id == current_user.household_id,
                ListItem.store_id == store_id,
                ListItem.checked.is_(True),
            )
        )
        await db.commit()

    event = WsEvent(
        event="list_cleared",
        item_id=None,
        payload={"cleared": count},
    )
    await ws_manager.manager.broadcast(store_id, event.model_dump())

    return {"cleared": count}


# ---------------------------------------------------------------------------
# POST /api/lists/{store_id}/reset
# ---------------------------------------------------------------------------


@router.post("/{store_id}/reset")
async def reset_list(
    store_id: int,
    current_user: User = Depends(get_current_household_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set all list items for a store to unchecked."""
    result = await db.execute(
        update(ListItem)
        .where(
            ListItem.household_id == current_user.household_id,
            ListItem.store_id == store_id,
        )
        .values(checked=False)
    )
    count = result.rowcount
    await db.commit()

    event = WsEvent(
        event="list_reset",
        item_id=None,
        payload={"reset": count},
    )
    await ws_manager.manager.broadcast(store_id, event.model_dump())

    return {"reset": count}
