"""
P0 Excel Import Fix Tests - Obelisco Manager
Tests for: Excel import with no header row, unit detection, quantity extraction
Also tests: Categories, Price Lookup, Materials DB, Labor DB
"""
import pytest
import requests
import os
import uuid
from io import BytesIO

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

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


class TestExcelImportP0:
    """P0 BUG FIX: Excel import with no header row - auto-detect columns"""
    
    def test_import_excel_no_header_row(self, auth_session):
        """
        Test importing Excel file with NO header row.
        File structure: col 0 = description, col 1 = unit (un/mt), col 2 = quantity
        Must correctly extract: name (full description), unit, quantity
        """
        from openpyxl import Workbook
        
        # Create test Excel file with NO header row
        wb = Workbook()
        ws = wb.active
        
        # Add items directly (no header)
        test_items = [
            ("Cabo H05VV-F 3G2,5mm para instalacao eletrica", "mt", 50),
            ("Tomada Schuko encastrar branca", "un", 10),
            ("Disjuntor monofasico 16A", "un", 5),
            ("Tubo VD 20mm vara 3m", "un", 8),
            ("Fio H07V-U 2,5mm azul", "mt", 100),
        ]
        
        for item in test_items:
            ws.append(item)
        
        # Save to bytes
        excel_bytes = BytesIO()
        wb.save(excel_bytes)
        excel_bytes.seek(0)
        
        # Upload file
        files = {'file': ('test_no_header.xlsx', excel_bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        response = auth_session.post(f"{BASE_URL}/api/budgets/import-excel", files=files)
        
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        
        # Verify budget created
        assert "id" in data
        assert "items" in data
        assert len(data["items"]) == 5, f"Expected 5 items, got {len(data['items'])}"
        
        # Verify items have correct structure
        for i, item in enumerate(data["items"]):
            assert "name" in item, f"Item {i} missing 'name'"
            assert "unit" in item, f"Item {i} missing 'unit'"
            assert "quantity" in item, f"Item {i} missing 'quantity'"
            
            # Name should be the full description, NOT 'un' or 'mt'
            assert item["name"] not in ("un", "mt", "un.", "mt."), f"Item {i} name is unit token: {item['name']}"
            assert len(item["name"]) > 10, f"Item {i} name too short: {item['name']}"
            
            # Unit should be populated
            assert item["unit"] in ("un", "mt", "un.", "mt.", ""), f"Item {i} unexpected unit: {item['unit']}"
            
            # Quantity should match test data
            expected_qty = test_items[i][2]
            assert item["quantity"] == expected_qty, f"Item {i} quantity mismatch: expected {expected_qty}, got {item['quantity']}"
        
        # Verify first item specifically
        assert "Cabo H05VV-F" in data["items"][0]["name"]
        assert data["items"][0]["unit"] == "mt"
        assert data["items"][0]["quantity"] == 50
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")
    
    def test_import_real_user_file(self, auth_session):
        """
        Test importing the actual user's file at /tmp/mapa.xlsx
        Should return 164 items with proper names, units, quantities
        """
        # Check if file exists
        if not os.path.exists('/tmp/mapa.xlsx'):
            pytest.skip("User's test file /tmp/mapa.xlsx not found")
        
        with open('/tmp/mapa.xlsx', 'rb') as f:
            files = {'file': ('mapa.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            response = auth_session.post(f"{BASE_URL}/api/budgets/import-excel", files=files)
        
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        
        # Verify budget created
        assert "id" in data
        assert "items" in data
        
        # Should have ~164 items (user's file)
        item_count = len(data["items"])
        assert item_count >= 100, f"Expected ~164 items, got {item_count}"
        
        # Verify items have proper names (not unit tokens)
        unit_token_names = 0
        short_names = 0
        for item in data["items"]:
            if item["name"].lower() in ("un", "mt", "un.", "mt.", "vg", "ml"):
                unit_token_names += 1
            if len(item["name"]) < 5:
                short_names += 1
        
        assert unit_token_names == 0, f"Found {unit_token_names} items with unit token as name"
        assert short_names < 5, f"Found {short_names} items with very short names"
        
        # Verify quantities are not all 1
        quantities = [item["quantity"] for item in data["items"]]
        unique_quantities = set(quantities)
        assert len(unique_quantities) > 1, f"All quantities are the same: {unique_quantities}"
        
        # Verify some items have unit field populated
        items_with_unit = [item for item in data["items"] if item.get("unit")]
        assert len(items_with_unit) > 0, "No items have unit field populated"
        
        print(f"Imported {item_count} items successfully")
        print(f"Items with unit: {len(items_with_unit)}")
        print(f"Unique quantities: {unique_quantities}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")
    
    def test_import_excel_with_header_row(self, auth_session):
        """Test importing Excel file WITH header row (regression test)"""
        from openpyxl import Workbook
        
        wb = Workbook()
        ws = wb.active
        
        # Add header row
        ws.append(["Descricao", "Unidade", "Quantidade", "Preco"])
        
        # Add items
        ws.append(["Cabo eletrico 3G2,5mm", "mt", 25, 2.50])
        ws.append(["Tomada dupla", "un", 4, 8.00])
        ws.append(["Quadro eletrico 12 modulos", "un", 1, 45.00])
        
        excel_bytes = BytesIO()
        wb.save(excel_bytes)
        excel_bytes.seek(0)
        
        files = {'file': ('test_with_header.xlsx', excel_bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        response = auth_session.post(f"{BASE_URL}/api/budgets/import-excel", files=files)
        
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        
        assert len(data["items"]) == 3
        
        # Verify first item
        assert "Cabo eletrico" in data["items"][0]["name"]
        assert data["items"][0]["quantity"] == 25
        assert data["items"][0]["unit_cost"] == 2.50
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")


class TestCategories:
    """Categories endpoint tests"""
    
    def test_get_categories(self, auth_session):
        """Test getting all categories"""
        response = auth_session.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) > 0, "No categories returned"
        
        # Verify category structure
        for cat in data:
            assert "id" in cat
            assert "name" in cat
            assert "items" in cat
            assert isinstance(cat["items"], list)
        
        # Check for expected categories
        cat_names = [c["name"] for c in data]
        assert "Cabos e Fios" in cat_names or any("Cabo" in n for n in cat_names)
    
    def test_save_custom_item(self, auth_session):
        """Test saving a custom item to a category"""
        payload = {
            "category": "Cabos e Fios",
            "name": f"TEST_Custom_Cable_{uuid.uuid4().hex[:8]}",
            "unit_cost": 15.50,
            "unit": "mt"
        }
        response = auth_session.post(f"{BASE_URL}/api/categories/save-item", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert "message" in data
        assert data.get("new") == True or "atualizado" in data.get("message", "").lower() or "guardado" in data.get("message", "").lower()


class TestPriceLookup:
    """Price lookup endpoint tests (uses LLM)"""
    
    def test_price_lookup_basic(self, auth_session):
        """Test price lookup for a common electrical item"""
        payload = {"item_name": "Tomada Schuko encastrar branca"}
        response = auth_session.post(f"{BASE_URL}/api/price-lookup", json=payload)
        
        assert response.status_code == 200, f"Price lookup failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "item_name" in data
        assert "price" in data
        assert "margin" in data
        assert "install_cost" in data
        
        # Price should be a number (may be 0 if LLM couldn't estimate)
        assert isinstance(data["price"], (int, float))
        assert isinstance(data["margin"], (int, float))
        
        print(f"Price lookup result: {data}")
    
    def test_price_lookup_cable(self, auth_session):
        """Test price lookup for cable (per meter)"""
        payload = {"item_name": "Cabo H05VV-F 3G2,5mm"}
        response = auth_session.post(f"{BASE_URL}/api/price-lookup", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "price" in data
        assert "unit" in data
        print(f"Cable price: {data}")


class TestMaterialsDB:
    """Materials database CRUD tests"""
    
    def test_get_materials(self, auth_session):
        """Test getting all materials"""
        response = auth_session.get(f"{BASE_URL}/api/materials")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_materials_crud(self, auth_session):
        """Test full CRUD for materials"""
        # CREATE
        create_payload = {
            "code": f"TEST_{uuid.uuid4().hex[:6]}",
            "description": f"TEST_Material_{uuid.uuid4().hex[:8]}",
            "category": "Cabos e Fios",
            "unit": "mt",
            "purchase_price": 2.50,
            "market_price": 3.00,
            "waste_pct": 5,
            "active": True
        }
        create_resp = auth_session.post(f"{BASE_URL}/api/materials", json=create_payload)
        assert create_resp.status_code == 200, f"Create material failed: {create_resp.text}"
        material = create_resp.json()
        mat_id = material["id"]
        
        assert material["description"] == create_payload["description"]
        assert material["purchase_price"] == 2.50
        
        # UPDATE
        update_payload = {**create_payload, "purchase_price": 3.00}
        update_resp = auth_session.put(f"{BASE_URL}/api/materials/{mat_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["purchase_price"] == 3.00
        
        # DELETE
        delete_resp = auth_session.delete(f"{BASE_URL}/api/materials/{mat_id}")
        assert delete_resp.status_code == 200


class TestLaborDB:
    """Labor database CRUD tests"""
    
    def test_get_labor(self, auth_session):
        """Test getting all labor types"""
        response = auth_session.get(f"{BASE_URL}/api/labor")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_labor_crud(self, auth_session):
        """Test full CRUD for labor"""
        # CREATE
        create_payload = {
            "type": f"test_tech_{uuid.uuid4().hex[:6]}",
            "description": "TEST Technician",
            "cost_hour": 20.0,
            "sell_hour": 45.0,
            "charges": "SS+seguro",
            "notes": "Test labor type"
        }
        create_resp = auth_session.post(f"{BASE_URL}/api/labor", json=create_payload)
        assert create_resp.status_code == 200, f"Create labor failed: {create_resp.text}"
        labor = create_resp.json()
        labor_id = labor["id"]
        
        assert labor["type"] == create_payload["type"]
        assert labor["cost_hour"] == 20.0
        
        # UPDATE
        update_payload = {**create_payload, "cost_hour": 25.0}
        update_resp = auth_session.put(f"{BASE_URL}/api/labor/{labor_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["cost_hour"] == 25.0
        
        # DELETE
        delete_resp = auth_session.delete(f"{BASE_URL}/api/labor/{labor_id}")
        assert delete_resp.status_code == 200


class TestSystemSettings:
    """System settings tests"""
    
    def test_get_system_settings(self, auth_session):
        """Test getting system settings"""
        response = auth_session.get(f"{BASE_URL}/api/system-settings")
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected fields
        assert "iva_rate" in data
        assert "min_margin" in data
        assert "target_margin" in data
        assert "indirect_costs" in data
        assert "company_info" in data


class TestProposalSettings:
    """Proposal settings tests"""
    
    def test_get_proposal_settings(self, auth_session):
        """Test getting proposal settings"""
        response = auth_session.get(f"{BASE_URL}/api/proposal-settings")
        assert response.status_code == 200
        data = response.json()
        
        assert "payment_methods" in data
        assert "validity_days" in data
        assert "warranty_text" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
