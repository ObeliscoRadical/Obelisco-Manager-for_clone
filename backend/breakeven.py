"""
Módulo Ponto de Equilíbrio / Faturamento Ideal.
Calcula quanto a empresa precisa de faturar por mês para cobrir custos + margem de lucro.
Fornece endpoint de pré-preenchimento com médias reais dos últimos meses.
"""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone, date as date_cls
import calendar
import logging

logger = logging.getLogger(__name__)

breakeven_router = APIRouter(prefix="/api/finance/breakeven", tags=["breakeven"])


def _working_days_in_month(year: int, month: int) -> int:
    """Conta dias úteis (seg-sex) do mês. Ignora feriados PT (aproximação)."""
    cal = calendar.Calendar()
    return sum(1 for d in cal.itermonthdates(year, month)
               if d.month == month and d.weekday() < 5)


def create_breakeven_router(db, get_current_user):

    @breakeven_router.get("/prefill")
    async def prefill(user=Depends(get_current_user)):
        """Retorna médias reais dos últimos 3 meses para pré-preencher a calculadora."""
        now = datetime.now(timezone.utc)
        cy, cm = now.year, now.month

        # Últimos 3 meses (excluindo o corrente, que ainda pode estar incompleto)
        months = []
        y, m = cy, cm
        for _ in range(3):
            m -= 1
            if m == 0:
                m = 12
                y -= 1
            months.append((y, m))

        # 1) Custos Fixos — média mensal do previsto (fixed_cost_instances)
        fixed_total = 0.0
        fixed_months_counted = 0
        for (yy, mm) in months:
            insts = await db.fixed_cost_instances.find(
                {"year": yy, "month": mm}, {"_id": 0, "expected_amount": 1}
            ).to_list(500)
            if insts:
                fixed_total += sum((i.get("expected_amount") or 0) for i in insts)
                fixed_months_counted += 1
        fixed_costs_monthly = round(fixed_total / fixed_months_counted, 2) if fixed_months_counted else 0.0

        # 2) Salários — média mensal do total_bruto dos payroll_runs fechados
        payroll_total = 0.0
        payroll_months_counted = 0
        for (yy, mm) in months:
            run = await db.payroll_runs.find_one({"year": yy, "month": mm}, {"_id": 0})
            if run:
                items = run.get("items") or []
                # Soma custo empresa: salário bruto + segurança social patronal (23.75%)
                run_gross = sum((it.get("total_bruto") or it.get("gross_total") or 0) for it in items)
                if not run_gross:
                    # fallback: base salary of active employees × count
                    emps = await db.employees.find({"active": True}, {"_id": 0, "base_salary": 1}).to_list(200)
                    run_gross = sum((e.get("base_salary") or 0) for e in emps)
                payroll_total += run_gross * 1.2375  # inclui TSU patronal
                payroll_months_counted += 1
        if payroll_months_counted == 0:
            # Sem runs — estimativa via salário base dos funcionários activos
            emps = await db.employees.find({"active": True}, {"_id": 0, "base_salary": 1}).to_list(200)
            if emps:
                payroll_total = sum((e.get("base_salary") or 0) for e in emps) * 1.2375
                payroll_months_counted = 1
        payroll_monthly_avg = round(payroll_total / payroll_months_counted, 2) if payroll_months_counted else 0.0

        # 3) Despesas variáveis — média mensal das despesas tipo "variavel" e "obra"
        var_total = 0.0
        var_months_counted = 0
        for (yy, mm) in months:
            prefix = f"{yy:04d}-{mm:02d}"
            exps = await db.expenses.find(
                {"date": {"$regex": f"^{prefix}"}, "type": {"$in": ["variavel", "obra"]}},
                {"_id": 0, "value_gross": 1}
            ).to_list(2000)
            if exps:
                var_total += sum((e.get("value_gross") or 0) for e in exps)
                var_months_counted += 1
        variable_expenses_monthly_avg = round(var_total / var_months_counted, 2) if var_months_counted else 0.0

        # 4) Faturamento mês corrente
        prefix_now = f"{cy:04d}-{cm:02d}"
        invs = await db.invoices.find(
            {"issue_date": {"$regex": f"^{prefix_now}"}},
            {"_id": 0, "value_total": 1, "value_net": 1}
        ).to_list(2000)
        current_month_revenue = round(sum((i.get("value_total") or 0) for i in invs), 2)
        current_month_revenue_net = round(sum((i.get("value_net") or 0) for i in invs), 2)

        # 5) Dias úteis
        working_days = _working_days_in_month(cy, cm)
        today = date_cls.today()
        # Dias úteis já passados
        elapsed = 0
        for day in range(1, min(today.day, 31) + 1):
            try:
                dt = date_cls(cy, cm, day)
                if dt.weekday() < 5 and dt <= today:
                    elapsed += 1
            except ValueError:
                break

        return {
            "reference_months": [{"year": y, "month": m} for (y, m) in months],
            "fixed_costs_monthly": fixed_costs_monthly,
            "payroll_monthly_avg": payroll_monthly_avg,
            "variable_expenses_monthly_avg": variable_expenses_monthly_avg,
            "current_month_revenue": current_month_revenue,
            "current_month_revenue_net": current_month_revenue_net,
            "current_year": cy,
            "current_month": cm,
            "working_days_month": working_days,
            "working_days_elapsed": elapsed,
        }

    return breakeven_router
