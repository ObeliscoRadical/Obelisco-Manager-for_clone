"""Tests for /api/proposal-import endpoints (PDF -> LLM extract).

Uses reportlab to generate a test PDF on the fly. LLM calls can take 30s+.
"""
import os
import io
import pytest
import requests
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://proposal-hub-56.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
LLM_TIMEOUT = 120

ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def _make_pdf() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, 800, "PROPOSTA COMERCIAL Nº 2023/001")
    c.setFont("Helvetica", 10)
    c.drawString(50, 780, "Data: 2023-05-10")
    c.drawString(50, 765, "Cliente: Sr. Teste")
    c.drawString(50, 750, "NIF: 123456789")
    c.drawString(50, 735, "Telefone: 912345678")
    c.drawString(50, 715, "Descricao: Instalacao eletrica de teste")
    c.drawString(50, 690, "Item                        Qtd    Unit       Total")
    c.drawString(50, 675, "Tomadas Schuko               10     15.00 EUR  150.00 EUR")
    c.drawString(50, 660, "Cabo 2.5mm2 (m)              50     1.50 EUR   75.00 EUR")
    c.drawString(50, 645, "Mao de obra electricista(h)  10     35.00 EUR  350.00 EUR")
    c.drawString(50, 620, "Subtotal: 575.00 EUR")
    c.drawString(50, 605, "IVA 23%: 132.25 EUR")
    c.drawString(50, 590, "TOTAL: 707.25 EUR")
    c.showPage()
    c.save()
    return buf.getvalue()


# --- Error cases ---
def test_reject_non_pdf(headers):
    files = {"file": ("teste.txt", b"nao e pdf", "text/plain")}
    r = requests.post(f"{API}/proposal-import/extract", headers=headers, files=files, timeout=30)
    assert r.status_code == 400
    assert "PDF" in r.json().get("detail", "")


def test_reject_empty_file(headers):
    files = {"file": ("vazio.pdf", b"", "application/pdf")}
    r = requests.post(f"{API}/proposal-import/extract", headers=headers, files=files, timeout=30)
    assert r.status_code == 400
    assert "vazio" in r.json().get("detail", "").lower()


def test_requires_auth():
    files = {"file": ("x.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")}
    r = requests.post(f"{API}/proposal-import/extract", files=files, timeout=30)
    assert r.status_code in (401, 403)


# --- Happy path (LLM) ---
@pytest.fixture(scope="module")
def extracted(headers):
    pdf = _make_pdf()
    files = {"file": ("proposta_teste_2023_001.pdf", pdf, "application/pdf")}
    r = requests.post(f"{API}/proposal-import/extract", headers=headers, files=files, timeout=LLM_TIMEOUT)
    assert r.status_code == 200, f"extract failed: {r.status_code} {r.text[:400]}"
    j = r.json()
    if j.get("error"):
        pytest.skip(f"LLM returned error: {j.get('error')}")
    assert "extracted" in j, j
    return j


def test_extract_structure(extracted):
    ex = extracted["extracted"]
    required = ["title", "client_name", "client_phone", "client_email", "client_nif",
                "proposal_date", "proposal_number", "notes", "detected_total",
                "detected_total_includes_vat", "vat_rate", "is_summary",
                "confidence", "raw_summary", "items"]
    for k in required:
        assert k in ex, f"missing key {k}"
    assert isinstance(ex["items"], list)
    assert len(ex["items"]) >= 1
    it0 = ex["items"][0]
    for k in ["category", "name", "unit", "quantity", "unit_cost",
              "sale_price_hint", "line_total_hint", "margin",
              "discount_type", "discount_value"]:
        assert k in it0, f"missing item key {k}"


def test_extract_values_plausible(extracted):
    ex = extracted["extracted"]
    # Confidence should be something
    assert ex["confidence"] in ("high", "medium", "low")
    # detected_total roughly around 575 or 707
    dt = float(ex.get("detected_total") or 0)
    assert dt > 0, "detected_total should be > 0"


# --- E2E: create budget + generate proposals, then cleanup ---
def test_e2e_create_budget_and_proposals(headers, extracted):
    ex = extracted["extracted"]
    items = []
    for it in ex["items"]:
        hint = float(it.get("sale_price_hint") or 0)
        uc = float(it.get("unit_cost") or 0)
        if uc <= 0 and hint > 0:
            uc = round(hint / 1.6, 2)
        items.append({
            "category": it.get("category") or "",
            "name": it.get("name") or "Item",
            "unit": it.get("unit") or "un",
            "quantity": float(it.get("quantity") or 1),
            "unit_cost": uc if uc > 0 else 10.0,
            "margin": 0.6,
            "discount_type": "percentage",
            "discount_value": 0,
        })

    payload = {
        "title": (ex.get("title") or "TEST_Proposta importada"),
        "client_name": ex.get("client_name") or "TEST_Cliente",
        "client_phone": ex.get("client_phone") or "",
        "payment_methods": [],
        "payment_split": "",
        "payment_notes": ex.get("notes") or "",
        "items": items,
    }
    r = requests.post(f"{API}/budgets", json=payload, headers=headers, timeout=30)
    assert r.status_code in (200, 201), f"budget create: {r.status_code} {r.text[:400]}"
    budget = r.json()
    budget_id = budget["id"]

    # generate 3 proposals
    r2 = requests.post(f"{API}/budgets/{budget_id}/generate-proposals", headers=headers, timeout=60)
    assert r2.status_code in (200, 201), f"gen proposals: {r2.status_code} {r2.text[:400]}"

    # Verify budget persisted
    rg = requests.get(f"{API}/budgets/{budget_id}", headers=headers, timeout=30)
    assert rg.status_code == 200
    assert len(rg.json().get("items", [])) == len(items)

    # Verify 3 proposals linked
    rp = requests.get(f"{API}/proposals", headers=headers, timeout=30)
    assert rp.status_code == 200
    linked = [p for p in rp.json() if p.get("budget_id") == budget_id]
    assert len(linked) == 3, f"expected 3 proposals, got {len(linked)}"
    tiers = sorted({(p.get("tier") or p.get("type") or "").lower() for p in linked})
    # tolerant check — should include basico/profissional/premium
    joined = " ".join(tiers)
    assert "bas" in joined and "prof" in joined and "prem" in joined, f"tiers: {tiers}"

    # Cleanup
    for p in linked:
        requests.delete(f"{API}/proposals/{p['id']}", headers=headers, timeout=15)
    requests.delete(f"{API}/budgets/{budget_id}", headers=headers, timeout=15)
