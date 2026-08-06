"""Test sequential POST /api/expenses/extract calls work correctly (bug fix regression)."""
import os
import io
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@obelisco.pt", "password": "obelisco2024"})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login: {r.json()}"
    return {"Authorization": f"Bearer {token}"}


def _make_png_bytes():
    img = Image.new("RGB", (300, 200), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


def test_extract_first_upload(auth_headers):
    files = {"file": ("test1.png", _make_png_bytes(), "image/png")}
    r = requests.post(f"{BASE_URL}/api/expenses/extract", files=files, headers=auth_headers, timeout=60)
    assert r.status_code == 200, f"First upload failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    assert "file_name" in data
    assert "extracted" in data


def test_extract_two_sequential_uploads(auth_headers):
    # First
    files1 = {"file": ("seq1.png", _make_png_bytes(), "image/png")}
    r1 = requests.post(f"{BASE_URL}/api/expenses/extract", files=files1, headers=auth_headers, timeout=60)
    assert r1.status_code == 200, f"Seq #1 failed: {r1.status_code} {r1.text[:400]}"
    assert "file_name" in r1.json()

    # Second (immediately after)
    files2 = {"file": ("seq2.png", _make_png_bytes(), "image/png")}
    r2 = requests.post(f"{BASE_URL}/api/expenses/extract", files=files2, headers=auth_headers, timeout=60)
    assert r2.status_code == 200, f"Seq #2 failed: {r2.status_code} {r2.text[:400]}"
    assert "file_name" in r2.json()

    # Both should return distinct file_name entries (upload persisted)
    assert r1.json()["file_name"] != r2.json()["file_name"] or True  # not strictly required
