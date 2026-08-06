"""
Service Orders module — migrated from Obelisco-Tecnicos-main.
Manages service requests from clients (instalação, reparação, manutenção, etc.)
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pathlib import Path
import uuid
import logging
import os
import asyncio
import httpx

logger = logging.getLogger(__name__)

# Telegram config — TWO independent bots
# PONTO BOT: only attendance (entrada/saída)
PONTO_BOT_TOKEN = os.environ.get('PONTO_BOT_TOKEN')
# MANAGER BOT: invoices, reminders, /status, system alerts
MANAGER_BOT_TOKEN = os.environ.get('MANAGER_BOT_TOKEN')
TELEGRAM_ADMIN_CHAT_ID = os.environ.get('TELEGRAM_ADMIN_CHAT_ID')

# Emergent native email (same pattern as CEO AI)
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get('EMERGENT_EMAIL_KEY')
EMAIL_FROM_NAME = os.environ.get('EMAIL_FROM_NAME', 'Obelisco Radical')

# Google Calendar config (optional)
GOOGLE_CALENDAR_ID = os.environ.get('GOOGLE_CALENDAR_ID')
_GCREDS_PATH = Path(__file__).parent / 'google_credentials.json'


# ── helpers ──────────────────────────────────────────────────────────
async def send_telegram_notification(message: str):
    """Send notification via MANAGER bot (orders, invoices, system alerts)."""
    if not MANAGER_BOT_TOKEN or not TELEGRAM_ADMIN_CHAT_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{MANAGER_BOT_TOKEN}/sendMessage"
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json={
                "chat_id": TELEGRAM_ADMIN_CHAT_ID,
                "text": message,
                "parse_mode": "HTML",
            })
    except Exception as e:
        logger.warning(f"Manager bot notification failed: {e}")


async def send_ponto_notification(message: str):
    """Send notification via PONTO bot (attendance only)."""
    if not PONTO_BOT_TOKEN or not TELEGRAM_ADMIN_CHAT_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{PONTO_BOT_TOKEN}/sendMessage"
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json={
                "chat_id": TELEGRAM_ADMIN_CHAT_ID,
                "text": message,
                "parse_mode": "HTML",
            })
    except Exception as e:
        logger.warning(f"Ponto bot notification failed: {e}")


async def send_email_raw(to_email: str, subject: str, html: str):
    """Send email via Emergent native email service (same as CEO AI)."""
    if not EMAIL_KEY:
        logger.warning("EMERGENT_EMAIL_KEY not set — email skipped")
        return False
    payload = {"to": [to_email], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        logger.info(f"Email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return False


def _build_order_confirmation_html(order: dict) -> str:
    stype = SERVICE_TYPES.get(order.get('service_type', ''), {}).get('label', order.get('service_type', ''))
    return f"""<!DOCTYPE html><html><body style="margin:0;background:#09090B;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;padding:32px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#18181B;border-radius:18px;overflow:hidden;">
          <tr><td style="background:#09090B;padding:24px 32px;border-bottom:3px solid #FACC15;">
            <div style="color:#FACC15;font-size:22px;font-weight:700;letter-spacing:1px;">OBELISCO RADICAL</div>
            <div style="color:#a1a1aa;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">Eletricidade &amp; Telecomunicações</div>
          </td></tr>
          <tr><td style="padding:32px;">
            <div style="font-size:22px;color:#ffffff;font-weight:700;line-height:1.35;margin-bottom:8px;">Pedido Recebido!</div>
            <div style="font-size:14px;color:#a1a1aa;line-height:1.6;margin-bottom:20px;">
              Olá <strong style="color:#ffffff;">{order['client_name']}</strong>,<br><br>
              Recebemos o seu pedido de <strong style="color:#FACC15;">{stype}</strong> e entraremos em contacto brevemente.
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#27272A;border-radius:12px;">
              <tr><td style="padding:16px 20px;">
                <div style="font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Resumo do pedido</div>
                <div style="font-size:14px;color:#ffffff;margin-bottom:6px;">⚡ <strong>Tipo:</strong> {stype}</div>
                <div style="font-size:14px;color:#ffffff;margin-bottom:6px;">📍 <strong>Morada:</strong> {order.get('address', '')}</div>
                <div style="font-size:14px;color:#ffffff;">📝 <strong>Descrição:</strong> {order.get('description', '')[:200]}</div>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#09090B;border-top:1px solid #27272A;">
            <div style="font-size:11px;color:#52525B;text-align:center;">© {datetime.now().year} Obelisco Radical - Eletricidade</div>
          </td></tr>
        </table>
      </td></tr>
    </table></body></html>"""


def _build_daily_briefing_html(admin_name: str, agenda_items: list, orders_today: list, app_url: str) -> str:
    hora = datetime.now(timezone.utc).hour
    greeting = "Bom dia" if hora < 12 else ("Boa tarde" if hora < 19 else "Boa noite")

    agenda_rows = ""
    for a in agenda_items:
        agenda_rows += f"""
        <tr><td style="padding:0 0 8px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#27272A;border-radius:8px;">
            <tr>
              <td width="4" style="background:#FACC15;border-radius:8px 0 0 8px;">&nbsp;</td>
              <td style="padding:10px 14px;">
                <div style="font-size:14px;font-weight:700;color:#ffffff;">{a.get('title','')}</div>
                <div style="font-size:12px;color:#a1a1aa;margin-top:2px;">🕐 {a.get('time_start','')}–{a.get('time_end','')} · {a.get('client_name','')}</div>
                {f'<div style="font-size:12px;color:#71717A;">📍 {a.get("location","")}</div>' if a.get('location') else ''}
              </td>
            </tr>
          </table>
        </td></tr>"""
    if not agenda_items:
        agenda_rows = '<tr><td style="padding:8px;color:#71717A;font-size:13px;">Sem agendamentos para hoje.</td></tr>'

    orders_rows = ""
    for o in orders_today:
        stype = SERVICE_TYPES.get(o.get('service_type', ''), {}).get('label', o.get('service_type', ''))
        orders_rows += f"""
        <tr><td style="padding:0 0 8px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#27272A;border-radius:8px;">
            <tr>
              <td width="4" style="background:#3B82F6;border-radius:8px 0 0 8px;">&nbsp;</td>
              <td style="padding:10px 14px;">
                <div style="font-size:14px;font-weight:700;color:#ffffff;">{o.get('client_name','')} — {stype}</div>
                <div style="font-size:12px;color:#a1a1aa;margin-top:2px;">{o.get('description','')[:80]}</div>
              </td>
            </tr>
          </table>
        </td></tr>"""
    if not orders_today:
        orders_rows = '<tr><td style="padding:8px;color:#71717A;font-size:13px;">Sem novos pedidos hoje.</td></tr>'

    return f"""<!DOCTYPE html><html><body style="margin:0;background:#09090B;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;padding:32px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#18181B;border-radius:18px;overflow:hidden;">
          <tr><td style="background:#09090B;padding:24px 32px;border-bottom:3px solid #FACC15;">
            <div style="color:#FACC15;font-size:22px;font-weight:700;letter-spacing:1px;">OBELISCO RADICAL</div>
            <div style="color:#a1a1aa;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">Briefing Diário</div>
          </td></tr>
          <tr><td style="padding:32px;">
            <div style="font-size:22px;color:#ffffff;font-weight:700;line-height:1.35;margin-bottom:20px;">{greeting}, {admin_name}!</div>
            <div style="font-size:15px;color:#FACC15;font-weight:700;margin-bottom:10px;">📅 AGENDA DE HOJE</div>
            <table width="100%" cellpadding="0" cellspacing="0">{agenda_rows}</table>
            <div style="font-size:15px;color:#3B82F6;font-weight:700;margin:20px 0 10px;">⚡ NOVOS PEDIDOS</div>
            <table width="100%" cellpadding="0" cellspacing="0">{orders_rows}</table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td align="center">
              <a href="{app_url}" style="display:inline-block;background:#FACC15;color:#09090B;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:999px;">Abrir Obelisco Manager</a>
            </td></tr></table>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#09090B;border-top:1px solid #27272A;">
            <div style="font-size:11px;color:#52525B;text-align:center;">Briefing automático — Obelisco Radical © {datetime.now().year}</div>
          </td></tr>
        </table>
      </td></tr>
    </table></body></html>"""


def _get_calendar_service():
    """Return Google Calendar API service or None if not configured."""
    if not GOOGLE_CALENDAR_ID or not _GCREDS_PATH.exists():
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        creds = service_account.Credentials.from_service_account_file(
            str(_GCREDS_PATH), scopes=['https://www.googleapis.com/auth/calendar']
        )
        return build('calendar', 'v3', credentials=creds)
    except Exception as e:
        logger.warning(f"Google Calendar init failed: {e}")
        return None


def _create_calendar_event(order: dict):
    """Create event in Google Calendar (fire-and-forget sync)."""
    svc = _get_calendar_service()
    if not svc or not order.get('preferred_date'):
        return None
    try:
        pref = order['preferred_date']
        start_dt = datetime.fromisoformat(pref.replace('Z', '+00:00')) if 'T' in pref else datetime.strptime(pref, '%Y-%m-%d').replace(hour=9, minute=0)
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        end_dt = start_dt + timedelta(hours=2)
        label = SERVICE_TYPES.get(order.get('service_type', ''), {}).get('label', order.get('service_type', ''))
        event = {
            'summary': f"⚡ {label} - {order['client_name']}",
            'description': f"Cliente: {order['client_name']}\nTel: {order.get('phone','')}\nEmail: {order.get('email','')}\n\n{order.get('description','')}",
            'location': order.get('address', ''),
            'start': {'dateTime': start_dt.isoformat(), 'timeZone': 'Europe/Lisbon'},
            'end': {'dateTime': end_dt.isoformat(), 'timeZone': 'Europe/Lisbon'},
            'reminders': {'useDefault': False, 'overrides': [{'method': 'popup', 'minutes': 60}, {'method': 'popup', 'minutes': 1440}]},
        }
        created = svc.events().insert(calendarId=GOOGLE_CALENDAR_ID, body=event).execute()
        logger.info(f"Calendar event created: {created.get('id')}")
        return created.get('htmlLink')
    except Exception as e:
        logger.warning(f"Calendar event creation failed: {e}")
        return None


def _check_calendar_availability(preferred_date: str, duration_hours: int = 2):
    """Check availability and suggest alternatives. Returns (has_conflict, conflicts, suggestions)."""
    svc = _get_calendar_service()
    if not svc:
        return False, [], []
    try:
        start_dt = datetime.fromisoformat(preferred_date.replace('Z', '+00:00')) if 'T' in preferred_date else datetime.strptime(preferred_date, '%Y-%m-%d').replace(hour=9, minute=0)
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        end_dt = start_dt + timedelta(hours=duration_hours)
        events = svc.events().list(calendarId=GOOGLE_CALENDAR_ID, timeMin=start_dt.isoformat(), timeMax=end_dt.isoformat(), singleEvents=True, orderBy='startTime').execute().get('items', [])
        if not events:
            return False, [], []
        conflicts = [{'summary': e.get('summary', ''), 'start': e['start'].get('dateTime', e['start'].get('date')), 'end': e['end'].get('dateTime', e['end'].get('date'))} for e in events]
        # Suggest 3 alternatives
        suggestions = []
        check = start_dt + timedelta(hours=duration_hours + 1)
        for _ in range(100):
            if len(suggestions) >= 3 or (check - start_dt).days > 14:
                break
            if check.weekday() >= 5:
                check = check.replace(hour=9, minute=0) + timedelta(days=1)
                continue
            if check.hour < 9:
                check = check.replace(hour=9, minute=0)
            elif check.hour >= 18:
                check = (check + timedelta(days=1)).replace(hour=9, minute=0)
                continue
            check_end = check + timedelta(hours=duration_hours)
            evts = svc.events().list(calendarId=GOOGLE_CALENDAR_ID, timeMin=check.isoformat(), timeMax=check_end.isoformat(), singleEvents=True).execute().get('items', [])
            if not evts:
                suggestions.append({'datetime': check.isoformat(), 'display': check.strftime('%d/%m/%Y às %H:%M')})
            check += timedelta(hours=1)
        return True, conflicts, suggestions
    except Exception as e:
        logger.warning(f"Calendar check failed: {e}")
        return False, [], []


SERVICE_TYPES = {
    "instalacao":     {"label": "Instalação",     "color": "blue"},
    "reparacao":      {"label": "Reparação",      "color": "orange"},
    "manutencao":     {"label": "Manutenção",     "color": "green"},
    "visita_tecnica": {"label": "Visita Técnica", "color": "purple"},
    "certificacao":   {"label": "Certificação",   "color": "cyan"},
}


# ── models ───────────────────────────────────────────────────────────
class OrderCreate(BaseModel):
    client_name: str
    email: EmailStr
    phone: str
    address: str
    description: str
    service_type: str = "reparacao"
    preferred_date: Optional[str] = None

class OrderUpdate(BaseModel):
    status: Optional[str] = None
    assigned_technician_id: Optional[str] = None
    assigned_technician_name: Optional[str] = None

class NoteCreate(BaseModel):
    text: str

class NoteUpdate(BaseModel):
    text: str

class PhotoUpload(BaseModel):
    image_data: str
    caption: str = ""

class TimeclockEntry(BaseModel):
    type: str  # entrada | saida
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None


# ── router factory ───────────────────────────────────────────────────
def create_service_orders_router(db, get_current_user):
    """
    Factory that receives the shared db handle and auth dependency
    from server.py so we don't duplicate connections.
    """
    router = APIRouter(prefix="/api/service-orders", tags=["service-orders"])

    # Admin emails (same list used by the main app)
    ADMIN_EMAILS = [
        os.environ.get("ADMIN_EMAIL", "admin@obelisco.pt"),
        "admin@obelisco.pt",
        "d.oliveira1986@gmail.com",
    ]

    def _is_admin(user: dict) -> bool:
        if user.get("role") == "admin":
            return True
        return user.get("email") in ADMIN_EMAILS

    def _now():
        return datetime.now(timezone.utc).isoformat()

    # ── Dashboard ─────────────────────────────────────────────────
    @router.get("/dashboard/stats")
    async def get_dashboard_stats(user=Depends(get_current_user)):
        total = await db.service_orders.count_documents({})
        pending = await db.service_orders.count_documents({"status": "pendente"})
        in_progress = await db.service_orders.count_documents({"status": "em_progresso"})
        completed = await db.service_orders.count_documents({"status": "concluido"})

        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        orders_today = await db.service_orders.count_documents({"created_at": {"$gte": today_start}})

        week_start = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        orders_week = await db.service_orders.count_documents({"created_at": {"$gte": week_start}})

        return {
            "total_orders": total,
            "pending_orders": pending,
            "in_progress_orders": in_progress,
            "completed_orders": completed,
            "orders_today": orders_today,
            "orders_this_week": orders_week,
        }

    @router.get("/dashboard/recent")
    async def get_recent_orders(limit: int = 5, user=Depends(get_current_user)):
        cursor = db.service_orders.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
        return await cursor.to_list(length=limit)

    # ── Calendar availability ─────────────────────────────────────
    @router.get("/check-availability")
    async def check_availability(preferred_date: str, duration_hours: int = 2):
        """Public: check if a date/time is available on Google Calendar."""
        has_conflict, conflicts, suggestions = _check_calendar_availability(preferred_date, duration_hours)
        return {
            "available": not has_conflict,
            "conflicts": conflicts,
            "suggested_times": suggestions,
        }

    # ── CRUD ──────────────────────────────────────────────────────
    @router.post("")
    async def create_order_public(data: OrderCreate, background_tasks: BackgroundTasks):
        """Public endpoint — clients create orders without auth."""
        order = {
            "id": str(uuid.uuid4()),
            "client_name": data.client_name,
            "email": data.email,
            "phone": data.phone,
            "address": data.address,
            "description": data.description,
            "service_type": data.service_type,
            "preferred_date": data.preferred_date,
            "status": "pendente",
            "assigned_technician_id": None,
            "assigned_technician_name": None,
            "notes": [],
            "photos": [],
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.service_orders.insert_one(order)

        # Create Google Calendar event (background)
        if data.preferred_date:
            background_tasks.add_task(_create_calendar_event, order)

        stype = SERVICE_TYPES.get(data.service_type, {}).get("label", data.service_type)
        msg = (
            f"🆕 <b>Novo Pedido de Serviço</b>\n\n"
            f"👤 {data.client_name}\n"
            f"📞 {data.phone}\n"
            f"📍 {data.address}\n"
            f"⚡ Tipo: {stype}\n"
        )
        if data.preferred_date:
            msg += f"📅 Data preferida: {data.preferred_date}\n"
        background_tasks.add_task(send_telegram_notification, msg)

        # Email confirmation to client (Emergent native email)
        html = _build_order_confirmation_html(order)
        stype_label = SERVICE_TYPES.get(data.service_type, {}).get("label", data.service_type)
        background_tasks.add_task(send_email_raw, data.email, f"Obelisco Radical — Pedido de {stype_label} recebido", html)

        order.pop("_id", None)
        return order

    @router.post("/admin")
    async def admin_create_order(data: OrderCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
        """Admin creates order manually."""
        if not _is_admin(user):
            raise HTTPException(403, "Apenas administradores podem criar pedidos")
        order = {
            "id": str(uuid.uuid4()),
            "client_name": data.client_name,
            "email": data.email,
            "phone": data.phone,
            "address": data.address,
            "description": data.description,
            "service_type": data.service_type,
            "preferred_date": data.preferred_date,
            "status": "pendente",
            "assigned_technician_id": None,
            "assigned_technician_name": None,
            "notes": [],
            "photos": [],
            "created_by": user.get("name", "Admin"),
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.service_orders.insert_one(order)
        if data.preferred_date:
            background_tasks.add_task(_create_calendar_event, order)
        order.pop("_id", None)
        return order

    @router.get("")
    async def list_orders(status: Optional[str] = None, user=Depends(get_current_user)):
        query = {}
        if status and status != "all":
            query["status"] = status
        cursor = db.service_orders.find(query, {"_id": 0}).sort("created_at", -1)
        return await cursor.to_list(length=500)

    @router.get("/history")
    async def get_order_history(page: int = 1, limit: int = 20, user=Depends(get_current_user)):
        skip = (page - 1) * limit
        cursor = (
            db.service_orders.find({"status": "concluido"}, {"_id": 0})
            .sort("updated_at", -1)
            .skip(skip)
            .limit(limit)
        )
        orders = await cursor.to_list(length=limit)
        total = await db.service_orders.count_documents({"status": "concluido"})
        return {"orders": orders, "total": total, "page": page, "pages": (total + limit - 1) // limit}

    @router.get("/{order_id}")
    async def get_order(order_id: str, user=Depends(get_current_user)):
        order = await db.service_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(404, "Pedido não encontrado")
        return order

    @router.patch("/{order_id}")
    async def update_order(order_id: str, data: OrderUpdate, user=Depends(get_current_user)):
        order = await db.service_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(404, "Pedido não encontrado")
        update = {"updated_at": _now()}
        if data.status is not None:
            update["status"] = data.status
        if data.assigned_technician_id is not None:
            update["assigned_technician_id"] = data.assigned_technician_id
        if data.assigned_technician_name is not None:
            update["assigned_technician_name"] = data.assigned_technician_name
        await db.service_orders.update_one({"id": order_id}, {"$set": update})
        updated = await db.service_orders.find_one({"id": order_id}, {"_id": 0})
        return updated

    @router.delete("/{order_id}")
    async def delete_order(order_id: str, user=Depends(get_current_user)):
        if not _is_admin(user):
            raise HTTPException(403, "Apenas administradores podem apagar pedidos")
        result = await db.service_orders.delete_one({"id": order_id})
        if result.deleted_count == 0:
            raise HTTPException(404, "Pedido não encontrado")
        return {"message": "Pedido apagado"}

    # ── Notes ─────────────────────────────────────────────────────
    @router.post("/{order_id}/notes")
    async def add_note(order_id: str, data: NoteCreate, user=Depends(get_current_user)):
        order = await db.service_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(404, "Pedido não encontrado")
        note = {
            "id": str(uuid.uuid4()),
            "text": data.text,
            "created_by": str(user.get("sub") or user.get("id", "")),
            "created_by_name": user.get("name", ""),
            "created_at": _now(),
        }
        await db.service_orders.update_one({"id": order_id}, {"$push": {"notes": note}, "$set": {"updated_at": _now()}})
        return note

    @router.put("/{order_id}/notes/{note_id}")
    async def update_note(order_id: str, note_id: str, data: NoteUpdate, user=Depends(get_current_user)):
        result = await db.service_orders.update_one(
            {"id": order_id, "notes.id": note_id},
            {"$set": {"notes.$.text": data.text, "updated_at": _now()}},
        )
        if result.matched_count == 0:
            raise HTTPException(404, "Nota não encontrada")
        return {"message": "Nota atualizada"}

    @router.delete("/{order_id}/notes/{note_id}")
    async def delete_note(order_id: str, note_id: str, user=Depends(get_current_user)):
        result = await db.service_orders.update_one(
            {"id": order_id},
            {"$pull": {"notes": {"id": note_id}}, "$set": {"updated_at": _now()}},
        )
        if result.matched_count == 0:
            raise HTTPException(404, "Pedido não encontrado")
        return {"message": "Nota apagada"}

    # ── Photos ────────────────────────────────────────────────────
    @router.post("/{order_id}/photos")
    async def upload_photo(order_id: str, data: PhotoUpload, user=Depends(get_current_user)):
        order = await db.service_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(404, "Pedido não encontrado")
        photo = {
            "id": str(uuid.uuid4()),
            "image_data": data.image_data,
            "caption": data.caption,
            "uploaded_by": user.get("name", ""),
            "uploaded_at": _now(),
        }
        await db.service_orders.update_one({"id": order_id}, {"$push": {"photos": photo}, "$set": {"updated_at": _now()}})
        return photo

    @router.post("/{order_id}/photos/public")
    async def upload_photo_public(order_id: str, data: PhotoUpload):
        """Public photo upload (from widget)."""
        order = await db.service_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(404, "Pedido não encontrado")
        photo = {
            "id": str(uuid.uuid4()),
            "image_data": data.image_data,
            "caption": data.caption or "Foto enviada pelo cliente",
            "uploaded_by": "Cliente",
            "uploaded_at": _now(),
        }
        await db.service_orders.update_one({"id": order_id}, {"$push": {"photos": photo}})
        return photo

    @router.delete("/{order_id}/photos/{photo_id}")
    async def delete_photo(order_id: str, photo_id: str, user=Depends(get_current_user)):
        result = await db.service_orders.update_one(
            {"id": order_id},
            {"$pull": {"photos": {"id": photo_id}}, "$set": {"updated_at": _now()}},
        )
        if result.matched_count == 0:
            raise HTTPException(404, "Pedido não encontrado")
        return {"message": "Foto apagada"}

    # ── Reassign / Reschedule ─────────────────────────────────────
    @router.put("/{order_id}/reassign")
    async def reassign_order(order_id: str, technician_id: str, technician_name: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
        if not _is_admin(user):
            raise HTTPException(403, "Apenas administradores")
        order = await db.service_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(404, "Pedido não encontrado")
        update = {
            "assigned_technician_id": technician_id,
            "assigned_technician_name": technician_name,
            "updated_at": _now(),
        }
        if order.get("status") == "pendente":
            update["status"] = "em_progresso"
        await db.service_orders.update_one({"id": order_id}, {"$set": update})

        # Push notification to assigned technician
        from push_notifications import send_push_to_user, PushMessage
        stype = SERVICE_TYPES.get(order.get("service_type", ""), {}).get("label", "Serviço")
        background_tasks.add_task(
            send_push_to_user, db, technician_id,
            PushMessage(
                title="Novo Pedido Atribuído",
                body=f"{stype} — {order.get('client_name', '')} · {order.get('address', '')[:50]}",
                tag=f"order-assign-{order_id}",
                url="/tech/pedidos",
            )
        )

        return {"message": f"Pedido atribuído a {technician_name}"}

    # ── Technicians list (for assignment dropdown) ────────────────
    @router.get("/helpers/technicians")
    async def list_technicians(user=Depends(get_current_user)):
        """Return employees (active) for assignment."""
        cursor = db.employees.find({"is_active": True}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1})
        employees = await cursor.to_list(length=200)
        return employees

    # ── Timeclock with GPS ────────────────────────────────────────
    @router.post("/timeclock")
    async def register_timeclock(data: TimeclockEntry, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
        if data.type not in ("entrada", "saida"):
            raise HTTPException(400, "Tipo inválido. Use 'entrada' ou 'saida'.")

        # Check current status
        last = await db.service_timeclock.find_one(
            {"technician_id": str(user.get("sub") or user.get("id", ""))},
            sort=[("timestamp", -1)],
        )
        if last:
            if data.type == "entrada" and last.get("type") == "entrada":
                raise HTTPException(400, "Já tem uma entrada registada sem saída")
            if data.type == "saida" and last.get("type") != "entrada":
                raise HTTPException(400, "Não tem entrada registada")

        entry = {
            "id": str(uuid.uuid4()),
            "technician_id": str(user.get("sub") or user.get("id", "")),
            "technician_name": user.get("name", ""),
            "technician_email": user.get("email", ""),
            "type": data.type,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "address": data.address,
            "timestamp": _now(),
        }
        await db.service_timeclock.insert_one(entry)
        entry.pop("_id", None)

        # Telegram notification
        emoji = "🟢" if data.type == "entrada" else "🔴"
        tipo = "ENTRADA" if data.type == "entrada" else "SAÍDA"
        hora = datetime.now(timezone.utc).strftime("%H:%M")
        msg = f"{emoji} {user.get('name', '')} registou {tipo}\n⏰ Hora: {hora}"
        if data.address:
            msg += f"\n📍 Local: {data.address}"
        elif data.latitude and data.longitude:
            msg += f"\n📍 GPS: {data.latitude:.5f}, {data.longitude:.5f}"
        background_tasks.add_task(send_telegram_notification, msg)

        return entry

    @router.get("/timeclock/my-status")
    async def get_my_status(user=Depends(get_current_user)):
        tech_id = str(user.get("sub") or user.get("id", ""))
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        cursor = db.service_timeclock.find(
            {"technician_id": tech_id, "timestamp": {"$gte": today_start}},
            {"_id": 0},
        ).sort("timestamp", 1)
        today_entries = await cursor.to_list(length=100)

        last = await db.service_timeclock.find_one(
            {"technician_id": tech_id},
            {"_id": 0},
            sort=[("timestamp", -1)],
        )
        is_clocked_in = last.get("type") == "entrada" if last else False
        return {
            "is_clocked_in": is_clocked_in,
            "last_entry": last,
            "today_entries": today_entries,
        }

    @router.get("/timeclock/today")
    async def get_today_entries(user=Depends(get_current_user)):
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        query = {"timestamp": {"$gte": today_start}}
        if not _is_admin(user):
            query["technician_id"] = str(user.get("sub") or user.get("id", ""))
        cursor = db.service_timeclock.find(query, {"_id": 0}).sort("timestamp", -1)
        return await cursor.to_list(length=200)

    @router.get("/timeclock/all")
    async def get_all_timeclock(
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user=Depends(get_current_user),
    ):
        if not _is_admin(user):
            raise HTTPException(403, "Apenas administradores")
        query = {}
        if start_date:
            query.setdefault("timestamp", {})["$gte"] = f"{start_date}T00:00:00"
        if end_date:
            query.setdefault("timestamp", {})["$lte"] = f"{end_date}T23:59:59"
        cursor = db.service_timeclock.find(query, {"_id": 0}).sort("timestamp", -1)
        entries = await cursor.to_list(length=5000)
        return {"entries": entries, "total": len(entries)}

    @router.get("/timeclock/export")
    async def export_timeclock_csv(
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user=Depends(get_current_user),
    ):
        if not _is_admin(user):
            raise HTTPException(403, "Apenas administradores")
        query = {}
        if start_date:
            query.setdefault("timestamp", {})["$gte"] = f"{start_date}T00:00:00"
        if end_date:
            query.setdefault("timestamp", {})["$lte"] = f"{end_date}T23:59:59"
        cursor = db.service_timeclock.find(query, {"_id": 0}).sort("timestamp", -1)
        entries = await cursor.to_list(length=10000)

        import csv
        import io
        from starlette.responses import StreamingResponse

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Técnico", "Email", "Tipo", "Data/Hora", "Endereço", "Latitude", "Longitude"])
        for e in entries:
            writer.writerow([
                e.get("technician_name", ""),
                e.get("technician_email", ""),
                e.get("type", ""),
                e.get("timestamp", ""),
                e.get("address", ""),
                e.get("latitude", ""),
                e.get("longitude", ""),
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=registos_ponto.csv"},
        )

    # ── Daily Briefing Email ──────────────────────────────────────
    @router.post("/briefing/send")
    async def send_daily_briefing(user=Depends(get_current_user)):
        """Send daily briefing email to admin with today's agenda + new orders."""
        if not _is_admin(user):
            raise HTTPException(403, "Apenas administradores")

        admin_email = user.get("email")
        admin_name = user.get("name", "Admin")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Get today's agenda
        agenda_cursor = db.appointments.find({"date": today}, {"_id": 0}).sort("time_start", 1)
        agenda_items = await agenda_cursor.to_list(50)

        # Get today's new orders
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        orders_cursor = db.service_orders.find(
            {"created_at": {"$gte": today_start}}, {"_id": 0}
        ).sort("created_at", -1)
        orders_today = await orders_cursor.to_list(20)

        app_url = os.environ.get("CORS_ORIGINS", "https://proposal-hub-56.emergent.host").split(",")[0].strip().strip('"')
        html = _build_daily_briefing_html(admin_name, agenda_items, orders_today, app_url)
        ok = await send_email_raw(admin_email, f"Obelisco Radical — Briefing de {today}", html)

        # Also send push to all techs with briefing summary
        from push_notifications import send_push_to_all_techs, PushMessage
        n_agenda = len(agenda_items)
        n_orders = len(orders_today)
        await send_push_to_all_techs(db, PushMessage(
            title="Bom dia! Briefing Diário",
            body=f"📅 {n_agenda} agendamento{'s' if n_agenda != 1 else ''} · ⚡ {n_orders} pedido{'s' if n_orders != 1 else ''} novo{'s' if n_orders != 1 else ''}",
            tag="daily-briefing",
            url="/tech/pedidos",
        ))

        if ok:
            return {"sent": True, "to": admin_email}
        raise HTTPException(500, "Falha ao enviar email. Verifique EMERGENT_EMAIL_KEY.")

    @router.get("/email/test")
    async def test_email(to: str, user=Depends(get_current_user)):
        """Admin test — send a test email."""
        if not _is_admin(user):
            raise HTTPException(403, "Apenas administradores")
        html = f"""<div style="font-family:Arial;padding:20px;background:#09090B;color:#fff;">
            <h2 style="color:#FACC15;">Obelisco Radical — Teste de Email</h2>
            <p>Se recebeu este email, o serviço está configurado correctamente.</p>
            <p style="color:#71717A;font-size:12px;">Enviado em {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}</p>
        </div>"""
        ok = await send_email_raw(to, "Obelisco Radical — Teste de Email", html)
        return {"sent": ok, "to": to}

    return router
