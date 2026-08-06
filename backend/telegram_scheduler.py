"""
Telegram Bot commands + scheduled payment reminders.
- /status: lists upcoming payments for next 7 days
- Daily scheduler: sends reminders 2 days before each recurring payment
"""
import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
TELEGRAM_ADMIN_CHAT_ID = os.environ.get('TELEGRAM_ADMIN_CHAT_ID')
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else None

_last_update_id = 0


async def _send_message(chat_id: str, text: str, parse_mode: str = "HTML"):
    """Send a Telegram message."""
    if not TELEGRAM_API:
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(f"{TELEGRAM_API}/sendMessage", json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            })
    except Exception as e:
        logger.warning(f"Telegram send failed: {e}")


async def _handle_status_command(chat_id: str, db):
    """Handle /status command — list upcoming payments for next 7 days."""
    today = datetime.now(timezone.utc)
    today_str = today.strftime("%Y-%m-%d")
    week_end = (today + timedelta(days=7)).strftime("%Y-%m-%d")

    # Query predicted bills from appointments
    cursor = db.appointments.find({
        "is_predicted_bill": True,
        "date": {"$gte": today_str, "$lte": week_end},
    }, {"_id": 0}).sort("date", 1)
    bills = await cursor.to_list(50)

    if not bills:
        await _send_message(chat_id,
            "✅ <b>Tudo em dia!</b>\n\n"
            "Nenhuma conta prevista para os próximos 7 dias."
        )
        return

    total = sum(b.get("predicted_amount", 0) for b in bills)

    lines = ["📅 <b>Contas da Semana</b>\n"]
    for b in bills:
        date_fmt = datetime.strptime(b["date"], "%Y-%m-%d").strftime("%d/%m")
        title = b.get("title", "").replace("💰 ", "")
        amount = b.get("predicted_amount", 0)
        cat = b.get("predicted_category", "")
        cat_emoji = {"fixo": "🏢", "variavel": "⛽", "obra": "⚡", "imposto": "🏛", "salario": "👤", "financeiro": "🏦"}.get(cat, "💰")
        lines.append(f"  {cat_emoji} <b>{date_fmt}</b> — {title}: <b>{amount:.2f}€</b>")

    lines.append(f"\n💰 <b>Total Previsto: {total:.2f}€</b>")
    lines.append(f"\n<i>Dados do extrato bancário · {today.strftime('%d/%m/%Y %H:%M')}</i>")

    await _send_message(chat_id, "\n".join(lines))


async def _handle_help_command(chat_id: str):
    """Handle /help command."""
    await _send_message(chat_id,
        "🤖 <b>Obelisco Bot — Comandos</b>\n\n"
        "/status — Contas previstas nos próximos 7 dias\n"
        "/resumo — Resumo financeiro do mês\n"
        "/help — Lista de comandos\n\n"
        "<i>Também recebo alertas automáticos de ponto GPS, novos pedidos e lembretes de pagamento.</i>"
    )


async def _handle_resumo_command(chat_id: str, db):
    """Handle /resumo command — monthly financial summary."""
    today = datetime.now(timezone.utc)
    month_start = today.replace(day=1).strftime("%Y-%m-%d")
    month_end = today.strftime("%Y-%m-%d")

    # Count upcoming bills this month
    cursor = db.appointments.find({
        "is_predicted_bill": True,
        "date": {"$gte": month_start, "$lte": (today.replace(day=28) + timedelta(days=4)).replace(day=1).strftime("%Y-%m-%d")},
    }, {"_id": 0})
    bills = await cursor.to_list(100)
    total_bills = sum(b.get("predicted_amount", 0) for b in bills)
    paid = [b for b in bills if b["date"] < today.strftime("%Y-%m-%d")]
    pending = [b for b in bills if b["date"] >= today.strftime("%Y-%m-%d")]

    # Count service orders this month
    orders = await db.service_orders.count_documents({"created_at": {"$gte": f"{month_start}T00:00:00"}})

    PT_MONTHS = {1:"Janeiro",2:"Fevereiro",3:"Março",4:"Abril",5:"Maio",6:"Junho",7:"Julho",8:"Agosto",9:"Setembro",10:"Outubro",11:"Novembro",12:"Dezembro"}

    msg = (
        f"📊 <b>Resumo de {PT_MONTHS.get(today.month, '')} {today.year}</b>\n\n"
        f"💰 Contas previstas: <b>{len(bills)}</b> ({total_bills:.2f}€)\n"
        f"✅ Já passadas: {len(paid)}\n"
        f"⏳ Pendentes: <b>{len(pending)}</b>\n"
        f"⚡ Pedidos de serviço: <b>{orders}</b>\n\n"
        f"<i>Use /status para ver detalhes da semana</i>"
    )
    await _send_message(chat_id, msg)


