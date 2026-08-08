from datetime import datetime, timezone, timedelta
from collections import defaultdict
from typing import Optional, List
import json
import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from bank_analysis import _build_treasury_insights, _load_or_compute_recurring_masters


logger = logging.getLogger(__name__)

cfo_virtual_router = APIRouter(prefix="/api/cfo-virtual", tags=["cfo-virtual"])

DEBT_TYPES = ("Fiscal_AT", "Segurança_Social", "Fornecedores", "Bancária")
ACTIVE_DEBT_STATUSES = ("ativa", "em_negociacao", "parcial", "vencida")
RESOLVED_DEBT_STATUSES = ("regularizada", "liquidada", "fechada")


class DebtCreate(BaseModel):
    credor: str
    tipo_divida: str
    valor_total: float
    valor_vencido: float = 0
    data_vencimento: str
    status: str = "ativa"
    observacoes: str = ""


class DebtUpdate(BaseModel):
    credor: Optional[str] = None
    tipo_divida: Optional[str] = None
    valor_total: Optional[float] = None
    valor_vencido: Optional[float] = None
    data_vencimento: Optional[str] = None
    status: Optional[str] = None
    observacoes: Optional[str] = None


class AnalysisInput(BaseModel):
    foco_extra: str = ""


class SimulatorInput(BaseModel):
    monthly_cost_cut: float = 0
    urgent_collection_boost: float = 0
    horizon_months: int = 6


def _round_money(value) -> float:
    return round(float(value or 0), 2)


def _date_only(value: str) -> str:
    return str(value or "")[:10]


def _parse_date(value: str):
    try:
        return datetime.strptime(_date_only(value), "%Y-%m-%d").date()
    except Exception:
        return None


def _payment_status_expense(doc: dict) -> bool:
    if doc.get("paid") is True:
        return True
    status = str(doc.get("payment_status") or "").lower()
    return status in ("pago", "paid")


def _monthly_equivalent(amount: float, frequency: str) -> float:
    freq = (frequency or "mensal").lower()
    if "trimes" in freq:
        return amount / 3
    if "semes" in freq:
        return amount / 6
    if "anual" in freq:
        return amount / 12
    if "quinzen" in freq:
        return amount * 2
    return amount


