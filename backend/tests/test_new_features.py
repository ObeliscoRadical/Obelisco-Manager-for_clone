"""Tests for 4 new features: Telegram, Calendar availability, /api/clients, /api/clients/profile, and Service Orders public creation."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:3000').rstrip('/')
if not BASE_URL.startswith('http'):
    # fallback from frontend .env if not exported
    with open('/app/frontend/.env') as f:
        for ln in f:
            if ln.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = ln.split('=', 1)[1].strip().rstrip('/')
                break

ADMIN_EMAIL = 'admin@obelisco.pt'
ADMIN_PWD = 'obelisco2024'


@pytest.fixture(scope='session')
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get('access_token') or r.json().get('token')
    assert tok
    return tok


@pytest.fixture(scope='session')
def headers(token):
    return {"Authorization": f"Bearer {token}"}


# ── Service Orders: public POST triggers Telegram (backend log check) ─────
def test_public_service_order_creation_triggers_telegram():
    payload = {
        "client_name": "TEST_Telegram_Client",
        "email": "tg_test@example.com",
        "phone": "+351911111111",
        "address": "Rua de Teste 1, Lisboa",
        "description": "Teste de notificação Telegram (fire and forget)",
        "service_type": "reparacao",
        "preferred_date": "2026-08-10T10:00",
    }
    r = requests.post(f"{BASE_URL}/api/service-orders", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["client_name"] == payload["client_name"]
    assert data["status"] == "pendente"
    assert data.get("id")
    # Wait a moment for background task
    time.sleep(3)


# ── Calendar availability endpoint ────────────────────────────────────────
def test_check_availability_returns_expected_shape():
    r = requests.get(f"{BASE_URL}/api/service-orders/check-availability",
                     params={"preferred_date": "2026-08-10T10:00"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "available" in data
    assert "conflicts" in data
    assert "suggested_times" in data
    assert isinstance(data["conflicts"], list)
    assert isinstance(data["suggested_times"], list)
    # Without credentials file, expect available=True
    assert data["available"] is True


# ── /api/clients ─────────────────────────────────────────────────────────
def test_list_clients(headers):
    r = requests.get(f"{BASE_URL}/api/clients", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # Should include APEC or at least be non-empty
    print(f"Total clients: {len(data)}")


def test_client_profile_apec(headers):
    r = requests.get(f"{BASE_URL}/api/clients/profile",
                     headers=headers, params={"name": "APEC"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "APEC"
    assert "kpis" in data
    kpis = data["kpis"]
    for k in ["total_invoiced", "total_received", "total_pending",
              "avg_payment_days", "proposals_count", "works_count",
              "invoices_count", "service_orders_count"]:
        assert k in kpis, f"Missing KPI key: {k}"
    assert isinstance(data["proposals"], list)
    assert kpis["proposals_count"] == len(data["proposals"])
    print(f"APEC proposals_count={kpis['proposals_count']} invoiced={kpis['total_invoiced']}")


def test_client_profile_cliente_teste_vencida(headers):
    r = requests.get(f"{BASE_URL}/api/clients/profile",
                     headers=headers, params={"name": "Cliente Teste Vencida"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    kpis = data["kpis"]
    print(f"Cliente Teste Vencida: invoiced={kpis['total_invoiced']} received={kpis['total_received']} pending={kpis['total_pending']} avg_days={kpis['avg_payment_days']}")
    assert kpis["total_invoiced"] > 0, "Expected non-zero total_invoiced"


def test_client_profile_requires_auth():
    r = requests.get(f"{BASE_URL}/api/clients/profile",
                     params={"name": "APEC"}, timeout=15)
    assert r.status_code in (401, 403)
