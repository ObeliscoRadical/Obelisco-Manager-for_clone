"""
Test suite for Expenses/Costs module (Despesas)
Tests:
- GET /api/expenses/categories - returns 13 PT expense categories
- POST /api/expenses - create manual expense with auto-compute gross
- GET /api/expenses - list with filters (month, year, category, type, obra_id)
- PUT /api/expenses/{id} - update expense fields
- DELETE /api/expenses/{id} - delete expense
- GET /api/expenses/summary - yearly summary with aggregations
- POST /api/expenses/extract - upload file for AI extraction (structure test)
- GET /api/expenses/file/{filename} - serve uploaded invoice file
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Expected 13 PT expense categories
EXPECTED_CATEGORIES = [
    "Combustível", "Material", "Fornecedor", "Serviços", "Comunicações",
    "Rendas", "Seguros", "Contabilidade/Advogado", "Ferramentas", "Viatura",
    "Alimentação", "Imposto/Taxa", "Outros"
]


class TestExpensesCategories:
    """Test GET /api/expenses/categories endpoint"""
    
    def test_categories_requires_auth(self, api_client):
        """Categories endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/expenses/categories")
        assert response.status_code == 401
        print("PASS: Categories endpoint requires auth")
    
    def test_categories_returns_13_items(self, authenticated_client):
        """Should return exactly 13 PT expense categories"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses/categories")
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        assert len(categories) == 13, f"Expected 13 categories, got {len(categories)}"
        print(f"PASS: Returns {len(categories)} categories")
    
    def test_categories_contains_expected_values(self, authenticated_client):
        """Should contain all expected PT categories"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses/categories")
        categories = response.json()
        for expected in EXPECTED_CATEGORIES:
            assert expected in categories, f"Missing category: {expected}"
        print("PASS: All 13 expected categories present")


