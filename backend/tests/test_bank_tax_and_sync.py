"""Tests for Tax Alerts + Bank->Expenses sync features (iteration 35)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bank-consolidate.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "admin@obelisco.pt", "password": "obelisco2024"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def analysis_id(headers):
    r = requests.get(f"{BASE_URL}/api/bank-analysis", headers=headers, timeout=30, allow_redirects=False)
    if r.status_code in (301, 307, 308):
        r = requests.get(f"{BASE_URL}/api/bank-analysis", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) > 0, "Need at least one existing analysis (seeded by previous iteration)."
    return items[0]["id"]


# ── Tax Alerts ────────────────────────────────────────────────
class TestTaxAlerts:
    def test_upcoming_returns_alerts(self, headers):
        r = requests.get(f"{BASE_URL}/api/bank-analysis/tax-alerts/upcoming", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "alerts" in data
        assert isinstance(data["alerts"], list)
        assert len(data["alerts"]) > 0, "Expected upcoming PT fiscal deadlines"
        types = {a["type"] for a in data["alerts"]}
        # At least one of the expected types
        assert types & {"IVA", "IRC-PPC", "TSU", "IRS-RET", "IRC-MOD22"}, f"Unexpected types: {types}"
        for a in data["alerts"]:
            assert "days_until" in a
            assert "status" in a
            assert a["status"] in ("overdue", "urgent", "soon", "upcoming")
            assert "label" in a and "date" in a

    def test_alerts_sorted_by_date(self, headers):
        r = requests.get(f"{BASE_URL}/api/bank-analysis/tax-alerts/upcoming", headers=headers, timeout=30)
        dates = [a["date"] for a in r.json()["alerts"]]
        assert dates == sorted(dates)

    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/bank-analysis/tax-alerts/upcoming", timeout=30)
        assert r.status_code in (401, 403)


# ── Check duplicates preview ─────────────────────────────────
class TestCheckDuplicates:
    def test_preview_shape(self, headers, analysis_id):
        r = requests.get(f"{BASE_URL}/api/bank-analysis/{analysis_id}/check-duplicates", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("new", "duplicates", "new_count", "dup_count"):
            assert k in data, f"missing key {k}"
        assert data["new_count"] == len(data["new"])
        assert data["dup_count"] == len(data["duplicates"])

    def test_404_on_missing(self, headers):
        r = requests.get(f"{BASE_URL}/api/bank-analysis/nonexistent-id/check-duplicates", headers=headers, timeout=30)
        assert r.status_code == 404


# ── Sync to Expenses ─────────────────────────────────────────
class TestSyncExpenses:
    def test_sync_idempotent_all_duplicates(self, headers, analysis_id):
        # First call – may create some or 0 (already run in previous iteration)
        r1 = requests.post(f"{BASE_URL}/api/bank-analysis/{analysis_id}/sync-expenses", headers=headers, timeout=60)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        for k in ("created", "skipped", "duplicates", "total_processed"):
            assert k in d1
        # Second call must produce created=0
        r2 = requests.post(f"{BASE_URL}/api/bank-analysis/{analysis_id}/sync-expenses", headers=headers, timeout=60)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["created"] == 0, f"Second sync must create 0, got {d2}"
        assert d2["skipped"] == d2["total_processed"], f"All should be skipped: {d2}"

    def test_expenses_have_bank_txn_id(self, headers):
        r = requests.get(f"{BASE_URL}/api/expenses", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", r.json().get("expenses", []))
        with_bank = [e for e in items if e.get("bank_txn_id")]
        assert len(with_bank) > 0, "Expected at least one synced expense with bank_txn_id"
        e = with_bank[0]
        for field in ("date", "supplier", "value_gross", "type", "payment_method", "bank_txn_id"):
            assert field in e and e[field] not in (None, ""), f"Field {field} missing/empty: {e}"
        assert e["payment_method"] == "Transferência Bancária"
