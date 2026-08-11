"""Iter45: Test PATCH /api/bank-analysis/category-overrides/{desc_key}."""
import os
import urllib.parse
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://obelisco-mgmt.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@obelisco.pt", "password": "obelisco2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_list_has_seeded_overrides(headers):
    r = requests.get(f"{BASE_URL}/api/bank-analysis/category-overrides/list", headers=headers)
    assert r.status_code == 200
    data = r.json()
    keys = [o["desc_key"] for o in data]
    print("Overrides in DB:", keys)
    # Ensure at least one seeded key exists
    assert any(k in keys for k in ["joteilux", "vodafone", "sonepar"]), f"Seeded overrides not found: {keys}"


def test_patch_valid_category(headers):
    key = "vodafone"
    encoded = urllib.parse.quote(key, safe="")
    r = requests.patch(
        f"{BASE_URL}/api/bank-analysis/category-overrides/{encoded}",
        json={"category": "obra"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body == {"ok": True, "category": "obra"}

    # Verify persistence via list
    r2 = requests.get(f"{BASE_URL}/api/bank-analysis/category-overrides/list", headers=headers)
    row = next((o for o in r2.json() if o["desc_key"] == key), None)
    assert row is not None
    assert row["category"] == "obra"

    # Restore to original 'fixo'
    requests.patch(
        f"{BASE_URL}/api/bank-analysis/category-overrides/{encoded}",
        json={"category": "fixo"},
        headers=headers,
    )


def test_patch_invalid_category_400(headers):
    r = requests.patch(
        f"{BASE_URL}/api/bank-analysis/category-overrides/vodafone",
        json={"category": "invalid_cat"},
        headers=headers,
    )
    assert r.status_code == 400, r.text


def test_patch_missing_category_400(headers):
    r = requests.patch(
        f"{BASE_URL}/api/bank-analysis/category-overrides/vodafone",
        json={},
        headers=headers,
    )
    assert r.status_code == 400


def test_patch_nonexistent_key_404(headers):
    r = requests.patch(
        f"{BASE_URL}/api/bank-analysis/category-overrides/nonexistent_xyz_test_123",
        json={"category": "obra"},
        headers=headers,
    )
    assert r.status_code == 404


def test_patch_requires_auth():
    r = requests.patch(
        f"{BASE_URL}/api/bank-analysis/category-overrides/vodafone",
        json={"category": "obra"},
    )
    assert r.status_code in (401, 403)