class TestExpensesCRUD:
    """Test CRUD operations for expenses"""
    
    def test_create_expense_manual(self, authenticated_client):
        """Create expense with manual values"""
        payload = {
            "date": "2026-01-15",
            "supplier": "TEST_Fornecedor ABC",
            "nif": "123456789",
            "invoice_number": "FT2026/001",
            "category": "Material",
            "type": "variavel",
            "value_net": 100.0,
            "vat_rate": 23,
            "vat_amount": 23.0,
            "value_gross": 123.0,
            "payment_method": "Transferência",
            "notes": "Test expense"
        }
        response = authenticated_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["supplier"] == "TEST_Fornecedor ABC"
        assert data["value_gross"] == 123.0
        assert data["category"] == "Material"
        print(f"PASS: Created expense with id={data['id']}")
        return data["id"]
    
    def test_create_expense_auto_compute_gross(self, authenticated_client):
        """Create expense with auto-computed gross from net+rate"""
        payload = {
            "date": "2026-01-16",
            "supplier": "TEST_Auto Compute",
            "category": "Serviços",
            "type": "fixo",
            "value_net": 100.0,
            "vat_rate": 23,
            # value_gross not provided - should be auto-computed
        }
        response = authenticated_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert response.status_code == 200
        data = response.json()
        # 100 * 1.23 = 123
        assert data["value_gross"] == 123.0, f"Expected 123.0, got {data['value_gross']}"
        assert data["vat_amount"] == 23.0, f"Expected 23.0, got {data['vat_amount']}"
        print(f"PASS: Auto-computed gross={data['value_gross']}, vat={data['vat_amount']}")
        return data["id"]
    
    def test_create_expense_obra_type(self, authenticated_client):
        """Create expense with type='obra' and obra_id"""
        payload = {
            "date": "2026-01-17",
            "supplier": "TEST_Obra Expense",
            "category": "Material",
            "type": "obra",
            "obra_id": "test-obra-123",
            "obra_name": "Obra Teste",
            "value_net": 500.0,
            "vat_rate": 23,
            "value_gross": 615.0
        }
        response = authenticated_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "obra"
        assert data["obra_id"] == "test-obra-123"
        print(f"PASS: Created obra expense with obra_id={data['obra_id']}")
        return data["id"]
    
    def test_list_expenses_no_filter(self, authenticated_client):
        """List all expenses without filters"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: Listed {len(data)} expenses")
    
    def test_list_expenses_filter_year(self, authenticated_client):
        """List expenses filtered by year"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses", params={"year": 2026})
        assert response.status_code == 200
        data = response.json()
        for exp in data:
            assert exp["date"].startswith("2026"), f"Date {exp['date']} not in 2026"
        print(f"PASS: Year filter returned {len(data)} expenses")
    
    def test_list_expenses_filter_month_year(self, authenticated_client):
        """List expenses filtered by month and year"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses", params={"year": 2026, "month": 1})
        assert response.status_code == 200
        data = response.json()
        for exp in data:
            assert exp["date"].startswith("2026-01"), f"Date {exp['date']} not in 2026-01"
        print(f"PASS: Month+Year filter returned {len(data)} expenses")
    
    def test_list_expenses_filter_category(self, authenticated_client):
        """List expenses filtered by category"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses", params={"category": "Material"})
        assert response.status_code == 200
        data = response.json()
        for exp in data:
            assert exp["category"] == "Material"
        print(f"PASS: Category filter returned {len(data)} expenses")
    
    def test_list_expenses_filter_type(self, authenticated_client):
        """List expenses filtered by type"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses", params={"type": "fixo"})
        assert response.status_code == 200
        data = response.json()
        for exp in data:
            assert exp["type"] == "fixo"
        print(f"PASS: Type filter returned {len(data)} expenses")
    
    def test_get_single_expense(self, authenticated_client):
        """Get a single expense by ID"""
        # First create one
        payload = {"date": "2026-01-18", "supplier": "TEST_Single", "value_gross": 50.0, "category": "Outros"}
        create_resp = authenticated_client.post(f"{BASE_URL}/api/expenses", json=payload)
        expense_id = create_resp.json()["id"]
        
        # Get it
        response = authenticated_client.get(f"{BASE_URL}/api/expenses/{expense_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == expense_id
        assert data["supplier"] == "TEST_Single"
        print(f"PASS: Retrieved expense {expense_id}")
    
    def test_get_nonexistent_expense(self, authenticated_client):
        """Get non-existent expense returns 404"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses/nonexistent-id-12345")
        assert response.status_code == 404
        print("PASS: Non-existent expense returns 404")
    
    def test_update_expense(self, authenticated_client):
        """Update expense fields"""
        # Create
        payload = {"date": "2026-01-19", "supplier": "TEST_Update", "value_gross": 100.0, "category": "Outros"}
        create_resp = authenticated_client.post(f"{BASE_URL}/api/expenses", json=payload)
        expense_id = create_resp.json()["id"]
        
        # Update
        update_payload = {"supplier": "TEST_Updated Supplier", "value_gross": 150.0}
        response = authenticated_client.put(f"{BASE_URL}/api/expenses/{expense_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["supplier"] == "TEST_Updated Supplier"
        assert data["value_gross"] == 150.0
        
        # Verify persistence
        get_resp = authenticated_client.get(f"{BASE_URL}/api/expenses/{expense_id}")
        assert get_resp.json()["supplier"] == "TEST_Updated Supplier"
        print(f"PASS: Updated expense {expense_id}")
    
    def test_update_nonexistent_expense(self, authenticated_client):
        """Update non-existent expense returns 404"""
        response = authenticated_client.put(
            f"{BASE_URL}/api/expenses/nonexistent-id-12345",
            json={"supplier": "Test"}
        )
        assert response.status_code == 404
        print("PASS: Update non-existent returns 404")
    
    def test_delete_expense(self, authenticated_client):
        """Delete expense"""
        # Create
        payload = {"date": "2026-01-20", "supplier": "TEST_Delete", "value_gross": 75.0, "category": "Outros"}
        create_resp = authenticated_client.post(f"{BASE_URL}/api/expenses", json=payload)
        expense_id = create_resp.json()["id"]
        
        # Delete
        response = authenticated_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
        assert response.status_code == 200
        assert response.json().get("ok") == True
        
        # Verify deleted
        get_resp = authenticated_client.get(f"{BASE_URL}/api/expenses/{expense_id}")
        assert get_resp.status_code == 404
        print(f"PASS: Deleted expense {expense_id}")
    
    def test_delete_nonexistent_expense(self, authenticated_client):
        """Delete non-existent expense returns 404"""
        response = authenticated_client.delete(f"{BASE_URL}/api/expenses/nonexistent-id-12345")
        assert response.status_code == 404
        print("PASS: Delete non-existent returns 404")


class TestExpensesSummary:
    """Test GET /api/expenses/summary endpoint"""
    
    def test_summary_requires_auth(self, api_client):
        """Summary endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/expenses/summary")
        assert response.status_code == 401
        print("PASS: Summary requires auth")
    
    def test_summary_returns_structure(self, authenticated_client):
        """Summary returns expected structure"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses/summary", params={"year": 2026})
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "year" in data
        assert "total_year" in data
        assert "total_iva" in data
        assert "current_month_total" in data
        assert "count" in data
        assert "by_month" in data
        assert "by_category" in data
        assert "by_type" in data
        assert "by_obra" in data
        
        # Check by_month has 12 entries
        assert len(data["by_month"]) == 12
        
        # Check by_type has expected keys
        assert "fixo" in data["by_type"]
        assert "variavel" in data["by_type"]
        assert "obra" in data["by_type"]
        
        print(f"PASS: Summary structure correct - year={data['year']}, total={data['total_year']}, count={data['count']}")
    
    def test_summary_aggregates_correctly(self, authenticated_client):
        """Summary aggregates expenses correctly"""
        # Create test expenses
        expenses_to_create = [
            {"date": "2026-02-01", "supplier": "TEST_Sum1", "category": "Material", "type": "fixo", "value_gross": 100.0, "vat_amount": 18.70},
            {"date": "2026-02-15", "supplier": "TEST_Sum2", "category": "Serviços", "type": "variavel", "value_gross": 200.0, "vat_amount": 37.40},
            {"date": "2026-02-20", "supplier": "TEST_Sum3", "category": "Material", "type": "obra", "obra_id": "test-obra", "obra_name": "Obra Test", "value_gross": 300.0, "vat_amount": 56.10},
        ]
        
        created_ids = []
        for exp in expenses_to_create:
            resp = authenticated_client.post(f"{BASE_URL}/api/expenses", json=exp)
            assert resp.status_code == 200
            created_ids.append(resp.json()["id"])
        
        # Get summary
        response = authenticated_client.get(f"{BASE_URL}/api/expenses/summary", params={"year": 2026})
        data = response.json()
        
        # Verify aggregations include our test data
        assert data["total_year"] >= 600.0, f"Total year should be >= 600, got {data['total_year']}"
        assert data["by_month"].get("2", 0) >= 600.0 or data["by_month"].get(2, 0) >= 600.0
        assert data["by_category"].get("Material", 0) >= 400.0
        assert data["by_type"].get("fixo", 0) >= 100.0
        assert data["by_type"].get("variavel", 0) >= 200.0
        assert data["by_type"].get("obra", 0) >= 300.0
        
        print(f"PASS: Summary aggregations correct - total={data['total_year']}, iva={data['total_iva']}")
        
        # Cleanup
        for exp_id in created_ids:
            authenticated_client.delete(f"{BASE_URL}/api/expenses/{exp_id}")


