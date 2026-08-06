import os
import pytest

# Test credentials from environment or defaults
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
TECH_EMAIL = os.environ.get("TEST_TECH_EMAIL", "d.oliveira1986@gmail.com")
TECH_PASSWORD = os.environ.get("TEST_TECH_PASSWORD", "A24d22r04")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"

@pytest.fixture(scope="session")
def base_url():
    return BASE_URL

@pytest.fixture(scope="session")
def admin_credentials():
    return {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}

@pytest.fixture(scope="session")
def tech_credentials():
    return {"email": TECH_EMAIL, "password": TECH_PASSWORD}
