"""Shared FastAPI dependencies: authentication and ownership checks."""
from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import Depends, Header, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFound
from app.core.security import decode_token
from app.db.session import get_db
from app.models.media import MediaAsset
from app.models.project import Project
from app.models.user import User

bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def _unauthorized(detail: str = "Not authenticated") -> AppError:
    return AppError(detail, status.HTTP_401_UNAUTHORIZED, "unauthenticated")


async def get_current_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
    token_query: Annotated[str | None, Query(alias="token", include_in_schema=False)] = None,
) -> User:
    """Reads a bearer token, or ?token= for <img>/<video> tags that cannot set headers."""
    raw = creds.credentials if creds else token_query
    if not raw:
        raise _unauthorized()

    try:
        payload = decode_token(raw, "access")
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Your session expired. Please sign in again.") from exc
    except jwt.PyJWTError as exc:
        raise _unauthorized("Invalid authentication token") from exc

    user = db.get(User, payload.get("sub", ""))
    if user is None or not user.is_active:
        raise _unauthorized("Account is no longer active")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_owned_project(project_id: str, db: DbSession, user: CurrentUser) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:
        # 404 rather than 403: never confirm that another user's project exists.
        raise NotFound("Project")
    return project


OwnedProject = Annotated[Project, Depends(get_owned_project)]


def get_owned_asset(media_id: str, db: DbSession, user: CurrentUser) -> MediaAsset:
    asset = db.get(MediaAsset, media_id)
    if asset is None or asset.owner_id != user.id:
        raise NotFound("Media asset")
    return asset


OwnedAsset = Annotated[MediaAsset, Depends(get_owned_asset)]
