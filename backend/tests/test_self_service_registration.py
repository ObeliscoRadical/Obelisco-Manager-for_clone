"""
Test Self-Service Registration (Iteration 62)
- POST /api/auth/register creates new company + admin user
- Auto-login after registration
- GET /api/auth/me and GET /api/companies/current return new tenant
- Existing admin and tech logins continue to work (regression)
"""
import pytest
import requests
import uuid
from auth_test_helpers import get_admin_credentials, get_base_url, get_tech_credentials

BASE_URL = get_base_url()
ADMIN_EMAIL, ADMIN_PASSWORD = get_admin_credentials()
TECH_EMAIL, TECH_PASSWORD = get_tech_credentials()


@pytest.fixture
def api_client():
    """Shared requests session with cookies"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestSelfServiceRegistration:
    """Test the new self-service registration flow"""

    def test_register_creates_company_and_admin(self, api_client):
        """POST /api/auth/register creates new company + admin with auto-login"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"TEST_Responsavel_{unique_id}",
            "email": f"test_reg_{unique_id}@example.com",
            "password": "testpass123",
            "company_name": f"TEST_Empresa_{unique_id}"
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "id" in data, "Response should contain user id"
        assert data["email"] == payload["email"].lower(), "Email should match"
        assert data["name"] == payload["name"], "Name should match"
        assert data["role"] == "admin", "New user should be admin"
        
        # Company context assertions
        assert "company_id" in data, "Response should contain company_id"
        assert "company_name" in data, "Response should contain company_name"
        assert data["company_name"] == payload["company_name"], "Company name should match"
        assert "company_slug" in data, "Response should contain company_slug"
        
        # Token assertions (auto-login)
        assert "access_token" in data, "Response should contain access_token"
        assert "refresh_token" in data, "Response should contain refresh_token"
        
        # Verify cookies are set
        assert "access_token" in api_client.cookies, "access_token cookie should be set"
        
        print(f"✓ Registration successful: user={data['id']}, company={data['company_id']}")

    def test_register_then_auth_me_returns_new_tenant(self, api_client):
        """After registration, GET /api/auth/me returns the new tenant context"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"TEST_AuthMe_{unique_id}",
            "email": f"test_authme_{unique_id}@example.com",
            "password": "testpass123",
            "company_name": f"TEST_AuthMeCompany_{unique_id}"
        }
        
        # Register
        reg_response = api_client.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert reg_response.status_code == 200, f"Registration failed: {reg_response.text}"
        reg_data = reg_response.json()
        
        # GET /api/auth/me
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200, f"GET /api/auth/me failed: {me_response.text}"
        
        me_data = me_response.json()
        assert me_data["id"] == reg_data["id"], "User ID should match"
        assert me_data["email"] == payload["email"].lower(), "Email should match"
        assert me_data["company_id"] == reg_data["company_id"], "Company ID should match"
        assert me_data["company_name"] == payload["company_name"], "Company name should match"
        
        print(f"✓ GET /api/auth/me returns correct tenant: {me_data['company_name']}")

    def test_register_then_companies_current_returns_new_tenant(self, api_client):
        """After registration, GET /api/companies/current returns the new tenant"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"TEST_CompCurrent_{unique_id}",
            "email": f"test_compcurrent_{unique_id}@example.com",
            "password": "testpass123",
            "company_name": f"TEST_CompCurrentCompany_{unique_id}"
        }
        
        # Register
        reg_response = api_client.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert reg_response.status_code == 200, f"Registration failed: {reg_response.text}"
        reg_data = reg_response.json()
        
        # GET /api/companies/current
        current_response = api_client.get(f"{BASE_URL}/api/companies/current")
        assert current_response.status_code == 200, f"GET /api/companies/current failed: {current_response.text}"
        
        current_data = current_response.json()
        assert current_data["id"] == reg_data["company_id"], "Company ID should match"
        assert current_data["name"] == payload["company_name"], "Company name should match"
        
        print(f"✓ GET /api/companies/current returns correct tenant: {current_data['name']}")

    def test_register_validation_missing_name(self, api_client):
        """Registration fails with missing name"""
        payload = {
            "name": "",
            "email": "test@example.com",
            "password": "testpass123",
            "company_name": "Test Company"
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        print("✓ Validation: missing name rejected")

    def test_register_validation_missing_company_name(self, api_client):
        """Registration fails with missing company name"""
        payload = {
            "name": "Test User",
            "email": "test@example.com",
            "password": "testpass123",
            "company_name": ""
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        print("✓ Validation: missing company name rejected")

    def test_register_validation_short_password(self, api_client):
        """Registration fails with password < 6 characters"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": "Test User",
            "email": f"test_short_{unique_id}@example.com",
            "password": "12345",  # Only 5 chars
            "company_name": "Test Company"
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        print("✓ Validation: short password rejected")

    def test_register_validation_duplicate_email(self, api_client):
        """Registration fails with already registered email"""
        # Try to register with existing admin email
        payload = {
            "name": "Test User",
            "email": ADMIN_EMAIL,
            "password": "testpass123",
            "company_name": "Test Company"
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "registado" in response.json().get("detail", "").lower() or "email" in response.json().get("detail", "").lower()
        
        print("✓ Validation: duplicate email rejected")


class TestAdminLoginRegression:
    """Verify existing admin login still works after registration feature"""

    def test_admin_login_still_works(self, api_client):
        """POST /api/auth/login with admin credentials still works"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        assert "company_id" in data
        assert "company_name" in data
        assert "access_token" in data
        
        print(f"✓ Admin login works: {data['name']} @ {data['company_name']}")

    def test_admin_auth_me_after_login(self, api_client):
        """GET /api/auth/me works after admin login"""
        # Login
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        
        # GET /api/auth/me
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200, f"GET /api/auth/me failed: {me_response.text}"
        
        me_data = me_response.json()
        assert me_data["email"] == ADMIN_EMAIL
        assert "company_id" in me_data
        
        print(f"✓ Admin GET /api/auth/me works: {me_data['company_name']}")


class TestTechLoginRegression:
    """Verify existing tech login still works after registration feature"""

    def test_tech_login_still_works(self, api_client):
        """POST /api/tech/auth/login with tech credentials still works"""
        response = api_client.post(f"{BASE_URL}/api/tech/auth/login", json={
            "email": TECH_EMAIL,
            "password": TECH_PASSWORD
        })
        
        assert response.status_code == 200, f"Tech login failed: {response.text}"
        
        data = response.json()
        assert "employee" in data, "Response should contain employee object"
        assert data["employee"]["email"] == TECH_EMAIL
        assert "access_token" in data
        
        print(f"✓ Tech login works: {data['employee']['name']}")

    def test_tech_auth_me_after_login(self, api_client):
        """GET /api/tech/auth/me works after tech login"""
        # Login
        login_response = api_client.post(f"{BASE_URL}/api/tech/auth/login", json={
            "email": TECH_EMAIL,
            "password": TECH_PASSWORD
        })
        assert login_response.status_code == 200
        login_data = login_response.json()
        
        # Set auth header for tech
        api_client.headers.update({"Authorization": f"Bearer {login_data['access_token']}"})
        
        # GET /api/tech/auth/me
        me_response = api_client.get(f"{BASE_URL}/api/tech/auth/me")
        assert me_response.status_code == 200, f"GET /api/tech/auth/me failed: {me_response.text}"
        
        me_data = me_response.json()
        assert me_data["email"] == TECH_EMAIL
        assert "company_id" in me_data or "company_name" in me_data
        
        print(f"✓ Tech GET /api/tech/auth/me works: {me_data['name']}")


class TestNewAccountIsolation:
    """Verify new account sees CompanySwitcher and operates as isolated tenant"""

    def test_new_account_has_available_companies(self, api_client):
        """New account should have available_companies with only their company"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"TEST_Isolation_{unique_id}",
            "email": f"test_isolation_{unique_id}@example.com",
            "password": "testpass123",
            "company_name": f"TEST_IsolationCompany_{unique_id}"
        }
        
        # Register
        reg_response = api_client.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert reg_response.status_code == 200
        reg_data = reg_response.json()
        
        # Check available_companies
        assert "available_companies" in reg_data, "Response should contain available_companies"
        available = reg_data["available_companies"]
        assert len(available) == 1, f"New account should have exactly 1 company, got {len(available)}"
        assert available[0]["id"] == reg_data["company_id"], "Available company should be the new company"
        
        print(f"✓ New account has isolated tenant: {available[0]['name']}")

    def test_new_account_companies_list_isolated(self, api_client):
        """GET /api/companies for new account returns only their company"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"TEST_CompList_{unique_id}",
            "email": f"test_complist_{unique_id}@example.com",
            "password": "testpass123",
            "company_name": f"TEST_CompListCompany_{unique_id}"
        }
        
        # Register
        reg_response = api_client.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert reg_response.status_code == 200
        reg_data = reg_response.json()
        
        # GET /api/companies
        companies_response = api_client.get(f"{BASE_URL}/api/companies")
        assert companies_response.status_code == 200, f"GET /api/companies failed: {companies_response.text}"
        
        companies_data = companies_response.json()
        assert "companies" in companies_data, "Response should contain companies list"
        companies = companies_data["companies"]
        assert len(companies) == 1, f"New account should see only 1 company, got {len(companies)}"
        assert companies[0]["id"] == reg_data["company_id"], "Should see only their company"
        
        print(f"✓ GET /api/companies returns isolated tenant: {companies[0]['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
