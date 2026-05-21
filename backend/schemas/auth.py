"""Pydantic v2 schemas for the Auth Service.

Covers user registration/login, JWT token responses, household creation,
member invitations, and household response payloads.
"""

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class RegisterRequest(BaseModel):
    """Request body for POST /api/auth/register."""

    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v


class LoginRequest(BaseModel):
    """Request body for POST /api/auth/login."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Response body returned after successful registration or login."""

    access_token: str
    token_type: str = "bearer"


class HouseholdCreate(BaseModel):
    """Request body for POST /api/auth/households."""

    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if len(v.strip()) < 1:
            raise ValueError("Household name must not be empty.")
        return v


class InviteRequest(BaseModel):
    """Request body for POST /api/auth/households/invite."""

    email: EmailStr


class HouseholdResponse(BaseModel):
    """Response body representing a Household resource."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
