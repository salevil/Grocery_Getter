"""Auth router — registration, login, and health check."""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_db
from backend.models.household import Household
from backend.models.invitation import Invitation
from backend.models.user import User
from backend.schemas.auth import (
    HouseholdCreate,
    HouseholdResponse,
    InviteRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)
from backend.services.auth_service import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Email stub
# ---------------------------------------------------------------------------

def send_invitation_email(email: str, token: str) -> None:
    """Stub — logs the invitation details instead of sending a real email."""
    logger.info("Invitation email to %s: join token = %s", email, token)


@router.get("/health")
async def auth_health() -> dict:
    """Placeholder route — kept for health checks."""
    return {"status": "ok", "router": "auth"}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Register a new user account.

    - Validates email uniqueness (400 if already taken).
    - Password length ≥ 8 chars is enforced by the RegisterRequest schema.
    - Returns a JWT with no household claim (user has not joined one yet).

    Requirements: 1.1, 1.2, 1.3, 1.4
    """
    # Check for duplicate email
    result = await db.execute(select(User).where(User.email == body.email))
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create the user
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, None)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Authenticate an existing user.

    - Returns a generic 401 for both unrecognised email and wrong password
      so as not to reveal which field is incorrect (Req 1.6).
    - Returns a JWT that includes the user's current household_id claim.

    Requirements: 1.5, 1.6
    """
    _auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
    )

    result = await db.execute(select(User).where(User.email == body.email))
    user: User | None = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise _auth_error

    token = create_access_token(user.id, user.household_id)
    return TokenResponse(access_token=token)


@router.post("/households", status_code=status.HTTP_201_CREATED)
async def create_household(
    body: HouseholdCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Create a new Household and assign the requesting user as its first member.

    - Returns 400 if the user already belongs to a household (Req 2.2).
    - Returns a fresh JWT with the new `household_id` claim alongside the
      created household resource (Req 2.1, 13.4).

    Requirements: 2.1, 2.2, 13.4
    """
    if current_user.household_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already a member of a household",
        )

    household = Household(name=body.name)
    db.add(household)
    await db.flush()  # populate household.id before assigning

    current_user.household_id = household.id
    await db.commit()
    await db.refresh(household)
    await db.refresh(current_user)

    token = create_access_token(current_user.id, household.id)
    return {
        "token": TokenResponse(access_token=token),
        "household": HouseholdResponse.model_validate(household),
    }


@router.post("/households/invite")
async def invite_to_household(
    body: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Generate an invitation token for the given email address.

    - Requires the requesting user to already belong to a household.
    - Stores an `Invitation` row with a 7-day expiry.
    - Calls `send_invitation_email` (stub — logs only).
    - Returns the token in the response for dev/testing convenience.

    Requirements: 2.3
    """
    if current_user.household_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must belong to a household before inviting others",
        )

    invite_token = str(uuid.uuid4())
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=7)

    invitation = Invitation(
        household_id=current_user.household_id,
        token=invite_token,
        email=str(body.email),
        used=False,
        expires_at=expires_at,
    )
    db.add(invitation)
    await db.commit()

    send_invitation_email(str(body.email), invite_token)

    return {"message": "Invitation sent", "token": invite_token}


@router.get("/households/join/{token}", response_model=TokenResponse)
async def join_household(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Accept a household invitation and add the current user to the household.

    - Returns 400 for missing, used, or expired tokens (Req 2.5).
    - Returns 400 if the user already belongs to a household (Req 2.2).
    - Returns a fresh JWT with the updated `household_id` claim (Req 13.4).

    Requirements: 2.2, 2.4, 2.5, 13.4
    """
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation: Invitation | None = result.scalar_one_or_none()

    now = datetime.now(tz=timezone.utc)

    if (
        invitation is None
        or invitation.used
        or invitation.expires_at.replace(tzinfo=timezone.utc) < now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation",
        )

    if current_user.household_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already a member of a household",
        )

    current_user.household_id = invitation.household_id
    invitation.used = True
    await db.commit()
    await db.refresh(current_user)

    new_token = create_access_token(current_user.id, current_user.household_id)
    return TokenResponse(access_token=new_token)
