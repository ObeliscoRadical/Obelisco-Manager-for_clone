"""
Service Orders module — migrated from Obelisco-Tecnicos-main.
Manages service requests from clients (instalação, reparação, manutenção, etc.)
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os
import httpx

logger = logging.getLogger(__name__)

# Telegram config (optional)
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
TELEGRAM_ADMIN_CHAT_ID = os.environ.get('TELEGRAM_ADMIN_CHAT_ID')


# ── helpers ──────────────────────────────────────────────────────────
async def send_telegram_notification(message: str):
    """Send notification via Telegram bot (fire-and-forget)."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_ADMIN_CHAT_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json={
                "chat_id": TELEGRAM_ADMIN_CHAT_ID,
                "text": message,
                "parse_mode": "HTML",
            })
    except Exception as e:
        logger.warning(f"Telegram notification failed: {e}")


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
    async def reassign_order(order_id: str, technician_id: str, technician_name: str, user=Depends(get_current_user)):
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

    return router
