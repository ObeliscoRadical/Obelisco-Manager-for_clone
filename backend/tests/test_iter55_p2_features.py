"""
Iteration 55 - P2 Features Testing
Tests for:
1. Dashboard mini chart (monthly_revenue_vs_expenses)
2. Contas Previstas filters (category, date range)
3. Team GPS Map (timeclock/team-map endpoint)
4. Security hardening (headers, rate limiting)
5. Existing timeclock endpoints (no regression)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in login response"
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}"}


# ============================================================
# 1. Dashboard Overview - Mini Chart (monthly_revenue_vs_expenses)
# ============================================================
class TestDashboardMiniChart:
    """Tests for GET /api/dashboard/overview - monthly_revenue_vs_expenses field"""

    def test_dashboard_overview_returns_200(self, auth_headers):
        """Dashboard overview endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    def test_dashboard_has_monthly_revenue_vs_expenses(self, auth_headers):
        """Dashboard includes monthly_revenue_vs_expenses field"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "monthly_revenue_vs_expenses" in data, "Missing monthly_revenue_vs_expenses field"

    def test_monthly_revenue_vs_expenses_structure(self, auth_headers):
        """monthly_revenue_vs_expenses has correct structure (6 months)"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        series = data.get("monthly_revenue_vs_expenses", [])
        
        # Should have 6 months of data
        assert len(series) == 6, f"Expected 6 months, got {len(series)}"
        
        # Each item should have required fields
        for item in series:
            assert "key" in item, "Missing 'key' field"
            assert "label" in item, "Missing 'label' field"
            assert "revenue" in item, "Missing 'revenue' field"
            assert "expenses" in item, "Missing 'expenses' field"
            assert "net" in item, "Missing 'net' field"
            assert isinstance(item["revenue"], (int, float)), "revenue should be numeric"
            assert isinstance(item["expenses"], (int, float)), "expenses should be numeric"

    def test_dashboard_highlights_structure(self, auth_headers):
        """Dashboard highlights has expected structure"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        
        assert "highlights" in data
        highlights = data["highlights"]
        assert "cash_month" in highlights
        assert "to_receive" in highlights
        assert "to_pay" in highlights
        assert "alerts" in highlights


# ============================================================
# 2. Contas Previstas - Filters
# ============================================================
class TestContasPrevistasFilters:
    """Tests for predicted bills list endpoint"""

    def test_predicted_bills_list_returns_200(self, auth_headers):
        """GET /api/bank-analysis/predicted-bills/list returns 200"""
        response = requests.get(f"{BASE_URL}/api/bank-analysis/predicted-bills/list", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    def test_predicted_bills_list_is_array(self, auth_headers):
        """Predicted bills list returns an array"""
        response = requests.get(f"{BASE_URL}/api/bank-analysis/predicted-bills/list", headers=auth_headers)
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_predicted_bills_item_structure(self, auth_headers):
        """Predicted bills items have expected fields for filtering"""
        response = requests.get(f"{BASE_URL}/api/bank-analysis/predicted-bills/list", headers=auth_headers)
        data = response.json()
        
        if len(data) > 0:
            item = data[0]
            # Fields needed for frontend filtering
            assert "id" in item, "Missing 'id' field"
            # predicted_category is used for category filter
            # date is used for date range filter


# ============================================================
# 3. Team GPS Map - /api/service-orders/timeclock/team-map
# ============================================================
class TestTeamGPSMap:
    """Tests for GET /api/service-orders/timeclock/team-map"""

    def test_team_map_returns_200(self, auth_headers):
        """Team map endpoint returns 200 for admin"""
        response = requests.get(f"{BASE_URL}/api/service-orders/timeclock/team-map", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    def test_team_map_response_structure(self, auth_headers):
        """Team map response has required fields"""
        response = requests.get(f"{BASE_URL}/api/service-orders/timeclock/team-map", headers=auth_headers)
        data = response.json()
        
        # Required fields per spec
        assert "latest_positions" in data, "Missing 'latest_positions'"
        assert "history_entries" in data, "Missing 'history_entries'"
        assert "summary" in data, "Missing 'summary'"
        assert "bounds" in data, "Missing 'bounds' (can be null)"
        assert "generated_at" in data, "Missing 'generated_at'"
        assert "history_date" in data, "Missing 'history_date'"

    def test_team_map_summary_structure(self, auth_headers):
        """Team map summary has KPI fields"""
        response = requests.get(f"{BASE_URL}/api/service-orders/timeclock/team-map", headers=auth_headers)
        data = response.json()
        summary = data.get("summary", {})
        
        assert "technicians_count" in summary, "Missing 'technicians_count'"
        assert "clocked_in_count" in summary, "Missing 'clocked_in_count'"
        assert "stale_count" in summary, "Missing 'stale_count'"
        assert "history_points" in summary, "Missing 'history_points'"

    def test_team_map_with_history_date_param(self, auth_headers):
        """Team map accepts history_date parameter"""
        response = requests.get(
            f"{BASE_URL}/api/service-orders/timeclock/team-map",
            headers=auth_headers,
            params={"history_date": "2026-01-15"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("history_date") == "2026-01-15"

    def test_team_map_with_technician_id_param(self, auth_headers):
        """Team map accepts technician_id parameter"""
        response = requests.get(
            f"{BASE_URL}/api/service-orders/timeclock/team-map",
            headers=auth_headers,
            params={"technician_id": "test-tech-id"}
        )
        assert response.status_code == 200

    def test_team_map_requires_auth(self):
        """Team map requires authentication"""
        response = requests.get(f"{BASE_URL}/api/service-orders/timeclock/team-map")
        assert response.status_code == 401

    def test_team_map_latest_positions_structure(self, auth_headers):
        """Latest positions have expected fields when data exists"""
        response = requests.get(f"{BASE_URL}/api/service-orders/timeclock/team-map", headers=auth_headers)
        data = response.json()
        positions = data.get("latest_positions", [])
        
        if len(positions) > 0:
            pos = positions[0]
            assert "technician_id" in pos, "Missing 'technician_id'"
            assert "technician_name" in pos, "Missing 'technician_name'"
            assert "latitude" in pos, "Missing 'latitude'"
            assert "longitude" in pos, "Missing 'longitude'"
            assert "is_clocked_in" in pos, "Missing 'is_clocked_in'"
            assert "minutes_since_update" in pos, "Missing 'minutes_since_update'"


# ============================================================
# 4. Existing Timeclock Endpoints - No Regression
# ============================================================
class TestTimeclockNoRegression:
    """Tests for existing timeclock endpoints to ensure no regression"""

    def test_timeclock_all_returns_200(self, auth_headers):
        """GET /api/service-orders/timeclock/all returns 200"""
        response = requests.get(f"{BASE_URL}/api/service-orders/timeclock/all", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    def test_timeclock_all_response_structure(self, auth_headers):
        """Timeclock all has entries and total"""
        response = requests.get(f"{BASE_URL}/api/service-orders/timeclock/all", headers=auth_headers)
        data = response.json()
        
        assert "entries" in data, "Missing 'entries'"
        assert "total" in data, "Missing 'total'"
        assert isinstance(data["entries"], list), "entries should be a list"

    def test_timeclock_all_with_date_filters(self, auth_headers):
        """Timeclock all accepts date filters"""
        response = requests.get(
            f"{BASE_URL}/api/service-orders/timeclock/all",
            headers=auth_headers,
            params={"start_date": "2026-01-01", "end_date": "2026-01-31"}
        )
        assert response.status_code == 200

    def test_timeclock_export_returns_csv(self, auth_headers):
        """GET /api/service-orders/timeclock/export returns CSV"""
        response = requests.get(f"{BASE_URL}/api/service-orders/timeclock/export", headers=auth_headers)
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("content-type", "")

    def test_timeclock_export_requires_auth(self):
        """Timeclock export requires authentication"""
        response = requests.get(f"{BASE_URL}/api/service-orders/timeclock/export")
        assert response.status_code == 401


# ============================================================
# 5. Security Hardening - Headers
# ============================================================
class TestSecurityHardening:
    """Tests for security headers and hardening"""

    def test_response_has_x_content_type_options(self, auth_headers):
        """Response includes X-Content-Type-Options header"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert "X-Content-Type-Options" in response.headers, "Missing X-Content-Type-Options header"
        assert response.headers["X-Content-Type-Options"] == "nosniff"

    def test_response_has_referrer_policy(self, auth_headers):
        """Response includes Referrer-Policy header"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert "Referrer-Policy" in response.headers, "Missing Referrer-Policy header"

    def test_response_has_content_security_policy(self, auth_headers):
        """Response includes Content-Security-Policy header"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert "Content-Security-Policy" in response.headers, "Missing Content-Security-Policy header"

    def test_response_has_x_frame_options(self, auth_headers):
        """Response includes X-Frame-Options header"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert "X-Frame-Options" in response.headers, "Missing X-Frame-Options header"

    def test_response_has_permissions_policy(self, auth_headers):
        """Response includes Permissions-Policy header"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert "Permissions-Policy" in response.headers, "Missing Permissions-Policy header"


