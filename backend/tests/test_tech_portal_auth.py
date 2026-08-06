"""
Backend tests for the Tech Portal integration (tech-app-obelisco unified into propostal app).

Covers:
- Admin login → /auth/me responds with admin user
- Tech login (Daniel) via /api/tech/auth/login → returns access_token + employee
- /api/tech/auth/me with tech token
- Cross-token isolation: admin token cannot call /tech/auth/me; tech token cannot call /auth/me
- Tech list guides (GET /api/tech/transport-guides)
- Tech guide detail (GET /api/tech/transport-guides/{id})
- Tech cannot access admin-only endpoints (GET /api/transport-guides)
"""
import os
import pytest
import requests

# Load frontend .env explicitly (REACT_APP_BACKEND_URL is not exported in the shell)
def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")

TECH_EMAIL = os.environ.get("TEST_TECH_EMAIL", "d.oliveira1986@gmail.com")
TECH_PASSWORD = os.environ.get("TEST_TECH_PASSWORD", "A24d22r04")

TIMEOUT = 30


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=TIMEOUT)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token")
    assert token, f"No access_token in response: {data}"
    return token


@pytest.fixture(scope="module")
def tech_token():
    r = requests.post(f"{API}/tech/auth/login", json={"email": TECH_EMAIL, "password": TECH_PASSWORD}, timeout=TIMEOUT)
    assert r.status_code == 200, f"Tech login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    assert "employee" in data
    assert data["employee"]["email"].lower() == TECH_EMAIL.lower()
    return data["access_token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ------------- ADMIN LOGIN & ME -------------
class TestAdminAuth:
    def test_admin_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data

    def test_admin_me(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200
        u = r.json()
        assert u.get("email", "").lower() == ADMIN_EMAIL

    def test_admin_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=TIMEOUT)
        assert r.status_code in (400, 401)


# ------------- TECH LOGIN & ME -------------
class TestTechAuth:
    def test_tech_login_success(self, tech_token):
        # Fixture already asserts login shape
        assert isinstance(tech_token, str) and len(tech_token) > 20

    def test_tech_me(self, tech_token):
        r = requests.get(f"{API}/tech/auth/me", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code == 200
        u = r.json()
        assert u.get("email", "").lower() == TECH_EMAIL
        assert "id" in u

    def test_tech_login_wrong_password(self):
        r = requests.post(f"{API}/tech/auth/login", json={"email": TECH_EMAIL, "password": "wrongpass"}, timeout=TIMEOUT)
        assert r.status_code == 401

    def test_tech_login_unknown_email(self):
        r = requests.post(f"{API}/tech/auth/login", json={"email": "no-such-user@obelisco.pt", "password": "abc"}, timeout=TIMEOUT)
        assert r.status_code == 401


# ------------- ISOLATION -------------
class TestCrossTokenIsolation:
    def test_admin_token_cannot_call_tech_me(self, admin_token):
        r = requests.get(f"{API}/tech/auth/me", headers=_h(admin_token), timeout=TIMEOUT)
        # Should NOT be 200 – admin JWT has type="access", not "tech"
        assert r.status_code in (401, 403), f"Expected 401/403 got {r.status_code} — admin token was accepted as tech!"

    def test_tech_token_cannot_call_admin_me(self, tech_token):
        r = requests.get(f"{API}/auth/me", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code in (401, 403), f"Expected 401/403 got {r.status_code}"

    def test_tech_token_cannot_list_admin_guides(self, tech_token):
        # /api/transport-guides is admin-only; tech should NOT be allowed
        r = requests.get(f"{API}/transport-guides", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code in (401, 403), f"Tech token accessed admin-only guides list! status={r.status_code}"


# ------------- TECH GUIDES -------------
class TestTechGuides:
    def test_tech_list_my_guides(self, tech_token):
        r = requests.get(f"{API}/tech/transport-guides", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code == 200
        guides = r.json()
        assert isinstance(guides, list)
        # Daniel should have at least the seed guide GT 2026/0007
        assert len(guides) >= 1, "Expected at least one guide assigned to tech"
        # Check shape
        g = guides[0]
        for key in ("id", "number", "status", "items"):
            assert key in g, f"guide missing '{key}': {g}"

    def test_tech_get_guide_detail(self, tech_token):
        # list, then fetch one
        r = requests.get(f"{API}/tech/transport-guides", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code == 200
        guides = r.json()
        assert guides, "no guides available"
        gid = guides[0]["id"]
        r2 = requests.get(f"{API}/tech/transport-guides/{gid}", headers=_h(tech_token), timeout=TIMEOUT)
        assert r2.status_code == 200
        detail = r2.json()
        assert detail["id"] == gid
        assert "items" in detail

    def test_tech_cannot_get_other_guide(self, tech_token):
        r = requests.get(f"{API}/tech/transport-guides/does-not-exist-xyz", headers=_h(tech_token), timeout=TIMEOUT)
        assert r.status_code == 404

    def test_tech_endpoints_reject_no_token(self):
        r = requests.get(f"{API}/tech/transport-guides", timeout=TIMEOUT)
        assert r.status_code in (401, 403)
