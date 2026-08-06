"""Backend tests for Google Calendar integration in Agenda page."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Fallback to frontend/.env if not present in env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_check_calendar_conflict(headers):
    """2026-08-12 14:00-16:00 should return a conflict (event exists)."""
    r = requests.get(
        f"{BASE_URL}/api/appointments/check-calendar",
        params={"date": "2026-08-12", "time_start": "14:00", "time_end": "16:00"},
        headers=headers, timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "available" in data
    assert "conflicts" in data
    assert "suggested_times" in data
    print(f"CONFLICT check: available={data['available']} conflicts={len(data['conflicts'])} suggestions={len(data['suggested_times'])}")
    assert data["available"] is False, f"Expected conflict on 2026-08-12 14:00-16:00, got {data}"
    assert len(data["conflicts"]) > 0
    assert len(data["suggested_times"]) > 0


def test_check_calendar_available(headers):
    """2026-08-25 09:00-11:00 should be free."""
    r = requests.get(
        f"{BASE_URL}/api/appointments/check-calendar",
        params={"date": "2026-08-25", "time_start": "09:00", "time_end": "11:00"},
        headers=headers, timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    print(f"AVAILABLE check: available={data['available']} conflicts={len(data['conflicts'])}")
    assert data["available"] is True, f"Expected available on 2026-08-25 09:00-11:00, got {data}"
    assert len(data["conflicts"]) == 0


def test_create_appointment_creates_gcal_event(headers):
    """POST /api/appointments should create a Google Calendar event and return gcal_event_id."""
    payload = {
        "title": "TEST_AgendaGCal_Integration",
        "date": "2026-09-15",
        "time_start": "10:00",
        "time_end": "11:30",
        "client_name": "TEST Client",
        "location": "Lisbon",
        "employee_ids": [],
        "notes": "TEST",
    }
    r = requests.post(f"{BASE_URL}/api/appointments", json=payload, headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    print(f"CREATE appt: id={data.get('id')} gcal_event_id={data.get('gcal_event_id')}")
    assert data.get("id")
    assert data.get("gcal_event_id"), f"Expected gcal_event_id in response, got: {data}"

    # Cleanup - delete the appointment
    try:
        requests.delete(f"{BASE_URL}/api/appointments/{data['id']}", headers=headers, timeout=30)
    except Exception:
        pass


def test_check_calendar_requires_auth():
    r = requests.get(
        f"{BASE_URL}/api/appointments/check-calendar",
        params={"date": "2026-08-25", "time_start": "09:00", "time_end": "11:00"},
        timeout=30,
    )
    assert r.status_code in (401, 403)
