"""
Backend tests for the Service Orders module (Obelisco-Tecnicos-main fusion).
Covers: public/admin CRUD, notes, photos, timeclock with GPS.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback to frontend env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.strip().split("=", 1)[1].rstrip("/")

ADMIN = {"email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"), "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")}
TECH = {"email": os.environ.get("TEST_TECH_EMAIL", "d.oliveira1986@gmail.com"), "password": os.environ.get("TEST_TECH_PASSWORD", "A24d22r04")}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def created_order_id(admin_headers):
    # public create used later, but need one to hang tests off
    payload = {
        "client_name": "TEST_Cliente",
        "email": "test_client@example.com",
        "phone": "912345678",
        "address": "Rua Teste 1",
        "description": "Teste de pedido",
        "service_type": "reparacao",
    }
    r = requests.post(f"{BASE}/api/service-orders", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ── PUBLIC ─────────────────────────────────────────────────────────────
class TestPublic:
    def test_public_create_no_auth(self):
        payload = {
            "client_name": "TEST_Pub",
            "email": "pub@test.com",
            "phone": "911111111",
            "address": "Av Publica 10",
            "description": "sem auth",
            "service_type": "instalacao",
        }
        r = requests.post(f"{BASE}/api/service-orders", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "pendente"
        assert data["service_type"] == "instalacao"
        assert "id" in data
        assert data["notes"] == []
        assert data["photos"] == []

    def test_public_invalid_email(self):
        payload = {
            "client_name": "x",
            "email": "not-an-email",
            "phone": "1",
            "address": "a",
            "description": "b",
        }
        r = requests.post(f"{BASE}/api/service-orders", json=payload, timeout=15)
        assert r.status_code in (400, 422)


# ── AUTH-REQUIRED CRUD ─────────────────────────────────────────────────
class TestOrdersCRUD:
    def test_requires_auth_for_list(self):
        r = requests.get(f"{BASE}/api/service-orders", timeout=10)
        assert r.status_code == 401

    def test_list_orders(self, admin_headers):
        r = requests.get(f"{BASE}/api/service-orders", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_dashboard_stats(self, admin_headers):
        r = requests.get(f"{BASE}/api/service-orders/dashboard/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_orders", "pending_orders", "in_progress_orders", "completed_orders", "orders_today", "orders_this_week"]:
            assert k in d
            assert isinstance(d[k], int)

    def test_admin_create_order(self, admin_headers):
        payload = {
            "client_name": "TEST_AdminCreated",
            "email": "admin_created@test.com",
            "phone": "913333333",
            "address": "Admin street",
            "description": "criado por admin",
            "service_type": "manutencao",
        }
        r = requests.post(f"{BASE}/api/service-orders/admin", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pendente"
        assert d["client_name"] == "TEST_AdminCreated"

    def test_get_single_order(self, admin_headers, created_order_id):
        r = requests.get(f"{BASE}/api/service-orders/{created_order_id}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == created_order_id
        assert "notes" in d and "photos" in d

    def test_patch_status(self, admin_headers, created_order_id):
        r = requests.patch(
            f"{BASE}/api/service-orders/{created_order_id}",
            json={"status": "em_progresso"},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "em_progresso"

        # verify persistence
        g = requests.get(f"{BASE}/api/service-orders/{created_order_id}", headers=admin_headers, timeout=10)
        assert g.json()["status"] == "em_progresso"

        # now conclude
        r2 = requests.patch(
            f"{BASE}/api/service-orders/{created_order_id}",
            json={"status": "concluido"},
            headers=admin_headers, timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["status"] == "concluido"

    def test_not_found(self, admin_headers):
        r = requests.get(f"{BASE}/api/service-orders/{uuid.uuid4()}", headers=admin_headers, timeout=10)
        assert r.status_code == 404


# ── NOTES ──────────────────────────────────────────────────────────────
class TestNotes:
    def test_add_and_delete_note(self, admin_headers, created_order_id):
        r = requests.post(
            f"{BASE}/api/service-orders/{created_order_id}/notes",
            json={"text": "Nota de teste"},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        note = r.json()
        assert note["text"] == "Nota de teste"
        assert "id" in note
        note_id = note["id"]

        # verify in order
        g = requests.get(f"{BASE}/api/service-orders/{created_order_id}", headers=admin_headers, timeout=10)
        assert any(n["id"] == note_id for n in g.json()["notes"])

        d = requests.delete(
            f"{BASE}/api/service-orders/{created_order_id}/notes/{note_id}",
            headers=admin_headers, timeout=10,
        )
        assert d.status_code == 200

        g2 = requests.get(f"{BASE}/api/service-orders/{created_order_id}", headers=admin_headers, timeout=10)
        assert all(n["id"] != note_id for n in g2.json()["notes"])


# ── PHOTOS ─────────────────────────────────────────────────────────────
class TestPhotos:
    IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

    def test_add_photo_auth(self, admin_headers, created_order_id):
        r = requests.post(
            f"{BASE}/api/service-orders/{created_order_id}/photos",
            json={"image_data": self.IMG, "caption": "foto teste"},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        assert "id" in r.json()

    def test_add_photo_public(self, created_order_id):
        r = requests.post(
            f"{BASE}/api/service-orders/{created_order_id}/photos/public",
            json={"image_data": self.IMG, "caption": ""},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["uploaded_by"] == "Cliente"


# ── TIMECLOCK ──────────────────────────────────────────────────────────
class TestTimeclock:
    def test_my_status(self, admin_headers):
        r = requests.get(f"{BASE}/api/service-orders/timeclock/my-status", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "is_clocked_in" in d
        assert "today_entries" in d
        assert isinstance(d["today_entries"], list)

    def test_entrada_saida_flow(self, admin_headers):
        # get current status
        s = requests.get(f"{BASE}/api/service-orders/timeclock/my-status", headers=admin_headers, timeout=10).json()
        # if already clocked in, do a saida first
        if s.get("is_clocked_in"):
            requests.post(
                f"{BASE}/api/service-orders/timeclock",
                json={"type": "saida", "latitude": 38.7, "longitude": -9.1, "address": "Lisboa"},
                headers=admin_headers, timeout=10,
            )

        r1 = requests.post(
            f"{BASE}/api/service-orders/timeclock",
            json={"type": "entrada", "latitude": 38.7, "longitude": -9.1, "address": "Lisboa"},
            headers=admin_headers, timeout=15,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["type"] == "entrada"

        # double entrada should fail
        r_dup = requests.post(
            f"{BASE}/api/service-orders/timeclock",
            json={"type": "entrada"},
            headers=admin_headers, timeout=10,
        )
        assert r_dup.status_code == 400

        # saida
        r2 = requests.post(
            f"{BASE}/api/service-orders/timeclock",
            json={"type": "saida", "latitude": 38.7, "longitude": -9.1, "address": "Lisboa"},
            headers=admin_headers, timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["type"] == "saida"

        # verify is_clocked_in false
        s2 = requests.get(f"{BASE}/api/service-orders/timeclock/my-status", headers=admin_headers, timeout=10).json()
        assert s2["is_clocked_in"] is False

    def test_today_admin(self, admin_headers):
        r = requests.get(f"{BASE}/api/service-orders/timeclock/today", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_all_admin_only(self, admin_headers):
        r = requests.get(
            f"{BASE}/api/service-orders/timeclock/all",
            params={"start_date": "2025-01-01", "end_date": "2026-12-31"},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert "entries" in d and "total" in d

    def test_all_requires_auth(self):
        r = requests.get(f"{BASE}/api/service-orders/timeclock/all", timeout=10)
        assert r.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
