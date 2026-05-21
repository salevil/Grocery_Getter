"""SQLAlchemy ORM model for the ListItem table."""

from sqlalchemy import Boolean, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from backend.db import Base


class ListItem(Base):
    __tablename__ = "list_items"
    __table_args__ = (UniqueConstraint("household_id", "product_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    store_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1"
    )
    checked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
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
        "Household", back_populates="list_items"
    )
    product: Mapped["Product"] = relationship(
        "Product", back_populates="list_items"
    )
    store: Mapped["Store | None"] = relationship(
        "Store", back_populates="list_items"
    )
