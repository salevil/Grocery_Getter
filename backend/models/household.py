"""SQLAlchemy ORM model for the Household table."""

from sqlalchemy import Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from backend.db import Base


class Household(Base):
    __tablename__ = "households"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="household")
    invitations: Mapped[list["Invitation"]] = relationship(
        "Invitation", back_populates="household", cascade="all, delete-orphan"
    )
    stores: Mapped[list["Store"]] = relationship(
        "Store", back_populates="household", cascade="all, delete-orphan"
    )
    products: Mapped[list["Product"]] = relationship(
        "Product", back_populates="household", cascade="all, delete-orphan"
    )
    list_items: Mapped[list["ListItem"]] = relationship(
        "ListItem", back_populates="household", cascade="all, delete-orphan"
    )
