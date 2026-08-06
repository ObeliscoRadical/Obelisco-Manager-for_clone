"""
Tests for PONTO BOT vs MANAGER BOT separation.
Verifies that:
  - .env has PONTO_BOT_TOKEN and MANAGER_BOT_TOKEN (and no legacy TELEGRAM_BOT_TOKEN)
  - service_orders.send_ponto_notification hits Telegram URL using PONTO token
  - service_orders.send_telegram_notification hits Telegram URL using MANAGER token
  - telegram_scheduler polls/sends via MANAGER token
  - tech_extras punch imports send_ponto_notification (and not the manager one)
"""
import os
import sys
import asyncio
import pathlib
import importlib
import pytest

BACKEND_DIR = pathlib.Path("/app/backend")
sys.path.insert(0, str(BACKEND_DIR))

# Load .env so modules see PONTO_BOT_TOKEN / MANAGER_BOT_TOKEN
from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

# --- 1. .env variable presence ------------------------------------------------
class TestEnvSeparation:
    def _read_env(self):
        text = (BACKEND_DIR / ".env").read_text()
        return {ln.split("=", 1)[0].strip(): ln.split("=", 1)[1].strip()
                for ln in text.splitlines() if "=" in ln and not ln.strip().startswith("#")}

    def test_ponto_and_manager_tokens_present(self):
        env = self._read_env()
        assert env.get("PONTO_BOT_TOKEN"), "PONTO_BOT_TOKEN missing in backend/.env"
        assert env.get("MANAGER_BOT_TOKEN"), "MANAGER_BOT_TOKEN missing in backend/.env"
        assert env["PONTO_BOT_TOKEN"] != env["MANAGER_BOT_TOKEN"], "Tokens must be different"

    def test_no_legacy_telegram_bot_token(self):
        env = self._read_env()
        assert "TELEGRAM_BOT_TOKEN" not in env, \
            "Legacy TELEGRAM_BOT_TOKEN must be removed from .env"

    def test_admin_chat_id_present(self):
        env = self._read_env()
        assert env.get("TELEGRAM_ADMIN_CHAT_ID"), "TELEGRAM_ADMIN_CHAT_ID missing"


# --- 2. Source-level import guarantees ----------------------------------------
class TestSourceReferences:
    def test_service_orders_defines_both_helpers(self):
        src = (BACKEND_DIR / "service_orders.py").read_text()
        assert "PONTO_BOT_TOKEN = os.environ.get('PONTO_BOT_TOKEN')" in src
        assert "MANAGER_BOT_TOKEN = os.environ.get('MANAGER_BOT_TOKEN')" in src
        # each helper must reference its own token in the URL
        # send_telegram_notification (manager) block
        manager_block = src[src.index("async def send_telegram_notification"):
                             src.index("async def send_ponto_notification")]
        assert "MANAGER_BOT_TOKEN" in manager_block
        assert "PONTO_BOT_TOKEN" not in manager_block, "Manager helper must NOT reference PONTO token"
        # send_ponto_notification block
        ponto_block = src[src.index("async def send_ponto_notification"):
                          src.index("async def send_email_raw")]
        assert "PONTO_BOT_TOKEN" in ponto_block
        assert "MANAGER_BOT_TOKEN" not in ponto_block, "Ponto helper must NOT reference MANAGER token"

    def test_tech_extras_punch_uses_ponto_only(self):
        src = (BACKEND_DIR / "tech_extras.py").read_text()
        assert "from service_orders import send_ponto_notification" in src
        assert "send_telegram_notification" not in src, \
            "tech_extras must NOT import the manager notifier"

    def test_telegram_scheduler_uses_manager_only(self):
        src = (BACKEND_DIR / "telegram_scheduler.py").read_text()
        assert "MANAGER_BOT_TOKEN = os.environ.get('MANAGER_BOT_TOKEN')" in src
        assert "PONTO_BOT_TOKEN" not in src, "Scheduler must NOT touch PONTO token"
        assert "TELEGRAM_BOT_TOKEN" not in src, "Scheduler must NOT reference legacy TELEGRAM_BOT_TOKEN"

    def test_service_orders_create_uses_manager(self):
        src = (BACKEND_DIR / "service_orders.py").read_text()
        # New service order background task must be the manager notifier
        assert "background_tasks.add_task(send_telegram_notification" in src


# --- 3. Runtime: helpers post to Telegram URL with correct token --------------
class TestRuntimeSeparation:
    def test_send_ponto_uses_ponto_token_url(self, monkeypatch):
        # Load module fresh so env is picked up
        if "service_orders" in sys.modules:
            del sys.modules["service_orders"]
        import service_orders as so

        captured = {}

        class FakeResp:
            status_code = 200
            def json(self): return {"ok": True}

        class FakeClient:
            def __init__(self, *a, **kw): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def post(self, url, json=None, **kw):
                captured["url"] = url
                captured["json"] = json
                return FakeResp()

        monkeypatch.setattr(so.httpx, "AsyncClient", FakeClient)

        asyncio.run(so.send_ponto_notification("TEST ponto message"))

        assert "url" in captured, "send_ponto_notification did not POST — env token missing?"
        assert so.PONTO_BOT_TOKEN and so.PONTO_BOT_TOKEN in captured["url"], \
            f"URL {captured['url']} must contain PONTO_BOT_TOKEN"
        assert so.MANAGER_BOT_TOKEN not in captured["url"], \
            "PONTO notifier must not leak MANAGER token in URL"
        assert captured["json"]["chat_id"] == so.TELEGRAM_ADMIN_CHAT_ID

    def test_send_manager_uses_manager_token_url(self, monkeypatch):
        if "service_orders" in sys.modules:
            del sys.modules["service_orders"]
        import service_orders as so

        captured = {}

        class FakeResp:
            status_code = 200
            def json(self): return {"ok": True}

        class FakeClient:
            def __init__(self, *a, **kw): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def post(self, url, json=None, **kw):
                captured["url"] = url
                captured["json"] = json
                return FakeResp()

        monkeypatch.setattr(so.httpx, "AsyncClient", FakeClient)

        asyncio.run(so.send_telegram_notification("TEST manager order message"))

        assert "url" in captured
        assert so.MANAGER_BOT_TOKEN and so.MANAGER_BOT_TOKEN in captured["url"]
        assert so.PONTO_BOT_TOKEN not in captured["url"], \
            "Manager notifier must not leak PONTO token in URL"

    def test_telegram_scheduler_uses_manager_token(self, monkeypatch):
        if "telegram_scheduler" in sys.modules:
            del sys.modules["telegram_scheduler"]
        import telegram_scheduler as ts

        # Sanity: module-level TELEGRAM_API must be built with MANAGER token
        assert ts.MANAGER_BOT_TOKEN, "MANAGER_BOT_TOKEN not loaded in scheduler"
        assert ts.MANAGER_BOT_TOKEN in ts.TELEGRAM_API
        # PONTO must not appear anywhere at import
        env_ponto = os.environ.get("PONTO_BOT_TOKEN", "")
        assert env_ponto and env_ponto not in ts.TELEGRAM_API
