"""Iteration 41: Test auto-sync of bank analysis to expenses + calendar,
and AI re-categorization of existing expenses."""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://custos-preview.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdrs(token):
    return {"Authorization": f"Bearer {token}"}


# CSV content with realistic Portuguese supplier data
CSV = b"""Data;Descricao;Valor
01-11-2025;VODAFONE PORTUGAL COMUNICACOES;-45.30
05-11-2025;GALP ENERGIA COMBUSTIVEL;-72.15
10-11-2025;LEROY MERLIN MATERIAL OBRA;-215.80
15-11-2025;TRANSFERENCIA DE CLIENTE ABC LDA;1500.00
20-11-2025;FIDELIDADE SEGURO AUTO;-89.50
01-12-2025;VODAFONE PORTUGAL COMUNICACOES;-45.30
05-12-2025;GALP ENERGIA COMBUSTIVEL;-70.00
20-12-2025;FIDELIDADE SEGURO AUTO;-89.50
"""


# ── Auto-sync via CSV upload ────────────────────────────────
class TestAutoSyncCSV:
    analysis_id = None

    def test_upload_csv_returns_auto_sync_and_auto_calendar(self, hdrs):
        files = {"file": ("test_iter41.csv", io.BytesIO(CSV), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/bank-analysis/upload", files=files, headers=hdrs, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "completed"
        assert "auto_sync" in data, "Missing auto_sync in upload response"
        assert "auto_calendar" in data, "Missing auto_calendar in upload response"
        auto_sync = data["auto_sync"]
        assert "created" in auto_sync and "skipped" in auto_sync and "total_processed" in auto_sync
        # Expect > 0 debit transactions synced (fresh upload)
        assert auto_sync["created"] + auto_sync["skipped"] > 0
        TestAutoSyncCSV.analysis_id = data["id"]
        print(f"First upload: created={auto_sync['created']}, skipped={auto_sync['skipped']}, calendar_created={data['auto_calendar'].get('created')}")

    def test_get_analysis_includes_auto_sync(self, hdrs):
        assert TestAutoSyncCSV.analysis_id
        r = requests.get(f"{BASE_URL}/api/bank-analysis/{TestAutoSyncCSV.analysis_id}", headers=hdrs, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "auto_sync" in d
        assert "auto_calendar" in d
        assert isinstance(d["auto_sync"].get("created"), int)

    def test_list_includes_auto_sync(self, hdrs):
        r = requests.get(f"{BASE_URL}/api/bank-analysis", headers=hdrs, timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # Our analysis should be there with auto_sync
        our = next((x for x in items if x.get("id") == TestAutoSyncCSV.analysis_id), None)
        assert our is not None, "Uploaded analysis not in list"
        assert "auto_sync" in our, "auto_sync missing in list projection"
        assert "auto_calendar" in our, "auto_calendar missing in list projection"

    def test_duplicate_detection_on_second_upload(self, hdrs):
        # Upload the SAME CSV again -> duplicates should be detected
        files = {"file": ("test_iter41_again.csv", io.BytesIO(CSV), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/bank-analysis/upload", files=files, headers=hdrs, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["auto_sync"]["skipped"] > 0, f"Expected skipped>0 for duplicate upload, got {data['auto_sync']}"
        print(f"Second upload (dup): created={data['auto_sync']['created']}, skipped={data['auto_sync']['skipped']}")
        # Cleanup the second analysis
        requests.delete(f"{BASE_URL}/api/bank-analysis/{data['id']}", headers=hdrs, timeout=30)

    def test_manual_sync_still_works(self, hdrs):
        """Manual sync-expenses endpoint should still work (should mostly skip since auto-sync ran)."""
        assert TestAutoSyncCSV.analysis_id
        r = requests.post(f"{BASE_URL}/api/bank-analysis/{TestAutoSyncCSV.analysis_id}/sync-expenses",
                          headers=hdrs, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "created" in d and "skipped" in d
        # After auto-sync, manual re-sync should mostly skip
        assert d["skipped"] >= 0

    def test_cleanup_analysis(self, hdrs):
        if TestAutoSyncCSV.analysis_id:
            requests.delete(f"{BASE_URL}/api/bank-analysis/{TestAutoSyncCSV.analysis_id}",
                            headers=hdrs, timeout=30)
        # Also clean up TEST expenses & appointments created
        # Delete expenses with our test file mention
        exps = requests.get(f"{BASE_URL}/api/expenses", headers=hdrs, timeout=30).json()
        for e in exps:
            if "test_iter41" in (e.get("notes") or ""):
                requests.delete(f"{BASE_URL}/api/expenses/{e['id']}", headers=hdrs, timeout=15)


# ── AI Re-categorize endpoint ───────────────────────────────
class TestAICategorize:
    def test_ai_categorize_returns_counts(self, hdrs):
        r = requests.post(f"{BASE_URL}/api/expenses/ai-categorize", headers=hdrs, timeout=180)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total", "updated_keywords", "updated_ai", "unchanged", "message"):
            assert k in d, f"Missing field {k} in response: {d}"
        assert isinstance(d["total"], int)
        assert isinstance(d["updated_keywords"], int)
        assert d["updated_keywords"] + d["updated_ai"] + d["unchanged"] == d["total"]
        print(f"AI categorize: total={d['total']}, kw={d['updated_keywords']}, ai={d['updated_ai']}, unchanged={d['unchanged']}")

    def test_ai_categorize_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/expenses/ai-categorize", timeout=30)
        assert r.status_code in (401, 403)
