"""
Test Treasury Insights API and System Settings for Tesouraria module.
Tests: GET /api/bank-analysis/treasury/insights, GET/PUT /api/system-settings
"""
import pytest
import requests
from auth_test_helpers import get_admin_credentials, get_base_url

BASE_URL = get_base_url()
ADMIN_EMAIL, ADMIN_PASSWORD = get_admin_credentials()

@pytest.fixture(scope="session")
def auth_token():
    """Get admin auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("access_token")
    assert token, f"No access_token in response: {resp.json()}"
    return token

@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestTreasuryInsightsAPI:
    """Tests for GET /api/bank-analysis/treasury/insights"""

    def test_treasury_insights_returns_200(self, auth_headers):
        """Treasury insights endpoint returns 200 with valid JSON"""
        resp = requests.get(f"{BASE_URL}/api/bank-analysis/treasury/insights", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, dict)

    def test_treasury_insights_has_required_fields(self, auth_headers):
        """Treasury insights response contains all required fields"""
        resp = requests.get(f"{BASE_URL}/api/bank-analysis/treasury/insights", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Check opening_balance structure
        assert "opening_balance" in data, "Missing opening_balance"
        ob = data["opening_balance"]
        assert "automatic" in ob, "Missing opening_balance.automatic"
        assert "effective" in ob, "Missing opening_balance.effective"
        assert "override_applied" in ob, "Missing opening_balance.override_applied"
        
        # Check projection structure
        assert "projection" in data, "Missing projection"
        proj = data["projection"]
        assert "summary_30d" in proj, "Missing projection.summary_30d"
        assert "summary_60d" in proj, "Missing projection.summary_60d"
        assert "daily" in proj, "Missing projection.daily"
        
        # Check anomalies structure
        assert "anomalies" in data, "Missing anomalies"
        anom = data["anomalies"]
        assert "count" in anom, "Missing anomalies.count"
        assert "threshold_pct" in anom, "Missing anomalies.threshold_pct"
        assert "items" in anom, "Missing anomalies.items"
        
        # Check pressure_map structure
        assert "pressure_map" in data, "Missing pressure_map"
        pm = data["pressure_map"]
        assert "top_days" in pm, "Missing pressure_map.top_days"
        assert "critical_dates" in pm, "Missing pressure_map.critical_dates"
        assert "critical_windows" in pm, "Missing pressure_map.critical_windows"

    def test_treasury_insights_opening_balance_override(self, auth_headers):
        """Treasury insights accepts opening_balance query param override"""
        override_value = 12345.67
        resp = requests.get(
            f"{BASE_URL}/api/bank-analysis/treasury/insights",
            headers=auth_headers,
            params={"opening_balance": override_value}
        )
        assert resp.status_code == 200
        data = resp.json()
        
        # Check override was applied
        assert data["opening_balance"]["override_applied"] is True
        assert data["opening_balance"]["effective"] == override_value

    def test_treasury_insights_summary_30d_structure(self, auth_headers):
        """Treasury insights summary_30d has correct structure"""
        resp = requests.get(f"{BASE_URL}/api/bank-analysis/treasury/insights", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        summary = data["projection"]["summary_30d"]
        required_fields = ["days", "ending_balance", "lowest_balance", "days_negative", "total_outflows", "coverage_status"]
        for field in required_fields:
            assert field in summary, f"Missing summary_30d.{field}"

    def test_treasury_insights_requires_auth(self):
        """Treasury insights requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/bank-analysis/treasury/insights")
        assert resp.status_code == 401, f"Expected 401 without auth, got {resp.status_code}"


class TestSystemSettingsAPI:
    """Tests for GET/PUT /api/system-settings with treasury_settings"""

    def test_get_system_settings_returns_200(self, auth_headers):
        """GET /api/system-settings returns 200"""
        resp = requests.get(f"{BASE_URL}/api/system-settings", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, dict)

    def test_system_settings_has_treasury_settings(self, auth_headers):
        """System settings includes treasury_settings with anomaly_threshold_pct"""
        resp = requests.get(f"{BASE_URL}/api/system-settings", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # treasury_settings may or may not exist initially, but if it does, check structure
        if "treasury_settings" in data:
            ts = data["treasury_settings"]
            assert "anomaly_threshold_pct" in ts, "Missing treasury_settings.anomaly_threshold_pct"
            assert isinstance(ts["anomaly_threshold_pct"], (int, float))

    def test_update_treasury_settings_anomaly_threshold(self, auth_headers):
        """PUT /api/system-settings can update treasury_settings.anomaly_threshold_pct"""
        # First get current settings
        get_resp = requests.get(f"{BASE_URL}/api/system-settings", headers=auth_headers)
        assert get_resp.status_code == 200
        current = get_resp.json()
        
        # Store original value for restoration
        original_threshold = current.get("treasury_settings", {}).get("anomaly_threshold_pct", 18)
        
        # Update with new value
        test_threshold = 25
        update_payload = {
            **current,
            "treasury_settings": {
                "anomaly_threshold_pct": test_threshold
            }
        }
        
        put_resp = requests.put(f"{BASE_URL}/api/system-settings", headers=auth_headers, json=update_payload)
        assert put_resp.status_code == 200, f"PUT failed: {put_resp.text}"
        updated = put_resp.json()
        
        # Verify update
        assert updated.get("treasury_settings", {}).get("anomaly_threshold_pct") == test_threshold
        
        # Verify treasury insights uses the new threshold
        insights_resp = requests.get(f"{BASE_URL}/api/bank-analysis/treasury/insights", headers=auth_headers)
        assert insights_resp.status_code == 200
        insights = insights_resp.json()
        assert insights["anomalies"]["threshold_pct"] == test_threshold
        
        # Restore original value
        restore_payload = {
            **current,
            "treasury_settings": {
                "anomaly_threshold_pct": original_threshold
            }
        }
        restore_resp = requests.put(f"{BASE_URL}/api/system-settings", headers=auth_headers, json=restore_payload)
        assert restore_resp.status_code == 200

    def test_system_settings_requires_auth(self):
        """System settings requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/system-settings")
        assert resp.status_code == 401, f"Expected 401 without auth, got {resp.status_code}"


class TestTreasuryInsightsIntegration:
    """Integration tests for treasury insights with settings"""

    def test_treasury_insights_respects_configured_threshold(self, auth_headers):
        """Treasury insights anomaly detection uses configured threshold from settings"""
        # Get current settings
        settings_resp = requests.get(f"{BASE_URL}/api/system-settings", headers=auth_headers)
        assert settings_resp.status_code == 200
        settings = settings_resp.json()
        
        configured_threshold = settings.get("treasury_settings", {}).get("anomaly_threshold_pct", 18)
        
        # Get treasury insights
        insights_resp = requests.get(f"{BASE_URL}/api/bank-analysis/treasury/insights", headers=auth_headers)
        assert insights_resp.status_code == 200
        insights = insights_resp.json()
        
        # Verify threshold matches
        assert insights["settings"]["anomaly_threshold_pct"] == configured_threshold
        assert insights["anomalies"]["threshold_pct"] == configured_threshold

    def test_treasury_summary_badges_structure(self, auth_headers):
        """Treasury insights includes summary_badges for dashboard display"""
        resp = requests.get(f"{BASE_URL}/api/bank-analysis/treasury/insights", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "summary_badges" in data, "Missing summary_badges"
        badges = data["summary_badges"]
        assert "status" in badges, "Missing summary_badges.status"
        assert badges["status"] in ["ok", "attention", "critical"], f"Invalid status: {badges['status']}"
        assert "anomaly_count" in badges, "Missing summary_badges.anomaly_count"
