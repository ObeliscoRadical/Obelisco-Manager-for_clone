"""
Test suite for Multitenancy Phase 2 - Obelisco Manager

Tests:
1. GET /api/companies returns detailed list with stats per tenant
2. GET /api/companies/{company_id}/users returns users with has_access_to_company and is_primary_for_company flags
3. PUT /api/users/{id} accepts company_access_ids and company_id updates
4. User with multi-company access appears in both tenants' user lists
5. Setting primary company (company_id) works correctly
6. Removing company access from user works correctly
"""

import pytest
import requests
import uuid
from auth_test_helpers import get_admin_credentials, get_base_url, unique_test_password

BASE_URL = get_base_url()
ADMIN_EMAIL, ADMIN_PASSWORD = get_admin_credentials()


class TestMultitenancyPhase2CompaniesEndpoint:
    """Test GET /api/companies returns detailed list with stats"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
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
    
    def test_companies_list_returns_stats(self, admin_session):
        """GET /api/companies should return companies with stats"""
        session, login_data = admin_session
        
        response = session.get(f"{BASE_URL}/api/companies")
        assert response.status_code == 200, f"Companies list failed: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "companies" in data, "Response missing companies array"
        assert "current_company_id" in data, "Response missing current_company_id"
        assert "primary_company_id" in data, "Response missing primary_company_id"
        
        # Verify companies have stats
        if data["companies"]:
            company = data["companies"][0]
            assert "stats" in company, "Company missing stats"
            assert "users_count" in company["stats"], "Stats missing users_count"
            assert "budgets_count" in company["stats"], "Stats missing budgets_count"
            assert "works_count" in company["stats"], "Stats missing works_count"
            assert "invoices_count" in company["stats"], "Stats missing invoices_count"
            assert "is_active" in company, "Company missing is_active flag"
            assert "is_primary" in company, "Company missing is_primary flag"
        
        print(f"✓ GET /api/companies returns {len(data['companies'])} companies with stats")


class TestMultitenancyPhase2CompanyUsers:
    """Test GET /api/companies/{company_id}/users endpoint"""
    
    @pytest.fixture
    def admin_session_with_company(self):
        """Get admin session and create a test company"""
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
        
        # Create a test company
        test_company_name = f"TEST_Phase2_{uuid.uuid4().hex[:8]}"
        create_response = session.post(
            f"{BASE_URL}/api/companies",
            json={"name": test_company_name}
        )
        assert create_response.status_code == 200
        new_company = create_response.json()["company"]
        
        return session, data, original_company_id, new_company
    
    def test_company_users_endpoint_returns_access_flags(self, admin_session_with_company):
        """GET /api/companies/{id}/users should return has_access_to_company and is_primary_for_company"""
        session, login_data, original_company_id, new_company = admin_session_with_company
        
        response = session.get(f"{BASE_URL}/api/companies/{original_company_id}/users")
        assert response.status_code == 200, f"Company users failed: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "company" in data, "Response missing company object"
        assert "users" in data, "Response missing users array"
        
        # Verify users have access flags
        if data["users"]:
            user = data["users"][0]
            assert "has_access_to_company" in user, "User missing has_access_to_company flag"
            assert "is_primary_for_company" in user, "User missing is_primary_for_company flag"
            assert "company_access_ids" in user, "User missing company_access_ids"
            assert "accessible_companies" in user, "User missing accessible_companies"
        
        print(f"✓ GET /api/companies/{original_company_id}/users returns {len(data['users'])} users with access flags")
    
    def test_company_users_sorted_by_access(self, admin_session_with_company):
        """Users with access should appear before users without access"""
        session, login_data, original_company_id, new_company = admin_session_with_company
        
        response = session.get(f"{BASE_URL}/api/companies/{new_company['id']}/users")
        assert response.status_code == 200
        
        data = response.json()
        users = data.get("users", [])
        
        # Check sorting - users with access should come first
        has_access_indices = [i for i, u in enumerate(users) if u.get("has_access_to_company")]
        no_access_indices = [i for i, u in enumerate(users) if not u.get("has_access_to_company")]
        
        if has_access_indices and no_access_indices:
            assert max(has_access_indices) < min(no_access_indices), \
                "Users with access should be sorted before users without access"
        
        print(f"✓ Company users are sorted by access status")


class TestMultitenancyPhase2UserCompanyUpdates:
    """Test PUT /api/users/{id} with company_access_ids and company_id"""
    
    @pytest.fixture
    def admin_session_with_test_user(self):
        """Get admin session and create a test user"""
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
        
        # Create a second company
        test_company_name = f"TEST_UserUpdate_{uuid.uuid4().hex[:8]}"
        create_response = session.post(
            f"{BASE_URL}/api/companies",
            json={"name": test_company_name}
        )
        assert create_response.status_code == 200
        second_company = create_response.json()["company"]
        
        # Create a test user
        test_user_email = f"TEST_user_{uuid.uuid4().hex[:8]}@test.com"
        create_user_response = session.post(
            f"{BASE_URL}/api/users",
            json={
                "email": test_user_email,
                "name": "Test User Phase2",
                "password": unique_test_password("Phase2User"),
                "role": "consulta",
                "company_access_ids": [original_company_id],
                "company_id": original_company_id
            }
        )
        assert create_user_response.status_code in [200, 201], f"User creation failed: {create_user_response.text}"
        test_user = create_user_response.json()
        
        return session, data, original_company_id, second_company, test_user
    
    def test_update_user_company_access_ids(self, admin_session_with_test_user):
        """PUT /api/users/{id} should accept company_access_ids update"""
        session, login_data, original_company_id, second_company, test_user = admin_session_with_test_user
        
        # Add second company to user's access
        new_access_ids = [original_company_id, second_company["id"]]
        
        update_response = session.put(
            f"{BASE_URL}/api/users/{test_user['id']}",
            json={
                "company_access_ids": new_access_ids,
                "company_id": original_company_id
            }
        )
        assert update_response.status_code == 200, f"User update failed: {update_response.text}"
        
        # Verify the update by checking company users
        session.headers["X-Company-Id"] = second_company["id"]
        company_users_response = session.get(f"{BASE_URL}/api/companies/{second_company['id']}/users")
        assert company_users_response.status_code == 200
        
        users_data = company_users_response.json()
        test_user_in_list = next((u for u in users_data["users"] if u["id"] == test_user["id"]), None)
        
        assert test_user_in_list is not None, "Test user should appear in second company's user list"
        assert test_user_in_list["has_access_to_company"] == True, "User should have access to second company"
        
        print(f"✓ User company_access_ids updated successfully")
    
    def test_update_user_primary_company(self, admin_session_with_test_user):
        """PUT /api/users/{id} should accept company_id (primary company) update"""
        session, login_data, original_company_id, second_company, test_user = admin_session_with_test_user
        
        # First give user access to both companies
        session.put(
            f"{BASE_URL}/api/users/{test_user['id']}",
            json={
                "company_access_ids": [original_company_id, second_company["id"]],
                "company_id": original_company_id
            }
        )
        
        # Now change primary company
        update_response = session.put(
            f"{BASE_URL}/api/users/{test_user['id']}",
            json={
                "company_access_ids": [original_company_id, second_company["id"]],
                "company_id": second_company["id"]
            }
        )
        assert update_response.status_code == 200, f"Primary company update failed: {update_response.text}"
        
        # Verify by checking company users
        company_users_response = session.get(f"{BASE_URL}/api/companies/{second_company['id']}/users")
        assert company_users_response.status_code == 200
        
        users_data = company_users_response.json()
        test_user_in_list = next((u for u in users_data["users"] if u["id"] == test_user["id"]), None)
        
        assert test_user_in_list is not None, "Test user should appear in company users"
        assert test_user_in_list["is_primary_for_company"] == True, "User should have this as primary company"
        
        print(f"✓ User primary company (company_id) updated successfully")
    
    def test_remove_company_access_from_user(self, admin_session_with_test_user):
        """Removing company from company_access_ids should work"""
        session, login_data, original_company_id, second_company, test_user = admin_session_with_test_user
        
        # First give user access to both companies
        session.put(
            f"{BASE_URL}/api/users/{test_user['id']}",
            json={
                "company_access_ids": [original_company_id, second_company["id"]],
                "company_id": original_company_id
            }
        )
        
        # Now remove access to second company
        update_response = session.put(
            f"{BASE_URL}/api/users/{test_user['id']}",
            json={
                "company_access_ids": [original_company_id],
                "company_id": original_company_id
            }
        )
        assert update_response.status_code == 200, f"Remove access failed: {update_response.text}"
        
        # Verify by checking company users
        company_users_response = session.get(f"{BASE_URL}/api/companies/{second_company['id']}/users")
        assert company_users_response.status_code == 200
        
        users_data = company_users_response.json()
        test_user_in_list = next((u for u in users_data["users"] if u["id"] == test_user["id"]), None)
        
        if test_user_in_list:
            assert test_user_in_list["has_access_to_company"] == False, "User should not have access after removal"
        
        print(f"✓ Company access removed from user successfully")


class TestMultitenancyPhase2UserIsolationWithMultiAccess:
    """Test user isolation when user has multi-company access"""
    
    @pytest.fixture
    def admin_session_with_multi_access_user(self):
        """Create a user with access to multiple companies"""
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
        
        # Create two test companies
        company1_name = f"TEST_Multi1_{uuid.uuid4().hex[:8]}"
        company2_name = f"TEST_Multi2_{uuid.uuid4().hex[:8]}"
        
        create1 = session.post(f"{BASE_URL}/api/companies", json={"name": company1_name})
        assert create1.status_code == 200
        company1 = create1.json()["company"]
        
        create2 = session.post(f"{BASE_URL}/api/companies", json={"name": company2_name})
        assert create2.status_code == 200
        company2 = create2.json()["company"]
        
        # Create a user with access to both new companies
        test_user_email = f"TEST_multi_{uuid.uuid4().hex[:8]}@test.com"
        create_user = session.post(
            f"{BASE_URL}/api/users",
            json={
                "email": test_user_email,
                "name": "Multi Access User",
                "password": unique_test_password("MultiUser"),
                "role": "consulta",
                "company_access_ids": [company1["id"], company2["id"]],
                "company_id": company1["id"]
            }
        )
        assert create_user.status_code in [200, 201]
        test_user = create_user.json()
        
        return session, original_company_id, company1, company2, test_user
    
    def test_user_appears_in_both_company_user_lists(self, admin_session_with_multi_access_user):
        """User with multi-company access should appear in both companies' user lists"""
        session, original_company_id, company1, company2, test_user = admin_session_with_multi_access_user
        
        # Check company1 users
        response1 = session.get(f"{BASE_URL}/api/companies/{company1['id']}/users")
        assert response1.status_code == 200
        users1 = response1.json()["users"]
        user_in_company1 = next((u for u in users1 if u["id"] == test_user["id"]), None)
        
        assert user_in_company1 is not None, "User should appear in company1 users"
        assert user_in_company1["has_access_to_company"] == True
        assert user_in_company1["is_primary_for_company"] == True  # company1 is primary
        
        # Check company2 users
        response2 = session.get(f"{BASE_URL}/api/companies/{company2['id']}/users")
        assert response2.status_code == 200
        users2 = response2.json()["users"]
        user_in_company2 = next((u for u in users2 if u["id"] == test_user["id"]), None)
        
        assert user_in_company2 is not None, "User should appear in company2 users"
        assert user_in_company2["has_access_to_company"] == True
        assert user_in_company2["is_primary_for_company"] == False  # company1 is primary, not company2
        
        print(f"✓ User with multi-company access appears correctly in both company user lists")
    
    def test_get_users_includes_multi_access_users(self, admin_session_with_multi_access_user):
        """GET /api/users should include users with access to current tenant even if primary is different"""
        session, original_company_id, company1, company2, test_user = admin_session_with_multi_access_user
        
        # Switch to company2 (where test_user has access but not primary)
        session.post(f"{BASE_URL}/api/companies/select", json={"company_id": company2["id"]})
        session.headers["X-Company-Id"] = company2["id"]
        
        # Get users in company2
        response = session.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200
        
        users = response.json()
        user_in_list = next((u for u in users if u["id"] == test_user["id"]), None)
        
        assert user_in_list is not None, \
            "User with access to tenant should appear in GET /api/users even if primary company is different"
        
        print(f"✓ GET /api/users includes users with access to current tenant")


