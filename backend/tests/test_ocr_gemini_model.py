"""
Tests for OCR endpoints after Gemini model change from gemini-2.5-pro to gemini-3.1-pro-preview.

Endpoints under test:
- POST /api/invoices/extract        (invoices.py extract_invoice_data)
- POST /api/expenses/extract        (expenses.py extract_invoice_data)
- POST /api/materials/import-invoice/extract  (stock_invoice_import.py)

Regression:
- POST /api/invoices                (manual invoice creation still works)
"""
import io
import os
import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env parse
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"


# ------------------------- fixtures -------------------------
@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def invoice_image_bytes():
    """Generate an invoice-like PNG with typed text for OCR."""
    img = Image.new("RGB", (900, 1100), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except Exception:
        font = ImageFont.load_default()
        font_sm = ImageFont.load_default()

    lines = [
        ("FATURA", font),
        ("", font_sm),
        ("Numero: FT 2026/0007", font_sm),
        ("Data emissao: 2026-01-15", font_sm),
        ("Data vencimento: 2026-02-15", font_sm),
        ("", font_sm),
        ("Emissor: Obelisco Lda    NIF: 500123456", font_sm),
        ("Rua Central, 100, Lisboa", font_sm),
        ("", font_sm),
        ("Cliente: ACME Constrution SA", font_sm),
        ("NIF: 501987654", font_sm),
        ("Morada: Av. da Liberdade, 200, Lisboa", font_sm),
        ("Email: financas@acme.pt", font_sm),
        ("Telefone: 210000111", font_sm),
        ("", font_sm),
        ("Descricao:", font),
        ("- Instalacao eletrica  ...............  1000.00 EUR", font_sm),
        ("- Manutencao mensal    ...............   200.00 EUR", font_sm),
        ("", font_sm),
        ("Valor liquido:  1200.00 EUR", font_sm),
        ("IVA (23%):       276.00 EUR", font_sm),
        ("Total:          1476.00 EUR", font),
    ]
    y = 40
    for text, ft in lines:
        d.text((40, y), text, fill="black", font=ft)
        y += 34

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def expense_image_bytes():
    """Generate an expense (supplier invoice) image."""
    img = Image.new("RGB", (900, 900), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except Exception:
        font = ImageFont.load_default()
        font_sm = ImageFont.load_default()

    lines = [
        ("FATURA FORNECEDOR", font),
        ("", font_sm),
        ("Fornecedor: Materiais Iberia Lda", font_sm),
        ("NIF: 502111222", font_sm),
        ("Numero fatura: FA 2026/00042", font_sm),
        ("Data: 2026-01-10", font_sm),
        ("", font_sm),
        ("Categoria: Materiais", font_sm),
        ("Descricao: Cabos electricos 2.5mm", font_sm),
        ("", font_sm),
        ("Valor sem IVA: 400.00", font_sm),
        ("IVA 23%:        92.00", font_sm),
        ("TOTAL:         492.00 EUR", font),
    ]
    y = 40
    for text, ft in lines:
        d.text((40, y), text, fill="black", font=ft)
        y += 34
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def stock_invoice_image_bytes():
    """Generate a stock-invoice image with material lines."""
    img = Image.new("RGB", (1000, 900), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except Exception:
        font = ImageFont.load_default()
        font_sm = ImageFont.load_default()

    lines = [
        ("FATURA MATERIAIS", font),
        ("Fornecedor: EletroStock Lda", font_sm),
        ("NIF: 503222333", font_sm),
        ("Nr Fatura: FS 2026/0100", font_sm),
        ("Data: 2026-01-08", font_sm),
        ("", font_sm),
        ("Ref        Descricao                  Qtd    Preco    Total", font_sm),
        ("CAB-001    Cabo 2.5mm rolo 100m       5      45.00    225.00", font_sm),
        ("DIS-010    Disjuntor bipolar 16A      10     12.50    125.00", font_sm),
        ("TOM-020    Tomada Schuko branca       20     3.20      64.00", font_sm),
        ("", font_sm),
        ("Total: 414.00 EUR", font),
    ]
    y = 40
    for text, ft in lines:
        d.text((30, y), text, fill="black", font=ft)
        y += 34
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ------------------------- health -------------------------
class TestHealth:
    def test_login_admin(self, token):
        assert isinstance(token, str) and len(token) > 20


# ------------------------- invoices OCR -------------------------
class TestInvoicesOCR:
    def test_extract_invoice_success(self, headers, invoice_image_bytes):
        files = {"file": ("test_invoice.png", invoice_image_bytes, "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/invoices/extract",
            headers=headers,
            files=files,
            timeout=180,
        )
        assert r.status_code == 200, f"Unexpected status {r.status_code}: {r.text}"
        data = r.json()
        assert "extracted" in data, f"Missing 'extracted' in response: {data}"
        extracted = data["extracted"]
        # If Gemini model is invalid, endpoint returns {"error": "..."}
        assert "error" not in extracted, (
            f"Gemini extraction failed with error: {extracted.get('error')}"
        )
        # Basic structure checks — Gemini may not extract 100% correctly
        # but keys should be present
        expected_keys = {
            "number", "issue_date", "client_name", "client_nif",
            "value_net", "vat_amount", "value_total",
        }
        missing = expected_keys - set(extracted.keys())
        assert not missing, f"Missing keys in extracted: {missing}. Got: {list(extracted.keys())}"
        # Value total should be a number > 0 for our sample
        assert isinstance(extracted["value_total"], (int, float))

    def test_extract_invalid_format(self, headers):
        files = {"file": ("bad.txt", b"hello", "text/plain")}
        r = requests.post(
            f"{BASE_URL}/api/invoices/extract",
            headers=headers,
            files=files,
            timeout=60,
        )
        assert r.status_code == 400


# ------------------------- expenses OCR -------------------------
class TestExpensesOCR:
    def test_extract_expense_success(self, headers, expense_image_bytes):
        files = {"file": ("test_expense.png", expense_image_bytes, "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/expenses/extract",
            headers=headers,
            files=files,
            timeout=180,
        )
        assert r.status_code == 200, f"Unexpected status {r.status_code}: {r.text}"
        data = r.json()
        assert "extracted" in data, f"Missing 'extracted': {data}"
        extracted = data["extracted"]
        assert "error" not in extracted, (
            f"Gemini expense extraction failed: {extracted.get('error')}"
        )


# ------------------------- stock invoice OCR -------------------------
class TestStockInvoiceOCR:
    def test_extract_stock_invoice_success(self, headers, stock_invoice_image_bytes):
        files = {"file": ("test_stock.png", stock_invoice_image_bytes, "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/materials/import-invoice/extract",
            headers=headers,
            files=files,
            timeout=180,
        )
        # If Gemini errors, this endpoint raises 500 with the error string in detail
        assert r.status_code == 200, (
            f"Stock OCR returned {r.status_code}: {r.text}"
        )
        data = r.json()
        assert "lines" in data or "extracted" in data, f"Unexpected shape: {data}"


# ------------------------- regression: manual invoice -------------------------
class TestInvoiceRegression:
    def test_create_manual_invoice(self, headers):
        payload = {
            "number": "",  # auto-number
            "issue_date": "2026-01-20",
            "due_date": "2026-02-20",
            "client_name": "TEST_Regression Client",
            "client_nif": "500000000",
            "value_net": 100.0,
            "vat_rate": 23,
            "vat_amount": 23.0,
            "value_total": 123.0,
            "notes": "TEST_regression",
        }
        r = requests.post(
            f"{BASE_URL}/api/invoices",
            headers=headers,
            json=payload,
            timeout=30,
        )
        assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
        data = r.json()
        inv_id = data.get("id")
        assert inv_id
        # Verify via list
        r2 = requests.get(
            f"{BASE_URL}/api/invoices",
            headers=headers,
            params={"client": "TEST_Regression"},
            timeout=30,
        )
        assert r2.status_code == 200
        items = r2.json()
        assert any(i.get("id") == inv_id for i in items), "Created invoice not found"
        # cleanup
        requests.delete(f"{BASE_URL}/api/invoices/{inv_id}", headers=headers, timeout=30)
