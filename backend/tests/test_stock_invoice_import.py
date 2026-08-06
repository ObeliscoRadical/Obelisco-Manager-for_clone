"""
Test module for Stock Invoice Import via OCR (Gemini 2.5 Pro).
Tests:
- POST /api/materials/import-invoice/extract - validation (no file, invalid format)
- POST /api/materials/import-invoice/apply - validation and all actions
  - action=create: creates new material with supplier_nif, creates stock_movement type=entrada
  - action=update_stock_only: sums quantity to stock_current, does NOT change purchase_price
  - action=update_stock_and_price: sums stock + updates purchase_price + adds price_history entry
  - action=skip: ignores line
- Summary response with counts
- Preserves supplier/supplier_nif on existing materials
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Get authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


# ============================================================
# EXTRACT ENDPOINT VALIDATION TESTS
# ============================================================

class TestExtractEndpointValidation:
    """Test POST /api/materials/import-invoice/extract validation"""
    
    def test_extract_no_file_returns_422(self, auth_session):
        """POST /api/materials/import-invoice/extract without file returns 422"""
        # Remove Content-Type to allow multipart
        headers = {k: v for k, v in auth_session.headers.items() if k.lower() != 'content-type'}
        response = requests.post(
            f"{BASE_URL}/api/materials/import-invoice/extract",
            headers=headers,
            files={}  # No file
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: No file returns 422")
    
    def test_extract_invalid_format_returns_400(self, auth_session):
        """POST /api/materials/import-invoice/extract with invalid format returns 400"""
        headers = {k: v for k, v in auth_session.headers.items() if k.lower() != 'content-type'}
        
        # Create a fake .txt file
        fake_file = ("invoice.txt", b"This is not a valid invoice file", "text/plain")
        
        response = requests.post(
            f"{BASE_URL}/api/materials/import-invoice/extract",
            headers=headers,
            files={"file": fake_file}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "suportado" in response.json().get("detail", "").lower() or "formato" in response.json().get("detail", "").lower()
        print("PASS: Invalid format returns 400")
    
    def test_extract_invalid_extension_returns_400(self, auth_session):
        """POST /api/materials/import-invoice/extract with .doc returns 400"""
        headers = {k: v for k, v in auth_session.headers.items() if k.lower() != 'content-type'}
        
        fake_file = ("invoice.doc", b"Fake doc content", "application/msword")
        
        response = requests.post(
            f"{BASE_URL}/api/materials/import-invoice/extract",
            headers=headers,
            files={"file": fake_file}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("PASS: .doc extension returns 400")


# ============================================================
# APPLY ENDPOINT VALIDATION TESTS
# ============================================================

class TestApplyEndpointValidation:
    """Test POST /api/materials/import-invoice/apply validation"""
    
    def test_apply_empty_lines_returns_400(self, auth_session):
        """POST /api/materials/import-invoice/apply with empty lines returns 400"""
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Test Supplier",
            "nif": "123456789",
            "invoice_number": "FT 2026/001",
            "date": "2026-01-15",
            "lines": []
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "sem linhas" in response.json().get("detail", "").lower()
        print("PASS: Empty lines returns 400 'Sem linhas para processar'")


# ============================================================
# APPLY ACTION=CREATE TESTS
# ============================================================

class TestApplyActionCreate:
    """Test apply with action=create"""
    
    def test_create_new_material(self, auth_session):
        """action=create creates new material with supplier_nif and stock_movement"""
        unique_desc = f"TEST_Import_Create_{uuid.uuid4().hex[:8]}"
        
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Fornecedor Teste",
            "nif": "999888777",
            "invoice_number": "FT TEST/0001",
            "date": "2026-01-15",
            "lines": [{
                "action": "create",
                "description": unique_desc,
                "quantity": 25,
                "unit_price": 12.50,
                "code": "REF001",
                "brand": "TestBrand",
                "unit": "un",
                "category": "Material Eléctrico",
                "vat_rate": 23
            }]
        })
        assert response.status_code == 200, f"Apply failed: {response.text}"
        data = response.json()
        
        # Check summary
        assert data["ok"] == True
        assert data["summary"]["created"] == 1
        assert data["summary"]["stock_movements"] == 1
        assert len(data["created"]) == 1
        assert data["created"][0]["description"] == unique_desc
        assert data["created"][0]["qty"] == 25
        print(f"PASS: Created material: {data['created'][0]['id']}")
        
        # Verify material in DB
        mat_id = data["created"][0]["id"]
        mat_resp = auth_session.get(f"{BASE_URL}/api/materials")
        materials = mat_resp.json()
        created_mat = next((m for m in materials if m["id"] == mat_id), None)
        
        assert created_mat is not None, "Created material not found in DB"
        assert created_mat["description"] == unique_desc
        assert created_mat["supplier_nif"] == "999888777"
        assert created_mat["supplier"] == "Fornecedor Teste"
        assert created_mat["stock_current"] == 25
        assert created_mat["purchase_price"] == 12.50
        assert created_mat["code"] == "REF001"
        assert created_mat["brand"] == "TestBrand"
        print("PASS: Material persisted with correct supplier_nif and stock")
        
        # Verify stock_movement created
        mov_resp = auth_session.get(f"{BASE_URL}/api/stock/movements", params={"material_id": mat_id})
        movements = mov_resp.json()
        assert len(movements) >= 1
        entrada_mov = next((m for m in movements if m["type"] == "entrada"), None)
        assert entrada_mov is not None, "No entrada movement found"
        assert entrada_mov["quantity"] == 25
        assert "FT TEST/0001" in entrada_mov.get("reason", "") or entrada_mov.get("invoice_number") == "FT TEST/0001"
        print("PASS: stock_movement type=entrada created")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/materials/{mat_id}")


# ============================================================
# APPLY ACTION=UPDATE_STOCK_ONLY TESTS
# ============================================================

class TestApplyActionUpdateStockOnly:
    """Test apply with action=update_stock_only"""
    
    @pytest.fixture(autouse=True)
    def setup_material(self, auth_session):
        """Create test material with supplier_nif via import apply (since materials API doesn't support supplier_nif)"""
        self.unique_desc = f"TEST_Update_Stock_{uuid.uuid4().hex[:8]}"
        
        # Create material via import apply to get supplier_nif set
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Old Supplier",
            "nif": "111222333",
            "invoice_number": "FT SETUP/0001",
            "date": "2026-01-01",
            "lines": [{
                "action": "create",
                "description": self.unique_desc,
                "quantity": 50,
                "unit_price": 10.00,
                "category": "Teste",
                "unit": "un"
            }]
        })
        assert response.status_code == 200, f"Setup failed: {response.text}"
        self.material_id = response.json()["created"][0]["id"]
        yield
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/materials/{self.material_id}")
    
    def test_update_stock_only_sums_quantity(self, auth_session):
        """action=update_stock_only sums quantity to stock_current"""
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "New Supplier",
            "nif": "444555666",
            "invoice_number": "FT TEST/0002",
            "date": "2026-01-16",
            "lines": [{
                "action": "update_stock_only",
                "description": self.unique_desc,
                "quantity": 30,
                "unit_price": 15.00,  # Different price - should NOT be applied
                "existing_material_id": self.material_id
            }]
        })
        assert response.status_code == 200, f"Apply failed: {response.text}"
        data = response.json()
        
        assert data["summary"]["updated_stock"] == 1
        assert data["summary"]["updated_price"] == 0  # Price should NOT be updated
        assert data["summary"]["stock_movements"] == 1
        print("PASS: update_stock_only summary correct")
        
        # Verify material
        mat_resp = auth_session.get(f"{BASE_URL}/api/materials")
        materials = mat_resp.json()
        updated_mat = next((m for m in materials if m["id"] == self.material_id), None)
        
        assert updated_mat["stock_current"] == 80  # 50 + 30
        assert updated_mat["purchase_price"] == 10.00  # Should NOT change
        print(f"PASS: Stock updated 50 -> 80, price unchanged at 10.00")
    
    def test_update_stock_only_preserves_existing_supplier(self, auth_session):
        """action=update_stock_only preserves existing supplier/supplier_nif"""
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Different Supplier",
            "nif": "777888999",
            "invoice_number": "FT TEST/0003",
            "date": "2026-01-17",
            "lines": [{
                "action": "update_stock_only",
                "description": self.unique_desc,
                "quantity": 10,
                "unit_price": 20.00,
                "existing_material_id": self.material_id
            }]
        })
        assert response.status_code == 200
        
        # Verify supplier preserved
        mat_resp = auth_session.get(f"{BASE_URL}/api/materials")
        materials = mat_resp.json()
        updated_mat = next((m for m in materials if m["id"] == self.material_id), None)
        
        # Should keep original supplier since it already had one
        assert updated_mat["supplier"] == "Old Supplier"
        assert updated_mat["supplier_nif"] == "111222333"
        print("PASS: Existing supplier/supplier_nif preserved")


