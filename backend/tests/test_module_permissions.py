"""Tests for iteration 19 - Module permissions + Admin access to Tech portal."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://proposal-hub-56.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"
TECH_EMAIL = "d.oliveira1986@gmail.com"
TECH_PASSWORD = "A24d22r04"

TEST_USER_EMAIL = f"teste_consulta_{int(time.time())}@obelisco.pt"
TEST_USER_PASSWORD = "test1234"


# ------------ Fixtures ------------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tech_token():
    r = requests.post(f"{BASE_URL}/api/tech/auth/login", json={"email": TECH_EMAIL, "password": TECH_PASSWORD})
    assert r.status_code == 200, f"Tech login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def tech_headers(tech_token):
    return {"Authorization": f"Bearer {tech_token}"}


# ------------ /roles + ALL_MODULES ------------

class TestRolesEndpoint:
    def test_get_roles_returns_all_modules_and_defaults(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/roles", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert "roles" in data and "permissions" in data
        assert "all_modules" in data
        assert isinstance(data["all_modules"], list)
        # Spec says 22 modules
        assert len(data["all_modules"]) == 22, f"Expected 22 modules, got {len(data['all_modules'])}: {data['all_modules']}"
        # Must include key ones
        for k in ["dashboard", "orcamentos", "propostas", "tech_portal", "utilizadores", "contabilista", "ponto_equilibrio"]:
            assert k in data["all_modules"], f"Missing module key: {k}"
        # Defaults
        assert "default_modules_per_role" in data
        defaults = data["default_modules_per_role"]
        assert "admin" in defaults and "tecnico" in defaults and "consulta" in defaults
        # Admin defaults = all True
        assert all(v is True for v in defaults["admin"].values())
        # tecnico → only tech_portal True
        assert defaults["tecnico"]["tech_portal"] is True
        assert defaults["tecnico"]["dashboard"] is False
        # consulta → dashboard + propostas True, others False
        assert defaults["consulta"]["dashboard"] is True
        assert defaults["consulta"]["propostas"] is True
        assert defaults["consulta"]["contabilista"] is False


# ------------ /auth/me includes module_permissions ------------

class TestAuthMe:
    def test_admin_auth_me_returns_module_permissions_field(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "admin"
        assert "module_permissions" in data  # field may be None for admin — that's OK; frontend bypasses

    def test_login_response_includes_module_permissions(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert "module_permissions" in r.json()


# ------------ Admin → Tech Portal ------------

class TestAdminAccessTechPortal:
    def test_admin_can_list_tech_guides(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/tech/transport-guides", headers=admin_headers)
        assert r.status_code == 200, f"Admin should be able to see tech guides. Got {r.status_code} {r.text}"
        guides = r.json()
        assert isinstance(guides, list)
        # Spec: "Verified 7 guides via curl." → we expect >= 1
        assert len(guides) >= 1, "Admin should see all guides (>=1 seed guide expected)"

    def test_tech_only_sees_own_guides(self, tech_headers, admin_headers):
        r_tech = requests.get(f"{BASE_URL}/api/tech/transport-guides", headers=tech_headers)
        r_admin = requests.get(f"{BASE_URL}/api/tech/transport-guides", headers=admin_headers)
        assert r_tech.status_code == 200 and r_admin.status_code == 200
        tech_guides = r_tech.json()
        admin_guides = r_admin.json()
        # Admin should see >= tech
        assert len(admin_guides) >= len(tech_guides), (
            f"Admin ({len(admin_guides)}) must see >= tech ({len(tech_guides)})"
        )

    def test_admin_profile_returns_is_admin_view(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/tech/profile", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data.get("_is_admin_view") is True
        assert data.get("role") == "admin"
        assert data.get("email") == ADMIN_EMAIL

    def test_tech_profile_no_admin_flag(self, tech_headers):
        r = requests.get(f"{BASE_URL}/api/tech/profile", headers=tech_headers)
        assert r.status_code == 200
        data = r.json()
        assert data.get("_is_admin_view") is not True


# ------------ User CRUD with module_permissions ------------

class TestUserCRUDWithPermissions:
    created_user_id = None

    def test_create_user_with_granular_perms(self, admin_headers):
        modules = {"dashboard": True, "orcamentos": True, "propostas": False, "contabilista": False}
        # Fill others False from ALL_MODULES → but backend also filters, so partial is OK too
        payload = {
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "name": "TEST_ConsultaUser",
            "role": "consulta",
            "module_permissions": modules,
        }
        r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        assert r.status_code == 200, f"POST /users failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["email"] == TEST_USER_EMAIL
        assert data["role"] == "consulta"
        perms = data["module_permissions"]
        assert perms["dashboard"] is True
        assert perms["orcamentos"] is True
        assert perms.get("propostas") is False
        assert perms.get("contabilista") is False
        assert "id" in data
        TestUserCRUDWithPermissions.created_user_id = data["id"]

    def test_list_users_includes_new_user_with_perms(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        assert r.status_code == 200
        users = r.json()
        match = next((u for u in users if u["email"] == TEST_USER_EMAIL), None)
        assert match is not None, "Newly created user not found in list"
        assert "module_permissions" in match
        assert match["module_permissions"]["dashboard"] is True
        assert match["module_permissions"]["orcamentos"] is True

    def test_new_user_can_login_and_auth_me_returns_perms(self):
        # login
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
        assert r.status_code == 200, f"New user login failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["role"] == "consulta"
        perms = data.get("module_permissions") or {}
        assert perms.get("dashboard") is True
        assert perms.get("orcamentos") is True
        # auth/me
        token = data["access_token"]
        r_me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r_me.status_code == 200
        me = r_me.json()
        assert me["module_permissions"]["dashboard"] is True

    def test_update_user_perms_persists(self, admin_headers):
        uid = TestUserCRUDWithPermissions.created_user_id
        assert uid, "Depends on create test"
        new_perms = {"dashboard": True, "orcamentos": False, "agenda": True}
        r = requests.put(f"{BASE_URL}/api/users/{uid}",
                         json={"module_permissions": new_perms},
                         headers=admin_headers)
        assert r.status_code == 200
        # verify with GET /users
        r2 = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        match = next((u for u in r2.json() if u["id"] == uid), None)
        assert match is not None
        assert match["module_permissions"]["orcamentos"] is False
        assert match["module_permissions"]["agenda"] is True

    def test_update_user_password_optional(self, admin_headers):
        uid = TestUserCRUDWithPermissions.created_user_id
        assert uid
        r = requests.put(f"{BASE_URL}/api/users/{uid}",
                         json={"password": "newpass456"},
                         headers=admin_headers)
        assert r.status_code == 200
        # login with new password
        r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": "newpass456"})
        assert r2.status_code == 200

    def test_non_admin_cannot_list_users(self):
        # login as our TEST consulta user (may have changed password)
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": "newpass456"})
        if r.status_code != 200:
            r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
        assert r.status_code == 200
        token = r.json()["access_token"]
        r2 = requests.get(f"{BASE_URL}/api/users", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 403

    def test_delete_created_user(self, admin_headers):
        uid = TestUserCRUDWithPermissions.created_user_id
        if not uid:
            pytest.skip("No user to delete")
        r = requests.delete(f"{BASE_URL}/api/users/{uid}", headers=admin_headers)
        assert r.status_code == 200
        # verify
        r2 = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        assert not any(u["id"] == uid for u in r2.json())


# ------------ Role default modules on create ------------

class TestRoleDefaultsOnCreate:
    def test_create_tecnico_gets_only_tech_portal(self, admin_headers):
        email = f"TEST_tecnico_{int(time.time())}@obelisco.pt"
        r = requests.post(f"{BASE_URL}/api/users", json={
            "email": email, "password": "pw12345", "name": "TEST_Tec", "role": "tecnico"
        }, headers=admin_headers)
        assert r.status_code == 200
        perms = r.json()["module_permissions"]
        assert perms["tech_portal"] is True
        assert perms["dashboard"] is False
        # cleanup
        requests.delete(f"{BASE_URL}/api/users/{r.json()['id']}", headers=admin_headers)
