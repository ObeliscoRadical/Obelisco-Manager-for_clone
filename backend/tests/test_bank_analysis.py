"""Tests for Bank Statement Analysis module."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
assert BASE_URL, "BASE_URL not resolved"

CSV_PATH = "/tmp/extrato_teste.csv"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@obelisco.pt", "password": "obelisco2024"},
                      timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def uploaded_analysis(auth_headers):
    with open(CSV_PATH, "rb") as f:
        files = {"file": ("extrato_teste.csv", f, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/bank-analysis/upload",
                          files=files, headers=auth_headers, timeout=180)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:500]}"
    return r.json()


# --- Upload + parsing ---
def test_upload_returns_transactions(uploaded_analysis):
    a = uploaded_analysis
    assert a["transaction_count"] == 31, f"expected 31 got {a['transaction_count']}"
    assert len(a["transactions"]) == 31
    assert a["date_from"] == "2026-01-05"
    assert a["date_to"] == "2026-03-15"


# --- Category assignments ---
def test_categories_assigned_correctly(uploaded_analysis):
    txns = uploaded_analysis["transactions"]
    def find(sub):
        return next(t for t in txns if sub.lower() in t["description"].lower())

    assert find("TRANSFERENCIA DE CLIENTE APEC")["category"] == "receita"
    assert find("EDP UNIVERSAL")["category"] == "fixo"
    assert find("VODAFONE")["category"] == "fixo"
    assert find("LEROY MERLIN")["category"] == "obra"
    assert find("GASOLEO BP")["category"] == "variavel"
    assert find("ORDENADO DIEGO")["category"] == "salario"
    assert find("AUTORIDADE TRIBUTARIA")["category"] == "imposto"


# --- Recurring detection ---
def test_recurring_detected(uploaded_analysis):
    rec = uploaded_analysis["recurring"]
    assert len(rec) >= 2, f"expected >=2 recurring, got {len(rec)}: {rec}"
    # Vodafone should appear (3 occurrences, exact same amount)
    assert any("VODAFONE" in r["description"].upper() for r in rec), rec
    for r in rec:
        assert r["occurrences"] >= 2
        assert r["avg_amount"] > 0


# --- Tax estimation ---
def test_tax_estimation_fields(uploaded_analysis):
    t = uploaded_analysis["taxes"]
    for k in ("irc_estimate", "iva_quarterly_estimate", "tsu_estimate",
              "total_tax_burden", "derrama_municipal", "ppc_installment"):
        assert k in t, f"missing {k}"
        assert isinstance(t[k], (int, float))
    assert t["total_tax_burden"] > 0
    assert t["tsu_estimate"] > 0  # since salaries exist


# --- Cashflow ---
def test_cashflow_projection(uploaded_analysis):
    cf = uploaded_analysis["cashflow"]
    projected = [c for c in cf if c["projected"]]
    historical = [c for c in cf if not c["projected"]]
    assert len(projected) == 6, f"expected 6 projected months got {len(projected)}"
    assert len(historical) >= 3
    for p in projected:
        assert "month" in p and "income" in p and "expenses" in p and "balance" in p


# --- List endpoint ---
def test_list_analyses(auth_headers, uploaded_analysis):
    r = requests.get(f"{BASE_URL}/api/bank-analysis", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list)
    assert any(x["id"] == uploaded_analysis["id"] for x in lst)


# --- Get by ID ---
def test_get_analysis_by_id(auth_headers, uploaded_analysis):
    r = requests.get(f"{BASE_URL}/api/bank-analysis/{uploaded_analysis['id']}",
                     headers=auth_headers, timeout=15)
    assert r.status_code == 200
    doc = r.json()
    assert doc["id"] == uploaded_analysis["id"]
    assert "transactions" in doc and len(doc["transactions"]) == 31
    assert "recurring" in doc and "cashflow" in doc and "taxes" in doc
    assert "_id" not in doc


def test_get_analysis_404(auth_headers):
    r = requests.get(f"{BASE_URL}/api/bank-analysis/nonexistent-id-xxx",
                     headers=auth_headers, timeout=10)
    assert r.status_code == 404