class TestExpensesExtract:
    """Test POST /api/expenses/extract endpoint (AI invoice extraction)"""
    
    def test_extract_requires_auth(self, api_client):
        """Extract endpoint requires authentication"""
        # Create a minimal file to send
        files = {"file": ("test.pdf", b"%PDF-1.4", "application/pdf")}
        response = requests.post(f"{BASE_URL}/api/expenses/extract", files=files)
        assert response.status_code == 401
        print("PASS: Extract requires auth")
    
    def test_extract_rejects_unsupported_format(self, auth_token):
        """Extract rejects non-PDF/image files"""
        # Use a fresh session for file upload (no Content-Type header)
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {auth_token}"})
        files = {"file": ("test.txt", b"This is a text file", "text/plain")}
        response = session.post(f"{BASE_URL}/api/expenses/extract", files=files)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        detail = response.json().get("detail", "").lower()
        assert "suportado" in detail or "formato" in detail
        print("PASS: Rejects unsupported file format")
    
    def test_extract_rejects_doc_format(self, auth_token):
        """Extract rejects .doc files"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {auth_token}"})
        files = {"file": ("test.doc", b"Fake doc content", "application/msword")}
        response = session.post(f"{BASE_URL}/api/expenses/extract", files=files)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("PASS: Rejects .doc format")
    
    def test_extract_accepts_pdf_returns_structure(self, auth_token):
        """Extract accepts PDF and returns expected structure"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {auth_token}"})
        # Create a minimal PDF-like content
        pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        files = {"file": ("test_invoice.pdf", pdf_content, "application/pdf")}
        response = session.post(f"{BASE_URL}/api/expenses/extract", files=files)
        
        # Should accept the file (200) even if AI extraction fails
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check structure
        assert "file_name" in data
        assert "original_name" in data
        assert "file_size" in data
        assert "extracted" in data
        
        # extracted should have either data or error
        extracted = data["extracted"]
        if "error" in extracted:
            print(f"PASS: PDF accepted, AI returned error (expected): {extracted['error'][:50]}...")
        else:
            # If AI worked, check fields
            expected_fields = ["supplier", "nif", "invoice_number", "date", "value_net", "vat_rate", "vat_amount", "value_gross", "category"]
            for field in expected_fields:
                assert field in extracted, f"Missing field: {field}"
            print(f"PASS: PDF accepted, AI extracted data successfully")
    
    def test_extract_accepts_jpg(self, auth_token):
        """Extract accepts JPG images"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {auth_token}"})
        # Minimal JPEG header
        jpg_content = bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00])
        files = {"file": ("invoice.jpg", jpg_content, "image/jpeg")}
        response = session.post(f"{BASE_URL}/api/expenses/extract", files=files)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: JPG accepted")
    
    def test_extract_accepts_png(self, auth_token):
        """Extract accepts PNG images"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {auth_token}"})
        # Minimal PNG header
        png_content = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        files = {"file": ("invoice.png", png_content, "image/png")}
        response = session.post(f"{BASE_URL}/api/expenses/extract", files=files)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: PNG accepted")


