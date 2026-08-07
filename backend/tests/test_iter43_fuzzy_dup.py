"""Iteration 43: Fuzzy duplicate detection + stale PDF processing detection."""
import os
import sys
import io
import pytest
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://custos-preview.preview.emergentagent.com").rstrip("/")

sys.path.insert(0, "/app/backend")
from bank_analysis import _extract_significant_words, _fuzzy_match_supplier  # noqa: E402


# ─── Unit tests: significant word extraction & fuzzy matching ───────────────────
class TestExtractSignificantWords:
    def test_extracts_joteilux_from_bank_desc(self):
        words = _extract_significant_words("29/01 COMPRA EL-E 3148056/04 JOTEILUX LDA QUELUZ")
        assert "JOTEILUX" in words, f"Expected JOTEILUX in {words}"

    def test_strips_noise_words(self):
        words = _extract_significant_words("JOTEILUX-COMERCIO DE MATERIAL ELECTRICO LDA")
        assert "JOTEILUX" in words
        assert "LDA" not in words
        assert "COMERCIO" not in words

    def test_strips_dates_and_refs(self):
        words = _extract_significant_words("29/01 3148056/04 ARMASUL")
        assert "ARMASUL" in words
        # No pure digit words
        assert all(not w.isdigit() for w in words)

    def test_multiple_suppliers(self):
        for supplier in ["SONEPAR", "SERVELEC", "ARMASUL", "ELECTRICOL"]:
            words = _extract_significant_words(f"COMPRA EL-E 12345/01 {supplier} LDA LISBOA")
            assert supplier in words, f"{supplier} not in {words}"


class TestFuzzyMatch:
    def test_joteilux_match(self):
        bank = "29/01 COMPRA EL-E 3148056/04 JOTEILUX LDA QUELUZ"
        exp = "JOTEILUX-COMERCIO DE MATERIAL ELECTRICO LDA"
        assert _fuzzy_match_supplier(bank, exp) is True

    def test_no_match_different_suppliers(self):
        assert _fuzzy_match_supplier("COMPRA EL-E JOTEILUX LDA", "SONEPAR PORTUGAL LDA") is False

    def test_no_match_empty(self):
        assert _fuzzy_match_supplier("", "JOTEILUX") is False
        assert _fuzzy_match_supplier("JOTEILUX", "") is False

    def test_armasul_match(self):
        assert _fuzzy_match_supplier("COMPRA EL-E 999/01 ARMASUL LDA", "ARMASUL - MATERIAIS ELECTRICOS LDA") is True


# ─── Integration tests via HTTP ────────────────────────────────────────────────
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@obelisco.pt", "password": "obelisco2024"})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def seed_expense(headers):
    """Create a JOTEILUX expense on 2026-01-29 for €58.08 for fuzzy match test."""
    payload = {
        "date": "2026-01-29",
        "supplier": "JOTEILUX-COMERCIO DE MATERIAL ELECTRICO LDA (TEST_ITER43)",
        "nif": "",
        "invoice_number": "TEST-ITER43-001",
        "category": "Obra",
        "type": "obra",
        "obra_id": None,
        "obra_name": None,
        "value_net": 47.22,
        "vat_rate": 23,
        "vat_amount": 10.86,
        "value_gross": 58.08,
        "payment_method": "Transferência Bancária",
        "notes": "TEST_ITER43 seed expense for fuzzy duplicate detection",
        "invoice_file": None,
    }
    r = requests.post(f"{BASE_URL}/api/expenses", json=payload, headers=headers)
    assert r.status_code in (200, 201), f"Failed to seed expense: {r.status_code} {r.text}"
    expense_id = r.json().get("id")
    yield expense_id
    # Cleanup
    if expense_id:
        requests.delete(f"{BASE_URL}/api/expenses/{expense_id}", headers=headers)