async def poll_telegram_updates(db):
    """Poll for new Telegram bot commands (runs in background)."""
    global _last_update_id
    if not TELEGRAM_API or not TELEGRAM_BOT_TOKEN:
        return

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{TELEGRAM_API}/getUpdates", params={
                "offset": _last_update_id + 1,
                "timeout": 5,
                "allowed_updates": '["message"]',
            })
        if resp.status_code != 200:
            return

        data = resp.json()
        for update in data.get("result", []):
            _last_update_id = update["update_id"]
            msg = update.get("message", {})
            text = msg.get("text", "")
            chat_id = str(msg.get("chat", {}).get("id", ""))

            if text.startswith("/status"):
                await _handle_status_command(chat_id, db)
            elif text.startswith("/resumo"):
                await _handle_resumo_command(chat_id, db)
            elif text.startswith("/help") or text.startswith("/start"):
                await _handle_help_command(chat_id)

    except Exception as e:
        if "timed out" not in str(e).lower():
            logger.warning(f"Telegram poll error: {e}")


async def check_and_send_payment_reminders(db):
    """Check for payments due in 2 days and send Telegram reminders."""
    if not TELEGRAM_API or not TELEGRAM_ADMIN_CHAT_ID:
        return 0

    today = datetime.now(timezone.utc)
    target_date = (today + timedelta(days=2)).strftime("%Y-%m-%d")

    # Find predicted bills due in 2 days
    cursor = db.appointments.find({
        "is_predicted_bill": True,
        "date": target_date,
    }, {"_id": 0})
    bills = await cursor.to_list(50)

    if not bills:
        return 0

    sent = 0
    for bill in bills:
        # Check if reminder was already sent
        reminder_key = f"reminder_{bill.get('id', '')}_{target_date}"
        existing = await db.telegram_reminders.find_one({"key": reminder_key})
        if existing:
            continue

        title = bill.get("title", "").replace("💰 ", "")
        amount = bill.get("predicted_amount", 0)
        date_fmt = datetime.strptime(target_date, "%Y-%m-%d").strftime("%d/%m/%Y")
        cat = bill.get("predicted_category", "")
        cat_emoji = {"fixo": "🏢", "variavel": "⛽", "obra": "⚡", "imposto": "🏛", "salario": "👤"}.get(cat, "💰")

        msg = (
            f"⏰ <b>Lembrete de Pagamento</b>\n\n"
            f"{cat_emoji} <b>{title}</b> vence em 48h\n"
            f"📅 Data: <b>{date_fmt}</b>\n"
            f"💰 Valor estimado: <b>{amount:.2f}€</b>\n\n"
            f"<i>Prepare o pagamento para evitar atrasos.</i>"
        )
        await _send_message(TELEGRAM_ADMIN_CHAT_ID, msg)

        # Mark reminder as sent
        await db.telegram_reminders.insert_one({
            "key": reminder_key,
            "bill_id": bill.get("id"),
            "sent_at": today.isoformat(),
        })
        sent += 1

    return sent


async def run_telegram_scheduler(db):
    """Background loop: polls for commands + checks daily reminders."""
    logger.info("Telegram scheduler started")
    last_reminder_check = None

    while True:
        try:
            # Poll for bot commands every 5 seconds
            await poll_telegram_updates(db)

            # Check payment reminders once per hour
            now = datetime.now(timezone.utc)
            if last_reminder_check is None or (now - last_reminder_check).total_seconds() > 3600:
                sent = await check_and_send_payment_reminders(db)
                if sent > 0:
                    logger.info(f"Sent {sent} payment reminders via Telegram")
                last_reminder_check = now

        except Exception as e:
            logger.warning(f"Telegram scheduler error: {e}")

        await asyncio.sleep(5)
