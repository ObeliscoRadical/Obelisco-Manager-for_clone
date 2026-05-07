"""Custos Fixos — modelos recorrentes + instâncias mensais com controlo de pagamento.

Fluxo:
1. Utilizador cadastra modelos (templates) ex: Renda Escritório 800€ todo dia 5
2. Para cada mês, gera-se uma instância pendente por template activo
3. Quando marca "Pago", cria-se automaticamente uma Despesa associada (mantém o cashflow real)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, date as date_cls
import uuid


fixed_costs_router = APIRouter(prefix="/api/fixed-costs", tags=["fixed-costs"])


# ===== MODELS =====
class FixedCostTemplateCreate(BaseModel):
    name: str                              # "Renda escritório"
    category: str = "Outros"               # mesma categoria das despesas
    supplier: str = ""
    nif: str = ""
    expected_amount: float                 # valor previsto/estimado
    due_day: int = 1                       # 1-28 (dia do mês de vencimento)
    payment_method: str = "Transferência"
    notes: str = ""
    active: bool = True


class FixedCostTemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    nif: Optional[str] = None
    expected_amount: Optional[float] = None
    due_day: Optional[int] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class MarkPaidInput(BaseModel):
    paid_date: str                         # YYYY-MM-DD
    paid_amount: float                     # valor real (pode diferir do esperado)
    payment_method: str = "Transferência"
    invoice_number: str = ""
    notes: str = ""


def _last_day(year: int, month: int) -> date_cls:
    if month == 12:
        return date_cls(year + 1, 1, 1).replace(day=1).fromordinal(date_cls(year + 1, 1, 1).toordinal() - 1)
    return date_cls(year, month + 1, 1).fromordinal(date_cls(year, month + 1, 1).toordinal() - 1)


def _due_date(year: int, month: int, day: int) -> str:
    """Returns YYYY-MM-DD for due_day capped at month last day."""
    last = _last_day(year, month).day
    d = max(1, min(int(day or 1), last))
    return f"{year:04d}-{month:02d}-{d:02d}"


def _annotate_instance(inst: dict, today: str) -> dict:
    if inst.get("status") == "pago":
        return inst
    due = (inst.get("due_date") or "")[:10]
    if due and due < today:
        inst["status"] = "atrasado"
        try:
            inst["days_overdue"] = (date_cls.fromisoformat(today) - date_cls.fromisoformat(due)).days
        except Exception:
            inst["days_overdue"] = 0
    else:
        inst["status"] = "pendente"
        inst["days_overdue"] = 0
    return inst


def create_fixed_costs_router(db, get_current_user):

    # ---------- TEMPLATES ----------
    @fixed_costs_router.get("/templates")
    async def list_templates(active_only: bool = False, user=Depends(get_current_user)):
        q = {"active": True} if active_only else {}
        return await db.fixed_cost_templates.find(q, {"_id": 0}).sort("name", 1).to_list(500)

    @fixed_costs_router.post("/templates")
    async def create_template(input: FixedCostTemplateCreate, user=Depends(get_current_user)):
        if input.expected_amount <= 0:
            raise HTTPException(status_code=400, detail="Valor previsto deve ser maior que zero")
        if not (1 <= input.due_day <= 31):
            raise HTTPException(status_code=400, detail="Dia de vencimento deve estar entre 1 e 31")
        doc = {
            "id": str(uuid.uuid4()),
            **input.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("name", ""),
        }
        await db.fixed_cost_templates.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @fixed_costs_router.put("/templates/{template_id}")
    async def update_template(template_id: str, input: FixedCostTemplateUpdate, user=Depends(get_current_user)):
        data = input.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Nada para atualizar")
        if "due_day" in data and not (1 <= data["due_day"] <= 31):
            raise HTTPException(status_code=400, detail="Dia inválido")
        r = await db.fixed_cost_templates.update_one({"id": template_id}, {"$set": data})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Modelo não encontrado")
        return await db.fixed_cost_templates.find_one({"id": template_id}, {"_id": 0})

    @fixed_costs_router.delete("/templates/{template_id}")
    async def delete_template(template_id: str, user=Depends(get_current_user)):
        r = await db.fixed_cost_templates.delete_one({"id": template_id})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Modelo não encontrado")
        return {"ok": True}

    # ---------- INSTANCES ----------
    @fixed_costs_router.post("/generate")
    async def generate_instances(year: int, month: int, user=Depends(get_current_user)):
        """Cria instâncias pendentes para o mês a partir dos templates activos.
        Idempotente: não duplica se já existir instância para esse template+mês."""
        if not (1 <= month <= 12):
            raise HTTPException(status_code=400, detail="Mês inválido")
        templates = await db.fixed_cost_templates.find({"active": True}, {"_id": 0}).to_list(500)
        existing = await db.fixed_cost_instances.find(
            {"year": year, "month": month}, {"_id": 0, "template_id": 1}
        ).to_list(2000)
        existing_ids = {e["template_id"] for e in existing}
        created = 0
        for t in templates:
            if t["id"] in existing_ids:
                continue
            inst = {
                "id": str(uuid.uuid4()),
                "template_id": t["id"],
                "name": t["name"],
                "category": t.get("category", "Outros"),
                "supplier": t.get("supplier", ""),
                "nif": t.get("nif", ""),
                "year": year,
                "month": month,
                "due_date": _due_date(year, month, t.get("due_day", 1)),
                "expected_amount": t["expected_amount"],
                "payment_method_default": t.get("payment_method", "Transferência"),
                "notes_default": t.get("notes", ""),
                "status": "pendente",
                "paid_date": None,
                "paid_amount": None,
                "expense_id": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.fixed_cost_instances.insert_one(inst)
            created += 1
        return {"created": created, "month": month, "year": year}

    @fixed_costs_router.get("/instances")
    async def list_instances(year: int, month: int, user=Depends(get_current_user)):
        items = await db.fixed_cost_instances.find(
            {"year": year, "month": month}, {"_id": 0}
        ).sort("due_date", 1).to_list(500)
        today = date_cls.today().isoformat()
        items = [_annotate_instance(i, today) for i in items]
        # Summary
        pendente = sum(i["expected_amount"] for i in items if i["status"] == "pendente")
        atrasado = sum(i["expected_amount"] for i in items if i["status"] == "atrasado")
        pago = sum((i.get("paid_amount") or 0) for i in items if i["status"] == "pago")
        previsto = sum(i["expected_amount"] for i in items)
        return {
            "year": year,
            "month": month,
            "items": items,
            "summary": {
                "previsto": round(previsto, 2),
                "pago": round(pago, 2),
                "pendente": round(pendente, 2),
                "atrasado": round(atrasado, 2),
                "count_total": len(items),
                "count_pago": sum(1 for i in items if i["status"] == "pago"),
                "count_pendente": sum(1 for i in items if i["status"] == "pendente"),
                "count_atrasado": sum(1 for i in items if i["status"] == "atrasado"),
            },
        }

    @fixed_costs_router.post("/instances/{instance_id}/pay")
    async def mark_paid(instance_id: str, input: MarkPaidInput, user=Depends(get_current_user)):
        inst = await db.fixed_cost_instances.find_one({"id": instance_id}, {"_id": 0})
        if not inst:
            raise HTTPException(status_code=404, detail="Instância não encontrada")
        if inst["status"] == "pago":
            raise HTTPException(status_code=400, detail="Já marcado como pago")
        if input.paid_amount <= 0:
            raise HTTPException(status_code=400, detail="Valor inválido")

        # Cria despesa associada para entrar no cashflow
        vat_rate = 23.0
        net = round(input.paid_amount / (1 + vat_rate / 100), 2)
        vat_amount = round(input.paid_amount - net, 2)
        expense = {
            "id": str(uuid.uuid4()),
            "date": input.paid_date,
            "supplier": inst.get("supplier", ""),
            "nif": inst.get("nif", ""),
            "invoice_number": input.invoice_number,
            "category": inst.get("category", "Outros"),
            "type": "fixo",
            "obra_id": None,
            "obra_name": None,
            "value_net": net,
            "vat_rate": vat_rate,
            "vat_amount": vat_amount,
            "value_gross": round(float(input.paid_amount), 2),
            "payment_method": input.payment_method,
            "notes": f"[Custo fixo] {inst['name']} {inst['month']:02d}/{inst['year']}" + (f" — {input.notes}" if input.notes else ""),
            "fixed_cost_instance_id": instance_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("id"),
        }
        await db.expenses.insert_one(expense)

        # Atualiza instância
        await db.fixed_cost_instances.update_one(
            {"id": instance_id},
            {"$set": {
                "status": "pago",
                "paid_date": input.paid_date,
                "paid_amount": round(float(input.paid_amount), 2),
                "payment_method": input.payment_method,
                "invoice_number": input.invoice_number,
                "paid_notes": input.notes,
                "expense_id": expense["id"],
                "paid_at": datetime.now(timezone.utc).isoformat(),
                "paid_by": user.get("name", ""),
            }},
        )
        return await db.fixed_cost_instances.find_one({"id": instance_id}, {"_id": 0})

    @fixed_costs_router.post("/instances/{instance_id}/unpay")
    async def unmark_paid(instance_id: str, user=Depends(get_current_user)):
        """Reverte: apaga a despesa associada e volta a colocar pendente."""
        inst = await db.fixed_cost_instances.find_one({"id": instance_id}, {"_id": 0})
        if not inst:
            raise HTTPException(status_code=404, detail="Instância não encontrada")
        if inst.get("expense_id"):
            await db.expenses.delete_one({"id": inst["expense_id"]})
        await db.fixed_cost_instances.update_one(
            {"id": instance_id},
            {"$set": {
                "status": "pendente",
                "paid_date": None,
                "paid_amount": None,
                "expense_id": None,
            }},
        )
        return await db.fixed_cost_instances.find_one({"id": instance_id}, {"_id": 0})

    @fixed_costs_router.delete("/instances/{instance_id}")
    async def delete_instance(instance_id: str, user=Depends(get_current_user)):
        inst = await db.fixed_cost_instances.find_one({"id": instance_id}, {"_id": 0})
        if not inst:
            raise HTTPException(status_code=404, detail="Instância não encontrada")
        if inst.get("expense_id"):
            await db.expenses.delete_one({"id": inst["expense_id"]})
        await db.fixed_cost_instances.delete_one({"id": instance_id})
        return {"ok": True}

    return fixed_costs_router
