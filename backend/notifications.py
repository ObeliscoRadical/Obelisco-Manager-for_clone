"""
Sistema de notificações in-app (sem push).

Coleção MongoDB: `notifications`
Schema:
{
  id: str,
  user_id: str,               # dono da notificação (id do users OU do employees)
  user_kind: "user"|"employee",
  type: "chat" | "agenda" | "guide" | "invoice",
  title: str,
  message: str,
  link: str,                  # rota frontend a abrir
  read: bool,
  dedup_key: Optional[str],   # evita duplicações (ex: fatura vencida no dia X)
  meta: dict,
  created_at: iso str
}

Endpoints (registados via create_notifications_router):
- GET  /api/notifications?unread_only=&limit=
- POST /api/notifications/{id}/read
- POST /api/notifications/read-all
- DELETE /api/notifications/{id}

Helper create_notification(...) é usado internamente pelo resto do backend
para gerar notificações quando ocorrem eventos.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import uuid


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_notification(
    db,
    *,
    user_id: str,
    user_kind: str,
    type: str,
    title: str,
    message: str,
    link: str = "",
    dedup_key: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Cria uma notificação. Se dedup_key existir e já houver notificação com esse
    dedup_key para o mesmo user, não cria uma nova (idempotente)."""
    if not user_id:
        return None
    if dedup_key:
        existing = await db.notifications.find_one({"user_id": user_id, "dedup_key": dedup_key}, {"_id": 0, "id": 1})
        if existing:
            return None
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_kind": user_kind,
        "type": type,
        "title": title[:120],
        "message": message[:400],
        "link": link,
        "read": False,
        "dedup_key": dedup_key,
        "meta": meta or {},
        "created_at": _now_iso(),
    }
    await db.notifications.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def notify_admins(db, get_admin_users_fn, **kwargs) -> None:
    """Notifica todos os utilizadores com role=admin."""
    admins = await get_admin_users_fn()
    for a in admins:
        await create_notification(db, user_id=a["id"], user_kind="user", **kwargs)


def create_notifications_router(db, get_current_user, get_tech_user):
    router = APIRouter(prefix="/api/notifications", tags=["notifications"])

    async def _resolve_recipient(request_user) -> Dict[str, str]:
        """Retorna {user_id, user_kind} baseado no user autenticado.
        Um user 'admin' ou user normal → kind='user', id=user.id
        Um técnico autenticado por header ou tech-token → kind='employee', id=employee.id
        """
        # get_current_user devolve o registo de `users`; para técnicos tem id do employee.
        # Verificamos pela role — techs têm role='tecnico' ou vêm do fluxo tech.
        role = (request_user.get("role") or "").lower()
        # Para segurança, cada notificação está atrelada ao user_id do próprio user autenticado.
        return {"user_id": request_user["id"], "user_kind": "employee" if role == "tecnico" else "user"}

    async def _scan_invoice_alerts_for_admin(admin_id: str):
        """Cria notificações (idempotentes por dedup_key) para faturas vencidas hoje ou já vencidas
        e ainda com balance>0. Só corre para admins."""
        try:
            today = datetime.now(timezone.utc).date()
            invoices = await db.invoices.find({}, {"_id": 0}).to_list(5000)
            for inv in invoices:
                total = float(inv.get("value_total") or 0)
                paid = sum(float(p.get("amount") or 0) for p in (inv.get("payments") or []))
                balance = total - paid
                if balance <= 0.01:
                    continue
                due = inv.get("due_date") or ""
                if not due:
                    continue
                try:
                    due_d = datetime.strptime(due[:10], "%Y-%m-%d").date()
                except Exception:
                    continue
                if due_d > today:
                    continue
                days_over = (today - due_d).days
                key = f"invoice_due:{inv.get('id')}:{today.isoformat()}"
                title = "Fatura vencida hoje" if days_over == 0 else f"Fatura em atraso ({days_over} dias)"
                await create_notification(
                    db, user_id=admin_id, user_kind="user", type="invoice",
                    title=title,
                    message=f"Nº {inv.get('number', '')} · {inv.get('client_name', '')} · {round(balance, 2)}€",
                    link="/faturas",
                    dedup_key=key,
                    meta={"invoice_id": inv.get("id"), "days_overdue": days_over},
                )
        except Exception:
            pass

    @router.get("")
    async def list_notifications(
        unread_only: bool = Query(False),
        limit: int = Query(50, ge=1, le=200),
        user=Depends(get_current_user),
    ):
        rec = await _resolve_recipient(user)
        # Scan on-demand para admins (idempotente via dedup_key)
        if (user.get("role") or "").lower() == "admin":
            await _scan_invoice_alerts_for_admin(rec["user_id"])
        q = {"user_id": rec["user_id"]}
        if unread_only:
            q["read"] = False
        items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        unread = await db.notifications.count_documents({"user_id": rec["user_id"], "read": False})
        return {"items": items, "unread_count": unread}

    @router.post("/{notification_id}/read")
    async def mark_read(notification_id: str, user=Depends(get_current_user)):
        rec = await _resolve_recipient(user)
        result = await db.notifications.update_one(
            {"id": notification_id, "user_id": rec["user_id"]}, {"$set": {"read": True}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Notificação não encontrada")
        return {"ok": True}

    @router.post("/read-all")
    async def mark_all_read(user=Depends(get_current_user)):
        rec = await _resolve_recipient(user)
        result = await db.notifications.update_many({"user_id": rec["user_id"], "read": False}, {"$set": {"read": True}})
        return {"ok": True, "updated": result.modified_count}

    @router.delete("/{notification_id}")
    async def delete_notification(notification_id: str, user=Depends(get_current_user)):
        rec = await _resolve_recipient(user)
        result = await db.notifications.delete_one({"id": notification_id, "user_id": rec["user_id"]})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Notificação não encontrada")
        return {"ok": True}

    # ---- Endpoint para técnico (usa get_tech_user, que resolve por header X-Tech-Session) ----
    tech_router = APIRouter(prefix="/api/tech/notifications", tags=["notifications-tech"])

    @tech_router.get("")
    async def list_tech_notifications(
        unread_only: bool = Query(False),
        limit: int = Query(50, ge=1, le=200),
        user=Depends(get_tech_user),
    ):
        uid = user.get("id")
        q = {"user_id": uid}
        if unread_only:
            q["read"] = False
        items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        unread = await db.notifications.count_documents({"user_id": uid, "read": False})
        return {"items": items, "unread_count": unread}

    @tech_router.post("/{notification_id}/read")
    async def tech_mark_read(notification_id: str, user=Depends(get_tech_user)):
        uid = user.get("id")
        result = await db.notifications.update_one({"id": notification_id, "user_id": uid}, {"$set": {"read": True}})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Notificação não encontrada")
        return {"ok": True}

    @tech_router.post("/read-all")
    async def tech_mark_all_read(user=Depends(get_tech_user)):
        uid = user.get("id")
        result = await db.notifications.update_many({"user_id": uid, "read": False}, {"$set": {"read": True}})
        return {"ok": True, "updated": result.modified_count}

    return router, tech_router
