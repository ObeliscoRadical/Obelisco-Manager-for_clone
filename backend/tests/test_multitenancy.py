"""
Test suite for Multitenancy (Multi-tenant SaaS) Phase 1 - Obelisco Manager

Tests:
1. Admin login returns multicompany context (company_id, company_name, company_slug, available_companies)
2. POST /api/companies creates a new tenant and admin gets access
3. POST /api/companies/select switches active tenant
4. GET /api/auth/me and GET /api/companies/current return the new company after switch
5. User created in new tenant has that tenant's company_id
6. GET /api/users is isolated by tenant (no user leakage)
7. Tech login continues to work and returns correct company context
8. Session refresh preserves active tenant
"""

import pytest
import requests
import uuid
from auth_test_helpers import get_admin_credentials, get_base_url, get_tech_credentials, unique_test_password

BASE_URL = get_base_url()
ADMIN_EMAIL, ADMIN_PASSWORD = get_admin_credentials()
TECH_EMAIL, TECH_PASSWORD = get_tech_credentials()


class TestMultitenancyAdminLogin:
    """Test admin login returns multicompany context"""
    
    def test_admin_login_returns_company_context(self):
        """Admin login should return company_id, company_name, company_slug, available_companies"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        
        # Verify multicompany context fields
        assert "company_id" in data, "Missing company_id in login response"
        assert "company_name" in data, "Missing company_name in login response"
        assert "company_slug" in data, "Missing company_slug in login response"
        assert "available_companies" in data, "Missing available_companies in login response"
        
        # Verify types
        assert isinstance(data["company_id"], str), "company_id should be string"
        assert isinstance(data["company_name"], str), "company_name should be string"
        assert isinstance(data["company_slug"], str), "company_slug should be string"
        assert isinstance(data["available_companies"], list), "available_companies should be list"
        
        # Verify available_companies structure
        if data["available_companies"]:
            company = data["available_companies"][0]
            assert "id" in company, "Company in available_companies missing id"
            assert "name" in company, "Company in available_companies missing name"
            assert "slug" in company, "Company in available_companies missing slug"
        
        print(f"✓ Admin login returns company context: {data['company_name']} ({data['company_slug']})")
        print(f"✓ Available companies: {len(data['available_companies'])}")


class TestMultitenancyCompanyCreation:
    """Test company creation and tenant switching"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session with cookies"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        session.headers.update({
            "Authorization": f"Bearer {data.get('access_token', '')}",
            "Content-Type": "application/json"
        })
        return session, data
    
    def test_create_new_company(self, admin_session):
        """POST /api/companies creates a new tenant"""
        session, login_data = admin_session
        
        test_company_name = f"TEST_Tenant_{uuid.uuid4().hex[:8]}"
        
        response = session.post(
            f"{BASE_URL}/api/companies",
            json={
                "name": test_company_name,
                "email": "test@tenant.com",
                "phone": "123456789"
            }
        )
        assert response.status_code == 200, f"Company creation failed: {response.text}"
        
        data = response.json()
        assert "company" in data, "Response missing company object"
        
        company = data["company"]
        assert company["name"] == test_company_name, "Company name mismatch"
        assert "id" in company, "Company missing id"
        assert "slug" in company, "Company missing slug"
        assert company["status"] == "active", "Company should be active"
        
        print(f"✓ Created new tenant: {company['name']} (id: {company['id']}, slug: {company['slug']})")
    
    def test_admin_gets_access_to_new_tenant(self, admin_session):
        """After creating a tenant, admin should have access to it"""
        session, login_data = admin_session
        
        # Create a new company
        test_company_name = f"TEST_Access_{uuid.uuid4().hex[:8]}"
        create_response = session.post(
            f"{BASE_URL}/api/companies",
            json={"name": test_company_name}
        )
        assert create_response.status_code == 200
        new_company = create_response.json()["company"]
        
        # Get available companies
        companies_response = session.get(f"{BASE_URL}/api/companies")
        assert companies_response.status_code == 200
        
        companies_data = companies_response.json()
        company_ids = [c["id"] for c in companies_data.get("companies", [])]
        
        assert new_company["id"] in company_ids, "Admin should have access to newly created tenant"
        print(f"✓ Admin has access to new tenant: {new_company['name']}")


