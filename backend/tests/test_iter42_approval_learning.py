"""Tests for Iter42: Sync approval flow + category-override learning."""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://obelisco-mgmt.preview.emergentagent.com').rstrip('/')

ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASS = "obelisco2024"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def analysis(headers):
    """Upload a synthetic CSV to create a fresh analysis with sync_preview."""
    csv = (
        "Data;Descricao;Valor\n"
        "05/01/2026;VODAFONE TELECOM 05/01;-45,50\n"
        "07/01/2026;LEROY MERLIN LOJA 07/01;-120,00\n"
        "08/01/2026;GALP ENERGIA CARTAO 08/01;-60,00\n"
        "10/01/2026;FIDELIDADE SEGURO 10/01;-80,00\n"
        "12/01/2026;TRANSFERENCIA DE CLIENTE ACME 12/01;+2500,00\n"
        "14/01/2026;RESTAURANTE FALCAO 14/01;-32,10\n"
    )
    files = {"file": ("test_iter42.csv", io.BytesIO(csv.encode("utf-8")), "text/csv")}
    r = requests.post(f"{BASE_URL}/api/bank-analysis/upload", headers=headers, files=files)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "sync_preview" in data, "sync_preview missing from upload response"
    yield data
    # Teardown
    try:
        requests.delete(f"{BASE_URL}/api/bank-analysis/{data['id']}", headers=headers)
    except Exception:
        pass


def test_upload_returns_sync_preview_pending(analysis):
    """CSV upload should return sync_preview with pending list, NOT auto-create expenses."""
    sp = analysis.get("sync_preview")
    assert sp is not None
    assert "pending" in sp
    assert isinstance(sp["pending"], list)
    assert sp.get("pending_count", 0) >= 1
    # And there must be no sync_approved yet
    assert not analysis.get("sync_approved")


def test_no_expenses_auto_created(analysis, headers):
    """After upload, no expense should have bank_txn_id matching this analysis' pending items."""
    pending_ids = {p["id"] for p in analysis["sync_preview"]["pending"]}
    r = requests.get(f"{BASE_URL}/api/expenses", headers=headers)
    assert r.status_code == 200
    expenses = r.json()
    matching = [e for e in expenses if e.get("bank_txn_id") in pending_ids]
    assert len(matching) == 0, f"Expenses were auto-created (should require approval): {matching}"


def test_patch_transaction_learns_override(analysis, headers):
    """PATCH transaction category should update AND save override with learned=true."""
    # pick first pending txn
    txn = analysis["sync_preview"]["pending"][0]
    r = requests.patch(
        f"{BASE_URL}/api/bank-analysis/{analysis['id']}/transactions/{txn['id']}",
        headers=headers,
        params={"category": "obra"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("learned") is True


def test_list_category_overrides(headers):
    r = requests.get(f"{BASE_URL}/api/bank-analysis/category-overrides/list", headers=headers)
    assert r.status_code == 200
    overrides = r.json()
    assert isinstance(overrides, list)
    # There must be at least our learned override
    assert len(overrides) >= 1
    o = overrides[0]
    assert "desc_key" in o
    assert "category" in o
    assert "original_description" in o


def test_approve_sync_partial(analysis, headers):
    """approve-sync with subset of ids should create expenses only for those ids."""
    pending = analysis["sync_preview"]["pending"]
    if len(pending) < 2:
        pytest.skip("Need at least 2 pending items")
    approved = [pending[0]["id"], pending[1]["id"]]
    r = requests.post(
        f"{BASE_URL}/api/bank-analysis/{analysis['id']}/approve-sync",
        headers=headers,
        json={"approved_ids": approved},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 2

    # Verify expenses exist
    r2 = requests.get(f"{BASE_URL}/api/expenses", headers=headers)
    assert r2.status_code == 200
    exp_txn_ids = {e.get("bank_txn_id") for e in r2.json() if e.get("bank_txn_id")}
    assert approved[0] in exp_txn_ids
    assert approved[1] in exp_txn_ids

    # Verify analysis sync_preview.pending updated
    r3 = requests.get(f"{BASE_URL}/api/bank-analysis/{analysis['id']}", headers=headers)
    assert r3.status_code == 200
    doc = r3.json()
    remaining_ids = {p["id"] for p in doc["sync_preview"]["pending"]}
    assert approved[0] not in remaining_ids
    assert approved[1] not in remaining_ids
    assert doc.get("sync_approved", {}).get("created") == 2


def test_override_applies_to_future_upload(headers, analysis):
    """After learning an override, a new upload with same normalized description should get the learned category."""
    # override was created for pending[0] description → 'obra' in test_patch_transaction_learns_override
    orig_desc = analysis["sync_preview"]["pending"][0]["description"]
    # Reupload a CSV containing the same supplier (dates differ so desc_key still similar)
    csv = (
        "Data;Descricao;Valor\n"
        f"20/02/2026;{orig_desc};-99,00\n"
    )
    files = {"file": ("test_iter42_reupload.csv", io.BytesIO(csv.encode("utf-8")), "text/csv")}
    r = requests.post(f"{BASE_URL}/api/bank-analysis/upload", headers=headers, files=files)
    assert r.status_code == 200, r.text
    doc = r.json()
    try:
        txns = doc.get("transactions", [])
        assert len(txns) == 1
        assert txns[0].get("category") == "obra", f"Override didn't apply, got category={txns[0].get('category')}"
    finally:
        requests.delete(f"{BASE_URL}/api/bank-analysis/{doc['id']}", headers=headers)


def test_cleanup_expenses(headers):
    """Cleanup expenses created by this test suite."""
    r = requests.get(f"{BASE_URL}/api/expenses", headers=headers)
    if r.status_code != 200:
        return
    for e in r.json():
        notes = (e.get("notes") or "")
        if "test_iter42" in notes:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{e['id']}", headers=headers)
            except Exception:
                pass
