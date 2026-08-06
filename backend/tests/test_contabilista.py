"""Tests for Contabilista IA module."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend env file for BASE_URL
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Auth negative case ----------
def test_chat_without_auth_returns_401():
    r = requests.post(
        f"{BASE_URL}/api/contabilista/chat",
        json={"session_id": "no-auth", "message": "test", "history": []},
        timeout=10,
    )
    assert r.status_code in (401, 403), f"Expected 401/403 but got {r.status_code}: {r.text[:200]}"


# ---------- Chat with real Gemini call ----------
def test_chat_returns_response(auth_headers):
    session_id = f"pytest-{uuid.uuid4().hex[:8]}"
    payload = {
        "session_id": session_id,
        "message": "Qual a taxa de IRC para PME 2026?",
        "history": [],
    }
    r = requests.post(
        f"{BASE_URL}/api/contabilista/chat",
        json=payload,
        headers=auth_headers,
        timeout=60,
    )
    assert r.status_code == 200, f"Chat failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "response" in data, f"No 'response' key in {data}"
    assert "session_id" in data
    assert data["session_id"] == session_id
    text = data["response"]
    assert isinstance(text, str) and len(text) > 20, f"Response too short: {text!r}"
    # Should mention IRC or PME in Portuguese context (soft assertion)
    lower = text.lower()
    assert ("irc" in lower or "pme" in lower or "17" in lower or "21" in lower), \
        f"Response missing IRC/PME context: {text[:400]}"
    # Persist session for history test via module-level cache
    pytest.session_id_for_history = session_id


# ---------- History ----------
def test_get_history(auth_headers):
    session_id = getattr(pytest, "session_id_for_history", None)
    if not session_id:
        pytest.skip("No session_id from chat test")
    # Small buffer to ensure DB write is done
    time.sleep(1)
    r = requests.get(
        f"{BASE_URL}/api/contabilista/history/{session_id}",
        headers=auth_headers,
        timeout=15,
    )
    assert r.status_code == 200, f"History failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "messages" in data
    assert isinstance(data["messages"], list)
    assert len(data["messages"]) >= 1, "No stored messages"
    # Validate _id not present (must be excluded)
    for m in data["messages"]:
        assert "_id" not in m, f"MongoDB _id leaked: {m}"
        assert m.get("session_id") == session_id