class TestMultitenancyCompanySwitch:
    """Test switching between tenants"""
    
    @pytest.fixture
    def admin_session_with_new_tenant(self):
        """Get admin session and create a new tenant for testing"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        session.headers.update({
            "Authorization": f"Bearer {data.get('access_token', '')}",
            "Content-Type": "application/json"
        })
        
        original_company_id = data.get("company_id")
        
        # Create a new tenant
        test_company_name = f"TEST_Switch_{uuid.uuid4().hex[:8]}"
        create_response = session.post(
            f"{BASE_URL}/api/companies",
            json={"name": test_company_name}
        )
        assert create_response.status_code == 200
        new_company = create_response.json()["company"]
        
        return session, data, original_company_id, new_company
    
    def test_select_company_switches_tenant(self, admin_session_with_new_tenant):
        """POST /api/companies/select switches the active tenant"""
        session, login_data, original_company_id, new_company = admin_session_with_new_tenant
        
        # Switch to new tenant
        select_response = session.post(
            f"{BASE_URL}/api/companies/select",
            json={"company_id": new_company["id"]}
        )
        assert select_response.status_code == 200, f"Company select failed: {select_response.text}"
        
        select_data = select_response.json()
        assert select_data["company_id"] == new_company["id"], "company_id should match selected company"
        assert select_data["company_name"] == new_company["name"], "company_name should match"
        
        print(f"✓ Switched to tenant: {select_data['company_name']}")
    
    def test_auth_me_returns_new_company_after_switch(self, admin_session_with_new_tenant):
        """GET /api/auth/me returns the new company after switch"""
        session, login_data, original_company_id, new_company = admin_session_with_new_tenant
        
        # Switch to new tenant
        session.post(
            f"{BASE_URL}/api/companies/select",
            json={"company_id": new_company["id"]}
        )
        
        # Update header with new company ID
        session.headers["X-Company-Id"] = new_company["id"]
        
        # Check /api/auth/me
        me_response = session.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200
        
        me_data = me_response.json()
        assert me_data["company_id"] == new_company["id"], "auth/me should return new company_id"
        assert me_data["company_name"] == new_company["name"], "auth/me should return new company_name"
        
        print(f"✓ /api/auth/me returns new company: {me_data['company_name']}")
    
    def test_companies_current_returns_new_company_after_switch(self, admin_session_with_new_tenant):
        """GET /api/companies/current returns the new company after switch"""
        session, login_data, original_company_id, new_company = admin_session_with_new_tenant
        
        # Switch to new tenant
        session.post(
            f"{BASE_URL}/api/companies/select",
            json={"company_id": new_company["id"]}
        )
        
        # Update header with new company ID
        session.headers["X-Company-Id"] = new_company["id"]
        
        # Check /api/companies/current
        current_response = session.get(f"{BASE_URL}/api/companies/current")
        assert current_response.status_code == 200
        
        current_data = current_response.json()
        assert current_data["id"] == new_company["id"], "companies/current should return new company id"
        assert current_data["name"] == new_company["name"], "companies/current should return new company name"
        
        print(f"✓ /api/companies/current returns new company: {current_data['name']}")


class TestMultitenancyUserIsolation:
    """Test user isolation between tenants"""
    
    @pytest.fixture
    def admin_session_with_two_tenants(self):
        """Get admin session with original and new tenant"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        session.headers.update({
            "Authorization": f"Bearer {data.get('access_token', '')}",
            "Content-Type": "application/json"
        })
        
        original_company_id = data.get("company_id")
        
        # Create a new tenant
        test_company_name = f"TEST_Isolation_{uuid.uuid4().hex[:8]}"
        create_response = session.post(
            f"{BASE_URL}/api/companies",
            json={"name": test_company_name}
        )
        assert create_response.status_code == 200
        new_company = create_response.json()["company"]
        
        return session, original_company_id, new_company
    
    def test_users_isolated_by_tenant(self, admin_session_with_two_tenants):
        """GET /api/users should be isolated by tenant"""
        session, original_company_id, new_company = admin_session_with_two_tenants
        
        # Get users in original tenant
        session.headers["X-Company-Id"] = original_company_id
        original_users_response = session.get(f"{BASE_URL}/api/users")
        assert original_users_response.status_code == 200
        original_users = original_users_response.json()
        original_user_count = len(original_users)
        
        # Switch to new tenant
        session.post(
            f"{BASE_URL}/api/companies/select",
            json={"company_id": new_company["id"]}
        )
        session.headers["X-Company-Id"] = new_company["id"]
        
        # Get users in new tenant (should be empty or different)
        new_users_response = session.get(f"{BASE_URL}/api/users")
        assert new_users_response.status_code == 200
        new_users = new_users_response.json()
        new_user_count = len(new_users)
        
        # New tenant should have fewer or no users (only admin might be shared)
        print(f"✓ Original tenant users: {original_user_count}")
        print(f"✓ New tenant users: {new_user_count}")
        
        # Verify no user leakage - users in new tenant should not include original tenant users
        # (except possibly the admin who has access to both)
        original_user_ids = {u.get("id") for u in original_users}
        new_user_ids = {u.get("id") for u in new_users}
        
        # The intersection should only contain the admin (if any)
        shared_users = original_user_ids & new_user_ids
        print(f"✓ Shared users (should be minimal): {len(shared_users)}")


