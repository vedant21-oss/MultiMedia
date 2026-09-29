from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.core.rate_limit import auth_limiter
from app.core.security import (
    create_access_token, create_refresh_token, decode_token, hash_password, verify_password,
)
from app.models.planner import AuditEvent
from app.models.user import User
from app.schemas.auth import (
    AuthOut, LoginIn, PasswordChangeIn, ProfileUpdateIn, RefreshIn, RegisterIn, TokenPair, UserOut,
)
from app.schemas.common import Message

router = APIRouter(prefix="/auth", tags=["auth"])


def _tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def _audit(db, user_id: str | None, action: str, **detail) -> None:
    db.add(AuditEvent(owner_id=user_id, action=action, detail=detail))
    db.commit()


@router.post(
    "/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(auth_limiter)],
)
def register(payload: RegisterIn, db: DbSession):
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise AppError("An account with that email already exists", 409, "email_taken")

    user = User(
        email=email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _audit(db, user.id, "user.register")
    return AuthOut(user=UserOut.model_validate(user), tokens=_tokens(user))


@router.post("/login", response_model=AuthOut, dependencies=[Depends(auth_limiter)])
def login(payload: LoginIn, db: DbSession):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    # Identical response for unknown email and wrong password - no account enumeration.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AppError("Incorrect email or password", 401, "invalid_credentials")
    if not user.is_active:
        raise AppError("This account has been deactivated", 403, "account_disabled")
    _audit(db, user.id, "user.login")
    return AuthOut(user=UserOut.model_validate(user), tokens=_tokens(user))


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshIn, db: DbSession):
    import jwt as pyjwt

    try:
        claims = decode_token(payload.refresh_token, "refresh")
    except pyjwt.ExpiredSignatureError as exc:
        raise AppError("Your session expired. Please sign in again.", 401, "token_expired") from exc
    except pyjwt.PyJWTError as exc:
        raise AppError("Invalid refresh token", 401, "invalid_token") from exc

    user = db.get(User, claims.get("sub", ""))
    if user is None or not user.is_active:
        raise AppError("Account is no longer active", 401, "account_disabled")
    return _tokens(user)


@router.post("/logout", response_model=Message)
def logout(user: CurrentUser, db: DbSession):
    """Tokens are stateless, so the client discards them.

    Recorded for the audit trail. A deployment needing true server-side
    revocation should add a token denylist keyed on the `jti` claim.
    """
    _audit(db, user.id, "user.logout")
    return Message(detail="Signed out. Discard your tokens on the client.")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def update_me(payload: ProfileUpdateIn, user: CurrentUser, db: DbSession):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/change-password", response_model=Message, dependencies=[Depends(auth_limiter)])
def change_password(payload: PasswordChangeIn, user: CurrentUser, db: DbSession):
    if not verify_password(payload.current_password, user.password_hash):
        raise AppError("Your current password is incorrect", 400, "wrong_password")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    _audit(db, user.id, "user.password_change")
    return Message(detail="Password updated")
