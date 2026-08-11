"""
Testes White Label / Branding por tenant
- PUT /api/system-settings guarda logo custom e extrai paleta
- GET /api/logo devolve logo do tenant ativo
- GET /api/public/branding expõe branding público por company_id
"""

import base64
import io
import uuid

import pytest
import requests
from PIL import Image

from auth_test_helpers import get_base_url


BASE_URL = get_base_url()


def make_logo_data_url(rgb=(37, 99, 235)) -> str:
    image = Image.new("RGBA", (64, 64), rgb + (255,))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode()}"


@pytest.fixture
def admin_session():
    session = requests.Session()
    unique = uuid.uuid4().hex[:8]
    response = session.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "name": f"Branding Test {unique}",
            "email": f"branding-test-{unique}@example.com",
            "password": "BrandingTest123",
            "company_name": f"Branding Tenant {unique}",
        },
    )
    assert response.status_code == 200, f"Tenant registration failed: {response.text}"
    data = response.json()
    session.headers.update({
        "Authorization": f"Bearer {data.get('access_token', '')}",
        "Content-Type": "application/json",
    })
    return session, data


class TestWhiteLabelBranding:
    def test_update_system_settings_extracts_brand_palette(self, admin_session):
        session, login_data = admin_session
        logo_data_url = make_logo_data_url((37, 99, 235))

        response = session.put(
            f"{BASE_URL}/api/system-settings",
            json={
                "branding": {"logo_data_url": logo_data_url},
                "company_info": {"name": login_data.get("company_name")},
            },
        )
        assert response.status_code == 200, f"Branding update failed: {response.text}"

        data = response.json()
        branding = data.get("branding") or {}
        palette = branding.get("palette") or {}

        assert branding.get("logo_data_url", "").startswith("data:image/png;base64,"), "Logo should be normalized to PNG data URL"
        assert branding.get("source") == "logo", "Branding source should be logo"
        assert palette.get("primary", "").startswith("#"), "Primary palette color should be hex"
        assert palette.get("primary") != "#facc15", "Primary color should adapt to uploaded logo"
        assert data.get("company_info", {}).get("name") == login_data.get("company_name")

    def test_logo_endpoint_returns_active_tenant_logo(self, admin_session):
        session, login_data = admin_session
        logo_data_url = make_logo_data_url((225, 29, 72))

        update_response = session.put(
            f"{BASE_URL}/api/system-settings",
            json={"branding": {"logo_data_url": logo_data_url}},
        )
        assert update_response.status_code == 200, update_response.text

        company_id = login_data.get("company_id")
        logo_response = session.get(f"{BASE_URL}/api/logo", params={"company_id": company_id})
        assert logo_response.status_code == 200, f"Logo endpoint failed: {logo_response.text}"

        payload = logo_response.json()
        assert payload.get("logo", "").startswith("data:image/png;base64,"), "Logo endpoint should return a data URL"
        assert payload.get("company_name") == login_data.get("company_name")
        assert payload.get("branding", {}).get("source") == "logo"

    def test_public_branding_endpoint_returns_company_palette(self, admin_session):
        session, login_data = admin_session
        logo_data_url = make_logo_data_url((16, 185, 129))

        update_response = session.put(
            f"{BASE_URL}/api/system-settings",
            json={"branding": {"logo_data_url": logo_data_url}},
        )
        assert update_response.status_code == 200, update_response.text

        public_response = requests.get(
            f"{BASE_URL}/api/public/branding",
            params={"company_id": login_data.get("company_id")},
        )
        assert public_response.status_code == 200, f"Public branding failed: {public_response.text}"

        payload = public_response.json()
        assert payload.get("company_id") == login_data.get("company_id")
        assert payload.get("company_name") == login_data.get("company_name")
        assert payload.get("branding", {}).get("logo_data_url", "").startswith("data:image/png;base64,")
        assert payload.get("branding", {}).get("palette", {}).get("primary") != "#facc15"