def _extract_json_object(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def _score_debt(item: dict) -> float:
    base = {
        "Segurança_Social": 130,
        "Fiscal_AT": 120,
        "Bancária": 80,
        "Fornecedores": 65,
    }.get(item.get("tipo_divida"), 50)
    overdue = max(int(item.get("days_past_due") or 0), 0)
    due_soon = int(item.get("days_to_due") or 0)
    score = base + min(overdue, 120)
    if 0 <= due_soon <= 7:
        score += 20
    if item.get("status") == "vencida":
        score += 25
    score += min((_round_money(item.get("valor_vencido") or item.get("valor_total")) / 1000), 25)
    return round(score, 2)


def _build_cash_allocation_plan(context: dict) -> list:
    available_cash = _round_money(context["snapshot"].get("allocatable_cash_now"))
    if available_cash <= 0:
        return []

    ranked = sorted(context.get("debts", []), key=lambda item: item.get("priority_score", 0), reverse=True)
    remaining = available_cash
    plan = []
    for debt in ranked:
        if remaining <= 0:
            break
        due_now = _round_money(debt.get("valor_vencido") or debt.get("valor_total"))
        if due_now <= 0:
            continue
        payment = min(remaining, due_now)
        if payment < 0.01:
            continue
        plan.append({
            "creditor": debt.get("credor"),
            "tipo_divida": debt.get("tipo_divida"),
            "amount": _round_money(payment),
            "status": "pagar_total" if payment >= due_now else "pagar_parcial",
            "risk_if_ignored": debt.get("risk_label"),
            "notes": f"Prioridade {int(debt.get('priority_score', 0))} · vencido {max(int(debt.get('days_past_due') or 0), 0)} dia(s)",
        })
        remaining = _round_money(remaining - payment)

    return plan


def _compute_work_item_totals(item: dict) -> dict:
    qty = float(item.get("quantity") or 0)
    real_qty = item.get("real_quantity")
    real_qty = float(real_qty) if real_qty is not None else qty
    predicted_uc = float(item.get("predicted_unit_cost") or 0)
    real_uc = float(item.get("real_unit_cost") or 0)
    margin = float(item.get("margin") or 0)
    sale_unit = round(predicted_uc * (1 + margin), 2)
    return {
        **item,
        "real_quantity": real_qty,
        "predicted_total": round(predicted_uc * qty, 2),
        "real_total": round(real_uc * real_qty, 2) if real_uc > 0 else 0,
        "sale_total": round(sale_unit * qty, 2),
    }


def _compute_work_financial_snapshot(work: dict, invoices: list, expenses: list) -> Optional[dict]:
    items = [_compute_work_item_totals(item) for item in (work.get("items") or [])]
    sale_total = _round_money(sum(item.get("sale_total", 0) for item in items))
    predicted_total = _round_money(sum(item.get("predicted_total", 0) for item in items))
    real_items_total = _round_money(sum(item.get("real_total", 0) for item in items))

    linked_invoices = [inv for inv in invoices if inv.get("obra_id") == work.get("id")]
    total_invoiced = _round_money(sum(inv.get("value_total") or 0 for inv in linked_invoices))
    total_received = 0.0
    for inv in linked_invoices:
        total_received += sum(float(pay.get("amount") or 0) for pay in (inv.get("payments") or []))
    total_received = _round_money(total_received)
    to_receive = _round_money(total_invoiced - total_received)
    to_invoice = _round_money(max(0, sale_total - total_invoiced))

    linked_expenses = [exp for exp in expenses if exp.get("obra_id") == work.get("id")]
    expenses_total = _round_money(sum(exp.get("value_gross") or 0 for exp in linked_expenses))
    real_total_cost = _round_money(real_items_total + expenses_total)
    projected_cash_balance = _round_money(sale_total - real_total_cost)
    margin_pct = round((projected_cash_balance / sale_total * 100), 1) if sale_total > 0 else 0
    is_active = (work.get("status") or "").lower() not in ("finalizado", "concluida", "concluída", "cancelada", "cancelado")

    if not is_active or (to_receive <= 0 and to_invoice <= 0):
        return None

    return {
        "work_id": work.get("id"),
        "title": work.get("title") or "Obra",
        "client_name": work.get("client_name") or "Cliente",
        "status": work.get("status") or "",
        "sale_total": sale_total,
        "predicted_total": predicted_total,
        "real_total_cost": real_total_cost,
        "to_receive": to_receive,
        "to_invoice": to_invoice,
        "projected_cash_balance": projected_cash_balance,
        "margin_pct": margin_pct,
        "is_collectable_now": bool(to_receive > 0 and projected_cash_balance > 0),
    }


async def _collect_context(db) -> dict:
    treasury = await _build_treasury_insights(db, days=60)
    latest_analysis = await db.bank_analyses.find_one(
        {"status": "completed"},
        {"_id": 0, "id": 1, "filename": 1, "date_from": 1, "date_to": 1, "transactions": 1},
        sort=[("date_to", -1), ("created_at", -1)],
    )

    today = datetime.now(timezone.utc).date()
    recent_transactions = []
    if latest_analysis:
        recent_transactions = sorted(latest_analysis.get("transactions") or [], key=lambda item: item.get("date", ""), reverse=True)[:18]

    recent_window_start = (today - timedelta(days=90)).isoformat()
    expenses = await db.expenses.find({}, {"_id": 0}).to_list(4000)
    recent_expenses = [
        exp for exp in expenses
        if _date_only(exp.get("date")) >= recent_window_start
    ]

    monthly_variable_by_month = defaultdict(float)
    for exp in recent_expenses:
        if exp.get("type") not in ("variavel", "obra"):
            continue
        monthly_variable_by_month[_date_only(exp.get("date"))[:7]] += _round_money(exp.get("value_gross"))
    monthly_variable_burn = _round_money(sum(monthly_variable_by_month.values()) / max(len(monthly_variable_by_month), 1))

    recurring_masters, recurring_source = await _load_or_compute_recurring_masters(db)
    recurring_fixed = []
    recurring_fixed_total = 0.0
    for master in recurring_masters:
        payment_type = (master.get("payment_type") or master.get("category") or "").lower()
        if payment_type not in ("fixo", "imposto", "salario", "financeiro"):
            continue
        monthly_value = _round_money(_monthly_equivalent(float(master.get("avg_amount") or 0), master.get("frequency") or "mensal"))
        if monthly_value <= 0:
            continue
        recurring_fixed_total += monthly_value
        recurring_fixed.append({
            "source": "recorrente_bancario",
            "label": master.get("description") or "Pagamento recorrente",
            "frequency": master.get("frequency") or "mensal",
            "monthly_equivalent": monthly_value,
        })

    fixed_templates = await db.fixed_cost_templates.find({"active": True}, {"_id": 0}).to_list(500)
    template_fixed_total = _round_money(sum(float(item.get("expected_amount") or 0) for item in fixed_templates))
    template_breakdown = [{
        "source": "modelo_fixo",
        "label": item.get("name") or item.get("supplier") or "Custo fixo",
        "frequency": "mensal",
        "monthly_equivalent": _round_money(item.get("expected_amount")),
    } for item in fixed_templates]

    monthly_fixed_costs = _round_money(max(recurring_fixed_total, template_fixed_total))

    invoices = await db.invoices.find({}, {"_id": 0}).to_list(4000)
    open_invoices = []
    monthly_receipts = defaultdict(float)
    for inv in invoices:
        amount_paid = _round_money(sum(float(pay.get("amount") or 0) for pay in (inv.get("payments") or [])))
        balance = _round_money((inv.get("value_total") or 0) - amount_paid)
        for pay in inv.get("payments") or []:
            pay_date = _date_only(pay.get("date"))
            if pay_date >= recent_window_start:
                monthly_receipts[pay_date[:7]] += _round_money(pay.get("amount"))
        if balance <= 0.01:
            continue
        due = _parse_date(inv.get("due_date"))
        days_overdue = (today - due).days if due and due < today else 0
        open_invoices.append({
            "id": inv.get("id"),
            "number": inv.get("number") or "Sem número",
            "client_name": inv.get("client_name") or "Cliente",
            "obra_id": inv.get("obra_id"),
            "due_date": _date_only(inv.get("due_date")),
            "balance": balance,
            "days_overdue": max(days_overdue, 0),
            "is_overdue": days_overdue > 0,
        })
    open_invoices = sorted(open_invoices, key=lambda item: (not item["is_overdue"], -item["days_overdue"], -item["balance"]))
    urgent_receivables = open_invoices[:10]
    overdue_receivables_total = _round_money(sum(item["balance"] for item in open_invoices if item["is_overdue"]))
    urgent_receivables_total = _round_money(sum(item["balance"] for item in urgent_receivables))
    average_monthly_receipts = _round_money(sum(monthly_receipts.values()) / max(len(monthly_receipts), 1))

    debts = await db.active_debts.find(
        {"status": {"$nin": list(RESOLVED_DEBT_STATUSES)}},
        {"_id": 0}
    ).sort("data_vencimento", 1).to_list(500)
    enriched_debts = []
    active_debt_total = 0.0
    overdue_debt_total = 0.0
    for debt in debts:
        due = _parse_date(debt.get("data_vencimento"))
        days_to_due = (due - today).days if due else 999
        days_past_due = (today - due).days if due and due < today else 0
        risk_label = "Execução / bloqueio" if debt.get("tipo_divida") in ("Fiscal_AT", "Segurança_Social") else "Pressão comercial"
        enriched = {
            **debt,
            "days_to_due": days_to_due,
            "days_past_due": max(days_past_due, 0),
            "risk_label": risk_label,
        }
        enriched["priority_score"] = _score_debt(enriched)
        active_debt_total += _round_money(enriched.get("valor_total"))
        overdue_debt_total += _round_money(enriched.get("valor_vencido"))
        enriched_debts.append(enriched)
    enriched_debts = sorted(enriched_debts, key=lambda item: item.get("priority_score", 0), reverse=True)

    works = await db.works.find({}, {"_id": 0}).to_list(500)
    work_opportunities = []
    for work in works:
        snap = _compute_work_financial_snapshot(work, invoices, expenses)
        if snap:
            work_opportunities.append(snap)
    work_opportunities = sorted(work_opportunities, key=lambda item: (not item["is_collectable_now"], -item["to_receive"], -item["projected_cash_balance"]))[:8]
    positive_margin_pool = _round_money(sum(item.get("projected_cash_balance", 0) for item in work_opportunities if item.get("projected_cash_balance", 0) > 0))

    next_14_outflows = treasury.get("projection", {}).get("summary_30d", {}).get("total_outflow", 0) * (14 / 30)
    current_cash = _round_money(treasury.get("opening_balance", {}).get("effective"))
    reserve_floor_14d = _round_money(max(0, min(max(current_cash, 0), next_14_outflows)))
    allocatable_cash_now = _round_money(max(0, current_cash - reserve_floor_14d))
    average_daily_burn = (monthly_fixed_costs + monthly_variable_burn) / 30 if (monthly_fixed_costs + monthly_variable_burn) > 0 else 0
    runway_days = round(max(current_cash, 0) / average_daily_burn, 1) if average_daily_burn > 0 else None

    if current_cash < 0 or treasury.get("projection", {}).get("summary_30d", {}).get("lowest_balance", 0) < 0:
        crisis_level = "critical"
    elif allocatable_cash_now <= 0:
        crisis_level = "pressure"
    else:
        crisis_level = "controlled"

    latest_report = await db.cfo_virtual_reports.find_one({}, {"_id": 0}, sort=[("created_at", -1)])

    context = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "context_validation": {
            "can_generate_analysis": bool(latest_analysis),
            "bank_statement_loaded": bool(latest_analysis),
            "fixed_costs_ready": bool(recurring_fixed or template_breakdown),
            "debt_collection_ready": True,
            "recent_transactions_count": len(recent_transactions),
            "open_receivables_count": len(open_invoices),
            "latest_bank_source": {
                "analysis_id": latest_analysis.get("id") if latest_analysis else None,
                "filename": latest_analysis.get("filename") if latest_analysis else None,
                "date_to": latest_analysis.get("date_to") if latest_analysis else None,
            },
        },
        "snapshot": {
            "current_cash": current_cash,
            "reserve_floor_14d": reserve_floor_14d,
            "allocatable_cash_now": allocatable_cash_now,
            "monthly_fixed_costs": monthly_fixed_costs,
            "monthly_variable_burn": monthly_variable_burn,
            "active_debt_total": _round_money(active_debt_total),
            "overdue_debt_total": _round_money(overdue_debt_total),
            "urgent_receivables_total": urgent_receivables_total,
            "overdue_receivables_total": overdue_receivables_total,
            "runway_days": runway_days,
            "crisis_level": crisis_level,
            "treasury_lowest_30d": _round_money(treasury.get("projection", {}).get("summary_30d", {}).get("lowest_balance", 0)),
        },
        "recent_transactions": [{
            "date": item.get("date"),
            "description": item.get("description"),
            "amount": _round_money(item.get("amount")),
            "category": item.get("category") or "outro",
        } for item in recent_transactions],
        "fixed_cost_breakdown": sorted(recurring_fixed + template_breakdown, key=lambda item: item["monthly_equivalent"], reverse=True)[:10],
        "debts": enriched_debts,
        "urgent_receivables": urgent_receivables,
        "work_margin_opportunities": work_opportunities,
        "metrics": {
            "average_monthly_receipts": average_monthly_receipts,
            "positive_margin_pool": positive_margin_pool,
            "recurring_source": recurring_source,
        },
        "treasury": {
            "summary_badges": treasury.get("summary_badges", {}),
            "projection_30d": treasury.get("projection", {}).get("summary_30d", {}),
            "projection_60d": treasury.get("projection", {}).get("summary_60d", {}),
            "anomalies": treasury.get("anomalies", {}).get("items", [])[:6],
            "pressure_map": treasury.get("pressure_map", {}),
        },
        "latest_report": latest_report,
    }
    context["cash_allocation"] = _build_cash_allocation_plan(context)
    return context


