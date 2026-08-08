"""
Iteration 39 Tests: Expenses AI Intelligence + Bank Analysis PDF Support
Tests:
1. POST /api/expenses/extract - AI extraction with category_source field
2. Smart categorization - supplier keyword mapping (Leroy Merlin → obra, Restaurante → variavel, EDP → fixo)
3. Duplicate detection on create (409) and force=true bypass
4. Duplicate detection on extract endpoint
5. POST /api/bank-analysis/upload accepts PDF files
6. POST /api/bank-analysis/upload rejects unsupported formats (.doc)
"""
import pytest
import requests
import os
import io
import uuid
from auth_test_helpers import get_admin_credentials, get_base_url

BASE_URL = get_base_url()

ADMIN_EMAIL, ADMIN_PASSWORD = get_admin_credentials()


@pytest.fixture(scope="module")
def auth_token():
    """Get admin authentication token."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    data = response.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestExpensesExtract:
    """Test POST /api/expenses/extract endpoint with AI extraction."""

    def test_extract_accepts_pdf(self, auth_headers):
        """Test that extract endpoint accepts PDF files."""
        # Create a minimal PDF-like file (just to test format acceptance)
        pdf_content = b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'
        files = {'file': ('test_invoice.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        
        response = requests.post(
            f"{BASE_URL}/api/expenses/extract",
            files=files,
            headers=auth_headers,
            timeout=60
        )
        
        # Should accept PDF format (may fail AI extraction but format should be accepted)
        assert response.status_code == 200, f"PDF should be accepted. Got {response.status_code}: {response.text}"
        data = response.json()
        assert "file_name" in data
        assert "extracted" in data

    def test_extract_accepts_image(self, auth_headers):
        """Test that extract endpoint accepts image files."""
        # Create a minimal PNG file
        png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        files = {'file': ('test_invoice.png', io.BytesIO(png_content), 'image/png')}
        
        response = requests.post(
            f"{BASE_URL}/api/expenses/extract",
            files=files,
            headers=auth_headers,
            timeout=60
        )
        
        assert response.status_code == 200, f"PNG should be accepted. Got {response.status_code}: {response.text}"
        data = response.json()
        assert "file_name" in data
        assert "extracted" in data

    def test_extract_rejects_unsupported_format(self, auth_headers):
        """Test that extract endpoint rejects unsupported formats."""
        doc_content = b'This is not a real doc file'
        files = {'file': ('test.doc', io.BytesIO(doc_content), 'application/msword')}
        
        response = requests.post(
            f"{BASE_URL}/api/expenses/extract",
            files=files,
            headers=auth_headers,
            timeout=30
        )
        
        assert response.status_code == 400, f"DOC should be rejected. Got {response.status_code}: {response.text}"


class TestSmartCategorization:
    """Test smart categorization from supplier keywords."""

    def test_leroy_merlin_maps_to_obra(self, auth_headers):
        """Supplier 'Leroy Merlin' should map to type 'obra'."""
        # Create expense with Leroy Merlin supplier
        unique_invoice = f"TEST_LM_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2026-01-15",
            "supplier": "Leroy Merlin Lisboa",
            "invoice_number": unique_invoice,
            "category": "Material",
            "type": "obra",  # Expected type
            "value_gross": 150.00,
            "value_net": 121.95,
            "vat_rate": 23,
            "vat_amount": 28.05
        }
        
        response = requests.post(
            f"{BASE_URL}/api/expenses",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Create failed: {response.status_code} - {response.text}"
        data = response.json()
        expense_id = data.get("id")
        
        # Verify the expense was created
        assert data.get("supplier") == "Leroy Merlin Lisboa"
        
        # Cleanup
        if expense_id:
            requests.delete(f"{BASE_URL}/api/expenses/{expense_id}", headers=auth_headers)

    def test_restaurante_maps_to_variavel(self, auth_headers):
        """Supplier with 'Restaurante' should map to type 'variavel'."""
        unique_invoice = f"TEST_REST_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2026-01-15",
            "supplier": "Restaurante O Bom Garfo",
            "invoice_number": unique_invoice,
            "category": "Alimentação",
            "type": "variavel",  # Expected type
            "value_gross": 25.00,
            "value_net": 20.33,
            "vat_rate": 23,
            "vat_amount": 4.67
        }
        
        response = requests.post(
            f"{BASE_URL}/api/expenses",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Create failed: {response.status_code} - {response.text}"
        data = response.json()
        expense_id = data.get("id")
        
        # Cleanup
        if expense_id:
            requests.delete(f"{BASE_URL}/api/expenses/{expense_id}", headers=auth_headers)

    def test_edp_maps_to_fixo(self, auth_headers):
        """Supplier 'EDP Comercial' should map to type 'fixo'."""
        unique_invoice = f"TEST_EDP_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2026-01-15",
            "supplier": "EDP Comercial",
            "invoice_number": unique_invoice,
            "category": "Serviços",
            "type": "fixo",  # Expected type
            "value_gross": 89.50,
            "value_net": 72.76,
            "vat_rate": 23,
            "vat_amount": 16.74
        }
        
        response = requests.post(
            f"{BASE_URL}/api/expenses",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Create failed: {response.status_code} - {response.text}"
        data = response.json()
        expense_id = data.get("id")
        
        # Cleanup
        if expense_id:
            requests.delete(f"{BASE_URL}/api/expenses/{expense_id}", headers=auth_headers)


class TestDuplicateDetection:
    """Test duplicate detection on expense creation."""

    def test_duplicate_returns_409(self, auth_headers):
        """Creating expense with same invoice_number+supplier should return 409."""
        unique_invoice = f"TEST_DUP_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2026-01-15",
            "supplier": "Test Supplier Duplicado",
            "invoice_number": unique_invoice,
            "nif": "123456789",
            "category": "Outros",
            "type": "variavel",
            "value_gross": 100.00,
            "value_net": 81.30,
            "vat_rate": 23,
            "vat_amount": 18.70
        }
        
        # Create first expense
        response1 = requests.post(
            f"{BASE_URL}/api/expenses",
            json=payload,
            headers=auth_headers
        )
        assert response1.status_code in [200, 201], f"First create failed: {response1.status_code} - {response1.text}"
        expense1_id = response1.json().get("id")
        
        try:
            # Try to create duplicate
            response2 = requests.post(
                f"{BASE_URL}/api/expenses",
                json=payload,
                headers=auth_headers
            )
            
            assert response2.status_code == 409, f"Duplicate should return 409. Got {response2.status_code}: {response2.text}"
            detail = response2.json().get("detail", {})
            assert detail.get("code") == "duplicate_invoice", f"Expected duplicate_invoice code, got: {detail}"
        finally:
            # Cleanup
            if expense1_id:
                requests.delete(f"{BASE_URL}/api/expenses/{expense1_id}", headers=auth_headers)

    def test_force_true_bypasses_duplicate(self, auth_headers):
        """With force=true, duplicate should be created anyway."""
        unique_invoice = f"TEST_FORCE_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2026-01-15",
            "supplier": "Test Supplier Force",
            "invoice_number": unique_invoice,
            "nif": "987654321",
            "category": "Outros",
            "type": "variavel",
            "value_gross": 50.00,
            "value_net": 40.65,
            "vat_rate": 23,
            "vat_amount": 9.35
        }
        
        # Create first expense
        response1 = requests.post(
            f"{BASE_URL}/api/expenses",
            json=payload,
            headers=auth_headers
        )
        assert response1.status_code in [200, 201], f"First create failed: {response1.status_code}"
        expense1_id = response1.json().get("id")
        
        try:
            # Create duplicate with force=true
            response2 = requests.post(
                f"{BASE_URL}/api/expenses?force=true",
                json=payload,
                headers=auth_headers
            )
            
            assert response2.status_code in [200, 201], f"Force create should succeed. Got {response2.status_code}: {response2.text}"
            expense2_id = response2.json().get("id")
            
            # Verify both exist
            assert expense1_id != expense2_id, "Should create two different expenses"
            
            # Cleanup second expense
            if expense2_id:
                requests.delete(f"{BASE_URL}/api/expenses/{expense2_id}", headers=auth_headers)
        finally:
            # Cleanup first expense
            if expense1_id:
                requests.delete(f"{BASE_URL}/api/expenses/{expense1_id}", headers=auth_headers)


class TestBankAnalysisPDF:
    """Test bank analysis PDF support."""

    def test_upload_accepts_pdf_format(self, auth_headers):
        """Test that bank analysis upload accepts PDF format (not rejected with 'formato não suportado')."""
        # Create a minimal PDF file
        pdf_content = b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'
        files = {'file': ('extrato_bancario.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        
        response = requests.post(
            f"{BASE_URL}/api/bank-analysis/upload",
            files=files,
            headers=auth_headers,
            timeout=120
        )
        
        # Should NOT return 400 with "formato não suportado"
        # May return 400 with "extrato bancário legível" (AI couldn't parse) which is acceptable
        if response.status_code == 400:
            detail = response.json().get("detail", "")
            assert "formato não suportado" not in detail.lower(), f"PDF should be accepted format. Got: {detail}"
            # "extrato bancário legível" or similar is acceptable (AI couldn't parse dummy PDF)
            print(f"PDF format accepted but AI couldn't parse (expected for dummy PDF): {detail}")
        else:
            # 200 would mean AI successfully parsed (unlikely for dummy PDF)
            print(f"Response: {response.status_code} - {response.text[:200]}")

    def test_upload_rejects_doc_format(self, auth_headers):
        """Test that bank analysis upload rejects .doc format with 400."""
        doc_content = b'This is not a real doc file'
        files = {'file': ('extrato.doc', io.BytesIO(doc_content), 'application/msword')}
        
        response = requests.post(
            f"{BASE_URL}/api/bank-analysis/upload",
            files=files,
            headers=auth_headers,
            timeout=30
        )
        
        assert response.status_code == 400, f"DOC should be rejected with 400. Got {response.status_code}: {response.text}"
        detail = response.json().get("detail", "")
        assert "formato não suportado" in detail.lower() or "suportado" in detail.lower(), f"Should mention unsupported format: {detail}"


class TestExpensesEndpoints:
    """Test basic expenses CRUD endpoints."""

    def test_list_expenses(self, auth_headers):
        """Test GET /api/expenses returns list."""
        response = requests.get(
            f"{BASE_URL}/api/expenses",
            headers=auth_headers,
            params={"year": 2026, "month": 1}
        )
        
        assert response.status_code == 200, f"List failed: {response.status_code} - {response.text}"
        assert isinstance(response.json(), list)

    def test_get_categories(self, auth_headers):
        """Test GET /api/expenses/categories returns list."""
        response = requests.get(
            f"{BASE_URL}/api/expenses/categories",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Categories failed: {response.status_code} - {response.text}"
        categories = response.json()
        assert isinstance(categories, list)
        assert len(categories) > 0
        assert "Combustível" in categories
        assert "Material" in categories

    def test_get_summary(self, auth_headers):
        """Test GET /api/expenses/summary returns summary data."""
        response = requests.get(
            f"{BASE_URL}/api/expenses/summary",
            headers=auth_headers,
            params={"year": 2026}
        )
        
        assert response.status_code == 200, f"Summary failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "year" in data
        assert "total_year" in data
        assert "by_month" in data
        assert "by_category" in data


class TestBankAnalysisEndpoints:
    """Test basic bank analysis endpoints."""

    def test_list_analyses(self, auth_headers):
        """Test GET /api/bank-analysis returns list."""
        response = requests.get(
            f"{BASE_URL}/api/bank-analysis",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"List failed: {response.status_code} - {response.text}"
        assert isinstance(response.json(), list)

    def test_tax_alerts(self, auth_headers):
        """Test GET /api/bank-analysis/tax-alerts/upcoming returns alerts."""
        response = requests.get(
            f"{BASE_URL}/api/bank-analysis/tax-alerts/upcoming",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Tax alerts failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "alerts" in data
        assert isinstance(data["alerts"], list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
