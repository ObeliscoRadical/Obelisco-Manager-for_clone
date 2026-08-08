"""Backend tests for Predicted Bills CRUD (Contas Previstas) — iteration 47."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bank-consolidate.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_list_predicted_bills(h):
    r = requests.get(f"{BASE_URL}/api/bank-analysis/predicted-bills/list", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # Should contain existing 19 bills (per context)
    if data:
        b = data[0]
        for k in ("id", "title", "date"):
            assert k in b, f"missing {k} in {b}"


def test_create_missing_fields_400(h):
    r = requests.post(f"{BASE_URL}/api/bank-analysis/predicted-bills", headers=h, json={"title": ""}, timeout=20)
    assert r.status_code == 400


def test_create_edit_delete_flow(h):
    # CREATE
    payload = {
        "title": "TEST_ITER47 Vodafone",
        "date": "2026-03-15",
        "amount": 42.5,
        "category": "fixo",
        "frequency": "mensal",
    }
    r = requests.post(f"{BASE_URL}/api/bank-analysis/predicted-bills", headers=h, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    created = r.json()
    bid = created["id"]
    assert created["title"] == payload["title"]
    assert created["date"] == payload["date"]
    assert created["predicted_amount"] == 42.5
    assert created["predicted_category"] == "fixo"
    assert created["predicted_frequency"] == "mensal"
    assert created.get("is_predicted_bill") is True
    assert "_id" not in created

    # GET verify persistence via list
    r = requests.get(f"{BASE_URL}/api/bank-analysis/predicted-bills/list", headers=h, timeout=20)
    assert r.status_code == 200
    ids = [b["id"] for b in r.json()]
    assert bid in ids

    # PATCH
    upd = {"title": "TEST_ITER47 Vodafone EDIT", "amount": 55.0, "category": "variavel", "frequency": "trimestral"}
    r = requests.patch(f"{BASE_URL}/api/bank-analysis/predicted-bills/{bid}", headers=h, json=upd, timeout=20)
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["title"] == "TEST_ITER47 Vodafone EDIT"
    assert updated["predicted_amount"] == 55.0
    assert updated["predicted_category"] == "variavel"
    assert updated["predicted_frequency"] == "trimestral"
    assert "55.00" in updated["notes"] and "trimestral" in updated["notes"]

    # PATCH empty body → 400
    r = requests.patch(f"{BASE_URL}/api/bank-analysis/predicted-bills/{bid}", headers=h, json={}, timeout=20)
    assert r.status_code == 400

    # DELETE
    r = requests.delete(f"{BASE_URL}/api/bank-analysis/predicted-bills/{bid}", headers=h, timeout=20)
    assert r.status_code == 200
    assert r.json().get("ok") is True

    # DELETE again → 404
    r = requests.delete(f"{BASE_URL}/api/bank-analysis/predicted-bills/{bid}", headers=h, timeout=20)
    assert r.status_code == 404

    # PATCH non-existent → 404
    r = requests.patch(f"{BASE_URL}/api/bank-analysis/predicted-bills/{bid}", headers=h, json={"title": "x"}, timeout=20)
    assert r.status_code == 404


def test_no_auth_401(h):
    r = requests.get(f"{BASE_URL}/api/bank-analysis/predicted-bills/list", timeout=20)
    assert r.status_code in (401, 403)
