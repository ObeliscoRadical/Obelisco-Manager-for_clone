import os
import re
import uuid
from functools import lru_cache
from pathlib import Path


TEST_CREDENTIALS_PATH = Path("/app/memory/test_credentials.md")


@lru_cache(maxsize=1)
def _read_test_credentials() -> str:
    try:
        return TEST_CREDENTIALS_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def _extract_section_value(section_title: str, field_name: str) -> str | None:
    content = _read_test_credentials()
    if not content:
        return None
    pattern = rf"##\s+{re.escape(section_title)}.*?(?:\n##\s|\Z)"
    match = re.search(pattern, content, flags=re.S)
    if not match:
        return None
    section = match.group(0)
    field_pattern = rf"-\s+{re.escape(field_name)}:\s+`([^`]+)`"
    field_match = re.search(field_pattern, section)
    return field_match.group(1).strip() if field_match else None


def get_base_url() -> str:
    base_url = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    if base_url:
        return base_url
    frontend_env = Path("/app/frontend/.env")
    if frontend_env.exists():
        for line in frontend_env.read_text(encoding="utf-8").splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL não definido para os testes.")


def get_admin_credentials() -> tuple[str, str]:
    email = os.environ.get("TEST_ADMIN_EMAIL") or _extract_section_value("Admin (acesso completo à app)", "Email")
    password = os.environ.get("TEST_ADMIN_PASSWORD") or _extract_section_value("Admin (acesso completo à app)", "Password")
    if not email or not password:
        raise RuntimeError("Credenciais admin de teste não encontradas em env nem em /app/memory/test_credentials.md")
    return email, password


def get_tech_credentials() -> tuple[str | None, str | None]:
    email = os.environ.get("TEST_TECH_EMAIL") or _extract_section_value("Técnico (Portal Técnico isolado)", "Email")
    password = os.environ.get("TEST_TECH_PASSWORD") or _extract_section_value("Técnico (Portal Técnico isolado)", "Password")
    return email, password


def unique_test_password(prefix: str = "TestPwd") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}!"