def _fallback_analysis(context: dict) -> dict:
    crisis = context["snapshot"].get("crisis_level")
    urgent = context.get("urgent_receivables", [])[:3]
    actions = []
    for item in context.get("treasury", {}).get("anomalies", [])[:3]:
        actions.append({
            "title": f"Rever imediatamente {item.get('description')}",
            "why_now": f"Subiu {item.get('increase_pct', 0)}% face à média recente.",
            "estimated_monthly_relief": _round_money(max(0, float(item.get("last_amount", 0) or 0) - float(item.get("baseline_avg", 0) or 0))),
            "execution": "Negociar, cortar ou suspender ainda este mês.",
        })
    if not actions:
        for cost in context.get("fixed_cost_breakdown", [])[:3]:
            actions.append({
                "title": f"Auditar {cost.get('label')}",
                "why_now": "É um dos maiores custos fixos do mapa actual.",
                "estimated_monthly_relief": _round_money(cost.get("monthly_equivalent") * 0.1),
                "execution": "Renegociar preço, prazo ou consumo na próxima 48h.",
            })

    treasury_plan = []
    for item in urgent:
        treasury_plan.append({
            "title": f"Cobrar {item.get('number')}",
            "target": item.get("client_name"),
            "amount_target": _round_money(item.get("balance")),
            "deadline": "24h",
            "why": "Factura vencida ou com saldo aberto prioritário para injectar liquidez.",
        })

    return {
        "executive_diagnosis": {
            "headline": "Modo sobrevivência financeira" if crisis == "critical" else "Pressão de tesouraria sob controlo apertado",
            "severity": crisis,
            "financial_truth": "Sem caixa livre, qualquer pagamento fora do plano piora a execução." if not context.get("cash_allocation") else "Há caixa limitada; use apenas a alocação exacta calculada pelo motor.",
            "survival_focus": "Cobrança urgente e micro-cortes em 48h." if crisis != "controlled" else "Disciplina total de caixa e negociação preventiva.",
        },
        "cost_surgery_actions": actions,
        "tactical_treasury_plan": treasury_plan,
        "orders_of_day": [
            "Confirmar hoje todos os saldos por receber vencidos.",
            "Congelar compras não críticas até rever caixa livre.",
            "Executar o plano exacto de caixa sem improvisos.",
        ],
    }


