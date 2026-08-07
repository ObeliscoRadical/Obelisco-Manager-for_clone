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


async def _mark_dispatch(db, channel: str, dispatch_key: str, payload: Optional[dict] = None):
    await db.notification_dispatches.update_one(
        {"channel": channel, "dispatch_key": dispatch_key},
        {"$set": {"channel": channel, "dispatch_key": dispatch_key, "payload": payload or {}, "sent_at": _now_iso()}},
        upsert=True,
    )


async def _was_dispatched(db, channel: str, dispatch_key: str) -> bool:
    existing = await db.notification_dispatches.find_one({"channel": channel, "dispatch_key": dispatch_key}, {"_id": 0, "channel": 1})
    return bool(existing)


def _build_treasury_email_html(title: str, message: str, link: str) -> str:
    cta = f'<a href="{link}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#FACC15;color:#18181B;text-decoration:none;font-weight:700;">Abrir painel</a>' if (link or '').startswith('http') else '<div style="font-size:13px;color:#a1a1aa;line-height:1.7;">Abra o painel de Análise Bancária no Obelisco Manager para ver o detalhe.</div>'
    return f"""<!DOCTYPE html><html><body style=\"margin:0;background:#09090B;font-family:Arial,Helvetica,sans-serif;\">
    <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#09090B;padding:32px 0;\"><tr><td align=\"center\">
      <table width=\"620\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#18181B;border-radius:18px;overflow:hidden;\">
        <tr><td style=\"background:#09090B;padding:24px 32px;border-bottom:3px solid #FACC15;\">
          <div style=\"color:#FACC15;font-size:22px;font-weight:700;letter-spacing:1px;\">OBELISCO RADICAL</div>
          <div style=\"color:#a1a1aa;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;\">Alerta de Tesouraria</div>
        </td></tr>
        <tr><td style=\"padding:32px;\">
          <div style=\"font-size:22px;color:#ffffff;font-weight:700;line-height:1.35;margin-bottom:8px;\">{title}</div>
          <div style=\"font-size:14px;color:#d4d4d8;line-height:1.7;margin-bottom:18px;\">{message}</div>
          {cta}
        </td></tr>
      </table>
    </td></tr></table></body></html>"""


async def scan_and_dispatch_treasury_alerts(db) -> dict:
    """Cria notificações idempotentes e envia email/Telegram para alertas de tesouraria."""
    try:
        from bank_analysis import _build_treasury_insights
        from service_orders import send_email_raw, send_telegram_notification, EMAIL_KEY, MANAGER_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID

        insights = await _build_treasury_insights(db, days=60)
        today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        admins = await db.users.find({"role": "admin"}, {"email": 1, "name": 1}).to_list(100)
        result = {"notifications": 0, "email": 0, "telegram": 0, "alerts": []}

        alert_specs = []
        summary30 = insights.get("projection", {}).get("summary_30d", {})
        shortfall_date = summary30.get("next_shortfall_date")
        if shortfall_date or summary30.get("lowest_balance", 0) < 0:
            alert_specs.append({
                "dispatch_key": f"treasury-negative:{today_key}:{shortfall_date or 'none'}",
                "title": "Saldo em risco nos próximos 30 dias",
                "message": f"A projeção indica saldo mínimo de {summary30.get('lowest_balance', 0):.2f}€ e possível défice a partir de {shortfall_date or 'data não definida'}.",
                "link": "/analise-bancaria",
                "type": "treasury",
                "meta": {"kind": "negative_projection", "next_shortfall_date": shortfall_date, "lowest_balance": summary30.get("lowest_balance")},
            })

        anomalies = insights.get("anomalies", {}).get("items", [])
        if anomalies:
            top = anomalies[0]
            alert_specs.append({
                "dispatch_key": f"treasury-anomaly:{today_key}:{top.get('desc_key', 'generic')}:{insights.get('anomalies', {}).get('count', 0)}",
                "title": "Débito anómalo detetado",
                "message": f"{top.get('description', 'Custo recorrente')} subiu {top.get('increase_pct', 0):.1f}% para {top.get('last_amount', 0):.2f}€.",
                "link": "/analise-bancaria",
                "type": "treasury",
                "meta": {"kind": "anomaly", "desc_key": top.get("desc_key"), "increase_pct": top.get("increase_pct"), "count": insights.get("anomalies", {}).get("count", 0)},
            })

        if not alert_specs:
            return result

        for alert in alert_specs:
            for admin in admins:
                admin_id = str(admin.get("_id") or admin.get("id") or "")
                if not admin_id:
                    continue
                created = await create_notification(
                    db,
                    user_id=admin_id,
                    user_kind="user",
                    type=alert["type"],
                    title=alert["title"],
                    message=alert["message"],
                    link=alert["link"],
                    dedup_key=alert["dispatch_key"],
                    meta=alert["meta"],
                )
                if created:
                    result["notifications"] += 1

            if EMAIL_KEY and not await _was_dispatched(db, "email", alert["dispatch_key"]):
                sent_all = 0
                for admin in admins:
                    email = (admin.get("email") or "").strip()
                    if not email:
                        continue
                    ok = await send_email_raw(
                        email,
                        f"Obelisco Manager — {alert['title']}",
                        _build_treasury_email_html(alert["title"], alert["message"], f"/analise-bancaria"),
                    )
                    if ok:
                        sent_all += 1
                if sent_all:
                    await _mark_dispatch(db, "email", alert["dispatch_key"], {"sent": sent_all})
                    result["email"] += sent_all

            if MANAGER_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID and not await _was_dispatched(db, "telegram", alert["dispatch_key"]):
                await send_telegram_notification(
                    f"⚠️ <b>{alert['title']}</b>\n\n{alert['message']}\n\nAbra o painel de Análise Bancária para detalhe."
                )
                await _mark_dispatch(db, "telegram", alert["dispatch_key"], {"chat_id": TELEGRAM_ADMIN_CHAT_ID})
                result["telegram"] += 1

            result["alerts"].append(alert["dispatch_key"])

        return result
    except Exception:
        return {"notifications": 0, "email": 0, "telegram": 0, "alerts": []}


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
            await scan_and_dispatch_treasury_alerts(db)
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
