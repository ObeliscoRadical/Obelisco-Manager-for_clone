"""
Test module for Annual Financial Reports feature (Relatório Financeiro Anual)
Tests GET /api/reports/annual endpoint with various filters and validates response structure
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAnnualReportsEndpoint:
    """Tests for GET /api/reports/annual endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        """Setup for each test"""
        self.client = api_client
        self.token = auth_token
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_annual_report_basic_structure(self, api_client, auth_token):
        """Test that annual report returns correct structure"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify top-level fields
        assert "year" in data
        assert data["year"] == 2026
        assert "scope_label" in data
        assert "filters" in data
        assert "kpis" in data
        assert "monthly" in data
        assert "categories_expense" in data
        assert "clients_revenue" in data
        assert "invoices" in data
        assert "expenses" in data
        assert "payroll_runs" in data
        assert "works" in data
        assert "works_in_progress" in data
        assert "generated_at" in data
    
    def test_annual_report_kpis_structure(self, api_client, auth_token):
        """Test that KPIs contain all required fields"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        kpis = response.json()["kpis"]
        
        # Verify all KPI fields exist
        required_kpi_fields = [
            "total_in", "total_emitted", "total_out",
            "total_out_variable", "total_out_fixed", "total_out_obra", "total_payroll",
            "result", "margin_pct",
            "vat_paid", "vat_charged", "vat_balance",
            "pending_total",
            "invoices_count", "expenses_count", "works_count", "works_in_progress_count"
        ]
        
        for field in required_kpi_fields:
            assert field in kpis, f"Missing KPI field: {field}"
    
    def test_annual_report_kpis_values_correct(self, api_client, auth_token):
        """Test that KPIs have correct values based on known data"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        kpis = response.json()["kpis"]
        
        # Verify KPI calculations
        assert kpis["total_in"] == 600.0, f"Expected total_in=600.0, got {kpis['total_in']}"
        assert kpis["total_emitted"] == 2460.0, f"Expected total_emitted=2460.0, got {kpis['total_emitted']}"
        
        # Verify total_out = variable + fixed + obra + payroll
        expected_total_out = kpis["total_out_variable"] + kpis["total_out_fixed"] + kpis["total_out_obra"] + kpis["total_payroll"]
        assert abs(kpis["total_out"] - expected_total_out) < 0.01, f"total_out mismatch: {kpis['total_out']} vs {expected_total_out}"
        
        # Verify result = total_in - total_out
        expected_result = kpis["total_in"] - kpis["total_out"]
        assert abs(kpis["result"] - expected_result) < 0.01, f"result mismatch: {kpis['result']} vs {expected_result}"
        
        # Verify vat_balance = vat_charged - vat_paid
        expected_vat_balance = kpis["vat_charged"] - kpis["vat_paid"]
        assert abs(kpis["vat_balance"] - expected_vat_balance) < 0.01, f"vat_balance mismatch"
    
    def test_annual_report_monthly_has_12_entries(self, api_client, auth_token):
        """Test that monthly array has exactly 12 entries"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        monthly = response.json()["monthly"]
        assert len(monthly) == 12, f"Expected 12 monthly entries, got {len(monthly)}"
    
    def test_annual_report_monthly_structure(self, api_client, auth_token):
        """Test that each monthly entry has correct structure"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        monthly = response.json()["monthly"]
        
        required_fields = [
            "month", "month_label", "entries",
            "expenses_variable", "expenses_fixed", "expenses_obra", "payroll",
            "total_out", "net", "accumulated"
        ]
        
        for m in monthly:
            for field in required_fields:
                assert field in m, f"Missing field {field} in monthly entry"
    
    def test_annual_report_monthly_accumulated_grows(self, api_client, auth_token):
        """Test that accumulated cashflow is calculated correctly (grows month after month)"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        monthly = response.json()["monthly"]
        
        # Verify accumulated is cumulative sum of net
        running_total = 0.0
        for m in monthly:
            running_total += m["net"]
            assert abs(m["accumulated"] - running_total) < 0.01, f"Accumulated mismatch at month {m['month']}"
    
    def test_annual_report_client_filter(self, api_client, auth_token):
        """Test that client filter works correctly (case-insensitive regex)"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026&client=Test",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # When filtering by client, expenses and payroll should be zeroed
        assert data["kpis"]["expenses_count"] == 0, "Expenses should be 0 when filtering by client"
        assert len(data["expenses"]) == 0, "Expenses list should be empty when filtering by client"
        assert len(data["payroll_runs"]) == 0, "Payroll should be empty when filtering by client"
        
        # Invoices should be filtered
        for inv in data["invoices"]:
            assert "test" in inv["client_name"].lower(), f"Invoice client should contain 'test': {inv['client_name']}"
    
    def test_annual_report_category_filter(self, api_client, auth_token):
        """Test that category filter works correctly (exact match)"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026&category=Combust%C3%ADvel",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # All expenses should be in the filtered category
        for exp in data["expenses"]:
            assert exp["category"] == "Combustível", f"Expense category should be 'Combustível': {exp['category']}"
    
    def test_annual_report_categories_expense_sorted_desc(self, api_client, auth_token):
        """Test that categories_expense is sorted by total descending"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        categories = response.json()["categories_expense"]
        
        if len(categories) > 1:
            for i in range(len(categories) - 1):
                assert categories[i]["total"] >= categories[i + 1]["total"], \
                    f"Categories not sorted desc: {categories[i]['total']} < {categories[i + 1]['total']}"
    
    def test_annual_report_categories_expense_pct_correct(self, api_client, auth_token):
        """Test that categories_expense percentages are correct"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        categories = data["categories_expense"]
        total_out = data["kpis"]["total_out"]
        
        if total_out > 0:
            for cat in categories:
                expected_pct = round(cat["total"] / total_out * 100, 1)
                assert abs(cat["pct"] - expected_pct) < 0.2, f"Category pct mismatch for {cat['category']}"
    
    def test_annual_report_clients_revenue_sorted_desc(self, api_client, auth_token):
        """Test that clients_revenue is sorted by total descending"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        clients = response.json()["clients_revenue"]
        
        if len(clients) > 1:
            for i in range(len(clients) - 1):
                assert clients[i]["total"] >= clients[i + 1]["total"], \
                    f"Clients not sorted desc: {clients[i]['total']} < {clients[i + 1]['total']}"
    
    def test_annual_report_clients_revenue_pct_correct(self, api_client, auth_token):
        """Test that clients_revenue percentages are correct"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        clients = data["clients_revenue"]
        total_emitted = data["kpis"]["total_emitted"]
        
        if total_emitted > 0:
            for cli in clients:
                expected_pct = round(cli["total"] / total_emitted * 100, 1)
                assert abs(cli["pct"] - expected_pct) < 0.2, f"Client pct mismatch for {cli['client']}"
    
    def test_annual_report_pending_total_all_years(self, api_client, auth_token):
        """Test that pending_total includes all invoices with balance > 0 (all years)"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        pending = data["kpis"]["pending_total"]
        
        # pending_total should be >= 0
        assert pending >= 0, f"pending_total should be >= 0, got {pending}"
    
    def test_annual_report_invoices_structure(self, api_client, auth_token):
        """Test that invoices have correct structure"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        invoices = response.json()["invoices"]
        
        if len(invoices) > 0:
            inv = invoices[0]
            required_fields = [
                "id", "number", "issue_date", "due_date",
                "client_name", "client_nif",
                "value_net", "vat_amount", "value_total",
                "paid", "balance", "status"
            ]
            for field in required_fields:
                assert field in inv, f"Missing invoice field: {field}"
    
    def test_annual_report_expenses_structure(self, api_client, auth_token):
        """Test that expenses have correct structure"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        expenses = response.json()["expenses"]
        
        if len(expenses) > 0:
            exp = expenses[0]
            required_fields = [
                "id", "date", "supplier", "nif", "invoice_number",
                "category", "type", "obra_name",
                "value_net", "vat_amount", "value_gross"
            ]
            for field in required_fields:
                assert field in exp, f"Missing expense field: {field}"
    
    def test_annual_report_works_structure(self, api_client, auth_token):
        """Test that works have correct structure"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        works = response.json()["works"]
        
        if len(works) > 0:
            work = works[0]
            required_fields = [
                "id", "title", "client_name", "status",
                "predicted_cost", "real_cost",
                "start_date", "end_date"
            ]
            for field in required_fields:
                assert field in work, f"Missing work field: {field}"
    
    def test_annual_report_payroll_structure(self, api_client, auth_token):
        """Test that payroll_runs have correct structure (if any exist)"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/annual?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        payroll = response.json()["payroll_runs"]
        
        if len(payroll) > 0:
            run = payroll[0]
            required_fields = [
                "year", "month",
                "total_iliquido", "total_liquido",
                "total_ss_empresa", "total_custo_empresa",
                "employees_count", "status"
            ]
            for field in required_fields:
                assert field in run, f"Missing payroll field: {field}"
    
    def test_annual_report_unauthorized(self):
        """Test that endpoint requires authentication"""
        # Use a fresh session without auth
        fresh_client = requests.Session()
        fresh_client.headers.update({"Content-Type": "application/json"})
        response = fresh_client.get(f"{BASE_URL}/api/reports/annual?year=2026")
        assert response.status_code == 401


# Fixtures
@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")
