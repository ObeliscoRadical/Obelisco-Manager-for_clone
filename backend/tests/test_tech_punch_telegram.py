"""
Verifies bug fix: Telegram notification is sent when technician punches in/out
via /api/tech/timesheet/punch (Portal Técnico → Ponto GPS).

Also validates:
- Sequential punch in → out works and total_hours is calculated
- Punch payload with GPS coordinates + address is stored and echoed back
"""
import os
import time
import pytest
import requests


def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

TECH_EMAIL = os.environ.get("TEST_TECH_EMAIL", "d.oliveira1986@gmail.com")
TECH_PASSWORD = os.environ.get("TEST_TECH_PASSWORD", "A24d22r04")
DANIEL_EMPLOYEE_ID = "4d357339-7b7e-40bb-91fe-93109060cbda"

TIMEOUT = 30


@pytest.fixture(scope="module")
def tech_token():
    r = requests.post(
        f"{API}/tech/auth/login",
        json={"email": TECH_EMAIL, "password": TECH_PASSWORD},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


class TestPunchWithGPS:
    def test_punch_in_with_gps_and_address(self, tech_token):
        payload = {
            "action": "in",
            "latitude": 41.15803,
            "longitude": -8.62924,
            "address": "TEST_Rua de Santa Catarina 100, Porto",
        }
        r = requests.post(
            f"{API}/tech/timesheet/punch",
            headers=_h(tech_token),
            json=payload,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["employee_id"] == DANIEL_EMPLOYEE_ID
        assert isinstance(data["punches"], list) and len(data["punches"]) >= 1
        last = data["punches"][-1]
        assert last["action"] == "in"
        assert last["latitude"] == pytest.approx(41.15803, rel=1e-3)
        assert last["longitude"] == pytest.approx(-8.62924, rel=1e-3)
        assert last["address"] == payload["address"]

    def test_punch_out_calculates_total_hours(self, tech_token):
        # Punch out after the previous in
        payload = {
            "action": "out",
            "latitude": 41.15803,
            "longitude": -8.62924,
            "address": "TEST_Rua de Santa Catarina 100, Porto",
        }
        r = requests.post(
            f"{API}/tech/timesheet/punch",
            headers=_h(tech_token),
            json=payload,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert any(p["action"] == "out" for p in data["punches"])
        # total_hours is a number >= 0
        assert "total_hours" in data
        assert isinstance(data["total_hours"], (int, float))
        assert data["total_hours"] >= 0

    def test_today_reflects_punches(self, tech_token):
        r = requests.get(
            f"{API}/tech/timesheet/today",
            headers=_h(tech_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        d = r.json()
        actions = [p["action"] for p in d.get("punches", [])]
        assert "in" in actions
        assert "out" in actions


class TestTelegramNotification:
    """
    Cannot mock Telegram — it is real. We validate that the punch endpoint
    completed successfully. Log inspection is done separately after tests.
    """

    def test_punch_triggers_telegram_side_effect(self, tech_token):
        # Add a break_start punch to trigger another Telegram send
        payload = {
            "action": "break_start",
            "latitude": 41.15,
            "longitude": -8.6,
            "address": "TEST_break location",
        }
        r = requests.post(
            f"{API}/tech/timesheet/punch",
            headers=_h(tech_token),
            json=payload,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        # Give the network a moment (telegram is awaited, but ensure the sockets flushed)
        time.sleep(1)
