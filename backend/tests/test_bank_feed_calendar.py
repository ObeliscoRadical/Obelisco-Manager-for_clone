"""Tests for enhanced recurring detection with day intelligence + feed-calendar endpoint.
Covers:
- Recurring detection: typical_day, day_consistency, next_expected, avg_interval_days.
- POST /api/bank-analysis/{id}/feed-calendar creates appointments with is_predicted_bill.
- Idempotency of feed-calendar (2nd call created=0).
- DELETE /api/bank-analysis/{id}/calendar-predictions removes them.
"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"
CSV_PATH = "/tmp/extrato_teste.csv"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def analysis_id(headers):
    """Upload extrato_teste.csv and get analysis with recurring patterns."""
    with open(CSV_PATH, "rb") as f:
        files = {"file": ("extrato_teste.csv", f, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/bank-analysis/upload", headers=headers, files=files, timeout=180)
    assert r.status_code == 200, r.text
    data = r.json()
    aid = data.get("id") or data.get("analysis", {}).get("id")
    assert aid, f"No id in response: {data}"
    return aid


class TestRecurringDetection:
    def test_recurring_has_day_intelligence_fields(self, headers, analysis_id):
        r = requests.get(f"{BASE_URL}/api/bank-analysis/{analysis_id}", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        recurring = data.get("recurring", [])
        assert len(recurring) >= 3, f"Expected at least 3 recurring patterns, got {len(recurring)}: {[r.get('description') for r in recurring]}"

        required = {"typical_day", "day_consistency", "next_expected", "avg_interval_days", "frequency", "avg_amount"}
        for rec in recurring:
            missing = required - set(rec.keys())
            assert not missing, f"Missing fields {missing} in {rec}"
            assert 1 <= rec["typical_day"] <= 31
            assert 0 <= rec["day_consistency"] <= 100
            # next_expected must be YYYY-MM-DD
            assert len(rec["next_expected"]) == 10 and rec["next_expected"][4] == "-"

    def test_typical_days_match_expected(self, headers, analysis_id):
        r = requests.get(f"{BASE_URL}/api/bank-analysis/{analysis_id}", headers=headers, timeout=30)
        recurring = r.json().get("recurring", [])

        def find(substr):
            substr = substr.lower()
            return [rec for rec in recurring if substr in rec["description"].lower()]

        # EDP -> day 10
        edp = find("edp")
        assert edp, "EDP recurring not detected"
        assert edp[0]["typical_day"] == 10, f"EDP typical_day expected 10, got {edp[0]['typical_day']}"

        # Vodafone -> day 10
        vod = find("vodafone")
        assert vod, "Vodafone recurring not detected"
        assert vod[0]["typical_day"] == 10

        # TSU -> day 25
        tsu = find("tsu")
        assert tsu, "TSU recurring not detected"
        assert tsu[0]["typical_day"] == 25


class TestFeedCalendar:
    def test_delete_predictions_first_clean(self, headers, analysis_id):
        # Ensure a clean state before creating
        r = requests.delete(f"{BASE_URL}/api/bank-analysis/{analysis_id}/calendar-predictions", headers=headers, timeout=30)
        assert r.status_code == 200, r.text

    def test_feed_calendar_creates_appointments(self, headers, analysis_id):
        r = requests.post(f"{BASE_URL}/api/bank-analysis/{analysis_id}/feed-calendar?months_ahead=6", headers=headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["created"] > 0, f"Expected >0 created, got {data}"
        # 5 recurring x 6 months = 30 (best case; some may be filtered if past)
        assert data["created"] >= 15, f"Expected at least 15 predicted bills, got {data['created']}"
        assert "total_recurring" in data

    def test_feed_calendar_idempotent(self, headers, analysis_id):
        r = requests.post(f"{BASE_URL}/api/bank-analysis/{analysis_id}/feed-calendar?months_ahead=6", headers=headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["created"] == 0, f"Expected created=0 on 2nd call, got {data}"
        assert data["skipped"] > 0

    def test_appointments_persisted_with_flag(self, headers, analysis_id):
        # Fetch appointments via API and confirm they exist with is_predicted_bill
        r = requests.get(f"{BASE_URL}/api/appointments", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        appts = r.json()
        predicted = [a for a in appts if a.get("source_analysis_id") == analysis_id and a.get("is_predicted_bill")]
        assert len(predicted) >= 15, f"Expected persisted predicted bills, got {len(predicted)}"
        # Sample validations
        sample = predicted[0]
        assert sample["notes"].startswith("Conta Prevista"), sample["notes"]
        assert sample["title"].startswith("💰")
        assert "predicted_amount" in sample
        assert "predicted_category" in sample

    def test_delete_predictions_removes_them(self, headers, analysis_id):
        r = requests.delete(f"{BASE_URL}/api/bank-analysis/{analysis_id}/calendar-predictions", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["removed"] > 0, f"Expected removed>0, got {data}"

        # Verify none remain
        r2 = requests.get(f"{BASE_URL}/api/appointments", headers=headers, timeout=30)
        remaining = [a for a in r2.json() if a.get("source_analysis_id") == analysis_id and a.get("is_predicted_bill")]
        assert len(remaining) == 0, f"Still {len(remaining)} predicted bills after delete"
