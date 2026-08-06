"""Tests for telegram_scheduler: /status command and payment reminders."""
import os
import sys
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock

import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv('/app/backend/.env')
sys.path.insert(0, '/app/backend')

from telegram_scheduler import (  # noqa: E402
    check_and_send_payment_reminders,
    _handle_status_command,
    _handle_resumo_command,
)

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']


@pytest.fixture
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture
def sent_messages():
    """Capture calls to _send_message."""
    return []


@pytest.fixture
def patch_send(sent_messages):
    async def fake_send(chat_id, text, parse_mode="HTML"):
        sent_messages.append({"chat_id": chat_id, "text": text})

    with patch("telegram_scheduler._send_message", new=fake_send):
        yield


# ---------- /status command tests ----------

def test_status_command_with_bills(db, sent_messages, patch_send):
    async def run():
        today = datetime.now(timezone.utc)
        bill_id = f"TEST_{uuid.uuid4()}"
        bill_date = (today + timedelta(days=3)).strftime("%Y-%m-%d")
        await db.appointments.insert_one({
            "id": bill_id,
            "title": "💰 EDP",
            "date": bill_date,
            "is_predicted_bill": True,
            "predicted_amount": 123.45,
            "predicted_category": "fixo",
        })
        try:
            await _handle_status_command("999", db)
            assert len(sent_messages) == 1
            msg = sent_messages[0]["text"]
            assert "Contas da Semana" in msg
            assert "EDP" in msg
            assert "123.45" in msg
            assert "Total Previsto" in msg
        finally:
            await db.appointments.delete_one({"id": bill_id})
    asyncio.run(run())


def test_status_command_no_bills(db, sent_messages, patch_send):
    async def run():
        # Delete any bills within next 7 days temporarily by using isolated marker
        # Instead, just simulate: use a chat id and mock: query returns real DB data.
        # If existing bills exist, this will not equal "Tudo em dia". So we mock find.
        today = datetime.now(timezone.utc)
        # Delete: not safe. Use patched db collection.
        class FakeCursor:
            def __init__(self): pass
            def sort(self, *a, **k): return self
            async def to_list(self, n): return []
        class FakeAppointments:
            def find(self, *a, **k): return FakeCursor()
        class FakeDB:
            appointments = FakeAppointments()
        await _handle_status_command("999", FakeDB())
        assert len(sent_messages) == 1
        assert "Tudo em dia" in sent_messages[0]["text"]
    asyncio.run(run())


# ---------- Payment reminder tests ----------

def test_reminder_sends_and_dedups(db, sent_messages, patch_send):
    async def run():
        today = datetime.now(timezone.utc)
        target = (today + timedelta(days=2)).strftime("%Y-%m-%d")
        bill_id = f"TEST_REM_{uuid.uuid4()}"

        await db.appointments.insert_one({
            "id": bill_id,
            "title": "💰 Renda Escritório",
            "date": target,
            "is_predicted_bill": True,
            "predicted_amount": 850.0,
            "predicted_category": "fixo",
        })
        # Cleanup any previous reminder key for this id
        await db.telegram_reminders.delete_many({"bill_id": bill_id})

        try:
            sent1 = await check_and_send_payment_reminders(db)
            assert sent1 >= 1, "Expected at least 1 reminder to be sent"
            # Find the message for our test bill
            our = [m for m in sent_messages if "Renda Escritório" in m["text"]]
            assert len(our) == 1
            msg = our[0]["text"]
            assert "Lembrete de Pagamento" in msg
            assert "48h" in msg
            assert "850.00" in msg
            date_fmt = datetime.strptime(target, "%Y-%m-%d").strftime("%d/%m/%Y")
            assert date_fmt in msg

            # Verify reminder record persisted
            rec = await db.telegram_reminders.find_one({"bill_id": bill_id})
            assert rec is not None
            assert rec["key"] == f"reminder_{bill_id}_{target}"

            # Second call — must dedup (0 for this bill)
            sent_messages.clear()
            sent2 = await check_and_send_payment_reminders(db)
            our2 = [m for m in sent_messages if "Renda Escritório" in m["text"]]
            assert len(our2) == 0, "Second call should not resend for same bill"
        finally:
            await db.appointments.delete_one({"id": bill_id})
            await db.telegram_reminders.delete_many({"bill_id": bill_id})
    asyncio.run(run())


def test_reminder_no_bills_returns_zero(db, sent_messages, patch_send):
    async def run():
        class FakeCursor:
            async def to_list(self, n): return []
        class FakeAppointments:
            def find(self, *a, **k): return FakeCursor()
        class FakeDB:
            appointments = FakeAppointments()
        sent = await check_and_send_payment_reminders(FakeDB())
        assert sent == 0
    asyncio.run(run())