# ============================================================
# APPLY ACTION=UPDATE_STOCK_AND_PRICE TESTS
# ============================================================

class TestApplyActionUpdateStockAndPrice:
    """Test apply with action=update_stock_and_price"""
    
    @pytest.fixture(autouse=True)
    def setup_material(self, auth_session):
        """Create test material"""
        self.unique_desc = f"TEST_Update_Price_{uuid.uuid4().hex[:8]}"
        response = auth_session.post(f"{BASE_URL}/api/materials", json={
            "description": self.unique_desc,
            "category": "Teste",
            "unit": "un",
            "purchase_price": 8.00,
            "stock_current": 100,
            "price_history": [{"price": 8.00, "date": "2025-01-01", "source": "initial"}]
        })
        assert response.status_code == 200
        self.material_id = response.json()["id"]
        yield
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/materials/{self.material_id}")
    
    def test_update_stock_and_price(self, auth_session):
        """action=update_stock_and_price sums stock + updates purchase_price + adds price_history"""
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Price Update Supplier",
            "nif": "555666777",
            "invoice_number": "FT TEST/0004",
            "date": "2026-01-18",
            "lines": [{
                "action": "update_stock_and_price",
                "description": self.unique_desc,
                "quantity": 20,
                "unit_price": 12.00,  # New price
                "existing_material_id": self.material_id
            }]
        })
        assert response.status_code == 200, f"Apply failed: {response.text}"
        data = response.json()
        
        assert data["summary"]["updated_stock"] == 1
        assert data["summary"]["updated_price"] == 1
        assert data["summary"]["stock_movements"] == 1
        
        # Check updated_price details
        assert len(data["updated_price"]) == 1
        assert data["updated_price"][0]["from"] == 8.00
        assert data["updated_price"][0]["to"] == 12.00
        print("PASS: update_stock_and_price summary correct")
        
        # Verify material
        mat_resp = auth_session.get(f"{BASE_URL}/api/materials")
        materials = mat_resp.json()
        updated_mat = next((m for m in materials if m["id"] == self.material_id), None)
        
        assert updated_mat["stock_current"] == 120  # 100 + 20
        assert updated_mat["purchase_price"] == 12.00  # Updated
        print(f"PASS: Stock updated 100 -> 120, price updated 8.00 -> 12.00")
        
        # Verify price_history has new entry with 'previous'
        history = updated_mat.get("price_history", [])
        assert len(history) >= 2, f"Expected at least 2 history entries, got {len(history)}"
        latest = history[-1]
        assert latest["price"] == 12.00
        assert latest.get("previous") == 8.00
        assert "FT TEST/0004" in latest.get("source", "")
        print("PASS: price_history entry added with 'previous' field")
    
    def test_update_populates_empty_supplier(self, auth_session):
        """action=update_stock_and_price populates supplier if material had none"""
        # Create material without supplier
        no_supplier_desc = f"TEST_No_Supplier_{uuid.uuid4().hex[:8]}"
        mat_resp = auth_session.post(f"{BASE_URL}/api/materials", json={
            "description": no_supplier_desc,
            "purchase_price": 5.00,
            "stock_current": 10
        })
        mat_id = mat_resp.json()["id"]
        
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "New Supplier Name",
            "nif": "123123123",
            "invoice_number": "FT TEST/0005",
            "date": "2026-01-19",
            "lines": [{
                "action": "update_stock_and_price",
                "description": no_supplier_desc,
                "quantity": 5,
                "unit_price": 6.00,
                "existing_material_id": mat_id
            }]
        })
        assert response.status_code == 200
        
        # Verify supplier populated
        mat_resp = auth_session.get(f"{BASE_URL}/api/materials")
        materials = mat_resp.json()
        updated_mat = next((m for m in materials if m["id"] == mat_id), None)
        
        assert updated_mat["supplier"] == "New Supplier Name"
        assert updated_mat["supplier_nif"] == "123123123"
        print("PASS: Empty supplier/supplier_nif populated from invoice")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/materials/{mat_id}")


