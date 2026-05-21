"""SQLAlchemy ORM model for the Store table."""

from sqlalchemy import ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from backend.db import Base


class Store(Base):
    __tablename__ = "stores"
    __table_args__ = (UniqueConstraint("household_id", "name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    household: Mapped["Household"] = relationship(
        "Household", back_populates="stores"
    )
    products: Mapped[list["Product"]] = relationship(
        "Product", back_populates="store"
    )
    list_items: Mapped[list["ListItem"]] = relationship(
        "ListItem", back_populates="store"
    )
