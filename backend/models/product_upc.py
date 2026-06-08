"""SQLAlchemy ORM model for the ProductUpc table.

Allows a product to have multiple known UPCs (e.g. same item from different stores).
"""

from sqlalchemy import ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from backend.db import Base


class ProductUpc(Base):
    __tablename__ = "product_upcs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    upc: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="manual")
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationship back to the product
    product: Mapped["Product"] = relationship("Product", back_populates="upcs")

    __table_args__ = (UniqueConstraint("product_id", "upc", name="uq_product_upcs_product_id_upc"),)
