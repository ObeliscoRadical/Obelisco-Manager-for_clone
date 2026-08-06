"""
Backend tests for the Tech Portal extras (tech_extras.py):
- Ponto (clock in/out): /api/tech/timesheet/today, /punch, /week
- Chat/Mensagens: /api/tech/messages (GET/POST) + admin /admin/messages/{id}
- Agenda: /api/tech/works/my, /api/tech/appointments/my
- Perfil: /api/tech/profile
- Fotos: POST /api/tech/upload/photo, GET /api/tech/photos, GET /api/tech/photos/{filename}
- Isolation: admin token cannot call tech endpoints; tech token cannot call admin-only endpoints
"""
import os
import io
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

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
TECH_EMAIL = os.environ.get("TEST_TECH_EMAIL", "d.oliveira1986@gmail.com")
TECH_PASSWORD = os.environ.get("TEST_TECH_PASSWORD", "A24d22r04")
DANIEL_EMPLOYEE_ID = "4d357339-7b7e-40bb-91fe-93109060cbda"

TIMEOUT = 30


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tech_token():
    r = requests.post(f"{API}/tech/auth/login", json={"email": TECH_EMAIL, "password": TECH_PASSWORD}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t): return {"Authorization": f"Bearer {t}"}


# ---------------- PONTO ----------------
class TestPonto:
    def test_today_empty_shape(self, tech_token):
        r = requests.get(f"{API}/tech/timesheet/today", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "date" in d
        assert "punches" in d
        assert isinstance(d["punches"], list)

    def test_punch_in(self, tech_token):
        r = requests.post(f"{API}/tech/timesheet/punch", headers=_h(tech_token), json={"action": "in"}, timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert any(p["action"] == "in" for p in d["punches"])
        assert d["total_hours"] == 0

    def test_week_returns_list(self, tech_token):
        r = requests.get(f"{API}/tech/timesheet/week", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_ponto_requires_tech_token(self, admin_token):
        r = requests.get(f"{API}/tech/timesheet/today", headers=_h(admin_token), timeout=TIMEOUT)
        assert r.status_code in (401, 403)


# ---------------- CHAT ----------------
class TestChat:
    def test_send_and_list_message(self, tech_token):
        # Send
        r = requests.post(f"{API}/tech/messages", headers=_h(tech_token),
                          json={"text": "TEST_msg from pytest"}, timeout=TIMEOUT)
        assert r.status_code == 200
        msg = r.json()
        assert msg["from_role"] == "tech"
        assert msg["text"] == "TEST_msg from pytest"
        assert msg["employee_id"] == DANIEL_EMPLOYEE_ID
        mid = msg["id"]

        # List — must contain the message
        r2 = requests.get(f"{API}/tech/messages", headers=_h(tech_token), timeout=TIMEOUT)
        assert r2.status_code == 200
        msgs = r2.json()
        assert isinstance(msgs, list)
        assert any(m["id"] == mid for m in msgs)

    def test_admin_can_post_to_thread(self, admin_token, tech_token):
        r = requests.post(f"{API}/tech/admin/messages/{DANIEL_EMPLOYEE_ID}",
                          headers=_h(admin_token),
                          json={"text": "TEST_admin_reply"}, timeout=TIMEOUT)
        assert r.status_code == 200
        msg = r.json()
        assert msg["from_role"] == "admin"

        # Tech should see it
        r2 = requests.get(f"{API}/tech/messages", headers=_h(tech_token), timeout=TIMEOUT)
        assert r2.status_code == 200
        assert any(m.get("text") == "TEST_admin_reply" for m in r2.json())

    def test_admin_threads_endpoint(self, admin_token):
        r = requests.get(f"{API}/tech/admin/messages/threads", headers=_h(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_chat_requires_tech(self, admin_token):
        r = requests.get(f"{API}/tech/messages", headers=_h(admin_token), timeout=TIMEOUT)
        assert r.status_code in (401, 403)


# ---------------- AGENDA ----------------
class TestAgenda:
    def test_works_my(self, tech_token):
        r = requests.get(f"{API}/tech/works/my", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_appointments_my(self, tech_token):
        r = requests.get(f"{API}/tech/appointments/my", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- PROFILE ----------------
class TestProfile:
    def test_get_profile(self, tech_token):
        r = requests.get(f"{API}/tech/profile", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code == 200
        p = r.json()
        assert p["email"].lower() == TECH_EMAIL
        assert p["id"] == DANIEL_EMPLOYEE_ID
        assert "password_hash" not in p, "password_hash must not leak"

    def test_profile_requires_tech(self, admin_token):
        r = requests.get(f"{API}/tech/profile", headers=_h(admin_token), timeout=TIMEOUT)
        assert r.status_code in (401, 403)


# ---------------- PHOTOS ----------------
class TestPhotos:
    def test_upload_and_list_photo(self, tech_token):
        # Minimal 1x1 PNG (transparent)
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
            b"\xc0\x00\x00\x00\x03\x00\x01\xc0\xa1\xd0\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        # Fetch a guide id
        gr = requests.get(f"{API}/tech/transport-guides", headers=_h(tech_token), timeout=TIMEOUT)
        assert gr.status_code == 200
        guides = gr.json()
        assert guides
        gid = guides[0]["id"]

        files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}
        data = {"guide_id": gid, "caption": "TEST_pytest"}
        r = requests.post(
            f"{API}/tech/upload/photo",
            headers=_h(tech_token),
            files=files,
            data=data,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["guide_id"] == gid
        assert p["filename"].endswith(".png")
        assert p["url"].startswith("/api/tech/photos/")

        # List
        lr = requests.get(f"{API}/tech/photos?guide_id={gid}", headers=_h(tech_token), timeout=TIMEOUT)
        assert lr.status_code == 200
        assert any(x["id"] == p["id"] for x in lr.json())

        # Fetch file
        fr = requests.get(f"{BASE_URL}{p['url']}", timeout=TIMEOUT)
        assert fr.status_code == 200
        assert fr.headers.get("content-type", "").startswith("image/")

    def test_upload_rejects_bad_extension(self, tech_token):
        files = {"file": ("evil.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/tech/upload/photo", headers=_h(tech_token), files=files, data={}, timeout=TIMEOUT)
        assert r.status_code == 400


# ---------------- ISOLATION ----------------
class TestIsolation:
    def test_no_token_rejected(self):
        for path in ["/tech/timesheet/today", "/tech/messages", "/tech/profile",
                     "/tech/works/my", "/tech/appointments/my"]:
            r = requests.get(f"{API}{path}", timeout=TIMEOUT)
            assert r.status_code in (401, 403), f"{path} should require auth, got {r.status_code}"