async def _run_llm_json(system_prompt: str, user_prompt: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY não configurada para o CFO Virtual.")

    chat = LlmChat(
        api_key=api_key,
        session_id=f"cfo-virtual-{uuid.uuid4().hex[:10]}",
        system_message=system_prompt,
    ).with_model("openai", "gpt-5.4")

    chunks = []
    async for event in chat.stream_message(UserMessage(text=user_prompt)):
        if isinstance(event, TextDelta):
            chunks.append(event.content)
        elif isinstance(event, StreamDone):
            break
    return _extract_json_object("".join(chunks))


async def _generate_analysis_report(context: dict, foco_extra: str) -> dict:
    compact_context = {
        "snapshot": context.get("snapshot"),
        "latest_bank_source": context.get("context_validation", {}).get("latest_bank_source"),
        "fixed_cost_breakdown": context.get("fixed_cost_breakdown", [])[:8],
        "recent_transactions": context.get("recent_transactions", [])[:14],
        "debts": context.get("debts", [])[:8],
        "cash_allocation_locked": context.get("cash_allocation", []),
        "urgent_receivables": context.get("urgent_receivables", [])[:6],
        "work_margin_opportunities": context.get("work_margin_opportunities", [])[:6],
        "treasury": context.get("treasury"),
    }
    system_prompt = (
        "És o CFO Virtual da Obelisco Radical em Portugal. És rigoroso, frio, realista e orientado à sobrevivência de caixa. "
        "Nunca inventas liquidez, nunca assumes recebimentos não listados no contexto e nunca sugeres pagamentos acima da liquidez disponível. "
        "Se a liquidez livre for zero ou negativa, assumes modo de sobrevivência e foco total em cobrança urgente, negociação dura e micro-cortes. "
        "Responde APENAS com JSON válido. Não uses markdown."
    )
    user_prompt = (
        "Analisa a situação financeira real e devolve JSON com a estrutura exacta:\n"
        "{\n"
        '  "executive_diagnosis": {"headline": "", "severity": "critical|pressure|controlled", "financial_truth": "", "survival_focus": ""},\n'
        '  "cost_surgery_actions": [{"title": "", "why_now": "", "estimated_monthly_relief": 0, "execution": ""}],\n'
        '  "tactical_treasury_plan": [{"title": "", "target": "", "amount_target": 0, "deadline": "", "why": ""}],\n'
        '  "orders_of_day": ["", "", ""]\n'
        "}\n\n"
        "REGRAS DURAS:\n"
        f"- A caixa livre exacta é {context['snapshot']['allocatable_cash_now']}€.\n"
        "- É PROIBIDO sugerir qualquer pagamento fora da alocação bloqueada em cash_allocation_locked.\n"
        "- Usa clientes, faturas, credores e obras reais do contexto quando fizer sentido.\n"
        "- Não dês conselhos genéricos. Fala como diretor financeiro de PME portuguesa sob stress real.\n"
        f"- Foco extra do utilizador: {foco_extra or 'Nenhum'}\n\n"
        f"CONTEXTO FINANCEIRO REAL:\n{json.dumps(compact_context, ensure_ascii=False)}"
    )
    try:
        return await _run_llm_json(system_prompt, user_prompt)
    except Exception as exc:
        logger.error(f"CFO analysis LLM failed: {exc}")
        return _fallback_analysis(context)


def _build_simulation_numbers(context: dict, monthly_cost_cut: float, urgent_collection_boost: float, horizon_months: int) -> dict:
    months = max(3, min(int(horizon_months or 6), 12))
    current_cash = _round_money(context["snapshot"].get("current_cash"))
    base_receipts = _round_money(context["metrics"].get("average_monthly_receipts"))
    base_outflow = _round_money(context["snapshot"].get("monthly_fixed_costs") + context["snapshot"].get("monthly_variable_burn"))
    positive_margin_pool = _round_money(context["metrics"].get("positive_margin_pool"))
    max_cut_feasible = _round_money(max(context["snapshot"].get("monthly_variable_burn", 0) * 0.8, 0))
    max_urgent_collection = _round_money(sum(item.get("balance", 0) for item in context.get("urgent_receivables", [])))
    effective_cut = _round_money(min(max(monthly_cost_cut, 0), max_cut_feasible))
    effective_collection = _round_money(min(max(urgent_collection_boost, 0), max_urgent_collection))
    monthly_margin_realization = _round_money(positive_margin_pool / months * 0.65) if positive_margin_pool > 0 else 0.0

    rows = []
    running_cash = current_cash
    for idx in range(1, months + 1):
        inflow = _round_money(base_receipts + monthly_margin_realization + (effective_collection if idx == 1 else 0))
        outflow = _round_money(max(0, base_outflow - effective_cut))
        ending_cash = _round_money(running_cash + inflow - outflow)
        rows.append({
            "month": idx,
            "label": f"M{idx}",
            "cash_start": running_cash,
            "inflow": inflow,
            "outflow": outflow,
            "ending_cash": ending_cash,
        })
        running_cash = ending_cash

    recovery_month = None
    if current_cash >= 0 and all(item["ending_cash"] >= 0 for item in rows):
        recovery_month = 0
    elif current_cash < 0:
        for idx, item in enumerate(rows):
            if item["ending_cash"] >= 0 and all(next_item["ending_cash"] >= 0 for next_item in rows[idx:]):
                recovery_month = item["month"]
                break

    return {
        "limits": {
            "max_cut_feasible": max_cut_feasible,
            "max_urgent_collection": max_urgent_collection,
            "positive_margin_pool": positive_margin_pool,
        },
        "assumptions": {
            "base_receipts": base_receipts,
            "base_outflow": base_outflow,
            "effective_cut": effective_cut,
            "effective_collection": effective_collection,
            "monthly_margin_realization": monthly_margin_realization,
        },
        "projection": rows,
        "recovery_month": recovery_month,
        "recovered_within_horizon": recovery_month is not None,
        "ending_cash": rows[-1]["ending_cash"] if rows else current_cash,
    }


def _fallback_simulator_commentary(numbers: dict) -> dict:
    recovery_month = numbers.get("recovery_month")
    if recovery_month == 0:
        verdict = "Caixa mantém-se positiva"
    else:
        verdict = "Recuperação possível" if recovery_month else "Recuperação não fechada no horizonte"
    return {
        "verdict": verdict,
        "recovery_window": "A caixa mantém-se acima de zero durante todo o horizonte." if recovery_month == 0 else (f"Caixa volta a positivo no mês {recovery_month} e mantém-se positiva daí em diante." if recovery_month else "Mesmo com este cenário, a caixa não recupera dentro do horizonte escolhido."),
        "non_negotiables": [
            "Validar cobrança urgente logo no primeiro mês.",
            "Executar apenas cortes realmente exequíveis no terreno.",
            "Não assumir margens de obra sem confirmação comercial e operacional.",
        ],
        "warning": "Se a cobrança falhar ou o corte não se materializar, a recuperação derrapa imediatamente.",
    }


async def _generate_simulator_commentary(context: dict, numbers: dict) -> dict:
    compact_context = {
        "snapshot": context.get("snapshot"),
        "urgent_receivables": context.get("urgent_receivables", [])[:6],
        "work_margin_opportunities": context.get("work_margin_opportunities", [])[:6],
        "limits": numbers.get("limits"),
        "assumptions": numbers.get("assumptions"),
        "projection": numbers.get("projection"),
    }
    system_prompt = (
        "És o CFO Virtual da Obelisco Radical. Explicas cenários de recuperação sem ilusões, sem promessas mágicas e com foco em execução real. "
        "Responde APENAS com JSON válido."
    )
    user_prompt = (
        "Devolve JSON com a estrutura exacta:\n"
        "{\n"
        '  "verdict": "",\n'
        '  "recovery_window": "",\n'
        '  "non_negotiables": ["", "", ""],\n'
        '  "warning": ""\n'
        "}\n\n"
        "Regras: baseia-te só no cenário real abaixo; se não houver recuperação, diz isso claramente.\n\n"
        f"CENÁRIO REAL:\n{json.dumps(compact_context, ensure_ascii=False)}"
    )
    try:
        return await _run_llm_json(system_prompt, user_prompt)
    except Exception as exc:
        logger.error(f"CFO simulator LLM failed: {exc}")
        return _fallback_simulator_commentary(numbers)


def create_cfo_virtual_router(db, get_current_user):
    @cfo_virtual_router.get("/dashboard")
    async def get_dashboard(user=Depends(get_current_user)):
        return await _collect_context(db)

    @cfo_virtual_router.get("/debts")
    async def list_debts(user=Depends(get_current_user)):
        items = await db.active_debts.find({}, {"_id": 0}).sort("data_vencimento", 1).to_list(500)
        return items

    @cfo_virtual_router.post("/debts")
    async def create_debt(input: DebtCreate, user=Depends(get_current_user)):
        if input.tipo_divida not in DEBT_TYPES:
            raise HTTPException(status_code=400, detail=f"tipo_divida inválido. Use: {', '.join(DEBT_TYPES)}")
        if input.valor_total <= 0:
            raise HTTPException(status_code=400, detail="valor_total deve ser maior que zero")
        if input.valor_vencido < 0 or input.valor_vencido > input.valor_total:
            raise HTTPException(status_code=400, detail="valor_vencido inválido")

        doc = {
            "id": str(uuid.uuid4()),
            **input.model_dump(),
            "data_vencimento": _date_only(input.data_vencimento),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("id"),
        }
        await db.active_debts.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @cfo_virtual_router.put("/debts/{debt_id}")
    async def update_debt(debt_id: str, input: DebtUpdate, user=Depends(get_current_user)):
        data = input.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Nada para atualizar")
        if "tipo_divida" in data and data["tipo_divida"] not in DEBT_TYPES:
            raise HTTPException(status_code=400, detail=f"tipo_divida inválido. Use: {', '.join(DEBT_TYPES)}")
        if "valor_total" in data and float(data["valor_total"] or 0) <= 0:
            raise HTTPException(status_code=400, detail="valor_total deve ser maior que zero")
        if "data_vencimento" in data:
            data["data_vencimento"] = _date_only(data["data_vencimento"])
        if "valor_total" in data:
            current = await db.active_debts.find_one({"id": debt_id}, {"_id": 0, "valor_vencido": 1})
            if not current:
                raise HTTPException(status_code=404, detail="Dívida não encontrada")
            if float(current.get("valor_vencido") or 0) > float(data["valor_total"]):
                raise HTTPException(status_code=400, detail="valor_total não pode ficar abaixo do valor_vencido")
        if "valor_vencido" in data:
            current = await db.active_debts.find_one({"id": debt_id}, {"_id": 0, "valor_total": 1})
            if not current:
                raise HTTPException(status_code=404, detail="Dívida não encontrada")
            if float(data["valor_vencido"] or 0) < 0 or float(data["valor_vencido"] or 0) > float(current.get("valor_total") or 0):
                raise HTTPException(status_code=400, detail="valor_vencido inválido")

        result = await db.active_debts.update_one(
            {"id": debt_id},
            {"$set": {**data, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": user.get("id")}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Dívida não encontrada")
        return await db.active_debts.find_one({"id": debt_id}, {"_id": 0})

    @cfo_virtual_router.delete("/debts/{debt_id}")
    async def delete_debt(debt_id: str, user=Depends(get_current_user)):
        result = await db.active_debts.delete_one({"id": debt_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Dívida não encontrada")
        return {"ok": True}

    @cfo_virtual_router.post("/analyze")
    async def analyze_financial_context(input: AnalysisInput, user=Depends(get_current_user)):
        context = await _collect_context(db)
        if not context.get("context_validation", {}).get("can_generate_analysis"):
            raise HTTPException(status_code=400, detail="Carregue primeiro um extrato bancário para o CFO Virtual cruzar saldo real e movimentos recentes.")
        ai_report = await _generate_analysis_report(context, input.foco_extra)
        final_report = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("id"),
            "context_validation": context.get("context_validation"),
            "snapshot": context.get("snapshot"),
            "cash_allocation": context.get("cash_allocation"),
            "analysis": ai_report,
            "urgent_receivables": context.get("urgent_receivables", [])[:6],
            "work_margin_opportunities": context.get("work_margin_opportunities", [])[:6],
        }
        await db.cfo_virtual_reports.insert_one(final_report)
        final_report.pop("_id", None)
        return final_report

    @cfo_virtual_router.post("/simulator")
    async def simulate_breathing_room(input: SimulatorInput, user=Depends(get_current_user)):
        context = await _collect_context(db)
        if not context.get("context_validation", {}).get("can_generate_analysis"):
            raise HTTPException(status_code=400, detail="Carregue primeiro um extrato bancário para simular fôlego financeiro com base real.")
        numbers = _build_simulation_numbers(context, input.monthly_cost_cut, input.urgent_collection_boost, input.horizon_months)
        commentary = await _generate_simulator_commentary(context, numbers)
        response = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "scenario": {
                "monthly_cost_cut": _round_money(input.monthly_cost_cut),
                "urgent_collection_boost": _round_money(input.urgent_collection_boost),
                "horizon_months": max(3, min(int(input.horizon_months or 6), 12)),
            },
            **numbers,
            "commentary": commentary,
        }
        await db.cfo_virtual_simulations.insert_one(response)
        response.pop("_id", None)
        return response

    return cfo_virtual_router