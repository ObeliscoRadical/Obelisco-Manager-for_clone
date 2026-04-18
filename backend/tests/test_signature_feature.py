"""
Test suite for Digital Signature Feature
Tests: sign-link generation, public proposal access, signing flow, re-sign rejection
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSignatureFeature:
    """Digital Signature Feature Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and create test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@obelisco.pt",
            "password": "obelisco2024"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        # Create test budget
        budget_resp = self.session.post(f"{BASE_URL}/api/budgets", json={
            "title": f"TEST_Signature_{uuid.uuid4().hex[:8]}",
            "client_name": "Test Signature Client",
            "client_phone": "+351912345678",
            "items": [{"category": "test", "name": "Test Item", "unit": "un", "quantity": 1, "unit_cost": 100, "margin": 0.5}]
        })
        assert budget_resp.status_code == 200, f"Budget creation failed: {budget_resp.text}"
        self.budget_id = budget_resp.json()["id"]
        
        # Generate proposals
        proposals_resp = self.session.post(f"{BASE_URL}/api/budgets/{self.budget_id}/generate-proposals")
        assert proposals_resp.status_code == 200, f"Proposal generation failed: {proposals_resp.text}"
        proposals = proposals_resp.json()
        self.proposal_id = proposals[0]["id"]  # Use basico tier
        
        yield
        
        # Cleanup: delete test budget and proposals
        try:
            self.session.delete(f"{BASE_URL}/api/budgets/{self.budget_id}")
            for p in proposals:
                self.session.delete(f"{BASE_URL}/api/proposals/{p['id']}")
        except:
            pass
    
    def test_create_sign_link_requires_auth(self):
        """POST /api/proposals/{id}/sign-link requires authentication"""
        # Use a new session without cookies
        resp = requests.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    
    def test_create_sign_link_success(self):
        """POST /api/proposals/{id}/sign-link generates token"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        assert resp.status_code == 200, f"Sign link creation failed: {resp.text}"
        data = resp.json()
        assert "token" in data, "Response missing 'token'"
        assert "sign_status" in data, "Response missing 'sign_status'"
        assert len(data["token"]) == 32, f"Token should be 32 chars, got {len(data['token'])}"
        assert data["sign_status"] == "pending", f"Initial sign_status should be 'pending', got {data['sign_status']}"
    
    def test_create_sign_link_idempotent(self):
        """Calling sign-link twice returns same token (idempotent)"""
        resp1 = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        assert resp1.status_code == 200
        token1 = resp1.json()["token"]
        
        resp2 = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        assert resp2.status_code == 200
        token2 = resp2.json()["token"]
        
        assert token1 == token2, f"Tokens should match: {token1} != {token2}"
    
    def test_public_get_proposal_no_auth(self):
        """GET /api/public/proposal/{token} works without auth"""
        # Get token first
        sign_resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        token = sign_resp.json()["token"]
        
        # Access public endpoint without cookies
        public_resp = requests.get(f"{BASE_URL}/api/public/proposal/{token}")
        assert public_resp.status_code == 200, f"Public GET failed: {public_resp.text}"
        data = public_resp.json()
        assert "proposal" in data, "Response missing 'proposal'"
        assert "settings" in data, "Response missing 'settings'"
    
    def test_public_get_proposal_excludes_sign_token(self):
        """Public response must NOT include sign_token"""
        sign_resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        token = sign_resp.json()["token"]
        
        public_resp = requests.get(f"{BASE_URL}/api/public/proposal/{token}")
        assert public_resp.status_code == 200
        proposal = public_resp.json()["proposal"]
        assert "sign_token" not in proposal, "sign_token should NOT be in public response"
    
    def test_public_get_proposal_invalid_token(self):
        """GET /api/public/proposal/{invalid} returns 404"""
        resp = requests.get(f"{BASE_URL}/api/public/proposal/invalid-token-12345")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
    
    def test_sign_proposal_invalid_signature_data(self):
        """POST /api/public/proposal/{token}/sign rejects invalid signature_data"""
        sign_resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        token = sign_resp.json()["token"]
        
        resp = requests.post(f"{BASE_URL}/api/public/proposal/{token}/sign", json={
            "signature_data": "invalid-not-data-image",
            "signed_by_name": "Test User",
            "signed_by_email": "test@test.com"
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "inválida" in resp.json().get("detail", "").lower()
    
    def test_sign_proposal_short_name(self):
        """POST /api/public/proposal/{token}/sign rejects name < 3 chars"""
        sign_resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        token = sign_resp.json()["token"]
        
        resp = requests.post(f"{BASE_URL}/api/public/proposal/{token}/sign", json={
            "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "signed_by_name": "AB",
            "signed_by_email": "test@test.com"
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "nome" in resp.json().get("detail", "").lower()
    
    def test_sign_proposal_success(self):
        """POST /api/public/proposal/{token}/sign succeeds with valid data"""
        sign_resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        token = sign_resp.json()["token"]
        
        resp = requests.post(f"{BASE_URL}/api/public/proposal/{token}/sign", json={
            "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "signed_by_name": "Test Signer Full Name",
            "signed_by_email": "signer@example.com"
        })
        assert resp.status_code == 200, f"Sign failed: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True, "Response should have ok=True"
        assert "signed_at" in data, "Response should have signed_at"
    
    def test_sign_proposal_re_sign_rejected(self):
        """POST /api/public/proposal/{token}/sign rejects if already signed"""
        sign_resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        token = sign_resp.json()["token"]
        
        # First sign
        resp1 = requests.post(f"{BASE_URL}/api/public/proposal/{token}/sign", json={
            "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "signed_by_name": "First Signer",
            "signed_by_email": "first@example.com"
        })
        assert resp1.status_code == 200
        
        # Try to re-sign
        resp2 = requests.post(f"{BASE_URL}/api/public/proposal/{token}/sign", json={
            "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "signed_by_name": "Second Signer",
            "signed_by_email": "second@example.com"
        })
        assert resp2.status_code == 400, f"Expected 400, got {resp2.status_code}"
        assert "assinada" in resp2.json().get("detail", "").lower()
    
    def test_signed_proposal_data_persisted(self):
        """After signing, proposal has all signature fields"""
        sign_resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/sign-link")
        token = sign_resp.json()["token"]
        
        # Sign
        requests.post(f"{BASE_URL}/api/public/proposal/{token}/sign", json={
            "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "signed_by_name": "Persistence Test",
            "signed_by_email": "persist@example.com"
        })
        
        # Verify via auth endpoint
        proposal_resp = self.session.get(f"{BASE_URL}/api/proposals/{self.proposal_id}")
        assert proposal_resp.status_code == 200
        p = proposal_resp.json()
        
        assert p.get("sign_status") == "signed", f"sign_status should be 'signed', got {p.get('sign_status')}"
        assert p.get("status") == "aceite", f"status should be 'aceite', got {p.get('status')}"
        assert p.get("signed_by_name") == "Persistence Test"
        assert p.get("signed_by_email") == "persist@example.com"
        assert p.get("signed_by_ip"), "signed_by_ip should be set"
        assert p.get("signed_at"), "signed_at should be set"
        assert p.get("signature_data"), "signature_data should be set"


class TestRegressionExistingEndpoints:
    """Regression tests - ensure existing endpoints still work"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@obelisco.pt",
            "password": "obelisco2024"
        })
        assert login_resp.status_code == 200
        yield
    
    def test_proposals_list(self):
        """GET /api/proposals still works"""
        resp = self.session.get(f"{BASE_URL}/api/proposals")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_budgets_list(self):
        """GET /api/budgets still works"""
        resp = self.session.get(f"{BASE_URL}/api/budgets")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_works_list(self):
        """GET /api/works still works"""
        resp = self.session.get(f"{BASE_URL}/api/works")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_payroll_summary(self):
        """GET /api/payroll/summary still works"""
        resp = self.session.get(f"{BASE_URL}/api/payroll/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "active_employees" in data
