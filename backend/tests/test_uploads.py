"""Upload validation, the ingestion pipeline, and safe file handling."""
from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.utils.files import classify, safe_filename


def _wait_ready(client: TestClient, asset_id: str, headers: dict, timeout: float = 25.0) -> dict:
    """Uploads return 202; poll until the background pipeline settles."""
    deadline = time.monotonic() + timeout
    body: dict = {}
    while time.monotonic() < deadline:
        body = client.get(f"/api/media/{asset_id}/status", headers=headers).json()
        if body["status"] in ("ready", "failed"):
            return body
        time.sleep(0.4)
    return body


# --------------------------------------------------------------------------- #
# Filename safety
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd", "passwd"),
        ("/absolute/path/video.mp4", "video.mp4"),
        ("C:\\Windows\\System32\\evil.pdf", "evil.pdf"),
        ("normal file (1).PNG", "normal_file_1_.PNG"),
        ("....//....//x.txt", "x.txt"),
    ],
)
def test_safe_filename_strips_path_components(raw: str, expected: str):
    assert safe_filename(raw) == expected


def test_safe_filename_never_returns_empty():
    assert safe_filename("...") != ""
    assert safe_filename("/") != ""


def test_storage_backend_rejects_keys_that_escape_the_root(storage_dir):
    from app.storage.local import LocalStorage

    storage = LocalStorage(storage_dir)
    with pytest.raises(ValueError, match="escapes the storage root"):
        storage.path("../../../etc/passwd")


def test_classify_maps_extensions_to_modalities():
    assert classify("clip.mp4")[2] == "video"
    assert classify("talk.mp3")[2] == "audio"
    assert classify("photo.JPG")[2] == "image"
    assert classify("paper.pdf")[2] == "document"
    assert classify("deck.pptx")[2] == "presentation"
    with pytest.raises(ValueError, match="Unsupported file type"):
        classify("malware.exe")


# --------------------------------------------------------------------------- #
# Upload endpoint
# --------------------------------------------------------------------------- #

def test_upload_requires_authentication(client: TestClient, project: dict, text_file):
    name, content, mime = text_file
    response = client.post(
        f"/api/projects/{project['id']}/media", files=[("files", (name, content, mime))]
    )
    assert response.status_code == 401


def test_unsupported_file_type_is_rejected_with_a_clear_message(
    client: TestClient, project: dict, auth: dict[str, str]
):
    response = client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", ("payload.exe", b"MZ\x90\x00", "application/octet-stream"))],
        headers=auth,
    )
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


def test_duplicate_upload_in_the_same_project_is_skipped(
    client: TestClient, project: dict, auth: dict[str, str], text_file
):
    name, content, mime = text_file
    first = client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", (name, content, mime))],
        headers=auth,
    )
    assert first.status_code == 202

    second = client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", ("copy.txt", content, mime))],
        headers=auth,
    )
    assert second.status_code == 400
    assert "Identical to" in second.json()["detail"]


def test_text_file_is_ingested_and_becomes_searchable(
    client: TestClient, project: dict, auth: dict[str, str], text_file
):
    """The full pipeline, end to end, with no AI key configured."""
    name, content, mime = text_file
    upload = client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", (name, content, mime))],
        headers=auth,
    )
    assert upload.status_code == 202
    asset_id = upload.json()["assets"][0]["id"]

    final = _wait_ready(client, asset_id, auth)
    assert final["status"] == "ready", final.get("error")
    assert final["segment_count"] >= 1
    # Demo mode must be labelled, never passed off as a live model response.
    assert final["analysis_source"] == "demo"

    detail = client.get(f"/api/media/{asset_id}", headers=auth).json()
    assert "backpropagation" in detail["full_text"]
    assert detail["segments"][0]["page_number"] == 1

    search = client.post(
        "/api/search",
        json={"project_id": project["id"], "query": "what causes overfitting"},
        headers=auth,
    ).json()
    assert search["mode"] == "lexical"
    assert search["total"] >= 1
    assert search["results"][0]["asset_id"] == asset_id


def test_search_returns_nothing_for_an_unrelated_query(
    client: TestClient, project: dict, auth: dict[str, str], text_file
):
    name, content, mime = text_file
    upload = client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", (name, content, mime))],
        headers=auth,
    )
    _wait_ready(client, upload.json()["assets"][0]["id"], auth)

    response = client.post(
        "/api/search",
        json={"project_id": project["id"], "query": "sourdough bread recipe"},
        headers=auth,
    ).json()
    assert response["total"] == 0


def test_file_streaming_supports_range_requests(
    client: TestClient, project: dict, auth: dict[str, str], text_file
):
    name, content, mime = text_file
    upload = client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", (name, content, mime))],
        headers=auth,
    )
    asset_id = upload.json()["assets"][0]["id"]
    _wait_ready(client, asset_id, auth)

    whole = client.get(f"/api/media/{asset_id}/file", headers=auth)
    assert whole.status_code == 200

    partial = client.get(
        f"/api/media/{asset_id}/file", headers={**auth, "Range": "bytes=0-9"}
    )
    assert partial.status_code == 206
    assert len(partial.content) == 10

    unsatisfiable = client.get(
        f"/api/media/{asset_id}/file", headers={**auth, "Range": "bytes=999999999-"}
    )
    assert unsatisfiable.status_code == 416


def test_deleting_an_asset_frees_the_owner_quota(
    client: TestClient, project: dict, auth: dict[str, str], text_file
):
    name, content, mime = text_file
    upload = client.post(
        f"/api/projects/{project['id']}/media",
        files=[("files", (name, content, mime))],
        headers=auth,
    )
    asset_id = upload.json()["assets"][0]["id"]
    _wait_ready(client, asset_id, auth)

    before = client.get("/api/auth/me", headers=auth).json()["storage_used_bytes"]
    assert before > 0

    assert client.delete(f"/api/media/{asset_id}", headers=auth).status_code == 200
    after = client.get("/api/auth/me", headers=auth).json()["storage_used_bytes"]
    assert after < before
    assert client.get(f"/api/media/{asset_id}", headers=auth).status_code == 404
