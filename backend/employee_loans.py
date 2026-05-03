"""Módulo de Créditos a Funcionários (empréstimos com pagamentos parcelares)."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


loans_router = APIRouter(prefix="/api/payroll/loans", tags=["employee-loans"])


class LoanCreate(BaseModel):
    employee_id: str
    issue_date: str                    # YYYY-MM-DD
    amount: float                      # valor emprestado
    instalments: int = 1               # número de parcelas
    instalment_amount: Optional[float] = None  # se vazio, calcula amount/instalments
    method: str = "Transferência"
    purpose: str = ""                  # finalidade
    notes: str = ""


class LoanUpdate(BaseModel):
    issue_date: Optional[str] = None
    amount: Optional[float] = None
    instalments: Optional[int] = None
    instalment_amount: Optional[float] = None
    method: Optional[str] = None
    purpose: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None       # ativo | quitado


class LoanPaymentInput(BaseModel):
    date: str
    amount: float
    method: str = "Desconto Salário"   # ou Transferência, Numerário, etc
    notes: str = ""


class LoanPaymentUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[float] = None
    method: Optional[str] = None
    notes: Optional[str] = None


def _annotate(loan: dict) -> dict:
    """Compute amount_paid, balance, instalments_paid, next_due_amount."""
    payments = loan.get("payments", [])
    paid = round(sum(float(p.get("amount", 0) or 0) for p in payments), 2)
    total = float(loan.get("amount", 0) or 0)
    balance = round(total - paid, 2)
    inst_amt = float(loan.get("instalment_amount") or 0) or (round(total / max(loan.get("instalments", 1), 1), 2))
    instalments_paid = int(paid // inst_amt) if inst_amt > 0 else 0
    auto_status = "quitado" if balance <= 0.01 else "ativo"
    return {
        **loan,
        "amount_paid": paid,
        "balance": balance,
        "instalment_amount": inst_amt,
        "instalments_paid": instalments_paid,
        "status": loan.get("status") or auto_status,
        "auto_status": auto_status,
    }


def create_loans_router(db, get_current_user):

    @loans_router.get("")
    async def list_loans(
        employee_id: Optional[str] = None,
        status: Optional[str] = None,
        user=Depends(get_current_user),
    ):
        q = {}
        if employee_id:
            q["employee_id"] = employee_id
        loans = await db.employee_loans.find(q, {"_id": 0}).sort("issue_date", -1).to_list(2000)
        loans = [_annotate(ln) for ln in loans]
        if status:
            loans = [ln for ln in loans if ln["status"] == status]
        return loans

    @loans_router.get("/summary")
    async def summary(user=Depends(get_current_user)):
        loans = await db.employee_loans.find({}, {"_id": 0}).to_list(5000)
        loans = [_annotate(ln) for ln in loans]
        total_emprestado = round(sum(ln["amount"] for ln in loans), 2)
        total_pago = round(sum(ln["amount_paid"] for ln in loans), 2)
        total_aberto = round(sum(ln["balance"] for ln in loans if ln["balance"] > 0.01), 2)
        ativos = [ln for ln in loans if ln["status"] == "ativo"]
        # Por funcionário (apenas activos)
        by_employee = {}
        for ln in ativos:
            key = ln.get("employee_id")
            if key not in by_employee:
                by_employee[key] = {
                    "employee_id": key,
                    "employee_name": ln.get("employee_name", ""),
                    "total_amount": 0,
                    "total_balance": 0,
                    "loan_count": 0,
                }
            by_employee[key]["total_amount"] = round(by_employee[key]["total_amount"] + ln["amount"], 2)
            by_employee[key]["total_balance"] = round(by_employee[key]["total_balance"] + ln["balance"], 2)
            by_employee[key]["loan_count"] += 1
        return {
            "total_emprestado": total_emprestado,
            "total_pago": total_pago,
            "total_aberto": total_aberto,
            "count_total": len(loans),
            "count_ativos": len(ativos),
            "count_quitados": len(loans) - len(ativos),
            "by_employee": sorted(by_employee.values(), key=lambda x: -x["total_balance"]),
        }

    @loans_router.get("/{loan_id}")
    async def get_loan(loan_id: str, user=Depends(get_current_user)):
        loan = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        if not loan:
            raise HTTPException(status_code=404, detail="Crédito não encontrado")
        return _annotate(loan)

    @loans_router.post("")
    async def create_loan(input: LoanCreate, user=Depends(get_current_user)):
        emp = await db.employees.find_one({"id": input.employee_id}, {"_id": 0})
        if not emp:
            raise HTTPException(status_code=404, detail="Funcionário não encontrado")
        if input.amount <= 0:
            raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
        if input.instalments <= 0:
            raise HTTPException(status_code=400, detail="Número de parcelas inválido")
        inst_amt = round(float(input.instalment_amount), 2) if input.instalment_amount else round(input.amount / input.instalments, 2)
        loan = {
            "id": str(uuid.uuid4()),
            "employee_id": input.employee_id,
            "employee_name": emp.get("name", ""),
            "issue_date": input.issue_date,
            "amount": round(float(input.amount), 2),
            "instalments": int(input.instalments),
            "instalment_amount": inst_amt,
            "method": input.method,
            "purpose": input.purpose,
            "notes": input.notes,
            "status": "ativo",
            "payments": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("name", ""),
        }
        await db.employee_loans.insert_one(loan)
        loan.pop("_id", None)
        return _annotate(loan)

    @loans_router.put("/{loan_id}")
    async def update_loan(loan_id: str, input: LoanUpdate, user=Depends(get_current_user)):
        loan = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        if not loan:
            raise HTTPException(status_code=404, detail="Crédito não encontrado")
        data = input.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Nada para atualizar")
        # Recalc instalment_amount if amount/instalments mudaram e não foi explicitamente passado
        if ("amount" in data or "instalments" in data) and "instalment_amount" not in data:
            new_amount = data.get("amount", loan.get("amount", 0))
            new_inst = data.get("instalments", loan.get("instalments", 1))
            if new_inst > 0:
                data["instalment_amount"] = round(float(new_amount) / int(new_inst), 2)
        await db.employee_loans.update_one({"id": loan_id}, {"$set": data})
        updated = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        return _annotate(updated)

    @loans_router.delete("/{loan_id}")
    async def delete_loan(loan_id: str, user=Depends(get_current_user)):
        r = await db.employee_loans.delete_one({"id": loan_id})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Crédito não encontrado")
        return {"ok": True}

    @loans_router.post("/{loan_id}/payment")
    async def add_payment(loan_id: str, input: LoanPaymentInput, user=Depends(get_current_user)):
        loan = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        if not loan:
            raise HTTPException(status_code=404, detail="Crédito não encontrado")
        if input.amount <= 0:
            raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
        payment = {
            "id": str(uuid.uuid4()),
            "date": input.date,
            "amount": round(float(input.amount), 2),
            "method": input.method,
            "notes": input.notes,
            "registered_at": datetime.now(timezone.utc).isoformat(),
            "registered_by": user.get("name", ""),
        }
        await db.employee_loans.update_one({"id": loan_id}, {"$push": {"payments": payment}})
        # Auto-quitar se saldo zerar
        updated = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        annotated = _annotate(updated)
        if annotated["balance"] <= 0.01 and annotated.get("status") != "quitado":
            await db.employee_loans.update_one({"id": loan_id}, {"$set": {"status": "quitado", "closed_at": datetime.now(timezone.utc).isoformat()}})
            updated = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        return _annotate(updated)

    @loans_router.put("/{loan_id}/payment/{payment_id}")
    async def update_payment(loan_id: str, payment_id: str, input: LoanPaymentUpdate, user=Depends(get_current_user)):
        loan = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        if not loan:
            raise HTTPException(status_code=404, detail="Crédito não encontrado")
        payments = loan.get("payments", [])
        idx = next((k for k, p in enumerate(payments) if p.get("id") == payment_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Pagamento não encontrado")
        data = input.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Nada para atualizar")
        if "amount" in data:
            if data["amount"] <= 0:
                raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
            data["amount"] = round(float(data["amount"]), 2)
        payments[idx] = {
            **payments[idx],
            **data,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.get("name", ""),
        }
        await db.employee_loans.update_one({"id": loan_id}, {"$set": {"payments": payments}})
        updated = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        return _annotate(updated)

    @loans_router.delete("/{loan_id}/payment/{payment_id}")
    async def delete_payment(loan_id: str, payment_id: str, user=Depends(get_current_user)):
        loan = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        if not loan:
            raise HTTPException(status_code=404, detail="Crédito não encontrado")
        payments = [p for p in loan.get("payments", []) if p.get("id") != payment_id]
        await db.employee_loans.update_one({"id": loan_id}, {"$set": {"payments": payments}})
        # Se já estava quitado mas agora ficou em aberto, reabrir
        updated = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        annotated = _annotate(updated)
        if annotated["balance"] > 0.01 and updated.get("status") == "quitado":
            await db.employee_loans.update_one({"id": loan_id}, {"$set": {"status": "ativo", "closed_at": None}})
            updated = await db.employee_loans.find_one({"id": loan_id}, {"_id": 0})
        return _annotate(updated)

    return loans_router
