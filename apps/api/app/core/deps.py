# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""
FastAPI dependency: extract the current user identity from the Authorization header.

Returns a lightweight stateless CurrentUser extracted from the signed token
claims.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from jose.exceptions import JWKError
from pydantic import BaseModel

from app.core.security import decode_access_token

bearer_scheme = HTTPBearer()


class CurrentUser(BaseModel):
    """Stateless identity extracted from the RS256 JWT claims."""

    id: str
    username: str | None = None


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        return CurrentUser(
            id=payload["sub"],
            username=payload.get("usr"),
        )
    except (JWTError, JWKError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
