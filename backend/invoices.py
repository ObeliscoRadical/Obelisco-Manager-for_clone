"""
Módulo de Faturação / Cobrança.
Gere faturas emitidas, pagamentos e lembretes manuais (wa.me).
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, date as date_cls
import uuid
import logging

logger = logging.getLogger(__name__)

invoices_router = APIRouter(prefix="/api/invoices", tags=["invoices"])


class PaymentEntry(BaseModel):
    date: str
    amount: float
    method: str = ""
    notes: str = ""


class InvoiceCreate(BaseModel):
    number: str = ""
    issue_date: str                        # YYYY-MM-DD
    due_date: str                          # YYYY-MM-DD
    client_name: str
    client_phone: str = ""
    client_email: str = ""
    client_nif: str = ""
    obra_id: Optional[str] = None
    proposal_id: Optional[str] = None
    value_net: float = 0
    vat_rate: float = 23
    vat_amount: float = 0
    value_total: float                      # required
    notes: str = ""


class InvoiceUpdate(BaseModel):
    number: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    client_nif: Optional[str] = None
    obra_id: Optional[str] = None
    proposal_id: Optional[str] = None
    value_net: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = None
    value_total: Optional[float] = None
    notes: Optional[str] = None


class PaymentInput(BaseModel):
    date: str
    amount: float
    method: str = ""
    notes: str = ""


def _today():
    return date_cls.today().isoformat()


def compute_status(invoice: dict) -> dict:
    """Return invoice with computed status and balance."""
    total = invoice.get("value_total", 0) or 0
    paid = sum(p.get("amount", 0) or 0 for p in invoice.get("payments", []))
    balance = round(total - paid, 2)
    today = _today()
    due = invoice.get("due_date", "")

    if balance <= 0.01:
        status = "paga"
    elif paid > 0:
        status = "parcial" if due >= today else "vencida_parcial"
    else:
        status = "pendente" if due >= today else "vencida"

    # Days overdue
    days_overdue = 0
    if due and due < today and balance > 0.01:
        d1 = date_cls.fromisoformat(due)
        d2 = date_cls.fromisoformat(today)
        days_overdue = (d2 - d1).days

    invoice["amount_paid"] = round(paid, 2)
    invoice["balance"] = balance
    invoice["status"] = status
    invoice["days_overdue"] = days_overdue
    return invoice


def create_invoices_router(db, get_current_user):

    @invoices_router.get("")
    async def list_invoices(
        status: Optional[str] = None,
        year: Optional[int] = None,
        month: Optional[int] = None,
        user=Depends(get_current_user),
    ):
        q = {}
        if year and month:
            q["issue_date"] = {"$regex": f"^{year:04d}-{month:02d}"}
        elif year:
            q["issue_date"] = {"$regex": f"^{year:04d}"}
        items = await db.invoices.find(q, {"_id": 0}).sort("due_date", 1).to_list(2000)
        items = [compute_status(i) for i in items]
        if status:
            items = [i for i in items if i["status"].startswith(status) or (status == "vencida" and i["status"].startswith("vencida"))]
        return items

    @invoices_router.get("/summary")
    async def summary(user=Depends(get_current_user)):
        items = await db.invoices.find({}, {"_id": 0}).to_list(5000)
        items = [compute_status(i) for i in items]
        total_emitido = sum(i.get("value_total", 0) or 0 for i in items)
        total_recebido = sum(i.get("amount_paid", 0) or 0 for i in items)
        total_em_aberto = sum(i.get("balance", 0) or 0 for i in items if i.get("balance", 0) > 0.01)
        total_vencido = sum(i.get("balance", 0) or 0 for i in items if i.get("status", "").startswith("vencida"))
        count_pendentes = sum(1 for i in items if i.get("balance", 0) > 0.01 and not i.get("status", "").startswith("vencida"))
        count_vencidas = sum(1 for i in items if i.get("status", "").startswith("vencida"))
        return {
            "total_emitido": round(total_emitido, 2),
            "total_recebido": round(total_recebido, 2),
            "total_em_aberto": round(total_em_aberto, 2),
            "total_vencido": round(total_vencido, 2),
            "count_total": len(items),
            "count_pendentes": count_pendentes,
            "count_vencidas": count_vencidas,
        }

    @invoices_router.post("")
    async def create_invoice(input: InvoiceCreate, user=Depends(get_current_user)):
        # Auto-number if not provided
        number = input.number
        if not number:
            year = input.issue_date[:4] if input.issue_date else str(datetime.now().year)
            count = await db.invoices.count_documents({"issue_date": {"$regex": f"^{year}"}})
            number = f"FT {year}/{count + 1:04d}"
        doc = {
            **input.model_dump(),
            "id": str(uuid.uuid4()),
            "number": number,
            "payments": [],
            "reminders_sent": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user["id"],
        }
        # Auto-compute vat if missing
        if doc.get("value_net") and not doc.get("vat_amount"):
            doc["vat_amount"] = round(doc["value_net"] * (doc.get("vat_rate", 23) / 100), 2)
        await db.invoices.insert_one(doc)
        doc.pop("_id", None)
        return compute_status(doc)

    @invoices_router.get("/{invoice_id}")
    async def get_invoice(invoice_id: str, user=Depends(get_current_user)):
        i = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not i:
            raise HTTPException(status_code=404, detail="Fatura não encontrada")
        return compute_status(i)

    @invoices_router.put("/{invoice_id}")
    async def update_invoice(invoice_id: str, input: InvoiceUpdate, user=Depends(get_current_user)):
        data = input.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Nada para atualizar")
        r = await db.invoices.update_one({"id": invoice_id}, {"$set": data})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Fatura não encontrada")
        i = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        return compute_status(i)

    @invoices_router.delete("/{invoice_id}")
    async def delete_invoice(invoice_id: str, user=Depends(get_current_user)):
        r = await db.invoices.delete_one({"id": invoice_id})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Fatura não encontrada")
        return {"ok": True}

    @invoices_router.post("/{invoice_id}/payment")
    async def add_payment(invoice_id: str, input: PaymentInput, user=Depends(get_current_user)):
        invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Fatura não encontrada")
        if input.amount <= 0:
            raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
        payment = {
            "id": str(uuid.uuid4()),
            "date": input.date,
            "amount": round(input.amount, 2),
            "method": input.method,
            "notes": input.notes,
            "registered_at": datetime.now(timezone.utc).isoformat(),
            "registered_by": user.get("name", ""),
        }
        payments = invoice.get("payments", []) + [payment]
        await db.invoices.update_one({"id": invoice_id}, {"$set": {"payments": payments}})
        updated = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        return compute_status(updated)

    @invoices_router.delete("/{invoice_id}/payment/{payment_id}")
    async def delete_payment(invoice_id: str, payment_id: str, user=Depends(get_current_user)):
        invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Fatura não encontrada")
        payments = [p for p in invoice.get("payments", []) if p.get("id") != payment_id]
        await db.invoices.update_one({"id": invoice_id}, {"$set": {"payments": payments}})
        updated = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        return compute_status(updated)

    @invoices_router.post("/{invoice_id}/reminder-log")
    async def log_reminder(invoice_id: str, user=Depends(get_current_user)):
        """Register that a reminder was sent (user clicked wa.me button)."""
        invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Fatura não encontrada")
        reminders = invoice.get("reminders_sent", []) + [{
            "date": datetime.now(timezone.utc).isoformat(),
            "sent_by": user.get("name", ""),
            "method": "whatsapp",
        }]
        await db.invoices.update_one({"id": invoice_id}, {"$set": {"reminders_sent": reminders}})
        return {"ok": True, "count": len(reminders)}

    return invoices_router