# ============================================================
# APPLY ACTION=SKIP TESTS
# ============================================================

class TestApplyActionSkip:
    """Test apply with action=skip"""
    
    def test_skip_ignores_line(self, auth_session):
        """action=skip ignores the line without error"""
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Skip Test Supplier",
            "nif": "000111222",
            "invoice_number": "FT TEST/0006",
            "date": "2026-01-20",
            "lines": [
                {
                    "action": "skip",
                    "description": "Item to skip",
                    "quantity": 100,
                    "unit_price": 50.00
                },
                {
                    "action": "create",
                    "description": f"TEST_Skip_Create_{uuid.uuid4().hex[:8]}",
                    "quantity": 5,
                    "unit_price": 10.00
                }
            ]
        })
        assert response.status_code == 200, f"Apply failed: {response.text}"
        data = response.json()
        
        assert data["summary"]["skipped"] == 1
        assert data["summary"]["created"] == 1
        assert "Item to skip" in data["skipped"]
        print("PASS: action=skip ignores line correctly")
        
        # Cleanup created material
        if data["created"]:
            auth_session.delete(f"{BASE_URL}/api/materials/{data['created'][0]['id']}")


# ============================================================
# APPLY SUMMARY RESPONSE TESTS
# ============================================================

class TestApplySummaryResponse:
    """Test apply returns correct summary structure"""
    
    def test_summary_has_all_counts(self, auth_session):
        """Apply returns summary with created, updated_stock, updated_price, skipped, stock_movements"""
        unique_desc = f"TEST_Summary_{uuid.uuid4().hex[:8]}"
        
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Summary Test",
            "nif": "333444555",
            "invoice_number": "FT TEST/0007",
            "date": "2026-01-21",
            "lines": [{
                "action": "create",
                "description": unique_desc,
                "quantity": 1,
                "unit_price": 1.00
            }]
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check summary structure
        summary = data["summary"]
        assert "created" in summary
        assert "updated_stock" in summary
        assert "updated_price" in summary
        assert "skipped" in summary
        assert "stock_movements" in summary
        
        assert isinstance(summary["created"], int)
        assert isinstance(summary["updated_stock"], int)
        assert isinstance(summary["updated_price"], int)
        assert isinstance(summary["skipped"], int)
        assert isinstance(summary["stock_movements"], int)
        print("PASS: Summary has all required count fields")
        
        # Cleanup
        if data["created"]:
            auth_session.delete(f"{BASE_URL}/api/materials/{data['created'][0]['id']}")