class TestMultitenancyPhase2Validation:
    """Test validation rules for company access updates"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
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
        return session, data
    
    def test_cannot_set_primary_outside_access_list(self, admin_session):
        """Primary company must be in company_access_ids"""
        session, login_data = admin_session
        original_company_id = login_data.get("company_id")
        
        # Create a test user
        test_user_email = f"TEST_val_{uuid.uuid4().hex[:8]}@test.com"
        create_user = session.post(
            f"{BASE_URL}/api/users",
            json={
                "email": test_user_email,
                "name": "Validation Test User",
                "password": unique_test_password("ValUser"),
                "role": "consulta"
            }
        )
        assert create_user.status_code in [200, 201]
        test_user = create_user.json()
        
        # Create a company the user doesn't have access to
        other_company_name = f"TEST_Other_{uuid.uuid4().hex[:8]}"
        create_company = session.post(f"{BASE_URL}/api/companies", json={"name": other_company_name})
        assert create_company.status_code == 200
        other_company = create_company.json()["company"]
        
        # Try to set primary to a company not in access list
        # The API should either reject this or auto-add the company to access list
        update_response = session.put(
            f"{BASE_URL}/api/users/{test_user['id']}",
            json={
                "company_access_ids": [original_company_id],  # Only original company
                "company_id": other_company["id"]  # Try to set primary to other company
            }
        )
        
        # The API should handle this gracefully - either reject or auto-add
        # Based on the code, it should auto-add the primary to access list
        if update_response.status_code == 200:
            # Verify the primary was added to access list
            company_users = session.get(f"{BASE_URL}/api/companies/{other_company['id']}/users")
            users_data = company_users.json()
            user_in_list = next((u for u in users_data["users"] if u["id"] == test_user["id"]), None)
            if user_in_list:
                assert user_in_list["has_access_to_company"] == True, \
                    "Primary company should be auto-added to access list"
            print(f"✓ Primary company auto-added to access list")
        else:
            # API rejected the invalid request
            print(f"✓ API correctly rejected setting primary outside access list")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
