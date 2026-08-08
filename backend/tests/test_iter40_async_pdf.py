"""
Iteration 40: Tests for async PDF bank statement upload fix.
- POST /api/bank-analysis/upload with CSV → sync response, status=completed
- POST /api/bank-analysis/upload with PDF (mock DB) → immediate response with status=processing
- GET /api/bank-analysis/{id}/status endpoint
- GET /api/bank-analysis includes 'status' field
"""
import os
import io
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timezone
from auth_test_helpers import get_admin_credentials, get_base_url

BASE_URL = get_base_url()
ADMIN_EMAIL, ADMIN_PASSWORD = get_admin_credentials()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ── Helper: minimal CSV bank statement ─────────────────────────────
def _make_csv_bytes():
    csv = (
        "Data;Descricao;Valor\n"
        "2025-01-05;TEST_PDF_ASYNC pagamento cliente;1500,00\n"
        "2025-01-10;TEST_PDF_ASYNC EDP electricidade;-85,50\n"
        "2025-01-15;TEST_PDF_ASYNC vodafone servicos;-45,00\n"
        "2025-02-05;TEST_PDF_ASYNC pagamento cliente;1500,00\n"
        "2025-02-10;TEST_PDF_ASYNC EDP electricidade;-88,00\n"
    )
    return csv.encode("utf-8")


# ── CSV upload: still synchronous, returns completed ───────────────
class TestCsvSyncUpload:
    """CSV path should still work synchronously and return completed status."""

    def test_csv_upload_returns_completed(self, auth_headers):
        files = {"file": ("test_async_iter40.csv", _make_csv_bytes(), "text/csv")}
        r = requests.post(
            f"{BASE_URL}/api/bank-analysis/upload",
            headers=auth_headers,
            files=files,
            timeout=90,
        )
        assert r.status_code == 200, f"CSV upload failed: {r.status_code} {r.text[:400]}"
        data = r.json()

        # CSV must be synchronous → complete data returned
        assert data.get("status") == "completed", f"Expected completed, got {data.get('status')}"
        assert "id" in data
        assert "transactions" in data
        assert "transaction_count" in data
        assert data["transaction_count"] >= 3
        assert "taxes" in data
        assert "by_category" in data

        # Save for cleanup
        pytest.csv_analysis_id = data["id"]

    def test_csv_analysis_in_list_with_status(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/bank-analysis", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)

        # Find our just-created analysis
        found = next((x for x in items if x.get("id") == getattr(pytest, "csv_analysis_id", None)), None)
        assert found is not None, "Just-created CSV analysis not found in list"
        # The 'status' field should be present for new records
        assert found.get("status") == "completed", f"List missing status=completed: {found}"

    def test_csv_status_endpoint(self, auth_headers):
        aid = getattr(pytest, "csv_analysis_id", None)
        assert aid, "No CSV analysis id"
        r = requests.get(f"{BASE_URL}/api/bank-analysis/{aid}/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == aid
        assert data["status"] == "completed"
        assert "transaction_count" in data
        assert data["transaction_count"] >= 3


# ── Status endpoint negative case ──────────────────────────────────
class TestStatusEndpoint:
    def test_status_404_for_unknown_id(self, auth_headers):
        fake = str(uuid.uuid4())
        r = requests.get(f"{BASE_URL}/api/bank-analysis/{fake}/status", headers=auth_headers, timeout=15)
        assert r.status_code == 404

    def test_status_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/bank-analysis/{uuid.uuid4()}/status", timeout=15)
        assert r.status_code in (401, 403)


# ── Async PDF flow: mock a 'processing' record in DB and verify ────
class TestPdfAsyncMocked:
    """Insert a mocked processing record directly into DB (bypasses Gemini),
    then verify the /status and listing endpoints reflect it correctly."""

    processing_id = None

    def test_insert_mock_processing_record(self, auth_headers):
        # Insert via a direct MongoDB write using pymongo (backend .env)
        from pymongo import MongoClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        client = MongoClient(env["MONGO_URL"])
        db = client[env["DB_NAME"]]

        pending_id = str(uuid.uuid4())
        db.bank_analyses.insert_one({
            "id": pending_id,
            "filename": "TEST_ITER40_mock_processing.pdf",
            "status": "processing",
            "transaction_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "test",
        })
        TestPdfAsyncMocked.processing_id = pending_id
        client.close()

    def test_status_returns_processing(self, auth_headers):
        aid = TestPdfAsyncMocked.processing_id
        assert aid
        r = requests.get(f"{BASE_URL}/api/bank-analysis/{aid}/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "processing"
        assert data["filename"] == "TEST_ITER40_mock_processing.pdf"
        assert data["transaction_count"] == 0

    def test_list_includes_processing_item_with_status(self, auth_headers):
        aid = TestPdfAsyncMocked.processing_id
        r = requests.get(f"{BASE_URL}/api/bank-analysis", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        found = next((x for x in items if x.get("id") == aid), None)
        assert found is not None, "Processing record missing from list"
        assert found["status"] == "processing"
        assert found["filename"] == "TEST_ITER40_mock_processing.pdf"

    def test_mock_failed_status(self, auth_headers):
        # Update to failed and verify
        from pymongo import MongoClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        client = MongoClient(env["MONGO_URL"])
        db = client[env["DB_NAME"]]

        failed_id = str(uuid.uuid4())
        db.bank_analyses.insert_one({
            "id": failed_id,
            "filename": "TEST_ITER40_failed.pdf",
            "status": "failed",
            "error": "Nenhuma transação encontrada no PDF.",
            "transaction_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "test",
        })
        client.close()

        r = requests.get(f"{BASE_URL}/api/bank-analysis/{failed_id}/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "failed"
        assert "error" in data
        assert data["error"]

        # Cleanup
        requests.delete(f"{BASE_URL}/api/bank-analysis/{failed_id}", headers=auth_headers, timeout=15)


# ── Cleanup ────────────────────────────────────────────────────────
def test_zz_cleanup(auth_headers):
    for attr in ("csv_analysis_id",):
        aid = getattr(pytest, attr, None)
        if aid:
            requests.delete(f"{BASE_URL}/api/bank-analysis/{aid}", headers=auth_headers, timeout=15)
    aid = TestPdfAsyncMocked.processing_id
    if aid:
        requests.delete(f"{BASE_URL}/api/bank-analysis/{aid}", headers=auth_headers, timeout=15)
