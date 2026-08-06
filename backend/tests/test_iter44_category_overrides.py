"""Iteration 44: Category overrides list/delete + full learning flow via bank analysis."""
import os
import io
import time
import requests
import pytest

def _load_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Fallback to frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/")


BASE = _load_base()


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={
        "email": "admin@obelisco.pt",
        "password": "obelisco2024",
    })
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_list_endpoint_returns_array(headers):
    r = requests.get(f"{BASE}/api/bank-analysis/category-overrides/list", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # Every entry (if any) must have the expected keys
    for item in data:
        assert "desc_key" in item
        assert "category" in item
        assert "_id" not in item  # Mongo ObjectId must be excluded


def test_learning_flow_end_to_end(headers):
    """Upload CSV → open analysis → PATCH category → verify override appears in list."""
    # Create a small CSV with a VODAFONE transaction
    csv_content = (
        "Data;Descricao;Valor\n"
        "15/01/2026;PAG VODAFONE TEST_ITER44;-45,50\n"
    ).encode("utf-8")

    files = {"file": ("test_iter44.csv", io.BytesIO(csv_content), "text/csv")}
    r = requests.post(
        f"{BASE}/api/bank-analysis/upload",
        headers=headers,
        files=files,
    )
    assert r.status_code == 200, r.text
    analysis_id = r.json().get("id") or r.json().get("analysis_id")
    assert analysis_id, r.json()

    # Poll status until completed (CSV should be near-instant)
    txn_id = None
    for _ in range(15):
        s = requests.get(f"{BASE}/api/bank-analysis/{analysis_id}", headers=headers)
        if s.status_code == 200:
            body = s.json()
            if body.get("status") == "completed" and body.get("transactions"):
                # find the VODAFONE txn
                for t in body["transactions"]:
                    if "VODAFONE" in (t.get("description") or "").upper():
                        txn_id = t["id"]
                        break
                if txn_id:
                    break
        time.sleep(1)

    assert txn_id, "VODAFONE transaction not found after upload"

    # PATCH category to 'obra'
    p = requests.patch(
        f"{BASE}/api/bank-analysis/{analysis_id}/transactions/{txn_id}",
        headers=headers,
        params={"category": "obra"},
    )
    assert p.status_code == 200, p.text
    assert p.json().get("learned") is True

    # Verify override appears in list
    lst = requests.get(f"{BASE}/api/bank-analysis/category-overrides/list", headers=headers)
    assert lst.status_code == 200
    items = lst.json()
    vodafone = [o for o in items if "vodafone" in o.get("desc_key", "").lower()]
    assert vodafone, f"No vodafone override found. Items: {[o.get('desc_key') for o in items]}"
    ov = vodafone[0]
    assert ov["category"] == "obra"
    assert ov.get("original_description")
    assert ov.get("updated_at")

    # DELETE override
    desc_key = ov["desc_key"]
    from urllib.parse import quote
    d = requests.delete(
        f"{BASE}/api/bank-analysis/category-overrides/{quote(desc_key, safe='')}",
        headers=headers,
    )
    assert d.status_code == 200, d.text
    assert d.json().get("ok") is True

    # Verify it's gone
    lst2 = requests.get(f"{BASE}/api/bank-analysis/category-overrides/list", headers=headers)
    assert desc_key not in [o["desc_key"] for o in lst2.json()]

    # Cleanup analysis
    requests.delete(f"{BASE}/api/bank-analysis/{analysis_id}", headers=headers)


def test_delete_nonexistent_override_returns_404(headers):
    r = requests.delete(
        f"{BASE}/api/bank-analysis/category-overrides/nonexistent_test_iter44_xyz",
        headers=headers,
    )
    assert r.status_code == 404
