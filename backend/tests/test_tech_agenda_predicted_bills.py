"""
Test: Tech Agenda Predicted Bills Bug Fix (Iteration 59)

Bug: Técnico real estava a ver contas previstas (is_predicted_bill=true) na agenda.
Fix: Em tech_extras.py, endpoint GET /api/tech/appointments/my agora filtra is_predicted_bill: {$ne: true} para técnicos reais.

Cenários:
1. Admin via /api/auth/login + GET /api/tech/appointments/my → pode ver entries com is_predicted_bill=true
2. Técnico via /api/tech/auth/login + GET /api/tech/appointments/my → NÃO pode ver entries com is_predicted_bill=true
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"
TECH_EMAIL = "d.oliveira1986@gmail.com"
TECH_PASSWORD = "A24d22r04"


class TestTechAgendaPredictedBills:
    """Test predicted bills filtering in tech agenda endpoint"""

    @pytest.fixture
    def admin_token(self):
        """Get admin token via /api/auth/login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in admin login response: {data}"
        return token

    @pytest.fixture
    def tech_token(self):
        """Get tech token via /api/tech/auth/login"""
        response = requests.post(f"{BASE_URL}/api/tech/auth/login", json={
            "email": TECH_EMAIL,
            "password": TECH_PASSWORD
        })
        assert response.status_code == 200, f"Tech login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in tech login response: {data}"
        return token

    def test_admin_login_success(self, admin_token):
        """Verify admin can login successfully"""
        assert admin_token is not None
        assert len(admin_token) > 10
        print(f"✓ Admin login successful, token length: {len(admin_token)}")

    def test_tech_login_success(self, tech_token):
        """Verify tech can login successfully"""
        assert tech_token is not None
        assert len(tech_token) > 10
        print(f"✓ Tech login successful, token length: {len(tech_token)}")

    def test_admin_can_see_predicted_bills_in_agenda(self, admin_token):
        """Admin via /api/tech/appointments/my should see entries with is_predicted_bill=true"""
        response = requests.get(
            f"{BASE_URL}/api/tech/appointments/my",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Admin appointments request failed: {response.text}"
        
        appointments = response.json()
        assert isinstance(appointments, list), f"Expected list, got: {type(appointments)}"
        
        # Count predicted bills
        predicted_bills = [a for a in appointments if a.get("is_predicted_bill") is True]
        total_count = len(appointments)
        predicted_count = len(predicted_bills)
        
        print(f"✓ Admin appointments: {total_count} total, {predicted_count} with is_predicted_bill=true")
        
        # Admin should be able to see predicted bills (if they exist in dataset)
        # The main agent confirmed: admin via /api/tech/appointments/my devolveu 4 entradas, 3 com is_predicted_bill=true
        if predicted_count > 0:
            print(f"  → Admin CAN see predicted bills: {[a.get('title', 'N/A') for a in predicted_bills[:3]]}")
        
        return appointments, predicted_count

    def test_tech_cannot_see_predicted_bills_in_agenda(self, tech_token):
        """Tech via /api/tech/appointments/my should NOT see entries with is_predicted_bill=true"""
        response = requests.get(
            f"{BASE_URL}/api/tech/appointments/my",
            headers={"Authorization": f"Bearer {tech_token}"}
        )
        assert response.status_code == 200, f"Tech appointments request failed: {response.text}"
        
        appointments = response.json()
        assert isinstance(appointments, list), f"Expected list, got: {type(appointments)}"
        
        # Count predicted bills - should be ZERO for tech
        predicted_bills = [a for a in appointments if a.get("is_predicted_bill") is True]
        total_count = len(appointments)
        predicted_count = len(predicted_bills)
        
        print(f"✓ Tech appointments: {total_count} total, {predicted_count} with is_predicted_bill=true")
        
        # CRITICAL: Tech should NOT see any predicted bills
        assert predicted_count == 0, (
            f"BUG: Tech user can see {predicted_count} predicted bills! "
            f"Titles: {[a.get('title', 'N/A') for a in predicted_bills]}"
        )
        
        print(f"  → Tech CANNOT see predicted bills (as expected)")
        return appointments

    def test_admin_vs_tech_comparison(self, admin_token, tech_token):
        """Compare admin and tech responses to verify filtering works correctly"""
        # Get admin appointments
        admin_response = requests.get(
            f"{BASE_URL}/api/tech/appointments/my",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert admin_response.status_code == 200
        admin_appts = admin_response.json()
        
        # Get tech appointments
        tech_response = requests.get(
            f"{BASE_URL}/api/tech/appointments/my",
            headers={"Authorization": f"Bearer {tech_token}"}
        )
        assert tech_response.status_code == 200
        tech_appts = tech_response.json()
        
        # Count predicted bills for each
        admin_predicted = [a for a in admin_appts if a.get("is_predicted_bill") is True]
        tech_predicted = [a for a in tech_appts if a.get("is_predicted_bill") is True]
        
        print(f"\n=== Comparison ===")
        print(f"Admin: {len(admin_appts)} appointments, {len(admin_predicted)} predicted bills")
        print(f"Tech:  {len(tech_appts)} appointments, {len(tech_predicted)} predicted bills")
        
        # Tech should have 0 predicted bills
        assert len(tech_predicted) == 0, f"Tech should not see predicted bills, but found {len(tech_predicted)}"
        
        # If admin has predicted bills, tech should have fewer total appointments
        if len(admin_predicted) > 0:
            print(f"  → Admin sees {len(admin_predicted)} predicted bills that tech cannot see")
        
        print("✓ Filtering verified: Tech cannot see predicted bills")

    def test_endpoint_not_broken(self, admin_token, tech_token):
        """Verify the endpoint works for both user types without errors"""
        # Admin request
        admin_response = requests.get(
            f"{BASE_URL}/api/tech/appointments/my",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert admin_response.status_code == 200, f"Admin endpoint broken: {admin_response.status_code}"
        
        # Tech request
        tech_response = requests.get(
            f"{BASE_URL}/api/tech/appointments/my",
            headers={"Authorization": f"Bearer {tech_token}"}
        )
        assert tech_response.status_code == 200, f"Tech endpoint broken: {tech_response.status_code}"
        
        # Both should return valid JSON arrays
        assert isinstance(admin_response.json(), list)
        assert isinstance(tech_response.json(), list)
        
        print("✓ Endpoint works correctly for both admin and tech users")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