class TestFuzzyDupInUpload:
    def test_csv_upload_detects_fuzzy_dup(self, headers, seed_expense):
        """Upload a CSV with transaction that fuzzy-matches the seeded JOTEILUX expense."""
        csv_content = (
            "Data;Descricao;Valor\n"
            "29/01/2026;COMPRA EL-E 3148056/04 JOTEILUX LDA QUELUZ;-58,08\n"
            "28/01/2026;PAG.AUT. VODAFONE PORTUGAL 12345;-45,00\n"
        )
        files = {"file": ("test_iter43_fuzzy.csv", csv_content.encode("utf-8"), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/bank-analysis/upload", files=files, headers=headers)
        assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
        data = r.json()
        analysis_id = data["id"]

        try:
            sync = data.get("sync_preview", {})
            dups = sync.get("duplicates", [])
            pending = sync.get("pending", [])

            # Find the JOTEILUX duplicate
            joteilux_dup = next((d for d in dups if "JOTEILUX" in d.get("description", "").upper()), None)
            assert joteilux_dup is not None, f"JOTEILUX not in duplicates. dups={dups}, pending={pending}"

            # Required UI fields
            assert "expense_supplier" in joteilux_dup, f"Missing expense_supplier: {joteilux_dup}"
            assert "expense_value" in joteilux_dup
            assert "expense_date" in joteilux_dup
            assert "match_type" in joteilux_dup
            assert joteilux_dup["expense_date"] == "2026-01-29"
            assert abs(joteilux_dup["expense_value"] - 58.08) < 0.01
            assert "JOTEILUX" in joteilux_dup["expense_supplier"].upper()
            assert joteilux_dup["match_type"] in ("fuzzy_date_value", "fuzzy_date", "fuzzy_value", "exact")

            # JOTEILUX should NOT be in pending
            joteilux_pending = [p for p in pending if "JOTEILUX" in p.get("description", "").upper()]
            assert len(joteilux_pending) == 0, f"JOTEILUX incorrectly in pending: {joteilux_pending}"
        finally:
            requests.delete(f"{BASE_URL}/api/bank-analysis/{analysis_id}", headers=headers)


# ─── Stale PDF processing detection ────────────────────────────────────────────
class TestStaleProcessingDetection:
    def test_stale_processing_marked_failed(self, headers):
        """Insert a fake 'processing' record with old created_at and verify /status marks it failed."""
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        import uuid

        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        assert mongo_url and db_name

        analysis_id = f"TEST_ITER43_STALE_{uuid.uuid4().hex[:8]}"
        old_time = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()

        async def _insert():
            client = AsyncIOMotorClient(mongo_url)
            try:
                await client[db_name].bank_analyses.insert_one({
                    "id": analysis_id,
                    "filename": "TEST_ITER43_stale.pdf",
                    "status": "processing",
                    "created_at": old_time,
                    "created_by": "test",
                })
            finally:
                client.close()

        async def _cleanup():
            client = AsyncIOMotorClient(mongo_url)
            try:
                await client[db_name].bank_analyses.delete_one({"id": analysis_id})
            finally:
                client.close()

        asyncio.run(_insert())
        try:
            r = requests.get(f"{BASE_URL}/api/bank-analysis/{analysis_id}/status", headers=headers)
            assert r.status_code == 200, f"Status failed: {r.status_code} {r.text}"
            body = r.json()
            assert body["status"] == "failed", f"Expected failed, got: {body}"
            assert "expirou" in (body.get("error") or "").lower() or ">10 min" in (body.get("error") or "")
        finally:
            asyncio.run(_cleanup())

    def test_fresh_processing_still_processing(self, headers):
        """A recent processing record should NOT be marked failed."""
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        import uuid

        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")

        analysis_id = f"TEST_ITER43_FRESH_{uuid.uuid4().hex[:8]}"
        fresh_time = datetime.now(timezone.utc).isoformat()

        async def _insert():
            client = AsyncIOMotorClient(mongo_url)
            try:
                await client[db_name].bank_analyses.insert_one({
                    "id": analysis_id,
                    "filename": "TEST_ITER43_fresh.pdf",
                    "status": "processing",
                    "created_at": fresh_time,
                    "created_by": "test",
                })
            finally:
                client.close()

        async def _cleanup():
            client = AsyncIOMotorClient(mongo_url)
            try:
                await client[db_name].bank_analyses.delete_one({"id": analysis_id})
            finally:
                client.close()

        asyncio.run(_insert())
        try:
            r = requests.get(f"{BASE_URL}/api/bank-analysis/{analysis_id}/status", headers=headers)
            assert r.status_code == 200
            assert r.json()["status"] == "processing"
        finally:
            asyncio.run(_cleanup())
