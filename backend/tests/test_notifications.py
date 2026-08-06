"""Testes end-to-end do sistema de notificações in-app.

Cobre:
- Auth admin + tech
- CRUD notificações admin
- Endpoints tech (sem DELETE)
- Isolação entre users
- Hooks: appointments (create/update/delete), tech chat (tech->admin, admin->tech), transport guides (create/update)
- Scan idempotente de faturas vencidas para admins
"""
import os
import uuid
import time
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASS = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
TECH_EMAIL = os.environ.get("TEST_TECH_EMAIL", "d.oliveira1986@gmail.com")
TECH_PASS = os.environ.get("TEST_TECH_PASSWORD", "A24d22r04")
TECH_EMP_ID = "4d357339-7b7e-40bb-91fe-93109060cbda"


# --------------- Fixtures ---------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"Login admin falhou: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tech_token():
    r = requests.post(f"{BASE_URL}/api/tech/auth/login", json={"email": TECH_EMAIL, "password": TECH_PASS}, timeout=30)
    assert r.status_code == 200, f"Login tech falhou: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tech_h(tech_token):
    return {"Authorization": f"Bearer {tech_token}", "Content-Type": "application/json"}


# --------------- Helpers ---------------
def _mark_and_delete_all_admin(admin_h):
    """Cleanup helper — remove todas as notificações do admin (chamado pelo próprio admin)."""
    r = requests.get(f"{BASE_URL}/api/notifications?limit=200", headers=admin_h, timeout=30)
    if r.status_code == 200:
        for n in r.json().get("items", []):
            requests.delete(f"{BASE_URL}/api/notifications/{n['id']}", headers=admin_h, timeout=10)


