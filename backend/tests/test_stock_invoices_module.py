"""
Test module for Stock Management and Invoices/Cobrança features.
Tests:
- Materials with stock_current and stock_min fields
- Stock movements (entrada/saida)
- Low stock alerts
- Invoice CRUD with auto-numbering
- Invoice status computation (pendente/vencida/parcial/paga)
- Payments (add/remove)
- Reminder logging
- Summary aggregations
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Get authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@obelisco.pt",
        "password": "obelisco2024"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


# ============================================================
# STOCK MANAGEMENT TESTS
# ============================================================

class TestMaterialsWithStock:
    """Test materials with stock_current and stock_min fields"""
    
    def test_create_material_with_stock(self, auth_session):
        """POST /api/materials with stock values should persist them"""
        response = auth_session.post(f"{BASE_URL}/api/materials", json={
            "description": "TEST_Stock_Material_001",
            "category": "Teste",
            "unit": "unidade",
            "purchase_price": 10.0,
            "stock_current": 50,
            "stock_min": 10
        })
        assert response.status_code == 200, f"Create material failed: {response.text}"
        data = response.json()
        assert data["description"] == "TEST_Stock_Material_001"
        assert data["stock_current"] == 50
        assert data["stock_min"] == 10
        assert "id" in data
        print(f"PASS: Created material with stock: {data['id']}")
        return data["id"]
    
    def test_get_material_has_stock_fields(self, auth_session):
        """GET /api/materials returns stock fields"""
        response = auth_session.get(f"{BASE_URL}/api/materials")
        assert response.status_code == 200
        materials = response.json()
        # Find our test material
        test_mat = next((m for m in materials if m.get("description") == "TEST_Stock_Material_001"), None)
        if test_mat:
            assert "stock_current" in test_mat
            assert "stock_min" in test_mat
            print(f"PASS: Material has stock fields: current={test_mat['stock_current']}, min={test_mat['stock_min']}")


class TestStockMovements:
    """Test stock movement endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup_material(self, auth_session):
        """Create a test material for stock movements"""
        response = auth_session.post(f"{BASE_URL}/api/materials", json={
            "description": "TEST_Stock_Movement_Material",
            "category": "Teste",
            "unit": "un",
            "purchase_price": 5.0,
            "stock_current": 100,
            "stock_min": 20
        })
        assert response.status_code == 200
        self.material_id = response.json()["id"]
        yield
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/materials/{self.material_id}")
    
    def test_stock_entrada_movement(self, auth_session):
        """POST /api/stock/movement with entrada increases stock"""
        response = auth_session.post(f"{BASE_URL}/api/stock/movement", json={
            "material_id": self.material_id,
            "movement_type": "entrada",
            "quantity": 30,
            "reason": "Compra"
        })
        assert response.status_code == 200, f"Entrada failed: {response.text}"
        data = response.json()
        assert data["movement_type"] == "entrada"
        assert data["quantity"] == 30
        assert data["stock_before"] == 100
        assert data["stock_after"] == 130
        print(f"PASS: Entrada movement: 100 -> 130")
    
    def test_stock_saida_movement(self, auth_session):
        """POST /api/stock/movement with saida decreases stock"""
        # First do entrada to have stock
        auth_session.post(f"{BASE_URL}/api/stock/movement", json={
            "material_id": self.material_id,
            "movement_type": "entrada",
            "quantity": 50,
            "reason": "Compra"
        })
        
        # Now do saida
        response = auth_session.post(f"{BASE_URL}/api/stock/movement", json={
            "material_id": self.material_id,
            "movement_type": "saida",
            "quantity": 30,
            "reason": "Consumo obra"
        })
        assert response.status_code == 200, f"Saida failed: {response.text}"
        data = response.json()
        assert data["movement_type"] == "saida"
        assert data["quantity"] == 30
        assert data["stock_after"] == data["stock_before"] - 30
        print(f"PASS: Saida movement: {data['stock_before']} -> {data['stock_after']}")
    
    def test_stock_saida_insufficient_rejected(self, auth_session):
        """POST /api/stock/movement rejects saida if stock_current - quantity < 0"""
        response = auth_session.post(f"{BASE_URL}/api/stock/movement", json={
            "material_id": self.material_id,
            "movement_type": "saida",
            "quantity": 999,  # More than available
            "reason": "Consumo obra"
        })
        assert response.status_code == 400, f"Should reject insufficient stock: {response.text}"
        assert "insuficiente" in response.json().get("detail", "").lower()
        print("PASS: Insufficient stock rejected with 400")
    
    def test_stock_invalid_quantity_rejected(self, auth_session):
        """POST /api/stock/movement rejects qty <= 0"""
        response = auth_session.post(f"{BASE_URL}/api/stock/movement", json={
            "material_id": self.material_id,
            "movement_type": "entrada",
            "quantity": 0,
            "reason": "Test"
        })
        assert response.status_code == 400
        print("PASS: Zero quantity rejected with 400")
        
        response = auth_session.post(f"{BASE_URL}/api/stock/movement", json={
            "material_id": self.material_id,
            "movement_type": "entrada",
            "quantity": -5,
            "reason": "Test"
        })
        assert response.status_code == 400
        print("PASS: Negative quantity rejected with 400")
    
    def test_stock_invalid_type_rejected(self, auth_session):
        """POST /api/stock/movement rejects invalid movement_type"""
        response = auth_session.post(f"{BASE_URL}/api/stock/movement", json={
            "material_id": self.material_id,
            "movement_type": "invalid",
            "quantity": 10,
            "reason": "Test"
        })
        assert response.status_code == 400
        print("PASS: Invalid movement type rejected with 400")
    
    def test_stock_movement_creates_record(self, auth_session):
        """Movement creates record with stock_before/stock_after"""
        response = auth_session.post(f"{BASE_URL}/api/stock/movement", json={
            "material_id": self.material_id,
            "movement_type": "entrada",
            "quantity": 10,
            "reason": "Compra",
            "notes": "Test note"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "stock_before" in data
        assert "stock_after" in data
        assert "created_at" in data
        assert data["reason"] == "Compra"
        print(f"PASS: Movement record created with all fields")


class TestStockMovementsList:
    """Test GET /api/stock/movements"""
    
    def test_list_movements(self, auth_session):
        """GET /api/stock/movements returns list"""
        response = auth_session.get(f"{BASE_URL}/api/stock/movements")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: Listed {len(data)} stock movements")
    
    def test_list_movements_filter_by_material(self, auth_session):
        """GET /api/stock/movements?material_id=X filters correctly"""
        # Create material and movement
        mat_resp = auth_session.post(f"{BASE_URL}/api/materials", json={
            "description": "TEST_Filter_Material",
            "stock_current": 50
        })
        mat_id = mat_resp.json()["id"]
        
        auth_session.post(f"{BASE_URL}/api/stock/movement", json={
            "material_id": mat_id,
            "movement_type": "entrada",
            "quantity": 5,
            "reason": "Test"
        })
        
        response = auth_session.get(f"{BASE_URL}/api/stock/movements", params={"material_id": mat_id})
        assert response.status_code == 200
        data = response.json()
        assert all(m["material_id"] == mat_id for m in data)
        print(f"PASS: Filtered movements by material_id")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/materials/{mat_id}")


class TestLowStock:
    """Test GET /api/stock/low"""
    
    def test_low_stock_returns_materials(self, auth_session):
        """GET /api/stock/low returns materials where stock_current <= stock_min"""
        # Create low stock material
        mat_resp = auth_session.post(f"{BASE_URL}/api/materials", json={
            "description": "TEST_Low_Stock_Material",
            "stock_current": 5,
            "stock_min": 10
        })
        mat_id = mat_resp.json()["id"]
        
        response = auth_session.get(f"{BASE_URL}/api/stock/low")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Our material should be in the list
        found = any(m["id"] == mat_id for m in data)
        assert found, "Low stock material not found in list"
        print(f"PASS: Low stock endpoint returns {len(data)} materials")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/materials/{mat_id}")
    
    def test_low_stock_excludes_zero_min(self, auth_session):
        """GET /api/stock/low excludes materials with stock_min = 0"""
        # Create material with stock_min = 0
        mat_resp = auth_session.post(f"{BASE_URL}/api/materials", json={
            "description": "TEST_No_Min_Stock",
            "stock_current": 0,
            "stock_min": 0
        })
        mat_id = mat_resp.json()["id"]
        
        response = auth_session.get(f"{BASE_URL}/api/stock/low")
        assert response.status_code == 200
        data = response.json()
        
        # Our material should NOT be in the list (stock_min = 0)
        found = any(m["id"] == mat_id for m in data)
        assert not found, "Material with stock_min=0 should not be in low stock list"
        print("PASS: Materials with stock_min=0 excluded from low stock")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/materials/{mat_id}")


# ============================================================
# INVOICES / COBRANÇA TESTS
# ============================================================

class TestInvoiceCreate:
    """Test invoice creation"""
    
    def test_create_invoice_auto_number(self, auth_session):
        """POST /api/invoices creates invoice with auto-generated number"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Client_Auto",
            "value_total": 1000.00
        })
        assert response.status_code == 200, f"Create invoice failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["number"].startswith("FT ")
        assert data["client_name"] == "TEST_Client_Auto"
        assert data["value_total"] == 1000.00
        assert data["status"] == "pendente"
        assert data["balance"] == 1000.00
        print(f"PASS: Created invoice with auto-number: {data['number']}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/invoices/{data['id']}")
    
    def test_create_invoice_manual_number(self, auth_session):
        """POST /api/invoices with provided number uses it"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "number": "FT TEST/0001",
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Client_Manual",
            "value_total": 500.00
        })
        assert response.status_code == 200
        data = response.json()
        assert data["number"] == "FT TEST/0001"
        print(f"PASS: Created invoice with manual number: {data['number']}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/invoices/{data['id']}")
    
    def test_create_invoice_with_vat_calc(self, auth_session):
        """POST /api/invoices auto-computes vat_amount from value_net + vat_rate"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_VAT_Client",
            "value_net": 100.00,
            "vat_rate": 23,
            "value_total": 123.00
        })
        assert response.status_code == 200
        data = response.json()
        assert data["vat_amount"] == 23.00
        print(f"PASS: VAT auto-computed: {data['vat_amount']}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/invoices/{data['id']}")


class TestInvoiceStatusComputation:
    """Test invoice status computation logic"""
    
    def test_status_pendente(self, auth_session):
        """Invoice with due_date >= today and no payments = pendente"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Pendente",
            "value_total": 100.00
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pendente"
        assert data["days_overdue"] == 0
        print("PASS: Status = pendente for future due date")
        
        auth_session.delete(f"{BASE_URL}/api/invoices/{data['id']}")
    
    def test_status_vencida(self, auth_session):
        """Invoice with due_date < today and no payments = vencida"""
        today = datetime.now().strftime("%Y-%m-%d")
        past_due = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")
        
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": past_due,
            "due_date": past_due,
            "client_name": "TEST_Vencida",
            "value_total": 100.00
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "vencida"
        assert data["days_overdue"] >= 10
        print(f"PASS: Status = vencida, days_overdue = {data['days_overdue']}")
        
        auth_session.delete(f"{BASE_URL}/api/invoices/{data['id']}")
    
    def test_status_paga(self, auth_session):
        """Invoice with balance <= 0 = paga"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create invoice
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Paga",
            "value_total": 100.00
        })
        inv_id = response.json()["id"]
        
        # Add full payment
        response = auth_session.post(f"{BASE_URL}/api/invoices/{inv_id}/payment", json={
            "date": today,
            "amount": 100.00,
            "method": "Transferência"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "paga"
        assert data["balance"] <= 0.01
        print("PASS: Status = paga after full payment")
        
        auth_session.delete(f"{BASE_URL}/api/invoices/{inv_id}")
    
    def test_status_parcial(self, auth_session):
        """Invoice with partial payment and due >= today = parcial"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create invoice
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Parcial",
            "value_total": 1000.00
        })
        inv_id = response.json()["id"]
        
        # Add partial payment
        response = auth_session.post(f"{BASE_URL}/api/invoices/{inv_id}/payment", json={
            "date": today,
            "amount": 500.00,
            "method": "MB Way"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "parcial"
        assert data["balance"] == 500.00
        assert data["amount_paid"] == 500.00
        print("PASS: Status = parcial after partial payment")
        
        auth_session.delete(f"{BASE_URL}/api/invoices/{inv_id}")
    
    def test_status_vencida_parcial(self, auth_session):
        """Invoice with partial payment and due < today = vencida_parcial"""
        today = datetime.now().strftime("%Y-%m-%d")
        past_due = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
        
        # Create overdue invoice
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": past_due,
            "due_date": past_due,
            "client_name": "TEST_Vencida_Parcial",
            "value_total": 1000.00
        })
        inv_id = response.json()["id"]
        
        # Add partial payment
        response = auth_session.post(f"{BASE_URL}/api/invoices/{inv_id}/payment", json={
            "date": today,
            "amount": 300.00,
            "method": "Numerário"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "vencida_parcial"
        assert data["balance"] == 700.00
        print("PASS: Status = vencida_parcial for overdue with partial payment")
        
        auth_session.delete(f"{BASE_URL}/api/invoices/{inv_id}")


class TestInvoiceList:
    """Test GET /api/invoices"""
    
    def test_list_invoices(self, auth_session):
        """GET /api/invoices returns list with computed status"""
        response = auth_session.get(f"{BASE_URL}/api/invoices")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "status" in data[0]
            assert "balance" in data[0]
        print(f"PASS: Listed {len(data)} invoices")
    
    def test_list_invoices_filter_status(self, auth_session):
        """GET /api/invoices?status=X filters correctly"""
        response = auth_session.get(f"{BASE_URL}/api/invoices", params={"status": "pendente"})
        assert response.status_code == 200
        data = response.json()
        # All should be pendente or start with pendente
        for inv in data:
            assert inv["status"].startswith("pendente") or inv["status"] == "pendente"
        print(f"PASS: Filtered by status=pendente: {len(data)} invoices")
    
    def test_list_invoices_filter_year(self, auth_session):
        """GET /api/invoices?year=X filters correctly"""
        year = datetime.now().year
        response = auth_session.get(f"{BASE_URL}/api/invoices", params={"year": year})
        assert response.status_code == 200
        data = response.json()
        for inv in data:
            assert inv["issue_date"].startswith(str(year))
        print(f"PASS: Filtered by year={year}: {len(data)} invoices")


class TestInvoicePayments:
    """Test payment endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup_invoice(self, auth_session):
        """Create test invoice"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Payment_Client",
            "value_total": 1230.00
        })
        self.invoice_id = response.json()["id"]
        yield
        auth_session.delete(f"{BASE_URL}/api/invoices/{self.invoice_id}")
    
    def test_add_payment(self, auth_session):
        """POST /api/invoices/{id}/payment adds payment"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = auth_session.post(f"{BASE_URL}/api/invoices/{self.invoice_id}/payment", json={
            "date": today,
            "amount": 500.00,
            "method": "Transferência"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["amount_paid"] == 500.00
        assert data["balance"] == 730.00
        print("PASS: Payment added successfully")
    
    def test_add_multiple_payments(self, auth_session):
        """Multiple payments accumulate correctly"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # First payment
        auth_session.post(f"{BASE_URL}/api/invoices/{self.invoice_id}/payment", json={
            "date": today, "amount": 300.00, "method": "MB Way"
        })
        
        # Second payment
        response = auth_session.post(f"{BASE_URL}/api/invoices/{self.invoice_id}/payment", json={
            "date": today, "amount": 200.00, "method": "Numerário"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["amount_paid"] == 500.00
        assert data["balance"] == 730.00
        print("PASS: Multiple payments accumulated correctly")
    
    def test_payment_zero_rejected(self, auth_session):
        """POST /api/invoices/{id}/payment rejects amount <= 0"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = auth_session.post(f"{BASE_URL}/api/invoices/{self.invoice_id}/payment", json={
            "date": today, "amount": 0, "method": "Test"
        })
        assert response.status_code == 400
        print("PASS: Zero payment rejected")
    
    def test_delete_payment(self, auth_session):
        """DELETE /api/invoices/{id}/payment/{payment_id} removes payment"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Add payment
        response = auth_session.post(f"{BASE_URL}/api/invoices/{self.invoice_id}/payment", json={
            "date": today, "amount": 400.00, "method": "Cheque"
        })
        invoice = response.json()
        payment_id = invoice["payments"][-1]["id"]
        
        # Delete payment
        response = auth_session.delete(f"{BASE_URL}/api/invoices/{self.invoice_id}/payment/{payment_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["amount_paid"] == 0
        assert data["balance"] == 1230.00
        print("PASS: Payment deleted successfully")


class TestInvoiceReminderLog:
    """Test reminder logging"""
    
    def test_log_reminder(self, auth_session):
        """POST /api/invoices/{id}/reminder-log registers reminder"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create invoice
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Reminder_Client",
            "client_phone": "912345678",
            "value_total": 500.00
        })
        inv_id = response.json()["id"]
        
        # Log reminder
        response = auth_session.post(f"{BASE_URL}/api/invoices/{inv_id}/reminder-log")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] == True
        assert data["count"] >= 1
        print(f"PASS: Reminder logged, count = {data['count']}")
        
        # Verify reminder in invoice
        response = auth_session.get(f"{BASE_URL}/api/invoices/{inv_id}")
        invoice = response.json()
        assert len(invoice.get("reminders_sent", [])) >= 1
        assert invoice["reminders_sent"][-1]["method"] == "whatsapp"
        print("PASS: Reminder persisted in invoice")
        
        auth_session.delete(f"{BASE_URL}/api/invoices/{inv_id}")


class TestInvoiceSummary:
    """Test GET /api/invoices/summary"""
    
    def test_summary_structure(self, auth_session):
        """GET /api/invoices/summary returns correct structure"""
        response = auth_session.get(f"{BASE_URL}/api/invoices/summary")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = ["total_emitido", "total_recebido", "total_em_aberto", 
                          "total_vencido", "count_total", "count_pendentes", "count_vencidas"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"PASS: Summary structure correct")
        print(f"  - Total emitido: {data['total_emitido']}")
        print(f"  - Total recebido: {data['total_recebido']}")
        print(f"  - Total em aberto: {data['total_em_aberto']}")
        print(f"  - Total vencido: {data['total_vencido']}")
    
    def test_summary_aggregates_correctly(self, auth_session):
        """Summary aggregates invoices correctly"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create test invoice
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Summary_Client",
            "value_total": 1000.00
        })
        inv_id = response.json()["id"]
        
        # Add partial payment
        auth_session.post(f"{BASE_URL}/api/invoices/{inv_id}/payment", json={
            "date": today, "amount": 400.00, "method": "Test"
        })
        
        # Check summary
        response = auth_session.get(f"{BASE_URL}/api/invoices/summary")
        data = response.json()
        
        # total_emitido should include our 1000
        assert data["total_emitido"] >= 1000
        # total_recebido should include our 400
        assert data["total_recebido"] >= 400
        # total_em_aberto should include our 600
        assert data["total_em_aberto"] >= 600
        
        print("PASS: Summary aggregates correctly")
        
        auth_session.delete(f"{BASE_URL}/api/invoices/{inv_id}")


class TestInvoiceCRUD:
    """Test basic CRUD operations"""
    
    def test_get_single_invoice(self, auth_session):
        """GET /api/invoices/{id} returns invoice"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Get_Client",
            "value_total": 250.00
        })
        inv_id = response.json()["id"]
        
        # Get
        response = auth_session.get(f"{BASE_URL}/api/invoices/{inv_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == inv_id
        assert data["client_name"] == "TEST_Get_Client"
        print("PASS: Get single invoice works")
        
        auth_session.delete(f"{BASE_URL}/api/invoices/{inv_id}")
    
    def test_update_invoice(self, auth_session):
        """PUT /api/invoices/{id} updates invoice"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Update_Client",
            "value_total": 300.00
        })
        inv_id = response.json()["id"]
        
        # Update
        response = auth_session.put(f"{BASE_URL}/api/invoices/{inv_id}", json={
            "client_name": "TEST_Updated_Client",
            "notes": "Updated notes"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["client_name"] == "TEST_Updated_Client"
        assert data["notes"] == "Updated notes"
        print("PASS: Update invoice works")
        
        auth_session.delete(f"{BASE_URL}/api/invoices/{inv_id}")
    
    def test_delete_invoice(self, auth_session):
        """DELETE /api/invoices/{id} deletes invoice"""
        today = datetime.now().strftime("%Y-%m-%d")
        due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Create
        response = auth_session.post(f"{BASE_URL}/api/invoices", json={
            "issue_date": today,
            "due_date": due,
            "client_name": "TEST_Delete_Client",
            "value_total": 100.00
        })
        inv_id = response.json()["id"]
        
        # Delete
        response = auth_session.delete(f"{BASE_URL}/api/invoices/{inv_id}")
        assert response.status_code == 200
        
        # Verify deleted
        response = auth_session.get(f"{BASE_URL}/api/invoices/{inv_id}")
        assert response.status_code == 404
        print("PASS: Delete invoice works")
    
    def test_get_nonexistent_invoice(self, auth_session):
        """GET /api/invoices/{id} returns 404 for nonexistent"""
        response = auth_session.get(f"{BASE_URL}/api/invoices/nonexistent-id-12345")
        assert response.status_code == 404
        print("PASS: Nonexistent invoice returns 404")


# ============================================================
# CLEANUP TEST DATA
# ============================================================

class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_materials(self, auth_session):
        """Remove TEST_ prefixed materials"""
        response = auth_session.get(f"{BASE_URL}/api/materials")
        materials = response.json()
        deleted = 0
        for m in materials:
            if m.get("description", "").startswith("TEST_"):
                auth_session.delete(f"{BASE_URL}/api/materials/{m['id']}")
                deleted += 1
        print(f"PASS: Cleaned up {deleted} test materials")
    
    def test_cleanup_test_invoices(self, auth_session):
        """Remove TEST_ prefixed invoices"""
        response = auth_session.get(f"{BASE_URL}/api/invoices")
        invoices = response.json()
        deleted = 0
        for inv in invoices:
            if inv.get("client_name", "").startswith("TEST_"):
                auth_session.delete(f"{BASE_URL}/api/invoices/{inv['id']}")
                deleted += 1
        print(f"PASS: Cleaned up {deleted} test invoices")
