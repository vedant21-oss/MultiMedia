"""Shared test fixtures.

Tests run against a throwaway SQLite database and never touch the real
Postgres instance or the real storage directory. AI providers are stubbed, so
the suite runs offline and costs nothing.
"""
from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# Must be set before app.core.config is imported anywhere.
_TMP = tempfile.mkdtemp(prefix="creatorai-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["STORAGE_DIR"] = f"{_TMP}/storage"
os.environ["JWT_SECRET"] = "test-secret-not-used-in-production"
os.environ["GEMINI_API_KEY"] = ""          # forces demo mode
os.environ["ENV"] = "test"

from fastapi.testclient import TestClient  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
import app.models  # noqa: E402,F401  - registers tables
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema() -> Iterator[None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clean_db() -> Iterator[None]:
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def storage_dir() -> Path:
    return Path(_TMP) / "storage"


def _register(client: TestClient, email: str, password: str = "hackathon1") -> dict:
    response = client.post(
        "/api/auth/register",
        json={"full_name": "Test User", "email": email, "password": password},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def user(client: TestClient) -> dict:
    return _register(client, "primary@devcrew.io")


@pytest.fixture
def other_user(client: TestClient) -> dict:
    return _register(client, "secondary@devcrew.io")


@pytest.fixture
def auth(user: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['tokens']['access_token']}"}


@pytest.fixture
def other_auth(other_user: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {other_user['tokens']['access_token']}"}


@pytest.fixture
def project(client: TestClient, auth: dict[str, str]) -> dict:
    response = client.post(
        "/api/projects",
        json={"name": "Test Project", "description": "Fixture project"},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def text_file() -> tuple[str, bytes, str]:
    content = (
        b"Neural networks learn by adjusting weights through backpropagation.\n"
        b"Overfitting happens when a model memorises the training data.\n"
        b"Dropout at 0.5 reduces overfitting in fully connected layers.\n"
        b"The assignment is due on 30 March 2026.\n"
    )
    return ("lecture.txt", content, "text/plain")
