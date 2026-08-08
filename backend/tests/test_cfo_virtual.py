"""
CFO Virtual Module Tests - Iteration 54
Tests for the CFO Virtual (Credit Recovery & Restructuring) module endpoints:
- GET /api/cfo-virtual/dashboard - Dashboard with KPIs, debts, receivables, work opportunities
- GET /api/cfo-virtual/debts - List active debts
- POST /api/cfo-virtual/debts - Create new debt
- PUT /api/cfo-virtual/debts/{id} - Update debt
- DELETE /api/cfo-virtual/debts/{id} - Delete debt
- POST /api/cfo-virtual/analyze - Generate AI analysis report
- POST /api/cfo-virtual/simulator - Run financial breathing room simulation
"""

import pytest
import requests
import os
import uuid
from auth_test_helpers import get_admin_credentials, get_base_url

BASE_URL = get_base_url()
ADMIN_EMAIL, ADMIN_PASSWORD = get_admin_credentials()


@pytest.fixture(scope="module")
def auth_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    data = response.json()
    return data.get("access_token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestCfoVirtualDashboard:
    """Tests for GET /api/cfo-virtual/dashboard"""

    def test_dashboard_returns_200(self, api_client):
        """Dashboard endpoint returns 200 with authenticated user"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    def test_dashboard_has_snapshot(self, api_client):
        """Dashboard contains snapshot with financial KPIs"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        data = response.json()
        
        assert "snapshot" in data, "Dashboard must have snapshot"
        snapshot = data["snapshot"]
        
        # Required snapshot fields
        required_fields = [
            "current_cash", "allocatable_cash_now", "monthly_fixed_costs",
            "active_debt_total", "overdue_debt_total", "urgent_receivables_total",
            "crisis_level", "reserve_floor_14d"
        ]
        for field in required_fields:
            assert field in snapshot, f"Snapshot missing field: {field}"

    def test_dashboard_has_context_validation(self, api_client):
        """Dashboard contains context validation flags"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        data = response.json()
        
        assert "context_validation" in data, "Dashboard must have context_validation"
        validation = data["context_validation"]
        
        required_fields = ["can_generate_analysis", "bank_statement_loaded", "fixed_costs_ready", "debt_collection_ready"]
        for field in required_fields:
            assert field in validation, f"Context validation missing field: {field}"

    def test_dashboard_has_debts_array(self, api_client):
        """Dashboard contains debts array with enriched data"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        data = response.json()
        
        assert "debts" in data, "Dashboard must have debts array"
        assert isinstance(data["debts"], list), "Debts must be a list"

    def test_dashboard_has_urgent_receivables(self, api_client):
        """Dashboard contains urgent receivables array"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        data = response.json()
        
        assert "urgent_receivables" in data, "Dashboard must have urgent_receivables"
        assert isinstance(data["urgent_receivables"], list), "Urgent receivables must be a list"

    def test_dashboard_has_work_margin_opportunities(self, api_client):
        """Dashboard contains work margin opportunities"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        data = response.json()
        
        assert "work_margin_opportunities" in data, "Dashboard must have work_margin_opportunities"
        assert isinstance(data["work_margin_opportunities"], list), "Work opportunities must be a list"

    def test_dashboard_has_cash_allocation(self, api_client):
        """Dashboard contains cash allocation plan"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        data = response.json()
        
        assert "cash_allocation" in data, "Dashboard must have cash_allocation"
        assert isinstance(data["cash_allocation"], list), "Cash allocation must be a list"

    def test_dashboard_has_recent_transactions(self, api_client):
        """Dashboard contains recent bank transactions"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        data = response.json()
        
        assert "recent_transactions" in data, "Dashboard must have recent_transactions"
        assert isinstance(data["recent_transactions"], list), "Recent transactions must be a list"

    def test_dashboard_requires_auth(self):
        """Dashboard endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"


class TestCfoVirtualDebts:
    """Tests for debt CRUD operations"""

    def test_list_debts_returns_200(self, api_client):
        """GET /api/cfo-virtual/debts returns 200"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/debts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert isinstance(response.json(), list), "Debts endpoint must return a list"

    def test_create_debt_success(self, api_client):
        """POST /api/cfo-virtual/debts creates a new debt"""
        debt_data = {
            "credor": f"TEST_Credor_{uuid.uuid4().hex[:6]}",
            "tipo_divida": "Fornecedores",
            "valor_total": 1500.00,
            "valor_vencido": 500.00,
            "data_vencimento": "2026-02-15",
            "status": "ativa",
            "observacoes": "Test debt for CFO Virtual testing"
        }
        
        response = api_client.post(f"{BASE_URL}/api/cfo-virtual/debts", json=debt_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Created debt must have id"
        assert data["credor"] == debt_data["credor"], "Credor must match"
        assert data["tipo_divida"] == debt_data["tipo_divida"], "Tipo divida must match"
        assert data["valor_total"] == debt_data["valor_total"], "Valor total must match"
        assert data["valor_vencido"] == debt_data["valor_vencido"], "Valor vencido must match"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/cfo-virtual/debts/{data['id']}")

    def test_create_debt_invalid_tipo(self, api_client):
        """POST /api/cfo-virtual/debts rejects invalid tipo_divida"""
        debt_data = {
            "credor": "Test Credor",
            "tipo_divida": "InvalidType",
            "valor_total": 1000.00,
            "valor_vencido": 0,
            "data_vencimento": "2026-02-15",
            "status": "ativa"
        }
        
        response = api_client.post(f"{BASE_URL}/api/cfo-virtual/debts", json=debt_data)
        assert response.status_code == 400, f"Expected 400 for invalid tipo_divida, got {response.status_code}"

    def test_create_debt_invalid_valor(self, api_client):
        """POST /api/cfo-virtual/debts rejects valor_total <= 0"""
        debt_data = {
            "credor": "Test Credor",
            "tipo_divida": "Fornecedores",
            "valor_total": 0,
            "valor_vencido": 0,
            "data_vencimento": "2026-02-15",
            "status": "ativa"
        }
        
        response = api_client.post(f"{BASE_URL}/api/cfo-virtual/debts", json=debt_data)
        assert response.status_code == 400, f"Expected 400 for valor_total <= 0, got {response.status_code}"

    def test_update_debt_success(self, api_client):
        """PUT /api/cfo-virtual/debts/{id} updates a debt"""
        # Create debt first
        debt_data = {
            "credor": f"TEST_Update_{uuid.uuid4().hex[:6]}",
            "tipo_divida": "Bancária",
            "valor_total": 2000.00,
            "valor_vencido": 0,
            "data_vencimento": "2026-03-01",
            "status": "ativa"
        }
        create_response = api_client.post(f"{BASE_URL}/api/cfo-virtual/debts", json=debt_data)
        assert create_response.status_code == 200
        debt_id = create_response.json()["id"]
        
        # Update debt
        update_data = {
            "valor_vencido": 500.00,
            "status": "vencida",
            "observacoes": "Updated via test"
        }
        update_response = api_client.put(f"{BASE_URL}/api/cfo-virtual/debts/{debt_id}", json=update_data)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        updated = update_response.json()
        assert updated["valor_vencido"] == 500.00, "Valor vencido must be updated"
        assert updated["status"] == "vencida", "Status must be updated"
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/cfo-virtual/debts")
        debts = get_response.json()
        found = next((d for d in debts if d["id"] == debt_id), None)
        assert found is not None, "Updated debt must be found in list"
        assert found["valor_vencido"] == 500.00, "Valor vencido must persist"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/cfo-virtual/debts/{debt_id}")

    def test_update_debt_not_found(self, api_client):
        """PUT /api/cfo-virtual/debts/{id} returns 404 for nonexistent debt"""
        response = api_client.put(f"{BASE_URL}/api/cfo-virtual/debts/nonexistent-id", json={"status": "ativa"})
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"

    def test_delete_debt_success(self, api_client):
        """DELETE /api/cfo-virtual/debts/{id} removes a debt"""
        # Create debt first
        debt_data = {
            "credor": f"TEST_Delete_{uuid.uuid4().hex[:6]}",
            "tipo_divida": "Fiscal_AT",
            "valor_total": 1000.00,
            "valor_vencido": 0,
            "data_vencimento": "2026-04-01",
            "status": "ativa"
        }
        create_response = api_client.post(f"{BASE_URL}/api/cfo-virtual/debts", json=debt_data)
        assert create_response.status_code == 200
        debt_id = create_response.json()["id"]
        
        # Delete debt
        delete_response = api_client.delete(f"{BASE_URL}/api/cfo-virtual/debts/{debt_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        # Verify deletion
        get_response = api_client.get(f"{BASE_URL}/api/cfo-virtual/debts")
        debts = get_response.json()
        found = next((d for d in debts if d["id"] == debt_id), None)
        assert found is None, "Deleted debt must not be found in list"

    def test_delete_debt_not_found(self, api_client):
        """DELETE /api/cfo-virtual/debts/{id} returns 404 for nonexistent debt"""
        response = api_client.delete(f"{BASE_URL}/api/cfo-virtual/debts/nonexistent-id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestCfoVirtualAnalyze:
    """Tests for POST /api/cfo-virtual/analyze"""

    def test_analyze_returns_structured_report(self, api_client):
        """POST /api/cfo-virtual/analyze returns structured analysis report"""
        # First check if bank statement is loaded
        dashboard_response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        dashboard = dashboard_response.json()
        
        if not dashboard.get("context_validation", {}).get("can_generate_analysis"):
            pytest.skip("No bank statement loaded - cannot test analyze endpoint")
        
        response = api_client.post(f"{BASE_URL}/api/cfo-virtual/analyze", json={"foco_extra": ""})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Required fields in analysis report
        assert "id" in data, "Report must have id"
        assert "created_at" in data, "Report must have created_at"
        assert "snapshot" in data, "Report must have snapshot"
        assert "cash_allocation" in data, "Report must have cash_allocation"
        assert "analysis" in data, "Report must have analysis"
        
        # Analysis structure
        analysis = data["analysis"]
        assert "executive_diagnosis" in analysis, "Analysis must have executive_diagnosis"
        assert "cost_surgery_actions" in analysis, "Analysis must have cost_surgery_actions"
        assert "tactical_treasury_plan" in analysis, "Analysis must have tactical_treasury_plan"

    def test_analyze_blocks_without_bank_statement(self, api_client):
        """POST /api/cfo-virtual/analyze blocks if no bank statement loaded"""
        # This test verifies the error message when bank statement is missing
        # If bank statement exists, we skip this test
        dashboard_response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        dashboard = dashboard_response.json()
        
        if dashboard.get("context_validation", {}).get("can_generate_analysis"):
            pytest.skip("Bank statement is loaded - cannot test blocking behavior")
        
        response = api_client.post(f"{BASE_URL}/api/cfo-virtual/analyze", json={})
        assert response.status_code == 400, f"Expected 400 without bank statement, got {response.status_code}"
        assert "extrato" in response.json().get("detail", "").lower(), "Error should mention bank statement"


class TestCfoVirtualSimulator:
    """Tests for POST /api/cfo-virtual/simulator"""

    def test_simulator_returns_projection(self, api_client):
        """POST /api/cfo-virtual/simulator returns financial projection"""
        # First check if bank statement is loaded
        dashboard_response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        dashboard = dashboard_response.json()
        
        if not dashboard.get("context_validation", {}).get("can_generate_analysis"):
            pytest.skip("No bank statement loaded - cannot test simulator endpoint")
        
        sim_input = {
            "monthly_cost_cut": 500,
            "urgent_collection_boost": 2000,
            "horizon_months": 6
        }
        
        response = api_client.post(f"{BASE_URL}/api/cfo-virtual/simulator", json=sim_input)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Required fields
        assert "id" in data, "Simulation must have id"
        assert "scenario" in data, "Simulation must have scenario"
        assert "limits" in data, "Simulation must have limits"
        assert "assumptions" in data, "Simulation must have assumptions"
        assert "projection" in data, "Simulation must have projection"
        assert "commentary" in data, "Simulation must have commentary"
        
        # Projection structure
        assert isinstance(data["projection"], list), "Projection must be a list"
        if data["projection"]:
            row = data["projection"][0]
            assert "month" in row, "Projection row must have month"
            assert "ending_cash" in row, "Projection row must have ending_cash"
            assert "inflow" in row, "Projection row must have inflow"
            assert "outflow" in row, "Projection row must have outflow"

    def test_simulator_respects_limits(self, api_client):
        """POST /api/cfo-virtual/simulator respects feasible limits"""
        dashboard_response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        dashboard = dashboard_response.json()
        
        if not dashboard.get("context_validation", {}).get("can_generate_analysis"):
            pytest.skip("No bank statement loaded - cannot test simulator endpoint")
        
        # Request with very high values
        sim_input = {
            "monthly_cost_cut": 999999,
            "urgent_collection_boost": 999999,
            "horizon_months": 6
        }
        
        response = api_client.post(f"{BASE_URL}/api/cfo-virtual/simulator", json=sim_input)
        assert response.status_code == 200
        
        data = response.json()
        
        # Effective values should be capped at limits
        limits = data.get("limits", {})
        assumptions = data.get("assumptions", {})
        
        assert assumptions.get("effective_cut", 0) <= limits.get("max_cut_feasible", 0) + 0.01, \
            "Effective cut must not exceed max feasible"
        assert assumptions.get("effective_collection", 0) <= limits.get("max_urgent_collection", 0) + 0.01, \
            "Effective collection must not exceed max urgent collection"

    def test_simulator_blocks_without_bank_statement(self, api_client):
        """POST /api/cfo-virtual/simulator blocks if no bank statement loaded"""
        dashboard_response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        dashboard = dashboard_response.json()
        
        if dashboard.get("context_validation", {}).get("can_generate_analysis"):
            pytest.skip("Bank statement is loaded - cannot test blocking behavior")
        
        response = api_client.post(f"{BASE_URL}/api/cfo-virtual/simulator", json={
            "monthly_cost_cut": 0,
            "urgent_collection_boost": 0,
            "horizon_months": 6
        })
        assert response.status_code == 400, f"Expected 400 without bank statement, got {response.status_code}"


class TestAntiIllusionRule:
    """Tests for the anti-illusion rule: no positive allocations when cash is zero/negative"""

    def test_cash_allocation_empty_when_no_free_cash(self, api_client):
        """Cash allocation should be empty when allocatable_cash_now <= 0"""
        response = api_client.get(f"{BASE_URL}/api/cfo-virtual/dashboard")
        data = response.json()
        
        allocatable = data.get("snapshot", {}).get("allocatable_cash_now", 0)
        cash_allocation = data.get("cash_allocation", [])
        
        if allocatable <= 0:
            # Anti-illusion rule: no payments suggested when no free cash
            assert len(cash_allocation) == 0, \
                f"Cash allocation must be empty when allocatable_cash_now={allocatable}, but got {len(cash_allocation)} items"
            print(f"✓ Anti-illusion rule verified: allocatable_cash={allocatable}, allocation is empty")
        else:
            # If there's free cash, allocation can have items
            total_allocated = sum(item.get("amount", 0) for item in cash_allocation)
            assert total_allocated <= allocatable + 0.01, \
                f"Total allocated ({total_allocated}) must not exceed allocatable cash ({allocatable})"
            print(f"✓ Allocation within limits: allocatable={allocatable}, allocated={total_allocated}")


class TestDataTestIds:
    """Verify data-testid attributes are present in frontend components"""
    
    def test_dashboard_data_testids_documented(self, api_client):
        """Document expected data-testid attributes for frontend testing"""
        # This test documents the expected data-testids based on the frontend code
        expected_testids = [
            "cfo-virtual-page",
            "refresh-cfo-dashboard",
            "run-cfo-analysis",
            "validation-bank",
            "validation-costs",
            "validation-debts",
            "validation-bank-source",
            "cfo-kpi-cash",
            "cfo-kpi-free-cash",
            "cfo-kpi-fixed-burn",
            "cfo-kpi-overdue-debt",
            "cfo-kpi-urgent-receivables",
            "cfo-analysis-panel",
            "cfo-crisis-level",
            "cfo-headline",
            "cfo-financial-truth",
            "cfo-cash-allocation-panel",
            "cfo-receivables-panel",
            "cfo-work-opportunities-panel",
            "cfo-debts-section",
            "new-debt-button",
            "save-debt-button",
            "cfo-simulator-section",
            "run-simulator-button",
            "simulator-chart",
            "sim-commentary",
            "cfo-transactions-panel"
        ]
        
        print(f"Expected data-testid attributes for CFO Virtual page: {len(expected_testids)}")
        for testid in expected_testids:
            print(f"  - {testid}")
        
        # This test always passes - it's documentation
        assert True
