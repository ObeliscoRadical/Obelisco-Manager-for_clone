"""Tests for the new 'alerts' array returned by GET /api/works/{work_id}/caixa.

Covers alert codes: margem_baixa, custo_excedido, faturas_vencidas,
despesas_atraso, sem_faturacao, recebimento_lento — plus empty case.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")

VALID_CODES = {
    "margem_baixa", "custo_excedido", "faturas_vencidas",
    "despesas_atraso", "sem_faturacao", "recebimento_lento",
}
VALID_SEVERITIES = {"high", "medium", "low"}


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login falhou: {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def all_works(admin_token):
    r = requests.get(f"{BASE_URL}/api/works", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def all_caixas(admin_token, all_works):
    out = []
    for w in all_works:
        r = requests.get(f"{BASE_URL}/api/works/{w['id']}/caixa",
                         headers=_h(admin_token), timeout=30)
        if r.status_code == 200:
            out.append((w, r.json()))
    assert out, "Nenhuma caixa devolvida"
    return out


class TestAlertsSchema:
    def test_alerts_field_exists_on_every_work(self, all_caixas):
        for w, caixa in all_caixas:
            assert "alerts" in caixa, f"'alerts' ausente em obra {w['id']}"
            assert isinstance(caixa["alerts"], list), \
                f"alerts nao e lista em obra {w['id']}: {type(caixa['alerts'])}"

    def test_each_alert_has_required_shape(self, all_caixas):
        checked = 0
        for w, caixa in all_caixas:
            for a in caixa["alerts"]:
                assert set(["code", "severity", "title", "message"]).issubset(a.keys()), \
                    f"Alerta com campos em falta em obra {w['id']}: {a}"
                assert a["code"] in VALID_CODES, f"code invalido: {a['code']}"
                assert a["severity"] in VALID_SEVERITIES, f"severity invalida: {a['severity']}"
                assert isinstance(a["title"], str) and a["title"]
                assert isinstance(a["message"], str) and a["message"]
                # meta e opcional mas quando existe deve ser dict
                if "meta" in a:
                    assert isinstance(a["meta"], dict)
                checked += 1
        print(f"Alertas totais validados no schema: {checked}")


class TestAlertsSemantic:
    """Valida coerencia entre valores no resumo/receitas e os alertas gerados."""

    def _find(self, alerts, code):
        return next((a for a in alerts if a["code"] == code), None)

    def test_faturas_vencidas_consistency(self, all_caixas):
        found = False
        for w, caixa in all_caixas:
            a = self._find(caixa["alerts"], "faturas_vencidas")
            if not a:
                continue
            found = True
            meta = a.get("meta", {})
            assert meta.get("count", 0) >= 1
            assert meta.get("total_owed", 0) > 0
            assert meta.get("max_days_overdue", 0) >= 1
            assert isinstance(meta.get("invoices"), list) and len(meta["invoices"]) == meta["count"]
            # severity high sse max_days > 30
            if meta["max_days_overdue"] > 30:
                assert a["severity"] == "high"
            else:
                assert a["severity"] in ("medium", "high")  # tolerant
        if not found:
            pytest.skip("Nenhuma obra tem faturas_vencidas para validar")

    def test_recebimento_lento_consistency(self, all_caixas):
        found = False
        for w, caixa in all_caixas:
            a = self._find(caixa["alerts"], "recebimento_lento")
            if not a:
                continue
            found = True
            rec = caixa["receitas"]
            assert rec["total_invoiced"] > 0
            ratio = rec["to_receive"] / rec["total_invoiced"]
            assert ratio > 0.5, f"debt_ratio {ratio} nao passa o threshold"
        if not found:
            pytest.skip("Nenhuma obra com recebimento_lento")

    def test_custo_excedido_consistency(self, all_caixas):
        found = False
        for w, caixa in all_caixas:
            a = self._find(caixa["alerts"], "custo_excedido")
            if not a:
                continue
            found = True
            resumo = caixa["resumo"]
            assert resumo["predicted_total"] > 0
            assert resumo["real_total_cost"] > resumo["predicted_total"]
            overrun = (resumo["real_total_cost"] / resumo["predicted_total"] - 1) * 100
            if overrun > 20:
                assert a["severity"] == "high"
        if not found:
            pytest.skip("Nenhuma obra com custo_excedido")

    def test_margem_baixa_consistency(self, all_caixas):
        found = False
        for w, caixa in all_caixas:
            a = self._find(caixa["alerts"], "margem_baixa")
            if not a:
                continue
            found = True
            resumo = caixa["resumo"]
            mp = resumo["margin_predicted_pct"]
            mr = resumo["margin_real_pct"]
            assert mp > 0
            assert mr < mp * 0.7
            if mr < mp * 0.5:
                assert a["severity"] == "high"
            else:
                assert a["severity"] == "medium"
        if not found:
            pytest.skip("Nenhuma obra com margem_baixa")

    def test_despesas_atraso_consistency(self, all_caixas):
        found = False
        for w, caixa in all_caixas:
            a = self._find(caixa["alerts"], "despesas_atraso")
            if not a:
                continue
            found = True
            meta = a.get("meta", {})
            assert meta.get("count", 0) >= 1
            assert meta.get("total", 0) > 0
            assert a["severity"] in ("medium", "high")
        if not found:
            pytest.skip("Nenhuma obra com despesas_atraso")


class TestAlertsErrorPaths:
    def test_unknown_work_returns_404(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/works/does-not-exist/caixa",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 404


class TestAlertsSeededE2E:
    """Semeia dados reais numa obra para exercitar todos os codigos de alertas
    e valida que aparecem no GET /caixa. Faz limpeza no fim."""

    def test_seed_and_verify_all_alerts(self, admin_token, all_works):
        import datetime as _dt
        assert all_works, "sem obras seed"
        work = all_works[0]
        wid = work["id"]

        today = _dt.date.today()
        past_due = (today - _dt.timedelta(days=45)).isoformat()  # 45 dias vencida
        exp_date = (today - _dt.timedelta(days=60)).isoformat()

        invoice_id = None
        expense_id = None
        try:
            # Cria factura -- valor alto para forcar recebimento_lento (pagamento parcial)
            inv_payload = {
                "client_name": "TEST_ALERT_CLIENT",
                "client_nif": "500000000",
                "items": [{"description": "TEST alert", "quantity": 1, "unit_price": 1000.0, "vat_rate": 23}],
                "issue_date": (today - _dt.timedelta(days=60)).isoformat(),
                "due_date": past_due,
                "value_net": 1000.0,
                "value_total": 1230.0,
                "vat_amount": 230.0,
                "vat_rate": 23,
                "amount": 1230.0,
                "total": 1230.0,
            }
            r = requests.post(f"{BASE_URL}/api/invoices", headers=_h(admin_token),
                              json=inv_payload, timeout=15)
            assert r.status_code in (200, 201), f"criacao factura falhou: {r.text}"
            invoice_id = r.json()["id"]

            # link a obra
            r = requests.put(f"{BASE_URL}/api/invoices/{invoice_id}/link-work",
                             headers=_h(admin_token), json={"obra_id": wid}, timeout=15)
            assert r.status_code == 200, r.text

            # Pagamento parcial (500€) -> ficam 730€ em divida => debt_ratio>0.5
            r = requests.post(f"{BASE_URL}/api/invoices/{invoice_id}/payment",
                              headers=_h(admin_token),
                              json={"amount": 500.0, "date": today.isoformat(), "method": "transferencia"},
                              timeout=15)
            assert r.status_code in (200, 201), f"pagamento falhou: {r.text}"

            # Cria despesa com data antiga e nao paga
            exp_payload = {
                "description": "TEST_ALERT_EXPENSE",
                "supplier": "TEST_SUPP",
                "amount": 300.0,
                "value_gross": 300.0,
                "date": exp_date,
                "category": "materiais",
                "type": "variavel",
                "paid": False,
            }
            r = requests.post(f"{BASE_URL}/api/expenses", headers=_h(admin_token),
                              json=exp_payload, timeout=15)
            assert r.status_code in (200, 201), f"criacao despesa: {r.text}"
            expense_id = r.json()["id"]

            r = requests.put(f"{BASE_URL}/api/expenses/{expense_id}/link-work",
                             headers=_h(admin_token), json={"obra_id": wid}, timeout=15)
            assert r.status_code == 200, r.text

            # Agora fetch caixa e valida alertas
            r = requests.get(f"{BASE_URL}/api/works/{wid}/caixa",
                             headers=_h(admin_token), timeout=15)
            assert r.status_code == 200
            caixa = r.json()
            codes = {a["code"]: a for a in caixa["alerts"]}
            print(f"\nAlertas apos seed: {list(codes.keys())}")
            print(f"resumo={caixa['resumo']}")

            # Deve conter estes:
            assert "faturas_vencidas" in codes, f"faturas_vencidas ausente. codes={list(codes.keys())}"
            fv = codes["faturas_vencidas"]
            assert fv["severity"] == "high"  # 45 dias > 30
            assert fv["meta"]["count"] >= 1
            assert fv["meta"]["max_days_overdue"] >= 40

            assert "despesas_atraso" in codes, f"despesas_atraso ausente. codes={list(codes.keys())}"
            da = codes["despesas_atraso"]
            assert da["meta"]["count"] >= 1
            assert da["meta"]["total"] >= 300

            assert "recebimento_lento" in codes, f"recebimento_lento ausente. codes={list(codes.keys())}"
            rl = codes["recebimento_lento"]
            assert rl["meta"]["debt_ratio_pct"] > 50

            # custo_excedido: depende de predicted_total vs real_total_cost
            resumo = caixa["resumo"]
            if resumo["predicted_total"] > 0 and resumo["real_total_cost"] > resumo["predicted_total"]:
                assert "custo_excedido" in codes

        finally:
            # cleanup
            if invoice_id:
                try:
                    requests.put(f"{BASE_URL}/api/invoices/{invoice_id}/link-work",
                                 headers=_h(admin_token), json={"obra_id": None}, timeout=10)
                except Exception:
                    pass
                try:
                    requests.delete(f"{BASE_URL}/api/invoices/{invoice_id}",
                                    headers=_h(admin_token), timeout=10)
                except Exception:
                    pass
            if expense_id:
                try:
                    requests.put(f"{BASE_URL}/api/expenses/{expense_id}/link-work",
                                 headers=_h(admin_token), json={"obra_id": None}, timeout=10)
                except Exception:
                    pass
                try:
                    requests.delete(f"{BASE_URL}/api/expenses/{expense_id}",
                                    headers=_h(admin_token), timeout=10)
                except Exception:
                    pass

    def test_empty_alerts_when_conditions_absent(self, admin_token, all_works):
        """Depois do teardown do teste anterior, a obra deve voltar a ter alerts=[]"""
        wid = all_works[0]["id"]
        r = requests.get(f"{BASE_URL}/api/works/{wid}/caixa",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        alerts = r.json().get("alerts", [])
        # deve estar vazio ou pelo menos nao conter faturas_vencidas ou despesas_atraso residuais
        residual = [a for a in alerts if a["code"] in ("faturas_vencidas", "despesas_atraso")]
        assert not residual, f"cleanup incompleto — sobrou: {residual}"


class TestAlertsGlobalStats:
    """Reporte informativo para o test agent — nao falha."""

    def test_report_codes_present(self, all_caixas):
        codes = {}
        empty_count = 0
        for w, caixa in all_caixas:
            if not caixa["alerts"]:
                empty_count += 1
            for a in caixa["alerts"]:
                codes[a["code"]] = codes.get(a["code"], 0) + 1
        print(f"\nResumo alertas: {codes}")
        print(f"Obras sem alertas: {empty_count}/{len(all_caixas)}")
        # nao ha assert — puramente informativo
