"""Tests for /api/finance/breakeven/prefill endpoint (Ponto de Equilíbrio)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://expenses-ai-1.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'admin@obelisco.pt'
ADMIN_PASSWORD = 'obelisco2024'


@pytest.fixture(scope='module')
def token():
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f'Login failed: {r.status_code} {r.text}'
    data = r.json()
    tk = data.get('token') or data.get('access_token')
    assert tk, f'No token in response: {data}'
    return tk


@pytest.fixture(scope='module')
def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


class TestBreakevenPrefill:
    def test_requires_auth(self):
        """Endpoint should require Bearer token."""
        r = requests.get(f'{BASE_URL}/api/finance/breakeven/prefill', timeout=15)
        assert r.status_code in (401, 403), f'Expected 401/403 without token, got {r.status_code}'

    def test_prefill_returns_200(self, auth_headers):
        r = requests.get(f'{BASE_URL}/api/finance/breakeven/prefill',
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, f'Got {r.status_code}: {r.text}'
        data = r.json()
        # Required fields
        required = [
            'fixed_costs_monthly',
            'payroll_monthly_avg',
            'variable_expenses_monthly_avg',
            'current_month_revenue',
            'working_days_month',
            'working_days_elapsed',
            'reference_months',
        ]
        for k in required:
            assert k in data, f'missing field {k} in response: {list(data.keys())}'

    def test_prefill_values_numeric_non_negative(self, auth_headers):
        r = requests.get(f'{BASE_URL}/api/finance/breakeven/prefill',
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        numeric_fields = [
            'fixed_costs_monthly',
            'payroll_monthly_avg',
            'variable_expenses_monthly_avg',
            'current_month_revenue',
            'working_days_month',
            'working_days_elapsed',
        ]
        for k in numeric_fields:
            v = data.get(k)
            assert isinstance(v, (int, float)), f'{k} not numeric: {v!r} ({type(v).__name__})'
            assert v >= 0, f'{k} is negative: {v}'

    def test_reference_months_is_list_of_three(self, auth_headers):
        r = requests.get(f'{BASE_URL}/api/finance/breakeven/prefill',
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        rm = data.get('reference_months')
        assert isinstance(rm, list), f'reference_months not list: {rm!r}'
        assert len(rm) == 3, f'expected 3 reference months, got {len(rm)}'
        for m in rm:
            assert 'year' in m and 'month' in m
            assert 1 <= m['month'] <= 12

    def test_working_days_in_valid_range(self, auth_headers):
        r = requests.get(f'{BASE_URL}/api/finance/breakeven/prefill',
                         headers=auth_headers, timeout=30)
        data = r.json()
        wd = data['working_days_month']
        assert 15 <= wd <= 25, f'working_days_month out of range: {wd}'
        we = data['working_days_elapsed']
        assert 0 <= we <= wd, f'elapsed {we} > month {wd}'


# Regression: OCR still working
class TestInvoiceOCRRegression:
    def test_invoices_extract_endpoint_available(self, auth_headers):
        """Should reject non-file requests but endpoint must still exist (not 404)."""
        r = requests.post(f'{BASE_URL}/api/invoices/extract',
                          headers=auth_headers, timeout=15)
        # Missing file -> 422 (validation), NOT 404
        assert r.status_code != 404, f'endpoint missing (404): {r.text}'
        assert r.status_code in (400, 422), f'Unexpected: {r.status_code} {r.text}'