# ============================================================
# MIXED ACTIONS TEST
# ============================================================

class TestMixedActions:
    """Test apply with multiple different actions"""
    
    def test_mixed_actions_in_single_request(self, auth_session):
        """Apply handles create, update_stock_only, update_stock_and_price, skip in one request"""
        # Create existing materials
        mat1_desc = f"TEST_Mixed_Update1_{uuid.uuid4().hex[:8]}"
        mat2_desc = f"TEST_Mixed_Update2_{uuid.uuid4().hex[:8]}"
        
        mat1_resp = auth_session.post(f"{BASE_URL}/api/materials", json={
            "description": mat1_desc,
            "purchase_price": 5.00,
            "stock_current": 20
        })
        mat1_id = mat1_resp.json()["id"]
        
        mat2_resp = auth_session.post(f"{BASE_URL}/api/materials", json={
            "description": mat2_desc,
            "purchase_price": 10.00,
            "stock_current": 30
        })
        mat2_id = mat2_resp.json()["id"]
        
        new_desc = f"TEST_Mixed_New_{uuid.uuid4().hex[:8]}"
        
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Mixed Test Supplier",
            "nif": "666777888",
            "invoice_number": "FT TEST/0008",
            "date": "2026-01-22",
            "lines": [
                {
                    "action": "create",
                    "description": new_desc,
                    "quantity": 10,
                    "unit_price": 15.00
                },
                {
                    "action": "update_stock_only",
                    "description": mat1_desc,
                    "quantity": 5,
                    "unit_price": 8.00,  # Different price - should NOT apply
                    "existing_material_id": mat1_id
                },
                {
                    "action": "update_stock_and_price",
                    "description": mat2_desc,
                    "quantity": 10,
                    "unit_price": 12.00,  # New price
                    "existing_material_id": mat2_id
                },
                {
                    "action": "skip",
                    "description": "Skipped item",
                    "quantity": 100,
                    "unit_price": 1.00
                }
            ]
        })
        assert response.status_code == 200, f"Apply failed: {response.text}"
        data = response.json()
        
        assert data["summary"]["created"] == 1
        assert data["summary"]["updated_stock"] == 2  # Both update actions count here
        assert data["summary"]["updated_price"] == 1  # Only update_stock_and_price
        assert data["summary"]["skipped"] == 1
        assert data["summary"]["stock_movements"] == 3  # create + 2 updates
        print("PASS: Mixed actions processed correctly")
        
        # Verify materials
        mat_resp = auth_session.get(f"{BASE_URL}/api/materials")
        materials = mat_resp.json()
        
        mat1 = next((m for m in materials if m["id"] == mat1_id), None)
        assert mat1["stock_current"] == 25  # 20 + 5
        assert mat1["purchase_price"] == 5.00  # Unchanged
        
        mat2 = next((m for m in materials if m["id"] == mat2_id), None)
        assert mat2["stock_current"] == 40  # 30 + 10
        assert mat2["purchase_price"] == 12.00  # Updated
        
        print("PASS: All materials updated correctly")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/materials/{mat1_id}")
        auth_session.delete(f"{BASE_URL}/api/materials/{mat2_id}")
        if data["created"]:
            auth_session.delete(f"{BASE_URL}/api/materials/{data['created'][0]['id']}")


