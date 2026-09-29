"""One user must never be able to see or touch another user's data.

Every check here asserts 404 rather than 403: confirming that a resource exists
but is forbidden is itself a leak.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_projects_are_scoped_to_their_owner(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
):
    created = client.post("/api/projects", json={"name": "Private"}, headers=auth).json()

    mine = client.get("/api/projects", headers=auth).json()
    theirs = client.get("/api/projects", headers=other_auth).json()

    assert any(p["id"] == created["id"] for p in mine)
    assert not any(p["id"] == created["id"] for p in theirs)


def test_reading_another_users_project_returns_404(
    client: TestClient, project: dict, other_auth: dict[str, str]
):
    response = client.get(f"/api/projects/{project['id']}", headers=other_auth)
    assert response.status_code == 404


def test_writing_to_another_users_project_returns_404(
    client: TestClient, project: dict, other_auth: dict[str, str]
):
    assert client.patch(
        f"/api/projects/{project['id']}", json={"name": "Hijacked"}, headers=other_auth
    ).status_code == 404
    assert client.delete(f"/api/projects/{project['id']}", headers=other_auth).status_code == 404


def test_uploading_into_another_users_project_returns_404(
    client: TestClient, project: dict, other_auth: dict[str, str], text_file
):
    name, content, mime = text_file
    response = client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", (name, content, mime))],
        headers=other_auth,
    )
    assert response.status_code == 404


def test_another_users_media_is_not_readable(
    client: TestClient, project: dict, auth: dict[str, str], other_auth: dict[str, str], text_file
):
    name, content, mime = text_file
    upload = client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", (name, content, mime))],
        headers=auth,
    )
    asset_id = upload.json()["assets"][0]["id"]

    for path in (f"/api/media/{asset_id}", f"/api/media/{asset_id}/file", f"/api/media/{asset_id}/status"):
        assert client.get(path, headers=other_auth).status_code == 404, path

    assert client.delete(f"/api/media/{asset_id}", headers=other_auth).status_code == 404


def test_generating_against_another_users_project_returns_404(
    client: TestClient, project: dict, other_auth: dict[str, str]
):
    response = client.post(
        "/api/generate",
        json={"project_id": project["id"], "content_type": "caption"},
        headers=other_auth,
    )
    assert response.status_code == 404


def test_chat_against_another_users_project_returns_404(
    client: TestClient, project: dict, other_auth: dict[str, str]
):
    response = client.post(
        "/api/chat",
        json={"project_id": project["id"], "message": "What is in here?"},
        headers=other_auth,
    )
    assert response.status_code == 404


def test_search_against_another_users_project_returns_404(
    client: TestClient, project: dict, other_auth: dict[str, str]
):
    response = client.post(
        "/api/search",
        json={"project_id": project["id"], "query": "anything"},
        headers=other_auth,
    )
    assert response.status_code == 404


def test_analytics_only_counts_your_own_data(
    client: TestClient, project: dict, auth: dict[str, str], other_auth: dict[str, str], text_file
):
    name, content, mime = text_file
    client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", (name, content, mime))],
        headers=auth,
    )

    mine = client.get("/api/analytics/overview", headers=auth).json()
    theirs = client.get("/api/analytics/overview", headers=other_auth).json()

    assert mine["totals"]["assets"] >= 1
    assert theirs["totals"]["assets"] == 0
