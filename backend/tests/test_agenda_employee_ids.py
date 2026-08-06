"""Backend regression for /agenda with employee_ids + location (iteration 22)."""
import os
import requests
from datetime import date, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://eletro-manager-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASS = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
TECH_EMAIL = os.environ.get("TEST_TECH_EMAIL", "d.oliveira1986@gmail.com")
TECH_PASS = os.environ.get("TEST_TECH_PASSWORD", "A24d22r04")
DANIEL_ID = "4d357339-7b7e-40bb-91fe-93109060cbda"


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


def _tech_login():
    r = requests.post(f"{API}/tech/auth/login", json={"email": TECH_EMAIL, "password": TECH_PASS})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}"}


_created_ids = []


def test_00_admin_creates_appt_with_employee_ids_and_location():
    h = _login(ADMIN_EMAIL, ADMIN_PASS)
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    payload = {
        "title": "TEST_ITER22 Visita",
        "client_name": "Cliente TEST",
        "date": tomorrow,
        "time_start": "08:15",
        "time_end": "09:05",
        "notes": "iter22 test",
        "employee_ids": [DANIEL_ID],
        "location": "Av Liberdade 100, Lisboa",
    }
    r = requests.post(f"{API}/appointments", json=payload, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["employee_ids"] == [DANIEL_ID]
    assert body["location"] == "Av Liberdade 100, Lisboa"
    assert "id" in body
    _created_ids.append(body["id"])

    # Verify GET returns it with fields
    r2 = requests.get(f"{API}/appointments", headers=h)
    assert r2.status_code == 200
    found = [a for a in r2.json() if a["id"] == body["id"]]
    assert len(found) == 1
    assert found[0]["employee_ids"] == [DANIEL_ID]
    assert found[0]["location"] == "Av Liberdade 100, Lisboa"


def test_01_admin_updates_employee_ids_and_location():
    assert _created_ids, "prev test must create"
    h = _login(ADMIN_EMAIL, ADMIN_PASS)
    aid = _created_ids[0]
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    payload = {
        "title": "TEST_ITER22 Visita EDIT",
        "client_name": "Cliente TEST",
        "date": tomorrow,
        "time_start": "10:00",
        "time_end": "10:45",
        "notes": "edited",
        "employee_ids": [DANIEL_ID],
        "location": "Rua Nova 5",
    }
    r = requests.put(f"{API}/appointments/{aid}", json=payload, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["location"] == "Rua Nova 5"
    assert body["time_start"] == "10:00"
    assert body["employee_ids"] == [DANIEL_ID]


def test_02_tech_sees_only_own_appts():
    # Create another appt NOT assigned to daniel
    h = _login(ADMIN_EMAIL, ADMIN_PASS)
    dt = (date.today() + timedelta(days=2)).isoformat()
    other_payload = {
        "title": "TEST_ITER22 NOT_FOR_DANIEL",
        "client_name": "x",
        "date": dt,
        "time_start": "22:30",
        "time_end": "22:59",
        "notes": "",
        "employee_ids": ["some-other-random-id-xxxx"],
        "location": "elsewhere",
    }
    r = requests.post(f"{API}/appointments", json=other_payload, headers=h)
    assert r.status_code == 200, r.text
    other_id = r.json()["id"]
    _created_ids.append(other_id)

    th = _tech_login()
    r2 = requests.get(f"{API}/tech/appointments/my", headers=th)
    assert r2.status_code == 200, r2.text
    ids = [a["id"] for a in r2.json()]
    assert _created_ids[0] in ids, "Daniel should see his appt"
    assert other_id not in ids, "Daniel must NOT see other appt"


def test_03_admin_supervisor_sees_all_on_tech_endpoint():
    h = _login(ADMIN_EMAIL, ADMIN_PASS)
    r = requests.get(f"{API}/tech/appointments/my", headers=h)
    assert r.status_code == 200, r.text
    ids = [a["id"] for a in r.json()]
    # Both appts within 30d, admin should see both
    assert _created_ids[0] in ids
    assert _created_ids[1] in ids


def test_04_backward_compat_no_employee_ids():
    """Admin GET /appointments should include old docs (no employee_ids) — model default [] applied."""
    h = _login(ADMIN_EMAIL, ADMIN_PASS)
    r = requests.get(f"{API}/appointments", headers=h)
    assert r.status_code == 200
    # Ensure endpoint works and returns list (no crash on missing field)
    assert isinstance(r.json(), list)


def test_99_cleanup():
    h = _login(ADMIN_EMAIL, ADMIN_PASS)
    for aid in _created_ids:
        requests.delete(f"{API}/appointments/{aid}", headers=h)
