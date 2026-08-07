"""
Iteration 20 - Bug fix validation.
Bug: Admin created a user with role='tecnico' and only module_permissions.tech_portal=true,
but that user got "Sem permissão" when accessing Portal Técnico.

Fix:
 - Frontend TechProtectedRoute now accepts users with module_permissions.tech_portal=true.
 - Backend get_tech_user (tech_extras.py) & _get_current_tech (transport_guides.py) accept
   any users-collection user with tech_portal=true, treats them as supervisor mode (_is_admin=True).

Also runs security regression: consulta user (no tech_portal) still gets 403 on /api/tech/*.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://custos-preview.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")

TS = int(time.time())
TEC_EMAIL = f"testtec_{TS}@obelisco.pt"
TEC_PASSWORD = "test1234"
CONSULTA_EMAIL = f"testconsulta_{TS}@obelisco.pt"
CONSULTA_PASSWORD = "test1234"


# ------------ Fixtures ------------

@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def tec_user_ids():
    """Holds created user ids for cleanup."""
    return {"tec": None, "consulta": None}


@pytest.fixture(scope="module")
def tec_headers():
    # Depends on user existing; created in TestTechPortalPermBugfix.test_01
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": TEC_EMAIL, "password": TEC_PASSWORD})
    if r.status_code != 200:
        pytest.skip("Tec user not created yet")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ------------ Create tec user with only tech_portal ------------

class TestTechPortalPermBugfix:
    def test_01_create_tec_user_with_only_tech_portal(self, admin_headers, tec_user_ids):
        payload = {
            "email": TEC_EMAIL,
            "password": TEC_PASSWORD,
            "name": "TEST_TecPortalOnly",
            "role": "tecnico",
            "module_permissions": {"tech_portal": True},
        }
        r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["email"] == TEC_EMAIL
        assert data["role"] == "tecnico"
        assert data["module_permissions"]["tech_portal"] is True
        # tec should not have dashboard etc
        assert data["module_permissions"].get("dashboard", False) is False
        assert "id" in data
        tec_user_ids["tec"] = data["id"]

    def test_02_login_returns_module_permissions(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": TEC_EMAIL, "password": TEC_PASSWORD})
        assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
        data = r.json()
        assert "access_token" in data
        assert data["role"] == "tecnico"
        perms = data.get("module_permissions") or {}
        assert perms.get("tech_portal") is True

    def test_03_tec_can_list_transport_guides(self, tec_headers):
        # This is THE bug fix: was returning 403 before
        r = requests.get(f"{BASE_URL}/api/tech/transport-guides", headers=tec_headers)
        assert r.status_code == 200, f"BUG: tech_portal user got {r.status_code} {r.text}"
        guides = r.json()
        assert isinstance(guides, list)
        # supervisor mode → sees all guides
        assert len(guides) >= 1

    def test_04_tec_profile_returns_200(self, tec_headers):
        r = requests.get(f"{BASE_URL}/api/tech/profile", headers=tec_headers)
        assert r.status_code == 200, f"tech/profile failed: {r.status_code} {r.text}"
        data = r.json()
        # since not an employee, should return user identity (with _is_admin_view flag)
        assert data.get("email") == TEC_EMAIL

    def test_05_tec_timesheet_today(self, tec_headers):
        r = requests.get(f"{BASE_URL}/api/tech/timesheet/today", headers=tec_headers)
        assert r.status_code == 200, f"timesheet/today failed: {r.status_code} {r.text}"

    def test_06_tec_auth_me_perms(self, tec_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=tec_headers)
        assert r.status_code == 200
        me = r.json()
        assert me["role"] == "tecnico"
        assert me["module_permissions"]["tech_portal"] is True


# ------------ Security regression ------------

class TestSecurityRegression:
    def test_10_create_consulta_no_tech_portal(self, admin_headers, tec_user_ids):
        payload = {
            "email": CONSULTA_EMAIL,
            "password": CONSULTA_PASSWORD,
            "name": "TEST_ConsultaNoTech",
            "role": "consulta",
            "module_permissions": {"dashboard": True, "tech_portal": False},
        }
        r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        assert r.status_code == 200, f"Create consulta failed: {r.text}"
        data = r.json()
        tec_user_ids["consulta"] = data["id"]
        assert data["module_permissions"].get("tech_portal") is not True

    def test_11_consulta_blocked_from_tech_guides(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": CONSULTA_EMAIL, "password": CONSULTA_PASSWORD})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        r2 = requests.get(f"{BASE_URL}/api/tech/transport-guides",
                          headers={"Authorization": f"Bearer {tok}"})
        assert r2.status_code == 403, f"SECURITY: consulta w/o tech_portal got {r2.status_code}"

    def test_12_consulta_blocked_from_tech_profile(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": CONSULTA_EMAIL, "password": CONSULTA_PASSWORD})
        tok = r.json()["access_token"]
        r2 = requests.get(f"{BASE_URL}/api/tech/profile",
                          headers={"Authorization": f"Bearer {tok}"})
        assert r2.status_code == 403


# ------------ Admin & Real Tech regression ------------

class TestRegressions:
    def test_20_admin_still_sees_tech_guides(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/tech/transport-guides", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_21_admin_profile_is_admin_view(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/tech/profile", headers=admin_headers)
        assert r.status_code == 200
        assert r.json().get("_is_admin_view") is True

    def test_22_real_tech_still_works(self):
        # Real employee tech via /tech/auth/login
        r = requests.post(f"{BASE_URL}/api/tech/auth/login",
                          json={"email": os.environ.get("TEST_TECH_EMAIL", "d.oliveira1986@gmail.com"), "password": os.environ.get("TEST_TECH_PASSWORD", "A24d22r04")})
        assert r.status_code == 200, f"Real tech login broken: {r.text}"
        tok = r.json()["access_token"]
        # can see own guides
        r2 = requests.get(f"{BASE_URL}/api/tech/transport-guides",
                          headers={"Authorization": f"Bearer {tok}"})
        assert r2.status_code == 200
        # timesheet works
        r3 = requests.get(f"{BASE_URL}/api/tech/timesheet/today",
                          headers={"Authorization": f"Bearer {tok}"})
        assert r3.status_code == 200


# ------------ Cleanup ------------

class TestZCleanup:
    def test_99_cleanup_test_users(self, admin_headers, tec_user_ids):
        for key, uid in tec_user_ids.items():
            if uid:
                r = requests.delete(f"{BASE_URL}/api/users/{uid}", headers=admin_headers)
                assert r.status_code in (200, 204), f"Delete {key} failed: {r.status_code}"