class TestExpensesFileServing:
    """Test GET /api/expenses/file/{filename} endpoint"""
    
    def test_file_requires_auth(self, api_client):
        """File serving requires authentication"""
        response = requests.get(f"{BASE_URL}/api/expenses/file/test.pdf")
        assert response.status_code == 401
        print("PASS: File serving requires auth")
    
    def test_file_nonexistent_returns_404(self, authenticated_client):
        """Non-existent file returns 404"""
        response = authenticated_client.get(f"{BASE_URL}/api/expenses/file/nonexistent-file-12345.pdf")
        assert response.status_code == 404
        print("PASS: Non-existent file returns 404")


class TestExpensesRegression:
    """Regression tests to ensure existing functionality still works"""
    
    def test_budgets_still_work(self, authenticated_client):
        """Budgets endpoint still works"""
        response = authenticated_client.get(f"{BASE_URL}/api/budgets")
        assert response.status_code == 200
        print("PASS: Budgets endpoint works")
    
    def test_proposals_still_work(self, authenticated_client):
        """Proposals endpoint still works"""
        response = authenticated_client.get(f"{BASE_URL}/api/proposals")
        assert response.status_code == 200
        print("PASS: Proposals endpoint works")
    
    def test_works_still_work(self, authenticated_client):
        """Works endpoint still works"""
        response = authenticated_client.get(f"{BASE_URL}/api/works")
        assert response.status_code == 200
        print("PASS: Works endpoint works")
    
    def test_payroll_summary_still_works(self, authenticated_client):
        """Payroll summary endpoint still works"""
        response = authenticated_client.get(f"{BASE_URL}/api/payroll/summary")
        assert response.status_code == 200
        print("PASS: Payroll summary works")


# Fixtures
@pytest.fixture
def api_client():
    """Shared requests session without auth"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@obelisco.pt",
        "password": "obelisco2024"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_expenses():
    """Cleanup TEST_ prefixed expenses after all tests"""
    yield
    # Cleanup after tests
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@obelisco.pt",
        "password": "obelisco2024"
    })
    if login_resp.status_code == 200:
        token = login_resp.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        # Get all expenses and delete TEST_ ones
        expenses_resp = session.get(f"{BASE_URL}/api/expenses")
        if expenses_resp.status_code == 200:
            for exp in expenses_resp.json():
                if exp.get("supplier", "").startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/expenses/{exp['id']}")
