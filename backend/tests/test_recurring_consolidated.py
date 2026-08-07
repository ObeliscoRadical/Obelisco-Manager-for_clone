"""Tests for /api/bank-analysis/recurring-consolidated endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://expenses-ai-1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


def test_get_recurring_consolidated(h):
    r = requests.get(f"{BASE_URL}/api/bank-analysis/recurring-consolidated", headers=h, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "masters" in data
    assert isinstance(data["masters"], list)
    if data["masters"]:
        m = data["masters"][0]
        for field in ("id", "description", "day_of_month", "category", "payment_type", "frequency", "avg_amount", "occurrences", "months_seen"):
            assert field in m, f"Missing field {field} in master: {m}"


def test_route_not_intercepted_by_analysis_id(h):
    # If /recurring-consolidated was captured by /{analysis_id}, we'd see 404 "Análise não encontrada"
    r = requests.get(f"{BASE_URL}/api/bank-analysis/recurring-consolidated", headers=h, timeout=60)
    assert r.status_code == 200
    body = r.text
    assert "Análise não encontrada" not in body


def test_refresh_recurring_consolidated(h):
    r = requests.post(f"{BASE_URL}/api/bank-analysis/recurring-consolidated/refresh", headers=h, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "masters" in data
    assert isinstance(data["masters"], list)


def test_patch_recurring_master(h):
    r = requests.get(f"{BASE_URL}/api/bank-analysis/recurring-consolidated", headers=h, timeout=60)
    masters = r.json().get("masters", [])
    if not masters:
        pytest.skip("No masters to patch")
    m = masters[0]
    original_cat = m.get("category")
    master_id = m["id"]
    new_cat = "variavel" if original_cat != "variavel" else "fixo"
    r2 = requests.patch(
        f"{BASE_URL}/api/bank-analysis/recurring-consolidated/{master_id}",
        headers=h, json={"category": new_cat, "notes": "TEST_note"}, timeout=30,
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["category"] == new_cat
    assert body["notes"] == "TEST_note"

    # restore
    requests.patch(
        f"{BASE_URL}/api/bank-analysis/recurring-consolidated/{master_id}",
        headers=h, json={"category": original_cat, "notes": m.get("notes", "")}, timeout=30,
    )


def test_patch_nonexistent_master(h):
    r = requests.patch(
        f"{BASE_URL}/api/bank-analysis/recurring-consolidated/nonexistent-id-xyz",
        headers=h, json={"category": "variavel"}, timeout=30,
    )
    assert r.status_code == 404


def test_delete_and_recreate_master(h):
    # get masters
    r = requests.get(f"{BASE_URL}/api/bank-analysis/recurring-consolidated", headers=h, timeout=60)
    masters = r.json().get("masters", [])
    if len(masters) < 2:
        pytest.skip("Need at least 2 masters for delete test")
    # Pick last
    target = masters[-1]
    master_id = target["id"]
    r2 = requests.delete(f"{BASE_URL}/api/bank-analysis/recurring-consolidated/{master_id}", headers=h, timeout=30)
    assert r2.status_code == 200, r2.text
    assert r2.json().get("ok") is True

    # verify removed
    r3 = requests.get(f"{BASE_URL}/api/bank-analysis/recurring-consolidated", headers=h, timeout=60)
    ids = [m["id"] for m in r3.json().get("masters", [])]
    assert master_id not in ids

    # delete again -> 404
    r4 = requests.delete(f"{BASE_URL}/api/bank-analysis/recurring-consolidated/{master_id}", headers=h, timeout=30)
    assert r4.status_code == 404

    # restore via refresh
    requests.post(f"{BASE_URL}/api/bank-analysis/recurring-consolidated/refresh", headers=h, timeout=120)