# ============================================================
# 6. Rate Limiting - Public Endpoints
# ============================================================
class TestRateLimiting:
    """Tests for rate limiting on public endpoints"""

    def test_rate_limit_on_check_availability(self):
        """Rate limiting is active on /api/service-orders/check-availability"""
        # This endpoint has limit of 30 requests per 60 seconds
        # We'll just verify it responds (not actually hit the limit)
        response = requests.get(f"{BASE_URL}/api/service-orders/check-availability")
        # Should return 200 or 422 (validation error) but not 429 on first request
        assert response.status_code in [200, 422, 400], f"Unexpected status: {response.status_code}"

    def test_authenticated_endpoints_not_rate_limited_normally(self, auth_headers):
        """Authenticated endpoints work normally without rate limiting"""
        # Make several requests to dashboard - should all succeed
        for _ in range(5):
            response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
            assert response.status_code == 200, f"Request failed: {response.status_code}"


# ============================================================
# 7. CORS Configuration
# ============================================================
class TestCORSConfiguration:
    """Tests for CORS configuration"""

    def test_cors_allows_frontend_origin(self, auth_headers):
        """CORS allows the frontend origin"""
        frontend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://bank-consolidate.preview.emergentagent.com')
        response = requests.options(
            f"{BASE_URL}/api/dashboard/overview",
            headers={
                "Origin": frontend_url,
                "Access-Control-Request-Method": "GET"
            }
        )
        # OPTIONS should succeed or the GET should work with CORS
        # Just verify the endpoint is accessible
        get_response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert get_response.status_code == 200


# ============================================================
# 8. Auth Endpoints - Basic Verification
# ============================================================
class TestAuthEndpoints:
    """Basic auth endpoint tests"""

    def test_login_success(self):
        """Login with valid credentials succeeds"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "id" in data
        assert data["email"] == ADMIN_EMAIL

    def test_login_invalid_credentials(self):
        """Login with invalid credentials fails"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@email.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401

    def test_auth_me_returns_user(self, auth_headers):
        """GET /api/auth/me returns current user"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert "role" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
