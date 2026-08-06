"""Tests for the Caixa da Obra endpoint: GET /api/works/{work_id}/caixa"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://expenses-ai-1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def a_work_id(auth_headers):
    r = requests.get(f"{BASE_URL}/api/works", headers=auth_headers)
    assert r.status_code == 200, r.text
    works = r.json()
    assert isinstance(works, list) and len(works) > 0, "No works available for testing"
    return works[0]["id"]


def test_caixa_requires_auth(a_work_id):
    r = requests.get(f"{BASE_URL}/api/works/{a_work_id}/caixa")
    assert r.status_code in (401, 403), f"Expected 401/403 got {r.status_code}"


def test_caixa_returns_full_structure(auth_headers, a_work_id):
    r = requests.get(f"{BASE_URL}/api/works/{a_work_id}/caixa", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    # Top-level keys
    for key in ("work", "resumo", "receitas", "despesas", "caixa"):
        assert key in data, f"Missing top-level key: {key}"

    resumo = data["resumo"]
    for key in ("sale_total", "predicted_total", "real_total_cost",
                "margin_predicted_pct", "margin_real_pct",
                "predicted_profit", "real_profit"):
        assert key in resumo, f"Missing resumo.{key}"

    receitas = data["receitas"]
    for key in ("total_invoiced", "total_received", "to_receive", "to_invoice", "invoices"):
        assert key in receitas, f"Missing receitas.{key}"
    assert isinstance(receitas["invoices"], list)

    despesas = data["despesas"]
    for key in ("expenses_total", "expenses_paid", "expenses_to_pay", "expenses"):
        assert key in despesas, f"Missing despesas.{key}"
    assert isinstance(despesas["expenses"], list)

    caixa = data["caixa"]
    for key in ("cash_balance", "projected_cash_balance", "receipts_progress_pct", "cost_progress_pct"):
        assert key in caixa, f"Missing caixa.{key}"


def test_caixa_math_consistency(auth_headers, a_work_id):
    """cash_balance == total_received - expenses_paid ; to_receive == invoiced - received."""
    r = requests.get(f"{BASE_URL}/api/works/{a_work_id}/caixa", headers=auth_headers)
    assert r.status_code == 200
    d = r.json()
    inv = d["receitas"]["total_invoiced"]
    rec = d["receitas"]["total_received"]
    to_r = d["receitas"]["to_receive"]
    exp_paid = d["despesas"]["expenses_paid"]
    cash = d["caixa"]["cash_balance"]
    assert abs((inv - rec) - to_r) < 0.02, f"to_receive mismatch: {inv}-{rec} != {to_r}"
    assert abs((rec - exp_paid) - cash) < 0.02, f"cash_balance mismatch: {rec}-{exp_paid} != {cash}"


def test_caixa_no_invoices_defaults(auth_headers):
    """Find a work with no invoices — cash_balance should be 0 or negative (only expenses)."""
    r = requests.get(f"{BASE_URL}/api/works", headers=auth_headers)
    works = r.json()
    for w in works:
        wid = w["id"]
        c = requests.get(f"{BASE_URL}/api/works/{wid}/caixa", headers=auth_headers)
        if c.status_code != 200:
            continue
        d = c.json()
        if d["receitas"]["total_invoiced"] == 0 and d["despesas"]["expenses_total"] == 0:
            assert d["caixa"]["cash_balance"] == 0
            assert d["caixa"]["receipts_progress_pct"] == 0
            if d["resumo"]["sale_total"] > 0:
                # no cost, margin_real_pct should be 100
                assert d["resumo"]["margin_real_pct"] == 100.0, f"Expected margin 100 got {d['resumo']['margin_real_pct']}"
            return
    pytest.skip("No work without invoices/expenses to validate defaults")


def test_caixa_invalid_work_404(auth_headers):
    r = requests.get(f"{BASE_URL}/api/works/nonexistent-xyz-123/caixa", headers=auth_headers)
    assert r.status_code == 404


def test_regression_works_endpoint(auth_headers):
    r = requests.get(f"{BASE_URL}/api/works", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_regression_works_full(auth_headers, a_work_id):
    r = requests.get(f"{BASE_URL}/api/works/{a_work_id}/full", headers=auth_headers)
    assert r.status_code == 200
    d = r.json()
    assert "id" in d or "work" in d or "title" in d
