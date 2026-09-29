"""Authentication, validation and token handling."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password, verify_password


def test_register_returns_user_and_tokens(client: TestClient):
    response = client.post(
        "/api/auth/register",
        json={"full_name": "Ada Lovelace", "email": "ada@devcrew.io", "password": "analytical1"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "ada@devcrew.io"
    assert body["tokens"]["access_token"]
    assert body["tokens"]["refresh_token"]
    # The hash must never leave the server.
    assert "password" not in str(body).lower() or "password_hash" not in body["user"]


def test_password_is_hashed_not_stored_plain():
    hashed = hash_password("hackathon1")
    assert hashed != "hackathon1"
    assert hashed.startswith("$2")
    assert verify_password("hackathon1", hashed)
    assert not verify_password("wrong", hashed)


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"full_name": "A", "email": "a@devcrew.io", "password": "hackathon1"}, "full_name"),
        ({"full_name": "Ok Name", "email": "not-an-email", "password": "hackathon1"}, "email"),
        ({"full_name": "Ok Name", "email": "b@devcrew.io", "password": "short1"}, "password"),
        ({"full_name": "Ok Name", "email": "c@devcrew.io", "password": "nodigitshere"}, "password"),
    ],
)
def test_register_rejects_bad_input(client: TestClient, payload: dict, field: str):
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert field in body["fields"]


def test_duplicate_email_is_rejected(client: TestClient):
    payload = {"full_name": "Dup User", "email": "dup@devcrew.io", "password": "hackathon1"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    second = client.post("/api/auth/register", json=payload)
    assert second.status_code == 409
    assert second.json()["code"] == "email_taken"


def test_login_succeeds_and_wrong_password_fails(client: TestClient):
    client.post(
        "/api/auth/register",
        json={"full_name": "Log In", "email": "login@devcrew.io", "password": "hackathon1"},
    )
    ok = client.post("/api/auth/login", json={"email": "login@devcrew.io", "password": "hackathon1"})
    assert ok.status_code == 200

    bad = client.post("/api/auth/login", json={"email": "login@devcrew.io", "password": "wrongpass1"})
    assert bad.status_code == 401
    assert bad.json()["code"] == "invalid_credentials"


def test_login_does_not_reveal_whether_an_account_exists(client: TestClient):
    """Unknown email and wrong password must be indistinguishable."""
    client.post(
        "/api/auth/register",
        json={"full_name": "Known", "email": "known@devcrew.io", "password": "hackathon1"},
    )
    wrong_password = client.post(
        "/api/auth/login", json={"email": "known@devcrew.io", "password": "wrongpass1"}
    )
    unknown_email = client.post(
        "/api/auth/login", json={"email": "ghost@devcrew.io", "password": "wrongpass1"}
    )
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_me_requires_authentication(client: TestClient):
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_the_current_user(client: TestClient, auth: dict[str, str]):
    response = client.get("/api/auth/me", headers=auth)
    assert response.status_code == 200
    assert response.json()["email"] == "primary@devcrew.io"


def test_refresh_token_issues_a_new_access_token(client: TestClient, user: dict):
    response = client.post(
        "/api/auth/refresh", json={"refresh_token": user["tokens"]["refresh_token"]}
    )
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_access_token_is_rejected_by_the_refresh_endpoint(client: TestClient, user: dict):
    """An access token must not be usable to mint new tokens."""
    response = client.post(
        "/api/auth/refresh", json={"refresh_token": user["tokens"]["access_token"]}
    )
    assert response.status_code == 401


def test_garbage_token_is_rejected(client: TestClient):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert response.status_code == 401


def test_change_password_requires_the_current_one(client: TestClient, auth: dict[str, str]):
    wrong = client.post(
        "/api/auth/change-password",
        json={"current_password": "notitatall1", "new_password": "brandnew12"},
        headers=auth,
    )
    assert wrong.status_code == 400

    right = client.post(
        "/api/auth/change-password",
        json={"current_password": "hackathon1", "new_password": "brandnew12"},
        headers=auth,
    )
    assert right.status_code == 200
    assert client.post(
        "/api/auth/login", json={"email": "primary@devcrew.io", "password": "brandnew12"}
    ).status_code == 200