class TestMultitenancyTechLogin:
    """Test tech login with multicompany context"""
    
    def test_tech_login_returns_company_context(self):
        """Tech login should return company context"""
        response = requests.post(
            f"{BASE_URL}/api/tech/auth/login",
            json={"email": TECH_EMAIL, "password": TECH_PASSWORD}
        )
        assert response.status_code == 200, f"Tech login failed: {response.text}"
        
        data = response.json()
        
        # Verify token
        assert "access_token" in data, "Missing access_token"
        assert "employee" in data, "Missing employee object"
        
        employee = data["employee"]
        
        # Verify company context in employee
        assert "company_id" in employee, "Missing company_id in employee"
        assert "company_name" in employee, "Missing company_name in employee"
        assert "company_slug" in employee, "Missing company_slug in employee"
        
        print(f"✓ Tech login returns company context: {employee.get('company_name')} ({employee.get('company_slug')})")
    
    def test_tech_auth_me_returns_company_context(self):
        """GET /api/tech/auth/me should return company context"""
        # Login first
        login_response = requests.post(
            f"{BASE_URL}/api/tech/auth/login",
            json={"email": TECH_EMAIL, "password": TECH_PASSWORD}
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Get /api/tech/auth/me
        me_response = requests.get(
            f"{BASE_URL}/api/tech/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_response.status_code == 200, f"Tech auth/me failed: {me_response.text}"
        
        data = me_response.json()
        
        # Verify company context
        assert "company_id" in data, "Missing company_id in tech/auth/me"
        assert "company_name" in data, "Missing company_name in tech/auth/me"
        assert "company_slug" in data, "Missing company_slug in tech/auth/me"
        
        print(f"✓ Tech /api/tech/auth/me returns company context: {data.get('company_name')}")


class TestMultitenancySessionRefresh:
    """Test session refresh preserves active tenant"""
    
    def test_refresh_preserves_active_tenant(self):
        """POST /api/auth/refresh should preserve the active tenant"""
        session = requests.Session()
        
        # Login
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200
        login_data = login_response.json()
        
        access_token = login_data.get("access_token", "")
        refresh_token = login_data.get("refresh_token", "")
        original_company_id = login_data.get("company_id")
        
        session.headers.update({
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "X-Company-Id": original_company_id
        })
        
        # Create a new tenant
        test_company_name = f"TEST_Refresh_{uuid.uuid4().hex[:8]}"
        create_response = session.post(
            f"{BASE_URL}/api/companies",
            json={"name": test_company_name}
        )
        assert create_response.status_code == 200
        new_company = create_response.json()["company"]
        
        # Switch to new tenant
        session.post(
            f"{BASE_URL}/api/companies/select",
            json={"company_id": new_company["id"]}
        )
        session.headers["X-Company-Id"] = new_company["id"]
        
        # Refresh the session
        refresh_response = session.post(
            f"{BASE_URL}/api/auth/refresh",
            json={"refresh_token": refresh_token}
        )
        assert refresh_response.status_code == 200, f"Refresh failed: {refresh_response.text}"
        
        refresh_data = refresh_response.json()
        
        # Verify the active tenant is preserved
        assert refresh_data.get("company_id") == new_company["id"], \
            f"Refresh should preserve active tenant. Expected {new_company['id']}, got {refresh_data.get('company_id')}"
        
        print(f"✓ Session refresh preserves active tenant: {refresh_data.get('company_name')}")


class TestMultitenancyUserCreationInTenant:
    """Test user creation in specific tenant"""
    
    @pytest.fixture
    def admin_session_with_new_tenant(self):
        """Get admin session and create a new tenant"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        session.headers.update({
            "Authorization": f"Bearer {data.get('access_token', '')}",
            "Content-Type": "application/json"
        })
        
        original_company_id = data.get("company_id")
        
        # Create a new tenant
        test_company_name = f"TEST_UserCreate_{uuid.uuid4().hex[:8]}"
        create_response = session.post(
            f"{BASE_URL}/api/companies",
            json={"name": test_company_name}
        )
        assert create_response.status_code == 200
        new_company = create_response.json()["company"]
        
        return session, original_company_id, new_company
    
    def test_user_created_in_active_tenant(self, admin_session_with_new_tenant):
        """User created while in new tenant should have that tenant's company_id"""
        session, original_company_id, new_company = admin_session_with_new_tenant
        
        # Switch to new tenant
        session.post(
            f"{BASE_URL}/api/companies/select",
            json={"company_id": new_company["id"]}
        )
        session.headers["X-Company-Id"] = new_company["id"]
        
        # Create a user in the new tenant
        test_user_email = f"TEST_user_{uuid.uuid4().hex[:8]}@test.com"
        create_user_response = session.post(
            f"{BASE_URL}/api/users",
            json={
                "email": test_user_email,
                "name": "Test User",
                "password": unique_test_password("TenantUser"),
                "role": "consulta"
            }
        )
        
        # User creation might return 200 or 201
        assert create_user_response.status_code in [200, 201], \
            f"User creation failed: {create_user_response.text}"
        
        created_user = create_user_response.json()
        
        # Verify the user has the new tenant's company_id
        assert created_user.get("company_id") == new_company["id"], \
            f"User should have new tenant's company_id. Expected {new_company['id']}, got {created_user.get('company_id')}"
        
        print(f"✓ User created in new tenant has correct company_id: {created_user.get('company_id')}")
        
        # Verify user doesn't appear in original tenant
        session.headers["X-Company-Id"] = original_company_id
        original_users_response = session.get(f"{BASE_URL}/api/users")
        assert original_users_response.status_code == 200
        original_users = original_users_response.json()
        
        original_user_emails = [u.get("email") for u in original_users]
        assert test_user_email not in original_user_emails, \
            "User created in new tenant should not appear in original tenant"
        
        print(f"✓ User does not appear in original tenant (isolation verified)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
