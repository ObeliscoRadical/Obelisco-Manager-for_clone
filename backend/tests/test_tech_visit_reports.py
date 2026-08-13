import uuid

import requests

from auth_test_helpers import get_base_url, get_tech_credentials


BASE_URL = get_base_url().rstrip("/")
TECH_EMAIL, TECH_PASSWORD = get_tech_credentials()


def _tech_login():
    response = requests.post(
        f"{BASE_URL}/api/tech/auth/login",
        json={"email": TECH_EMAIL, "password": TECH_PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    token = response.json().get("access_token")
    assert token
    return {"Authorization": f"Bearer {token}"}


def _payload(reference_suffix: str):
    return {
        "status": "rascunho",
        "header": {
            "visit_date": "2026-08-13",
            "client_name": "Apartamento - Mem Martins",
            "client_phone": "912345678",
            "work_reference": f"RV-{reference_suffix}",
            "work_id": None,
        },
        "scope": {
            "title": "IMPLEMENTAÇÃO DE CIRCUITOS – COZINHA",
            "description": "Levantamento técnico e validação dos pontos de uso.",
        },
        "circuits": [
            {
                "icon_key": "plug-zap",
                "service_key": "tomada",
                "description": "MÁQUINA DE LAVAR LOUÇA",
                "quantity": 1,
                "circuit_type": "Circuito dedicado",
                "usage_point": "Cozinha",
            }
        ],
        "distribution_board": {
            "photo_data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBg6n0XU4AAAAASUVORK5CYII=",
            "modules": "24 módulos",
            "dimensions": "450x320mm",
            "installation_type": "Embutido",
            "purpose": "Distribuição de cozinha",
        },
    }


def test_tech_visit_reports_crud_flow():
    headers = _tech_login()
    suffix = uuid.uuid4().hex[:8].upper()
    created = requests.post(
        f"{BASE_URL}/api/tech/visit-reports",
        headers=headers,
        json=_payload(suffix),
        timeout=30,
    )
    assert created.status_code == 200, created.text
    created_data = created.json()
    report_id = created_data["id"]
    assert created_data["header"]["work_reference"] == f"RV-{suffix}"
    assert created_data["technician_id"]

    listed = requests.get(f"{BASE_URL}/api/tech/visit-reports", headers=headers, timeout=30)
    assert listed.status_code == 200, listed.text
    listed_ids = {item["id"] for item in listed.json()}
    assert report_id in listed_ids

    detail = requests.get(f"{BASE_URL}/api/tech/visit-reports/{report_id}", headers=headers, timeout=30)
    assert detail.status_code == 200, detail.text
    assert detail.json()["scope"]["title"] == "IMPLEMENTAÇÃO DE CIRCUITOS – COZINHA"

    updated_payload = _payload(suffix)
    updated_payload["status"] = "final"
    updated_payload["circuits"][0]["quantity"] = 2
    updated_payload["distribution_board"]["purpose"] = "Distribuição final da cozinha"
    updated = requests.put(
        f"{BASE_URL}/api/tech/visit-reports/{report_id}",
        headers=headers,
        json=updated_payload,
        timeout=30,
    )
    assert updated.status_code == 200, updated.text
    updated_data = updated.json()
    assert updated_data["status"] == "final"
    assert updated_data["circuits"][0]["quantity"] == 2

    works = requests.get(f"{BASE_URL}/api/tech/visit-reports/helpers/works", headers=headers, timeout=30)
    assert works.status_code == 200, works.text
    assert isinstance(works.json(), list)

    deleted = requests.delete(f"{BASE_URL}/api/tech/visit-reports/{report_id}", headers=headers, timeout=30)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["ok"] is True