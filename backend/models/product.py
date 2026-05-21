"""SQLAlchemy ORM model for the Product table."""

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from backend.db import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    upc: Mapped[str | None] = mapped_column(Text, nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[str | None] = mapped_column(Text, nullable=True)
    store_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True
    )
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    household: Mapped["Household"] = relationship(
        "Household", back_populates="products"
    )
    store: Mapped["Store | None"] = relationship(
        "Store", back_populates="products"
    )
    list_items: Mapped[list["ListItem"]] = relationship(
        "ListItem", back_populates="product", cascade="all, delete-orphan"
    )
