"""
Obelisco Manager API Tests
Tests for: Auth, Budgets, Proposals, Works, Appointments, Dashboard
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["email"] == os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
        assert data["name"] == "Admin"
        assert data["role"] == "admin"
        # Check cookies are set
        assert "access_token" in response.cookies or response.headers.get('set-cookie')
    
    def test_login_invalid_credentials(self):
        """Test login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
    
    def test_login_invalid_email(self):
        """Test login with non-existent email"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "anypassword"
        })
        assert response.status_code == 401
    
    def test_auth_me_without_token(self):
        """Test /auth/me without authentication"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
    
    def test_logout(self):
        """Test logout endpoint"""
        session = requests.Session()
        # Login first
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
        })
        assert login_resp.status_code == 200
        
        # Logout
        logout_resp = session.post(f"{BASE_URL}/api/auth/logout")
        assert logout_resp.status_code == 200
        data = logout_resp.json()
        assert "message" in data


@pytest.fixture
def auth_session():
    """Create authenticated session"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
    })
    if response.status_code != 200:
        pytest.skip("Authentication failed")
    return session


class TestBudgets:
    """Budget CRUD tests"""
    
    def test_get_budgets_unauthorized(self):
        """Test getting budgets without auth"""
        response = requests.get(f"{BASE_URL}/api/budgets")
        assert response.status_code == 401
    
    def test_create_budget(self, auth_session):
        """Test creating a new budget"""
        payload = {
            "title": f"TEST_Budget_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Cliente Teste",
            "client_phone": "911123456",
            "items": [
                {"category": "Material", "name": "Cabo eletrico", "quantity": 10, "unit_cost": 5.0, "margin": 0.6},
                {"category": "Mao de obra", "name": "Instalacao", "quantity": 2, "unit_cost": 50.0, "margin": 0.5}
            ]
        }
        response = auth_session.post(f"{BASE_URL}/api/budgets", json=payload)
        assert response.status_code == 200, f"Create budget failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert data["title"] == payload["title"]
        assert data["client_name"] == payload["client_name"]
        assert data["status"] == "rascunho"
        assert len(data["items"]) == 2
        
        # Verify totals calculation
        # total_cost = 10*5 + 2*50 = 150
        # total_price = 10*5*1.6 + 2*50*1.5 = 80 + 150 = 230
        assert data["total_cost"] == 150.0
        assert data["total_price"] == 230.0
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")
    
    def test_get_budgets(self, auth_session):
        """Test getting all budgets"""
        response = auth_session.get(f"{BASE_URL}/api/budgets")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_budget_crud_flow(self, auth_session):
        """Test full CRUD flow for budgets"""
        # CREATE
        create_payload = {
            "title": f"TEST_CRUD_Budget_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_CRUD_Cliente",
            "client_phone": "912345678",
            "items": [{"category": "Test", "name": "Item1", "quantity": 1, "unit_cost": 100, "margin": 0.5}]
        }
        create_resp = auth_session.post(f"{BASE_URL}/api/budgets", json=create_payload)
        assert create_resp.status_code == 200
        budget = create_resp.json()
        budget_id = budget["id"]
        
        # READ
        get_resp = auth_session.get(f"{BASE_URL}/api/budgets/{budget_id}")
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["title"] == create_payload["title"]
        
        # UPDATE
        update_payload = {"title": "TEST_Updated_Title", "status": "aprovado"}
        update_resp = auth_session.put(f"{BASE_URL}/api/budgets/{budget_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["title"] == "TEST_Updated_Title"
        assert updated["status"] == "aprovado"
        
        # DELETE
        delete_resp = auth_session.delete(f"{BASE_URL}/api/budgets/{budget_id}")
        assert delete_resp.status_code == 200
        
        # Verify deletion
        verify_resp = auth_session.get(f"{BASE_URL}/api/budgets/{budget_id}")
        assert verify_resp.status_code == 404


class TestProposals:
    """Proposal generation and management tests"""
    
    def test_generate_proposals_from_budget(self, auth_session):
        """Test generating 3 proposals from a budget"""
        # First create a budget
        budget_payload = {
            "title": f"TEST_Proposal_Budget_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Proposal_Cliente",
            "client_phone": "913456789",
            "items": [{"category": "Servico", "name": "Instalacao", "quantity": 1, "unit_cost": 1000, "margin": 0.6}]
        }
        budget_resp = auth_session.post(f"{BASE_URL}/api/budgets", json=budget_payload)
        assert budget_resp.status_code == 200
        budget = budget_resp.json()
        budget_id = budget["id"]
        
        # Generate proposals
        gen_resp = auth_session.post(f"{BASE_URL}/api/budgets/{budget_id}/generate-proposals")
        assert gen_resp.status_code == 200
        proposals = gen_resp.json()
        
        # Verify 3 proposals created
        assert len(proposals) == 3
        
        # Verify tiers
        tiers = [p["tier"] for p in proposals]
        assert "basico" in tiers
        assert "profissional" in tiers
        assert "premium" in tiers
        
        # Verify multipliers
        base_value = budget["total_price"]  # 1000 * 1.6 = 1600
        for p in proposals:
            if p["tier"] == "basico":
                assert p["multiplier"] == 1.0
                assert p["final_value"] == round(base_value * 1.0, 2)
            elif p["tier"] == "profissional":
                assert p["multiplier"] == 1.15
                assert p["final_value"] == round(base_value * 1.15, 2)
            elif p["tier"] == "premium":
                assert p["multiplier"] == 1.30
                assert p["final_value"] == round(base_value * 1.30, 2)
        
        # Cleanup
        for p in proposals:
            auth_session.delete(f"{BASE_URL}/api/proposals/{p['id']}")
        auth_session.delete(f"{BASE_URL}/api/budgets/{budget_id}")
    
    def test_get_proposals(self, auth_session):
        """Test getting all proposals"""
        response = auth_session.get(f"{BASE_URL}/api/proposals")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_update_proposal_status(self, auth_session):
        """Test updating proposal status"""
        # Create budget and proposals
        budget_payload = {
            "title": f"TEST_Status_Budget_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Status_Cliente",
            "items": [{"category": "Test", "name": "Item", "quantity": 1, "unit_cost": 500, "margin": 0.5}]
        }
        budget_resp = auth_session.post(f"{BASE_URL}/api/budgets", json=budget_payload)
        budget = budget_resp.json()
        
        gen_resp = auth_session.post(f"{BASE_URL}/api/budgets/{budget['id']}/generate-proposals")
        proposals = gen_resp.json()
        proposal_id = proposals[0]["id"]
        
        # Update status
        status_resp = auth_session.put(f"{BASE_URL}/api/proposals/{proposal_id}/status", json={"status": "aceite"})
        assert status_resp.status_code == 200
        updated = status_resp.json()
        assert updated["status"] == "aceite"
        
        # Cleanup
        for p in proposals:
            auth_session.delete(f"{BASE_URL}/api/proposals/{p['id']}")
        auth_session.delete(f"{BASE_URL}/api/budgets/{budget['id']}")


class TestWorks:
    """Works/Obras management tests"""
    
    def test_create_work(self, auth_session):
        """Test creating a new work"""
        payload = {
            "title": f"TEST_Work_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Work_Cliente",
            "client_phone": "914567890",
            "status": "orcamento",
            "predicted_cost": 5000.0,
            "real_cost": 0,
            "notes": "Test work notes"
        }
        response = auth_session.post(f"{BASE_URL}/api/works", json=payload)
        assert response.status_code == 200, f"Create work failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["title"] == payload["title"]
        assert data["status"] == "orcamento"
        assert data["predicted_cost"] == 5000.0
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/works/{data['id']}")
    
    def test_work_crud_flow(self, auth_session):
        """Test full CRUD flow for works"""
        # CREATE
        create_payload = {
            "title": f"TEST_CRUD_Work_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_CRUD_Work_Cliente",
            "status": "orcamento",
            "predicted_cost": 3000.0,
            "real_cost": 0
        }
        create_resp = auth_session.post(f"{BASE_URL}/api/works", json=create_payload)
        assert create_resp.status_code == 200
        work = create_resp.json()
        work_id = work["id"]
        
        # READ
        get_resp = auth_session.get(f"{BASE_URL}/api/works/{work_id}")
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["title"] == create_payload["title"]
        
        # UPDATE - change status and add real cost
        update_payload = {"status": "em_execucao", "real_cost": 1500.0}
        update_resp = auth_session.put(f"{BASE_URL}/api/works/{work_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["status"] == "em_execucao"
        assert updated["real_cost"] == 1500.0
        
        # DELETE
        delete_resp = auth_session.delete(f"{BASE_URL}/api/works/{work_id}")
        assert delete_resp.status_code == 200
        
        # Verify deletion
        verify_resp = auth_session.get(f"{BASE_URL}/api/works/{work_id}")
        assert verify_resp.status_code == 404
    
    def test_create_work_from_proposal(self, auth_session):
        """Test creating a work from a proposal"""
        # Create budget and proposals
        budget_payload = {
            "title": f"TEST_WorkFromProposal_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_WorkFromProposal_Cliente",
            "items": [{"category": "Test", "name": "Item", "quantity": 1, "unit_cost": 2000, "margin": 0.5}]
        }
        budget_resp = auth_session.post(f"{BASE_URL}/api/budgets", json=budget_payload)
        budget = budget_resp.json()
        
        gen_resp = auth_session.post(f"{BASE_URL}/api/budgets/{budget['id']}/generate-proposals")
        proposals = gen_resp.json()
        proposal = proposals[0]  # Use basico tier
        
        # Create work from proposal
        work_resp = auth_session.post(f"{BASE_URL}/api/works/from-proposal/{proposal['id']}")
        assert work_resp.status_code == 200
        work = work_resp.json()
        
        assert work["proposal_id"] == proposal["id"]
        assert work["predicted_cost"] == proposal["final_value"]
        assert work["client_name"] == proposal["client_name"]
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/works/{work['id']}")
        for p in proposals:
            auth_session.delete(f"{BASE_URL}/api/proposals/{p['id']}")
        auth_session.delete(f"{BASE_URL}/api/budgets/{budget['id']}")


class TestAppointments:
    """Appointment/Agenda tests"""
    
    def test_create_appointment(self, auth_session):
        """Test creating a new appointment"""
        payload = {
            "title": f"TEST_Appointment_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Appointment_Cliente",
            "date": "2026-05-15",
            "time_start": "10:00",
            "time_end": "11:00",
            "notes": "Test appointment"
        }
        response = auth_session.post(f"{BASE_URL}/api/appointments", json=payload)
        assert response.status_code == 200, f"Create appointment failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["title"] == payload["title"]
        assert data["date"] == "2026-05-15"
        assert data["time_start"] == "10:00"
        assert data["time_end"] == "11:00"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/appointments/{data['id']}")
    
    def test_duplicate_appointment_prevention(self, auth_session):
        """Test that overlapping appointments are rejected"""
        # Create first appointment
        payload1 = {
            "title": "TEST_First_Appointment",
            "date": "2026-06-20",
            "time_start": "14:00",
            "time_end": "15:00"
        }
        resp1 = auth_session.post(f"{BASE_URL}/api/appointments", json=payload1)
        assert resp1.status_code == 200
        appt1 = resp1.json()
        
        # Try to create overlapping appointment
        payload2 = {
            "title": "TEST_Overlapping_Appointment",
            "date": "2026-06-20",
            "time_start": "14:30",
            "time_end": "15:30"
        }
        resp2 = auth_session.post(f"{BASE_URL}/api/appointments", json=payload2)
        assert resp2.status_code == 400, "Should reject overlapping appointment"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/appointments/{appt1['id']}")
    
    def test_get_appointments(self, auth_session):
        """Test getting all appointments"""
        response = auth_session.get(f"{BASE_URL}/api/appointments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_appointment_crud_flow(self, auth_session):
        """Test full CRUD flow for appointments"""
        # CREATE
        create_payload = {
            "title": f"TEST_CRUD_Appointment_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_CRUD_Cliente",
            "date": "2026-07-10",
            "time_start": "09:00",
            "time_end": "10:00"
        }
        create_resp = auth_session.post(f"{BASE_URL}/api/appointments", json=create_payload)
        assert create_resp.status_code == 200
        appt = create_resp.json()
        appt_id = appt["id"]
        
        # UPDATE
        update_payload = {
            "title": "TEST_Updated_Appointment",
            "client_name": "TEST_Updated_Cliente",
            "date": "2026-07-10",
            "time_start": "11:00",
            "time_end": "12:00"
        }
        update_resp = auth_session.put(f"{BASE_URL}/api/appointments/{appt_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["title"] == "TEST_Updated_Appointment"
        assert updated["time_start"] == "11:00"
        
        # DELETE
        delete_resp = auth_session.delete(f"{BASE_URL}/api/appointments/{appt_id}")
        assert delete_resp.status_code == 200


class TestDashboard:
    """Dashboard stats tests"""
    
    def test_get_dashboard_stats(self, auth_session):
        """Test getting dashboard statistics"""
        response = auth_session.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields
        assert "total_obras" in data
        assert "obras_em_andamento" in data
        assert "obras_finalizadas" in data
        assert "lucro_estimado" in data
        assert "total_orcamentos" in data
        assert "total_propostas" in data
        assert "appointments_today" in data
        assert "total_predicted" in data
        assert "total_real" in data
        assert "recent_works" in data
        assert "recent_budgets" in data
        
        # Verify types
        assert isinstance(data["total_obras"], int)
        assert isinstance(data["recent_works"], list)
        assert isinstance(data["recent_budgets"], list)
    
    def test_dashboard_stats_unauthorized(self):
        """Test dashboard stats without auth"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