# ============================================================
# EDGE CASES
# ============================================================

class TestEdgeCases:
    """Test edge cases"""
    
    def test_update_nonexistent_material_skipped(self, auth_session):
        """update_stock_only with nonexistent material_id is skipped"""
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Edge Test",
            "nif": "999000111",
            "invoice_number": "FT TEST/0009",
            "date": "2026-01-23",
            "lines": [{
                "action": "update_stock_only",
                "description": "Nonexistent material",
                "quantity": 10,
                "unit_price": 5.00,
                "existing_material_id": "nonexistent-id-12345"
            }]
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["summary"]["skipped"] == 1
        assert data["summary"]["updated_stock"] == 0
        assert "já não existe" in str(data["skipped"]).lower() or "nonexistent" in str(data["skipped"]).lower()
        print("PASS: Nonexistent material_id is skipped gracefully")
    
    def test_zero_quantity_skipped(self, auth_session):
        """Lines with quantity <= 0 are skipped"""
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "Zero Qty Test",
            "nif": "888999000",
            "invoice_number": "FT TEST/0010",
            "date": "2026-01-24",
            "lines": [{
                "action": "create",
                "description": "Zero quantity item",
                "quantity": 0,
                "unit_price": 10.00
            }]
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["summary"]["created"] == 0
        assert data["summary"]["skipped"] == 1
        print("PASS: Zero quantity line is skipped")
    
    def test_update_without_material_id_skipped(self, auth_session):
        """update_stock_only without existing_material_id is skipped"""
        response = auth_session.post(f"{BASE_URL}/api/materials/import-invoice/apply", json={
            "supplier": "No ID Test",
            "nif": "777666555",
            "invoice_number": "FT TEST/0011",
            "date": "2026-01-25",
            "lines": [{
                "action": "update_stock_only",
                "description": "No material ID",
                "quantity": 10,
                "unit_price": 5.00,
                "existing_material_id": None
            }]
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["summary"]["skipped"] == 1
        assert data["summary"]["updated_stock"] == 0
        print("PASS: Update without material_id is skipped")


# ============================================================
# CLEANUP
# ============================================================

class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_materials(self, auth_session):
        """Remove TEST_ prefixed materials created during tests"""
        response = auth_session.get(f"{BASE_URL}/api/materials")
        materials = response.json()
        deleted = 0
        for m in materials:
            desc = m.get("description", "")
            if desc.startswith("TEST_Import_") or desc.startswith("TEST_Update_") or \
               desc.startswith("TEST_Skip_") or desc.startswith("TEST_Summary_") or \
               desc.startswith("TEST_Mixed_") or desc.startswith("TEST_No_Supplier"):
                auth_session.delete(f"{BASE_URL}/api/materials/{m['id']}")
                deleted += 1
        print(f"PASS: Cleaned up {deleted} test materials")