# --------------- Basic admin CRUD ---------------
class TestAdminNotifications:
    def test_list_notifications_admin(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/notifications", headers=admin_h, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "unread_count" in body
        assert isinstance(body["items"], list)
        assert isinstance(body["unread_count"], int)

    def test_invoice_scan_idempotent(self, admin_h):
        """Chamar 2x seguidas NÃO deve criar duplicadas de type=invoice."""
        r1 = requests.get(f"{BASE_URL}/api/notifications?limit=200", headers=admin_h, timeout=30)
        assert r1.status_code == 200
        inv1 = [n for n in r1.json()["items"] if n["type"] == "invoice"]
        r2 = requests.get(f"{BASE_URL}/api/notifications?limit=200", headers=admin_h, timeout=30)
        assert r2.status_code == 200
        inv2 = [n for n in r2.json()["items"] if n["type"] == "invoice"]
        # Mesma quantidade (idempotente via dedup_key)
        assert len(inv1) == len(inv2), f"Scan de faturas não é idempotente: {len(inv1)} → {len(inv2)}"
        # E dedup_keys únicos
        keys = [n.get("dedup_key") for n in inv2]
        assert len(keys) == len(set(keys)), "dedup_keys duplicados detectados"

    def test_unread_only_filter(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/notifications?unread_only=true", headers=admin_h, timeout=30)
        assert r.status_code == 200
        for n in r.json()["items"]:
            assert n["read"] is False

    def test_mark_read_and_persist(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/notifications?unread_only=true", headers=admin_h, timeout=30)
        items = r.json()["items"]
        if not items:
            pytest.skip("Sem notificações não lidas para testar")
        nid = items[0]["id"]
        rr = requests.post(f"{BASE_URL}/api/notifications/{nid}/read", headers=admin_h, timeout=10)
        assert rr.status_code == 200
        # Verifica persistência
        r2 = requests.get(f"{BASE_URL}/api/notifications?limit=200", headers=admin_h, timeout=30)
        found = next((n for n in r2.json()["items"] if n["id"] == nid), None)
        assert found is not None and found["read"] is True

    def test_mark_all_read(self, admin_h):
        # Cria uma notificação nova (para o admin) via factura scan já visto — usa read-all como no-op
        r = requests.post(f"{BASE_URL}/api/notifications/read-all", headers=admin_h, timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # Após marcar todas, unread_count deve ser 0
        r2 = requests.get(f"{BASE_URL}/api/notifications", headers=admin_h, timeout=30)
        assert r2.json()["unread_count"] == 0

    def test_mark_read_404_for_bogus(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/notifications/{uuid.uuid4()}/read", headers=admin_h, timeout=10)
        assert r.status_code == 404

    def test_delete_notification(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/notifications?limit=200", headers=admin_h, timeout=30)
        items = r.json()["items"]
        if not items:
            pytest.skip("Sem notificações para eliminar")
        nid = items[0]["id"]
        rr = requests.delete(f"{BASE_URL}/api/notifications/{nid}", headers=admin_h, timeout=10)
        assert rr.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/notifications?limit=200", headers=admin_h, timeout=30)
        assert not any(n["id"] == nid for n in r2.json()["items"])

    def test_delete_404_for_bogus(self, admin_h):
        r = requests.delete(f"{BASE_URL}/api/notifications/{uuid.uuid4()}", headers=admin_h, timeout=10)
        assert r.status_code == 404


# --------------- Tech portal ---------------
class TestTechNotifications:
    def test_list_tech(self, tech_h):
        r = requests.get(f"{BASE_URL}/api/tech/notifications", headers=tech_h, timeout=30)
        assert r.status_code == 200
        assert "items" in r.json() and "unread_count" in r.json()

    def test_no_delete_endpoint_on_tech(self, tech_h):
        # Tenta usar rota /api/notifications/{id} para uma notificação inexistente com tech token → deve dar 401/403 (auth admin obriga get_current_user)
        r = requests.delete(f"{BASE_URL}/api/notifications/{uuid.uuid4()}", headers=tech_h, timeout=10)
        assert r.status_code in (401, 403), f"Tech não pode aceder ao DELETE admin: {r.status_code}"


# --------------- Hook: Appointments ---------------
class TestAppointmentHooks:
    @pytest.fixture(scope="class")
    def created_appt(self, admin_h, tech_h):
        """Cria uma marcação atribuída ao tech e devolve o id. Cleanup: DELETE."""
        # data futura livre
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=2)).replace(hour=10, minute=0, second=0, microsecond=0)
        end = tomorrow + timedelta(hours=2)
        payload = {
            "title": "TEST_notif_appt",
            "start_at": tomorrow.isoformat(),
            "end_at": end.isoformat(),
            "date": tomorrow.date().isoformat(),
            "time_start": "10:00",
            "time_end": "12:00",
            "employee_ids": [TECH_EMP_ID],
            "notes": "test",
        }
        r = requests.post(f"{BASE_URL}/api/appointments", json=payload, headers=admin_h, timeout=30)
        assert r.status_code in (200, 201), f"Create appt falhou: {r.status_code} {r.text}"
        appt = r.json()
        yield appt
        # Cleanup — DELETE (gera notificação "cancelada", que também limparemos)
        requests.delete(f"{BASE_URL}/api/appointments/{appt['id']}", headers=admin_h, timeout=10)
        # Limpa notificações agenda do tech: tech não pode deletar; só marca como lidas
        requests.post(f"{BASE_URL}/api/tech/notifications/read-all", headers=tech_h, timeout=10)

    def test_create_appt_notifies_tech(self, created_appt, tech_h):
        # Fetch tech notifs
        r = requests.get(f"{BASE_URL}/api/tech/notifications?limit=50", headers=tech_h, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        matched = [n for n in items if n.get("type") == "agenda"
                   and n.get("meta", {}).get("appointment_id") == created_appt["id"]
                   and n.get("title") == "Nova marcação atribuída"]
        assert matched, f"Notificação de nova marcação não criada. Items agenda: {[n for n in items if n['type']=='agenda']}"

    def test_update_appt_notifies_alterada(self, created_appt, admin_h, tech_h):
        # Altera título/horário → deve gerar 'Marcação alterada'
        # AppointmentCreate usa date+time_start+time_end (não start_at/end_at)
        base_dt = datetime.fromisoformat(f"{created_appt['date']}T{created_appt['time_start']}")
        new_start = base_dt + timedelta(hours=1)
        new_end = new_start + timedelta(hours=2)
        payload = {
            "title": "TEST_notif_appt (alterada)",
            "date": new_start.date().isoformat(),
            "time_start": new_start.strftime("%H:%M"),
            "time_end": new_end.strftime("%H:%M"),
            "employee_ids": [TECH_EMP_ID],
            "notes": "alt",
        }
        r = requests.put(f"{BASE_URL}/api/appointments/{created_appt['id']}", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        time.sleep(0.5)
        rn = requests.get(f"{BASE_URL}/api/tech/notifications?limit=50", headers=tech_h, timeout=30)
        assert any(
            n.get("title") == "Marcação alterada"
            and n.get("meta", {}).get("appointment_id") == created_appt["id"]
            for n in rn.json()["items"]
        ), "Notificação 'Marcação alterada' não encontrada"

    def test_delete_appt_notifies_cancelada(self, admin_h, tech_h):
        # Cria uma nova só para testar o cancel
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=3)).replace(hour=14, minute=0, second=0, microsecond=0)
        end = tomorrow + timedelta(hours=1)
        payload = {
            "title": "TEST_notif_appt_cancel",
            "start_at": tomorrow.isoformat(),
            "end_at": end.isoformat(),
            "date": tomorrow.date().isoformat(),
            "time_start": "14:00",
            "time_end": "15:00",
            "employee_ids": [TECH_EMP_ID],
        }
        rc = requests.post(f"{BASE_URL}/api/appointments", json=payload, headers=admin_h, timeout=30)
        assert rc.status_code in (200, 201), rc.text
        aid = rc.json()["id"]
        rd = requests.delete(f"{BASE_URL}/api/appointments/{aid}", headers=admin_h, timeout=10)
        assert rd.status_code == 200
        time.sleep(0.5)
        rn = requests.get(f"{BASE_URL}/api/tech/notifications?limit=50", headers=tech_h, timeout=30)
        assert any(
            n.get("title") == "Marcação cancelada"
            and n.get("meta", {}).get("appointment_id") == aid
            for n in rn.json()["items"]
        ), "Notificação 'Marcação cancelada' não criada"


# --------------- Hook: Chat ---------------
class TestChatHooks:
    def test_tech_message_notifies_admin(self, tech_h, admin_h):
        # Pega count inicial
        r0 = requests.get(f"{BASE_URL}/api/notifications?limit=200", headers=admin_h, timeout=30)
        before_chat = [n for n in r0.json()["items"] if n["type"] == "chat"]
        # Tech envia msg
        r = requests.post(f"{BASE_URL}/api/tech/messages", json={"text": "TEST_notif_chat_from_tech"}, headers=tech_h, timeout=30)
        assert r.status_code in (200, 201), r.text
        time.sleep(0.5)
        r1 = requests.get(f"{BASE_URL}/api/notifications?limit=200", headers=admin_h, timeout=30)
        after_chat = [n for n in r1.json()["items"] if n["type"] == "chat"]
        assert len(after_chat) > len(before_chat), "Admin não recebeu notificação chat do tech"

    def test_admin_message_notifies_tech(self, admin_h, tech_h):
        r0 = requests.get(f"{BASE_URL}/api/tech/notifications?limit=200", headers=tech_h, timeout=30)
        before_chat = [n for n in r0.json()["items"] if n["type"] == "chat"]
        r = requests.post(
            f"{BASE_URL}/api/tech/admin/messages/{TECH_EMP_ID}",
            json={"text": "TEST_notif_chat_from_admin"}, headers=admin_h, timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        time.sleep(0.5)
        r1 = requests.get(f"{BASE_URL}/api/tech/notifications?limit=200", headers=tech_h, timeout=30)
        after_chat = [n for n in r1.json()["items"] if n["type"] == "chat"]
        assert len(after_chat) > len(before_chat), "Tech não recebeu notificação chat do admin"


# --------------- Hook: Transport guides ---------------
class TestGuideHooks:
    def test_create_guide_notifies_tech(self, admin_h, tech_h):
        # Buscar uma obra para associar
        rw = requests.get(f"{BASE_URL}/api/works?limit=1", headers=admin_h, timeout=30)
        if rw.status_code != 200 or not rw.json():
            pytest.skip("Sem obras para criar guia")
        obra = rw.json()[0] if isinstance(rw.json(), list) else rw.json().get("items", [{}])[0]
        obra_id = obra.get("id")
        if not obra_id:
            pytest.skip("Obra sem id")
        payload = {
            "obra_id": obra_id,
            "assigned_employee_id": TECH_EMP_ID,
            "items": [{"name": "TEST_material", "qty_planned": 1, "unit": "un"}],
        }
        r = requests.post(f"{BASE_URL}/api/transport-guides", json=payload, headers=admin_h, timeout=30)
        assert r.status_code in (200, 201), f"Create guide falhou: {r.status_code} {r.text}"
        gid = r.json()["id"]
        time.sleep(0.5)
        rn = requests.get(f"{BASE_URL}/api/tech/notifications?limit=200", headers=tech_h, timeout=30)
        found = any(
            n.get("type") == "guide" and n.get("meta", {}).get("guide_id") == gid
            for n in rn.json()["items"]
        )
        # Cleanup
        requests.delete(f"{BASE_URL}/api/transport-guides/{gid}", headers=admin_h, timeout=10)
        assert found, "Tech não recebeu notificação de nova guia"


# --------------- Isolação ---------------
class TestIsolation:
    def test_tech_cant_read_admin_notif(self, admin_h, tech_h):
        # Admin scan cria pelo menos algumas invoice notifications
        r = requests.get(f"{BASE_URL}/api/notifications?limit=5", headers=admin_h, timeout=30)
        items = r.json()["items"]
        if not items:
            pytest.skip("Admin sem notificações — impossível testar isolação")
        nid = items[0]["id"]
        # Tech tenta marcar como lida via endpoint tech
        r2 = requests.post(f"{BASE_URL}/api/tech/notifications/{nid}/read", headers=tech_h, timeout=10)
        assert r2.status_code == 404, f"Tech deveria não conseguir marcar notif admin (404). got {r2.status_code}"
