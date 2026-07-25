"""Tests for PUT /api/invoices/{id}/link-work and /api/expenses/{id}/link-work endpoints
   plus verification that GET /api/works/{work_id}/caixa reflects the link changes."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"

ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"
TECH_EMAIL = "d.oliveira1986@gmail.com"
TECH_PASSWORD = "A24d22r04"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login falhou: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def tech_token():
    r = requests.post(f"{BASE_URL}/api/tech/auth/login",
                      json={"email": TECH_EMAIL, "password": TECH_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Tech login indisponivel: {r.status_code}")
    return r.json().get("access_token") or r.json().get("token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def some_work(admin_token):
    r = requests.get(f"{BASE_URL}/api/works", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    works = r.json()
    assert works, "Sem obras seed"
    return works[0]


@pytest.fixture(scope="module")
def second_work(admin_token):
    r = requests.get(f"{BASE_URL}/api/works", headers=_h(admin_token), timeout=15)
    works = r.json()
    return works[1] if len(works) > 1 else None


# ---------- Helper: create test invoice & expense ----------

@pytest.fixture
def test_invoice(admin_token):
    payload = {
        "client_name": "TEST_CLIENT_LINK",
        "client_nif": "500000000",
        "items": [{"description": "TEST item", "quantity": 1, "unit_price": 100.0, "vat_rate": 23}],
        "issue_date": "2026-01-15",
        "due_date": "2026-02-15",
        "value_total": 123.0,
        "amount": 123.0,
        "total": 123.0,
    }
    r = requests.post(f"{BASE_URL}/api/invoices", headers=_h(admin_token), json=payload, timeout=15)
    if r.status_code not in (200, 201):
        # fallback: reuse an existing invoice without obra
        list_r = requests.get(f"{BASE_URL}/api/invoices", headers=_h(admin_token), timeout=15)
        assert list_r.status_code == 200, list_r.text
        candidates = [i for i in list_r.json() if not i.get("obra_id")]
        assert candidates, f"Sem faturas disponiveis. Post falhou: {r.text}"
        inv = candidates[0]
        yield inv
        # restore obra_id to original (None) — best effort
        try:
            requests.put(f"{BASE_URL}/api/invoices/{inv['id']}/link-work",
                         headers=_h(admin_token), json={"obra_id": None}, timeout=10)
        except Exception:
            pass
        return
    inv = r.json()
    yield inv
    # cleanup best-effort
    try:
        requests.delete(f"{BASE_URL}/api/invoices/{inv['id']}", headers=_h(admin_token), timeout=10)
    except Exception:
        pass


@pytest.fixture
def test_expense(admin_token):
    payload = {
        "description": "TEST_EXPENSE_LINK",
        "amount": 50.0,
        "date": "2026-01-15",
        "category": "outros",
        "type": "variavel",
    }
    r = requests.post(f"{BASE_URL}/api/expenses", headers=_h(admin_token), json=payload, timeout=15)
    assert r.status_code in (200, 201), f"Criacao despesa: {r.status_code} {r.text}"
    exp = r.json()
    yield exp
    try:
        requests.delete(f"{BASE_URL}/api/expenses/{exp['id']}", headers=_h(admin_token), timeout=10)
    except Exception:
        pass


# ---------- Invoice link tests ----------

class TestInvoiceLink:
    def test_link_and_unlink_invoice(self, admin_token, some_work, test_invoice):
        wid = some_work["id"]
        iid = test_invoice["id"]

        # LINK
        r = requests.put(f"{BASE_URL}/api/invoices/{iid}/link-work",
                         headers=_h(admin_token), json={"obra_id": wid}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("obra_id") == wid

        # GET caixa reflects
        r2 = requests.get(f"{BASE_URL}/api/works/{wid}/caixa", headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200, r2.text
        caixa = r2.json()
        inv_ids = [i.get("id") for i in caixa.get("receitas", {}).get("invoices", [])]
        assert iid in inv_ids, f"Fatura nao aparece na caixa: {inv_ids}"

        # UNLINK
        r3 = requests.put(f"{BASE_URL}/api/invoices/{iid}/link-work",
                          headers=_h(admin_token), json={"obra_id": None}, timeout=15)
        assert r3.status_code == 200, r3.text
        assert r3.json().get("obra_id") in (None, "")

        # Ensure removed from caixa
        r4 = requests.get(f"{BASE_URL}/api/works/{wid}/caixa", headers=_h(admin_token), timeout=15)
        inv_ids2 = [i.get("id") for i in r4.json().get("receitas", {}).get("invoices", [])]
        assert iid not in inv_ids2

    def test_link_invoice_invalid_work(self, admin_token, test_invoice):
        r = requests.put(f"{BASE_URL}/api/invoices/{test_invoice['id']}/link-work",
                         headers=_h(admin_token), json={"obra_id": "nope-does-not-exist"}, timeout=15)
        assert r.status_code == 404
        assert "Obra" in r.text

    def test_link_invoice_invalid_id(self, admin_token, some_work):
        r = requests.put(f"{BASE_URL}/api/invoices/nope-invoice/link-work",
                         headers=_h(admin_token), json={"obra_id": some_work["id"]}, timeout=15)
        assert r.status_code == 404
        assert "Fatura" in r.text

    def test_link_invoice_forbidden_for_tech(self, tech_token, some_work, admin_token, test_invoice):
        # Tech tem tokens em endpoint diferente e module_permissions vazio para faturas
        r = requests.put(f"{BASE_URL}/api/invoices/{test_invoice['id']}/link-work",
                         headers=_h(tech_token), json={"obra_id": some_work["id"]}, timeout=15)
        # Aceitamos 403 (sem permissao) ou 401 (tech token nao aceite neste endpoint admin)
        assert r.status_code in (401, 403), f"Esperava 401/403, obtive {r.status_code}: {r.text}"


# ---------- Expense link tests ----------

class TestExpenseLink:
    def test_link_and_unlink_expense(self, admin_token, some_work, test_expense):
        wid = some_work["id"]
        eid = test_expense["id"]

        r = requests.put(f"{BASE_URL}/api/expenses/{eid}/link-work",
                         headers=_h(admin_token), json={"obra_id": wid}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("obra_id") == wid
        assert body.get("type") == "obra", f"type deveria ser 'obra', foi {body.get('type')}"
        assert body.get("obra_name") == some_work.get("title")

        # caixa reflects
        r2 = requests.get(f"{BASE_URL}/api/works/{wid}/caixa", headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200
        caixa = r2.json()
        exp_ids = [e.get("id") for e in caixa.get("despesas", {}).get("expenses", [])]
        assert eid in exp_ids

        # unlink
        r3 = requests.put(f"{BASE_URL}/api/expenses/{eid}/link-work",
                          headers=_h(admin_token), json={"obra_id": None}, timeout=15)
        assert r3.status_code == 200
        body3 = r3.json()
        assert body3.get("obra_id") in (None, "")
        assert body3.get("obra_name") in (None, "")

    def test_link_expense_invalid_work(self, admin_token, test_expense):
        r = requests.put(f"{BASE_URL}/api/expenses/{test_expense['id']}/link-work",
                         headers=_h(admin_token), json={"obra_id": "nope-work"}, timeout=15)
        assert r.status_code == 404

    def test_link_expense_invalid_id(self, admin_token, some_work):
        r = requests.put(f"{BASE_URL}/api/expenses/nope-exp/link-work",
                         headers=_h(admin_token), json={"obra_id": some_work["id"]}, timeout=15)
        assert r.status_code == 404
        assert "Despesa" in r.text

    def test_link_expense_forbidden_for_tech(self, tech_token, some_work, test_expense):
        r = requests.put(f"{BASE_URL}/api/expenses/{test_expense['id']}/link-work",
                         headers=_h(tech_token), json={"obra_id": some_work["id"]}, timeout=15)
        assert r.status_code in (401, 403)


# ---------- Move between works ----------

class TestMoveBetweenWorks:
    def test_move_invoice_across_works(self, admin_token, some_work, second_work, test_invoice):
        if not second_work:
            pytest.skip("Nao ha 2 obras para teste de move")
        iid = test_invoice["id"]
        # attach to first
        requests.put(f"{BASE_URL}/api/invoices/{iid}/link-work",
                     headers=_h(admin_token), json={"obra_id": some_work["id"]}, timeout=15)
        # move to second
        r = requests.put(f"{BASE_URL}/api/invoices/{iid}/link-work",
                         headers=_h(admin_token), json={"obra_id": second_work["id"]}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("obra_id") == second_work["id"]

        # ensure not in first
        c1 = requests.get(f"{BASE_URL}/api/works/{some_work['id']}/caixa",
                          headers=_h(admin_token), timeout=15).json()
        c2 = requests.get(f"{BASE_URL}/api/works/{second_work['id']}/caixa",
                          headers=_h(admin_token), timeout=15).json()
        ids1 = [i.get("id") for i in c1.get("receitas", {}).get("invoices", [])]
        ids2 = [i.get("id") for i in c2.get("receitas", {}).get("invoices", [])]
        assert iid not in ids1
        assert iid in ids2
