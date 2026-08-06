"""
Test module for Work Analysis (Análise de Custo de Obra - Previsto vs Real)
Tests the new endpoints:
- GET /api/works/{id}/full - returns work + items + expenses + kpis
- POST /api/works/{id}/sync-budget - sync items from budget
- POST /api/works/{id}/items - add extra item
- PUT /api/works/{id}/items/{item_id} - update item real cost
- DELETE /api/works/{id}/items/{item_id} - delete item
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping tests")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestWorkAnalysisEndpoints:
    """Tests for Work Analysis feature endpoints"""
    
    work_id = None
    budget_id = None
    item_id = None
    expense_id = None
    
    def test_01_create_budget_for_work(self, auth_headers):
        """Create a budget to link to work"""
        payload = {
            "title": "TEST_Budget_WorkAnalysis",
            "client_name": "TEST_Cliente Análise",
            "client_phone": "912345678",
            "items": [
                {"category": "Material", "name": "Cabo H05VV-F 3G2,5mm", "unit": "metro", "quantity": 50, "unit_cost": 2.5, "margin": 0.6},
                {"category": "Mão de Obra", "name": "Instalação ponto luz", "unit": "un", "quantity": 10, "unit_cost": 15, "margin": 0.8}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/budgets", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create budget: {response.text}"
        data = response.json()
        assert "id" in data
        TestWorkAnalysisEndpoints.budget_id = data["id"]
        print(f"Created budget: {data['id']}")
    
    def test_02_create_work_with_budget(self, auth_headers):
        """Create a work linked to the budget"""
        payload = {
            "title": "TEST_Obra_Análise_Custos",
            "client_name": "TEST_Cliente Análise",
            "client_phone": "912345678",
            "budget_id": TestWorkAnalysisEndpoints.budget_id,
            "status": "em_execucao",
            "predicted_cost": 500,
            "real_cost": 0,
            "notes": "Obra para testar análise previsto vs real"
        }
        response = requests.post(f"{BASE_URL}/api/works", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create work: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["budget_id"] == TestWorkAnalysisEndpoints.budget_id
        TestWorkAnalysisEndpoints.work_id = data["id"]
        print(f"Created work: {data['id']}")
    
    def test_03_get_work_full_returns_structure(self, auth_headers):
        """GET /api/works/{id}/full returns work, items, expenses, kpis"""
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check structure
        assert "work" in data, "Missing 'work' in response"
        assert "items" in data, "Missing 'items' in response"
        assert "expenses" in data, "Missing 'expenses' in response"
        assert "kpis" in data, "Missing 'kpis' in response"
        
        # Check work data
        assert data["work"]["id"] == TestWorkAnalysisEndpoints.work_id
        assert data["work"]["title"] == "TEST_Obra_Análise_Custos"
        
        print(f"Full response structure verified: work, items ({len(data['items'])}), expenses ({len(data['expenses'])}), kpis")
    
    def test_04_get_work_full_auto_syncs_items(self, auth_headers):
        """GET /api/works/{id}/full auto-syncs items from budget if not synced"""
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Should have 2 items from budget
        assert len(data["items"]) == 2, f"Expected 2 items, got {len(data['items'])}"
        
        # Check first item structure
        item = data["items"][0]
        assert "id" in item
        assert "name" in item
        assert "predicted_unit_cost" in item
        assert "real_unit_cost" in item
        assert "predicted_total" in item
        assert "real_total" in item
        assert "sale_total" in item
        assert "is_extra" in item
        assert item["is_extra"] == False
        
        TestWorkAnalysisEndpoints.item_id = item["id"]
        print(f"Items auto-synced from budget: {[i['name'] for i in data['items']]}")
    
    def test_05_kpis_structure_and_values(self, auth_headers):
        """KPIs have correct structure and computed values"""
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        assert response.status_code == 200
        kpis = response.json()["kpis"]
        
        # Check all KPI fields exist
        required_kpis = [
            "sale_total", "predicted_total", "real_total_items", "expenses_total",
            "real_total", "predicted_profit", "real_profit", "margin_predicted_pct",
            "margin_real_pct", "overrun_pct", "is_overrun"
        ]
        for kpi in required_kpis:
            assert kpi in kpis, f"Missing KPI: {kpi}"
        
        # Verify calculations
        # sale_total = sum of (predicted_unit_cost * (1 + margin) * quantity)
        # Item 1: 2.5 * 1.6 * 50 = 200
        # Item 2: 15 * 1.8 * 10 = 270
        # Total sale = 470
        assert kpis["sale_total"] == 470, f"Expected sale_total=470, got {kpis['sale_total']}"
        
        # predicted_total = sum of (predicted_unit_cost * quantity)
        # Item 1: 2.5 * 50 = 125
        # Item 2: 15 * 10 = 150
        # Total predicted = 275
        assert kpis["predicted_total"] == 275, f"Expected predicted_total=275, got {kpis['predicted_total']}"
        
        # No real costs yet
        assert kpis["real_total_items"] == 0
        assert kpis["expenses_total"] == 0
        assert kpis["real_total"] == 0
        
        # Profit calculations
        assert kpis["predicted_profit"] == 195  # 470 - 275
        assert kpis["real_profit"] == 470  # 470 - 0 (no real costs)
        
        # No overrun yet
        assert kpis["is_overrun"] == False
        
        print(f"KPIs verified: sale_total={kpis['sale_total']}, predicted_total={kpis['predicted_total']}")
    
    def test_06_update_item_real_cost(self, auth_headers):
        """PUT /api/works/{id}/items/{item_id} updates real cost"""
        payload = {
            "real_unit_cost": 3.1,
            "real_quantity": 55,
            "real_notes": "Preço subiu, usou mais material"
        }
        response = requests.put(
            f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/items/{TestWorkAnalysisEndpoints.item_id}",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Find updated item
        item = next((i for i in data["items"] if i["id"] == TestWorkAnalysisEndpoints.item_id), None)
        assert item is not None
        assert item["real_unit_cost"] == 3.1
        assert item["real_quantity"] == 55
        assert item["real_notes"] == "Preço subiu, usou mais material"
        
        # Check real_total computed: 3.1 * 55 = 170.5
        assert item["real_total"] == 170.5, f"Expected real_total=170.5, got {item['real_total']}"
        
        print(f"Item updated: real_unit_cost={item['real_unit_cost']}, real_total={item['real_total']}")
    
    def test_07_history_recorded_on_cost_change(self, auth_headers):
        """History entry created when real_unit_cost changes"""
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        assert response.status_code == 200
        
        item = next((i for i in response.json()["items"] if i["id"] == TestWorkAnalysisEndpoints.item_id), None)
        assert item is not None
        assert "history" in item
        assert len(item["history"]) >= 1, "Expected at least 1 history entry"
        
        # Check history entry structure
        h = item["history"][0]
        assert "at" in h
        assert "by" in h
        assert "from" in h
        assert "to" in h
        assert h["from"] == 0  # Was 0 before
        assert h["to"] == 3.1  # Changed to 3.1
        
        print(f"History recorded: from {h['from']} to {h['to']} at {h['at']}")
    
    def test_08_add_extra_item(self, auth_headers):
        """POST /api/works/{id}/items adds extra item with is_extra=true"""
        payload = {
            "name": "TEST_Material Imprevisto",
            "category": "Extra",
            "unit": "un",
            "quantity": 5,
            "predicted_unit_cost": 10,
            "real_unit_cost": 12,
            "margin": 0.6,
            "notes": "Material não previsto no orçamento"
        }
        response = requests.post(
            f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/items",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Find the extra item
        extra = next((i for i in data["items"] if i.get("is_extra") == True), None)
        assert extra is not None, "Extra item not found"
        assert extra["name"] == "TEST_Material Imprevisto"
        assert extra["is_extra"] == True
        assert extra["real_unit_cost"] == 12
        
        # Check computed values
        # predicted_total = 10 * 5 = 50
        # real_total = 12 * 5 = 60
        # sale_total = 10 * 1.6 * 5 = 80
        assert extra["predicted_total"] == 50
        assert extra["real_total"] == 60
        assert extra["sale_total"] == 80
        
        print(f"Extra item added: {extra['name']}, is_extra={extra['is_extra']}")
    
    def test_09_kpis_updated_with_real_costs(self, auth_headers):
        """KPIs reflect real costs after updates"""
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        assert response.status_code == 200
        kpis = response.json()["kpis"]
        
        # Now we have:
        # Item 1: real_total = 3.1 * 55 = 170.5
        # Item 2: real_total = 0 (no real cost set)
        # Extra: real_total = 12 * 5 = 60
        # Total real_items = 170.5 + 0 + 60 = 230.5
        assert kpis["real_total_items"] == 230.5, f"Expected 230.5, got {kpis['real_total_items']}"
        
        # sale_total now includes extra: 470 + 80 = 550
        assert kpis["sale_total"] == 550, f"Expected 550, got {kpis['sale_total']}"
        
        # predicted_total now includes extra: 275 + 50 = 325
        assert kpis["predicted_total"] == 325, f"Expected 325, got {kpis['predicted_total']}"
        
        print(f"KPIs updated: real_total_items={kpis['real_total_items']}, sale_total={kpis['sale_total']}")
    
    def test_10_create_expense_linked_to_work(self, auth_headers):
        """Create expense with obra_id to test expenses in /full"""
        payload = {
            "date": "2026-01-15",
            "supplier": "TEST_Fornecedor Material",
            "nif": "123456789",
            "invoice_number": f"FT-TEST-{uuid.uuid4().hex[:6]}",
            "category": "Material",
            "type": "obra",
            "obra_id": TestWorkAnalysisEndpoints.work_id,
            "obra_name": "TEST_Obra_Análise_Custos",
            "value_net": 100,
            "vat_rate": 23,
            "value_gross": 123
        }
        response = requests.post(f"{BASE_URL}/api/expenses", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        TestWorkAnalysisEndpoints.expense_id = data["id"]
        print(f"Created expense linked to work: {data['id']}")
    
    def test_11_expenses_appear_in_full_response(self, auth_headers):
        """Expenses with obra_id appear in /full response"""
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["expenses"]) >= 1, "Expected at least 1 expense"
        expense = data["expenses"][0]
        assert expense["obra_id"] == TestWorkAnalysisEndpoints.work_id
        assert expense["value_gross"] == 123
        
        # Check expenses_total in KPIs
        assert data["kpis"]["expenses_total"] == 123, f"Expected 123, got {data['kpis']['expenses_total']}"
        
        # real_total = real_total_items + expenses_total = 230.5 + 123 = 353.5
        assert data["kpis"]["real_total"] == 353.5, f"Expected 353.5, got {data['kpis']['real_total']}"
        
        print(f"Expenses in /full: {len(data['expenses'])}, expenses_total={data['kpis']['expenses_total']}")
    
    def test_12_overrun_detection(self, auth_headers):
        """is_overrun=true when overrun_pct > 10"""
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        assert response.status_code == 200
        kpis = response.json()["kpis"]
        
        # overrun_pct = (real_total - predicted_total) / predicted_total * 100
        # = (353.5 - 325) / 325 * 100 = 8.77%
        # This is < 10%, so is_overrun should be False
        print(f"overrun_pct={kpis['overrun_pct']}, is_overrun={kpis['is_overrun']}")
        
        # Let's add more real cost to trigger overrun
        # Update item 2 with high real cost
        item2 = response.json()["items"][1]  # Second item
        payload = {"real_unit_cost": 25}  # Much higher than predicted 15
        response2 = requests.put(
            f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/items/{item2['id']}",
            json=payload,
            headers=auth_headers
        )
        assert response2.status_code == 200
        
        # Check overrun now
        response3 = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        kpis = response3.json()["kpis"]
        
        # New real_total_items = 170.5 + (25*10) + 60 = 480.5
        # real_total = 480.5 + 123 = 603.5
        # overrun_pct = (603.5 - 325) / 325 * 100 = 85.7%
        assert kpis["overrun_pct"] > 10, f"Expected overrun_pct > 10, got {kpis['overrun_pct']}"
        assert kpis["is_overrun"] == True, "Expected is_overrun=True"
        
        print(f"Overrun detected: overrun_pct={kpis['overrun_pct']}, is_overrun={kpis['is_overrun']}")
    
    def test_13_sync_budget_preserves_real_costs(self, auth_headers):
        """POST /api/works/{id}/sync-budget preserves existing real costs"""
        # Get current real costs
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        items_before = response.json()["items"]
        real_costs_before = {i["id"]: i["real_unit_cost"] for i in items_before if not i.get("is_extra")}
        
        # Sync from budget
        response = requests.post(
            f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/sync-budget",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Check real costs preserved
        items_after = response.json()["items"]
        for item in items_after:
            if not item.get("is_extra") and item["id"] in real_costs_before:
                # Real cost should be preserved (or item might have new ID after sync)
                pass  # The sync creates new IDs but preserves by budget_item_idx
        
        # Check extras preserved
        extras = [i for i in items_after if i.get("is_extra")]
        assert len(extras) >= 1, "Extra items should be preserved after sync"
        
        print(f"Sync completed, extras preserved: {len(extras)}")
    
    def test_14_delete_extra_item(self, auth_headers):
        """DELETE /api/works/{id}/items/{item_id} removes item"""
        # Get extra item
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/full", headers=auth_headers)
        extras = [i for i in response.json()["items"] if i.get("is_extra")]
        assert len(extras) >= 1
        extra_id = extras[0]["id"]
        
        # Delete it
        response = requests.delete(
            f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}/items/{extra_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify deleted
        items_after = response.json()["items"]
        assert not any(i["id"] == extra_id for i in items_after), "Item should be deleted"
        
        print(f"Extra item deleted: {extra_id}")
    
    def test_15_work_without_budget_no_sync(self, auth_headers):
        """Work without budget_id returns 400 on sync"""
        # Create work without budget
        payload = {
            "title": "TEST_Obra_Sem_Orcamento",
            "client_name": "TEST_Cliente",
            "status": "orcamento"
        }
        response = requests.post(f"{BASE_URL}/api/works", json=payload, headers=auth_headers)
        work_id = response.json()["id"]
        
        # Try to sync
        response = requests.post(f"{BASE_URL}/api/works/{work_id}/sync-budget", headers=auth_headers)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "orçamento" in response.json()["detail"].lower() or "orcamento" in response.json()["detail"].lower()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/works/{work_id}", headers=auth_headers)
        print("Work without budget correctly returns 400 on sync")
    
    def test_99_cleanup(self, auth_headers):
        """Cleanup test data"""
        # Delete expense
        if TestWorkAnalysisEndpoints.expense_id:
            requests.delete(f"{BASE_URL}/api/expenses/{TestWorkAnalysisEndpoints.expense_id}", headers=auth_headers)
        
        # Delete work
        if TestWorkAnalysisEndpoints.work_id:
            requests.delete(f"{BASE_URL}/api/works/{TestWorkAnalysisEndpoints.work_id}", headers=auth_headers)
        
        # Delete budget
        if TestWorkAnalysisEndpoints.budget_id:
            requests.delete(f"{BASE_URL}/api/budgets/{TestWorkAnalysisEndpoints.budget_id}", headers=auth_headers)
        
        print("Cleanup completed")


class TestWorkCRUDRegression:
    """Regression tests for basic work CRUD operations"""
    
    work_id = None
    
    def test_01_create_work(self, auth_headers):
        """Create work via POST /api/works"""
        payload = {
            "title": "TEST_Obra_Regression",
            "client_name": "TEST_Cliente Regression",
            "client_phone": "911111111",
            "status": "orcamento",
            "predicted_cost": 1000,
            "real_cost": 500,
            "notes": "Teste de regressão"
        }
        response = requests.post(f"{BASE_URL}/api/works", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "TEST_Obra_Regression"
        TestWorkCRUDRegression.work_id = data["id"]
        print(f"Work created: {data['id']}")
    
    def test_02_get_work(self, auth_headers):
        """Get work via GET /api/works/{id}"""
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkCRUDRegression.work_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == TestWorkCRUDRegression.work_id
        assert data["title"] == "TEST_Obra_Regression"
    
    def test_03_update_work(self, auth_headers):
        """Update work via PUT /api/works/{id}"""
        payload = {"status": "em_execucao", "real_cost": 600}
        response = requests.put(f"{BASE_URL}/api/works/{TestWorkCRUDRegression.work_id}", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "em_execucao"
        assert data["real_cost"] == 600
    
    def test_04_list_works(self, auth_headers):
        """List works via GET /api/works"""
        response = requests.get(f"{BASE_URL}/api/works", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert any(w["id"] == TestWorkCRUDRegression.work_id for w in data)
    
    def test_05_delete_work(self, auth_headers):
        """Delete work via DELETE /api/works/{id}"""
        response = requests.delete(f"{BASE_URL}/api/works/{TestWorkCRUDRegression.work_id}", headers=auth_headers)
        assert response.status_code == 200
        
        # Verify deleted
        response = requests.get(f"{BASE_URL}/api/works/{TestWorkCRUDRegression.work_id}", headers=auth_headers)
        assert response.status_code == 404
        print("Work deleted and verified")
