"""
Modulo de Salarios (Payroll) - Obelisco Manager
Fase 1: Funcionarios, Assiduidade, Processamento Salarial, Configuracoes
Defaults PT 2026:
  - SS trabalhador: 11%
  - SS patronal: 23.75%
  - Horas extra: 125% (1a hora diurna), 137.5% (restantes), 150% (noturnas/sabado), 200% (dom/feriado)
  - Subsidio alimentacao: 6.00 EUR/dia (cartao, isento IRS/SS)
  - IRS: escaloes simplificados (editaveis)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

payroll_router = APIRouter(prefix="/api/payroll", tags=["payroll"])


# ----- Default PT legal settings -----
DEFAULT_PAYROLL_SETTINGS = {
    "ss_worker_pct": 11.0,        # Trabalhador
    "ss_employer_pct": 23.75,     # Entidade patronal
    "meal_allowance_day": 6.00,   # Cartao refeicao (isento 2026)
    "overtime_first_hour_pct": 125.0,      # 1a hora diurna dia util
    "overtime_extra_hour_pct": 137.5,      # 2a+ hora diurna
    "overtime_night_weekend_pct": 150.0,   # noturna / sabado
    "overtime_holiday_pct": 200.0,         # dom / feriado
    "standard_weekly_hours": 40.0,
    "standard_work_days_month": 22,
    "irs_brackets": [
        # escaloes simplificados - editaveis pelo admin (solteiro sem dependentes)
        {"limit": 870,    "rate": 0.0},
        {"limit": 1200,   "rate": 5.0},
        {"limit": 1800,   "rate": 13.5},
        {"limit": 2500,   "rate": 22.0},
        {"limit": 4000,   "rate": 28.0},
        {"limit": 7000,   "rate": 35.0},
        {"limit": 999999, "rate": 42.0},
    ],
}


# ----- Models -----
class EmployeeCreate(BaseModel):
    name: str
    nif: str = ""
    niss: str = ""
    iban: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    role: str = ""                          # cargo
    category: str = ""                      # categoria profissional
    contract_type: str = "efetivo"          # efetivo, termo certo, termo incerto, prestacao servicos
    admission_date: str = ""
    base_salary: float = 0                  # salario base mensal
    hourly_rate: float = 0                  # valor hora (calculado se 0)
    meal_allowance: float = 6.00            # subsidio alimentacao/dia
    weekly_hours: float = 40.0
    work_days_per_week: int = 5
    payment_frequency: str = "mensal"       # mensal, quinzenal, semanal
    active: bool = True
    has_duodecimos: bool = False
    has_commissions: bool = False
    has_advances: bool = False
    has_fixed_deductions: bool = False
    accident_insurance: str = ""
    notes: str = ""


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    nif: Optional[str] = None
    niss: Optional[str] = None
    iban: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    category: Optional[str] = None
    contract_type: Optional[str] = None
    admission_date: Optional[str] = None
    base_salary: Optional[float] = None
    hourly_rate: Optional[float] = None
    meal_allowance: Optional[float] = None
    weekly_hours: Optional[float] = None
    work_days_per_week: Optional[int] = None
    payment_frequency: Optional[str] = None
    active: Optional[bool] = None
    has_duodecimos: Optional[bool] = None
    has_commissions: Optional[bool] = None
    has_advances: Optional[bool] = None
    has_fixed_deductions: Optional[bool] = None
    accident_insurance: Optional[str] = None
    notes: Optional[str] = None


class AttendanceCreate(BaseModel):
    employee_id: str
    date: str                                 # YYYY-MM-DD
    day_type: str = "normal"                  # normal, sabado, domingo, feriado, falta_j, falta_i, ferias, baixa, formacao, folga, meio_dia
    time_in: str = ""                         # HH:MM
    time_out: str = ""                        # HH:MM
    break_minutes: int = 0
    normal_hours: float = 0
    overtime_hours: float = 0
    night_hours: float = 0
    worksite: str = ""                        # obra associada
    notes: str = ""


class AttendanceUpdate(BaseModel):
    day_type: Optional[str] = None
    time_in: Optional[str] = None
    time_out: Optional[str] = None
    break_minutes: Optional[int] = None
    normal_hours: Optional[float] = None
    overtime_hours: Optional[float] = None
    night_hours: Optional[float] = None
    worksite: Optional[str] = None
    notes: Optional[str] = None


class PayrollRunCreate(BaseModel):
    month: int        # 1-12
    year: int


class PayrollItemUpdate(BaseModel):
    premio: Optional[float] = None
    comissao: Optional[float] = None
    ajuda_custo: Optional[float] = None
    adiantamento: Optional[float] = None
    desconto_manual: Optional[float] = None
    desconto_irs: Optional[float] = None
    outros_descontos: Optional[float] = None
    observacoes: Optional[str] = None


class PayrollPaymentInput(BaseModel):
    date: str
    amount: float
    method: str = "Transferência"
    notes: str = ""


class PayrollPaymentUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[float] = None
    method: Optional[str] = None
    notes: Optional[str] = None


class PayrollSettingsUpdate(BaseModel):
    ss_worker_pct: Optional[float] = None
    ss_employer_pct: Optional[float] = None
    meal_allowance_day: Optional[float] = None
    overtime_first_hour_pct: Optional[float] = None
    overtime_extra_hour_pct: Optional[float] = None
    overtime_night_weekend_pct: Optional[float] = None
    overtime_holiday_pct: Optional[float] = None
    standard_weekly_hours: Optional[float] = None
    standard_work_days_month: Optional[int] = None
    irs_brackets: Optional[List[dict]] = None


# ----- Helpers -----
def _hourly_rate(employee, settings):
    if employee.get("hourly_rate") and employee["hourly_rate"] > 0:
        return employee["hourly_rate"]
    weekly = employee.get("weekly_hours") or settings.get("standard_weekly_hours", 40)
    base = employee.get("base_salary", 0)
    if weekly <= 0:
        return 0
    return base / (weekly * 52 / 12)


def _irs_rate(monthly_gross, brackets):
    """Aplica escalao IRS progressivo - retorna percentagem a aplicar sobre ilіquido"""
    for b in brackets:
        if monthly_gross <= b.get("limit", 0):
            return b.get("rate", 0)
    return brackets[-1].get("rate", 0) if brackets else 0


def calculate_payroll_item(employee, attendance_records, settings):
    """Calcula o item de payroll para 1 funcionario num mes"""
    base = employee.get("base_salary", 0)
    hr = _hourly_rate(employee, settings)
    ma_day = employee.get("meal_allowance", settings.get("meal_allowance_day", 6.00))

    dias_trabalhados = 0
    dias_ferias = 0
    faltas_j = 0
    faltas_i = 0
    horas_normais = 0.0
    horas_extra_1 = 0.0     # 125%
    horas_extra_2 = 0.0     # 137.5%
    horas_extra_fds = 0.0   # 150% noturnas/sabado
    horas_extra_dom = 0.0   # 200% domingo/feriado
    dias_com_sa = 0         # dias elegiveis subsidio alimentacao

    for a in attendance_records:
        dtype = a.get("day_type", "normal")
        if dtype == "normal":
            dias_trabalhados += 1
            dias_com_sa += 1
            horas_normais += a.get("normal_hours", 0)
            ot = a.get("overtime_hours", 0)
            if ot > 0:
                # primeira hora 125%, restante 137.5%
                horas_extra_1 += min(1, ot)
                if ot > 1:
                    horas_extra_2 += ot - 1
        elif dtype == "sabado":
            dias_trabalhados += 1
            dias_com_sa += 1
            horas_normais += a.get("normal_hours", 0)
            horas_extra_fds += a.get("overtime_hours", 0)
        elif dtype == "domingo" or dtype == "feriado":
            dias_trabalhados += 1
            dias_com_sa += 1
            horas_extra_dom += a.get("normal_hours", 0) + a.get("overtime_hours", 0)
        elif dtype == "meio_dia":
            dias_trabalhados += 0.5
            dias_com_sa += 1
            horas_normais += a.get("normal_hours", 0)
        elif dtype == "ferias":
            dias_ferias += 1
        elif dtype == "falta_j":
            faltas_j += 1
        elif dtype == "falta_i":
            faltas_i += 1
        # baixa, formacao, folga: sem impacto direto

    # Valor horas normais: ja incluidas no salario base (nao somar separado se mensalizado)
    # Mas se o salario base for 0 e for "a hora", somar
    salary_component = base
    if base == 0 and horas_normais > 0:
        salary_component = horas_normais * hr

    # Desconto por falta injustificada: valor_dia * nr
    work_days = settings.get("standard_work_days_month", 22)
    valor_dia = base / 30 if base else 0  # usar /30 convencao PT
    desconto_faltas = valor_dia * faltas_i

    # Horas extras
    he1_val = horas_extra_1 * hr * (settings.get("overtime_first_hour_pct", 125) / 100)
    he2_val = horas_extra_2 * hr * (settings.get("overtime_extra_hour_pct", 137.5) / 100)
    he_fds_val = horas_extra_fds * hr * (settings.get("overtime_night_weekend_pct", 150) / 100)
    he_dom_val = horas_extra_dom * hr * (settings.get("overtime_holiday_pct", 200) / 100)
    total_he = he1_val + he2_val + he_fds_val + he_dom_val

    # Subsidio alimentacao
    total_sa = dias_com_sa * ma_day

    return {
        "salario_base": round(salary_component, 2),
        "dias_trabalhados": dias_trabalhados,
        "dias_ferias": dias_ferias,
        "faltas_justificadas": faltas_j,
        "faltas_injustificadas": faltas_i,
        "horas_normais": round(horas_normais, 2),
        "horas_extra_1": round(horas_extra_1, 2),
        "horas_extra_2": round(horas_extra_2, 2),
        "horas_extra_fds": round(horas_extra_fds, 2),
        "horas_extra_dom": round(horas_extra_dom, 2),
        "valor_hora": round(hr, 2),
        "valor_horas_extra_1": round(he1_val, 2),
        "valor_horas_extra_2": round(he2_val, 2),
        "valor_horas_extra_fds": round(he_fds_val, 2),
        "valor_horas_extra_dom": round(he_dom_val, 2),
        "total_horas_extra": round(total_he, 2),
        "subsidio_alimentacao": round(total_sa, 2),
        "desconto_faltas": round(desconto_faltas, 2),
    }


def finalize_payroll_item(item, employee, settings, extras=None):
    """Aplica premios, descontos SS/IRS e calcula liquido"""
    extras = extras or {}
    premio = extras.get("premio", 0) or 0
    comissao = extras.get("comissao", 0) or 0
    ajuda = extras.get("ajuda_custo", 0) or 0
    adiantamento = extras.get("adiantamento", 0) or 0
    desconto_manual = extras.get("desconto_manual", 0) or 0
    outros = extras.get("outros_descontos", 0) or 0

    # Iliquido tributavel (subsidio alimentacao em cartao e isento)
    base_tributavel = (
        item["salario_base"]
        + item["total_horas_extra"]
        + premio
        + comissao
        - item["desconto_faltas"]
    )
    # Ajudas de custo ate limite legal sao isentas; acima tributam - simplificamos como isentas
    iliquido = base_tributavel + item["subsidio_alimentacao"] + ajuda

    # SS trabalhador
    ss_worker = base_tributavel * (settings.get("ss_worker_pct", 11) / 100)
    # SS patronal (custo empresa, NAO descontado ao trabalhador)
    ss_employer = base_tributavel * (settings.get("ss_employer_pct", 23.75) / 100)
    # IRS (retencao na fonte, aplicado sobre base tributavel mensal)
    irs_rate = extras.get("desconto_irs")
    if irs_rate is None:
        irs_rate = _irs_rate(base_tributavel, settings.get("irs_brackets", []))
    irs_val = base_tributavel * (irs_rate / 100)

    total_descontos = ss_worker + irs_val + adiantamento + desconto_manual + outros
    liquido = iliquido - total_descontos

    # Custo total empresa
    custo_empresa = iliquido + ss_employer

    return {
        **item,
        "premio": round(premio, 2),
        "comissao": round(comissao, 2),
        "ajuda_custo": round(ajuda, 2),
        "adiantamento": round(adiantamento, 2),
        "desconto_manual": round(desconto_manual, 2),
        "outros_descontos": round(outros, 2),
        "base_tributavel": round(base_tributavel, 2),
        "total_iliquido": round(iliquido, 2),
        "desconto_ss": round(ss_worker, 2),
        "ss_patronal": round(ss_employer, 2),
        "irs_rate": round(irs_rate, 2),
        "desconto_irs": round(irs_val, 2),
        "total_descontos": round(total_descontos, 2),
        "total_liquido": round(liquido, 2),
        "custo_total_empresa": round(custo_empresa, 2),
    }


# ===== FACTORY - needs db and get_current_user injected =====
def create_payroll_router(db, get_current_user):
    """Cria o router com as dependencias injetadas"""

    # ----- Settings -----
    @payroll_router.get("/settings")
    async def get_settings(user=Depends(get_current_user)):
        s = await db.payroll_settings.find_one({}, {"_id": 0})
        if not s:
            return DEFAULT_PAYROLL_SETTINGS
        # Merge with defaults in case new fields added
        return {**DEFAULT_PAYROLL_SETTINGS, **s}

    @payroll_router.put("/settings")
    async def update_settings(input: PayrollSettingsUpdate, user=Depends(get_current_user)):
        data = input.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Nada para atualizar")
        await db.payroll_settings.update_one({}, {"$set": data}, upsert=True)
        s = await db.payroll_settings.find_one({}, {"_id": 0})
        return {**DEFAULT_PAYROLL_SETTINGS, **(s or {})}

    # ----- Employees -----
    @payroll_router.get("/employees")
    async def list_employees(user=Depends(get_current_user)):
        emps = await db.employees.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
        return emps

    @payroll_router.post("/employees")
    async def create_employee(input: EmployeeCreate, user=Depends(get_current_user)):
        doc = {**input.model_dump(), "id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat()}
        await db.employees.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @payroll_router.get("/employees/{emp_id}")
    async def get_employee(emp_id: str, user=Depends(get_current_user)):
        e = await db.employees.find_one({"id": emp_id}, {"_id": 0})
        if not e:
            raise HTTPException(status_code=404, detail="Funcionário não encontrado")
        return e

    @payroll_router.put("/employees/{emp_id}")
    async def update_employee(emp_id: str, input: EmployeeUpdate, user=Depends(get_current_user)):
        data = input.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Nada para atualizar")
        r = await db.employees.update_one({"id": emp_id}, {"$set": data})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Funcionário não encontrado")
        e = await db.employees.find_one({"id": emp_id}, {"_id": 0})
        return e

    @payroll_router.delete("/employees/{emp_id}")
    async def delete_employee(emp_id: str, user=Depends(get_current_user)):
        r = await db.employees.delete_one({"id": emp_id})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Funcionário não encontrado")
        return {"ok": True}

    # ----- Attendance -----
    @payroll_router.get("/attendance")
    async def list_attendance(employee_id: Optional[str] = None, month: Optional[int] = None, year: Optional[int] = None, user=Depends(get_current_user)):
        q = {}
        if employee_id:
            q["employee_id"] = employee_id
        if year and month:
            prefix = f"{year:04d}-{month:02d}"
            q["date"] = {"$regex": f"^{prefix}"}
        recs = await db.attendance.find(q, {"_id": 0}).sort("date", 1).to_list(5000)
        return recs

    @payroll_router.post("/attendance")
    async def create_attendance(input: AttendanceCreate, user=Depends(get_current_user)):
        existing = await db.attendance.find_one({"employee_id": input.employee_id, "date": input.date})
        if existing:
            raise HTTPException(status_code=400, detail="Já existe registo deste funcionario para esta data")
        doc = {**input.model_dump(), "id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat()}
        await db.attendance.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @payroll_router.put("/attendance/{att_id}")
    async def update_attendance(att_id: str, input: AttendanceUpdate, user=Depends(get_current_user)):
        data = input.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Nada para atualizar")
        r = await db.attendance.update_one({"id": att_id}, {"$set": data})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Registo não encontrado")
        rec = await db.attendance.find_one({"id": att_id}, {"_id": 0})
        return rec

    @payroll_router.delete("/attendance/{att_id}")
    async def delete_attendance(att_id: str, user=Depends(get_current_user)):
        r = await db.attendance.delete_one({"id": att_id})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Registo não encontrado")
        return {"ok": True}

    # ----- Payroll Run -----
    @payroll_router.get("/runs")
    async def list_runs(user=Depends(get_current_user)):
        runs = await db.payroll_runs.find({}, {"_id": 0}).sort([("year", -1), ("month", -1)]).to_list(200)
        return runs

    @payroll_router.post("/runs")
    async def create_run(input: PayrollRunCreate, user=Depends(get_current_user)):
        existing = await db.payroll_runs.find_one({"month": input.month, "year": input.year})
        if existing:
            raise HTTPException(status_code=400, detail=f"Processamento de {input.month}/{input.year} já existe")

        settings = await db.payroll_settings.find_one({}, {"_id": 0}) or {}
        settings = {**DEFAULT_PAYROLL_SETTINGS, **settings}

        employees = await db.employees.find({"active": True}, {"_id": 0}).to_list(1000)

        run_id = str(uuid.uuid4())
        items = []
        total_iliquido = 0
        total_liquido = 0
        total_custo = 0

        for emp in employees:
            prefix = f"{input.year:04d}-{input.month:02d}"
            att = await db.attendance.find({
                "employee_id": emp["id"],
                "date": {"$regex": f"^{prefix}"}
            }, {"_id": 0}).to_list(100)

            base_item = calculate_payroll_item(emp, att, settings)
            final_item = finalize_payroll_item(base_item, emp, settings)

            item_doc = {
                "id": str(uuid.uuid4()),
                "payroll_run_id": run_id,
                "employee_id": emp["id"],
                "employee_name": emp.get("name", ""),
                "employee_nif": emp.get("nif", ""),
                "month": input.month,
                "year": input.year,
                "payment_frequency": emp.get("payment_frequency", "mensal"),
                "payments": [],
                **final_item,
                "status": "rascunho",
            }
            await db.payroll_items.insert_one(item_doc)
            item_doc.pop("_id", None)
            items.append(item_doc)
            total_iliquido += final_item["total_iliquido"]
            total_liquido += final_item["total_liquido"]
            total_custo += final_item["custo_total_empresa"]

        run_doc = {
            "id": run_id,
            "month": input.month,
            "year": input.year,
            "status": "rascunho",
            "employees_count": len(employees),
            "total_iliquido": round(total_iliquido, 2),
            "total_liquido": round(total_liquido, 2),
            "total_custo_empresa": round(total_custo, 2),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "closed_at": None,
        }
        await db.payroll_runs.insert_one(run_doc)
        run_doc.pop("_id", None)
        return {"run": run_doc, "items": items}

    @payroll_router.get("/runs/{run_id}")
    async def get_run(run_id: str, user=Depends(get_current_user)):
        run = await db.payroll_runs.find_one({"id": run_id}, {"_id": 0})
        if not run:
            raise HTTPException(status_code=404, detail="Processamento não encontrado")
        items = await db.payroll_items.find({"payroll_run_id": run_id}, {"_id": 0}).sort("employee_name", 1).to_list(500)
        return {"run": run, "items": items}

    @payroll_router.put("/runs/{run_id}/items/{item_id}")
    async def update_payroll_item(run_id: str, item_id: str, input: PayrollItemUpdate, user=Depends(get_current_user)):
        run = await db.payroll_runs.find_one({"id": run_id}, {"_id": 0})
        if not run:
            raise HTTPException(status_code=404, detail="Processamento não encontrado")
        if run.get("status") == "fechado":
            raise HTTPException(status_code=400, detail="Processamento fechado - não pode editar")

        item = await db.payroll_items.find_one({"id": item_id, "payroll_run_id": run_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Item não encontrado")

        emp = await db.employees.find_one({"id": item["employee_id"]}, {"_id": 0})
        settings = await db.payroll_settings.find_one({}, {"_id": 0}) or {}
        settings = {**DEFAULT_PAYROLL_SETTINGS, **settings}

        # Pegar extras (merge do ja guardado + novo)
        extras = {
            "premio": item.get("premio", 0),
            "comissao": item.get("comissao", 0),
            "ajuda_custo": item.get("ajuda_custo", 0),
            "adiantamento": item.get("adiantamento", 0),
            "desconto_manual": item.get("desconto_manual", 0),
            "outros_descontos": item.get("outros_descontos", 0),
        }
        update_data = input.model_dump(exclude_none=True)
        for k in extras:
            if k in update_data:
                extras[k] = update_data[k]

        # Reconstruir base sem extras nem descontos derivados
        base_item = {
            "salario_base": item["salario_base"],
            "dias_trabalhados": item["dias_trabalhados"],
            "dias_ferias": item["dias_ferias"],
            "faltas_justificadas": item["faltas_justificadas"],
            "faltas_injustificadas": item["faltas_injustificadas"],
            "horas_normais": item["horas_normais"],
            "horas_extra_1": item["horas_extra_1"],
            "horas_extra_2": item["horas_extra_2"],
            "horas_extra_fds": item["horas_extra_fds"],
            "horas_extra_dom": item["horas_extra_dom"],
            "valor_hora": item["valor_hora"],
            "valor_horas_extra_1": item["valor_horas_extra_1"],
            "valor_horas_extra_2": item["valor_horas_extra_2"],
            "valor_horas_extra_fds": item["valor_horas_extra_fds"],
            "valor_horas_extra_dom": item["valor_horas_extra_dom"],
            "total_horas_extra": item["total_horas_extra"],
            "subsidio_alimentacao": item["subsidio_alimentacao"],
            "desconto_faltas": item["desconto_faltas"],
        }
        irs_override = update_data.get("desconto_irs") if "desconto_irs" in update_data else None
        extras_calc = dict(extras)
        if irs_override is not None:
            extras_calc["desconto_irs"] = irs_override
        final = finalize_payroll_item(base_item, emp or {}, settings, extras_calc)

        set_data = {
            **final,
            "observacoes": update_data.get("observacoes", item.get("observacoes", "")),
        }
        await db.payroll_items.update_one({"id": item_id}, {"$set": set_data})

        # Recalcular totais do run
        all_items = await db.payroll_items.find({"payroll_run_id": run_id}, {"_id": 0}).to_list(500)
        t_il = sum(i.get("total_iliquido", 0) for i in all_items)
        t_liq = sum(i.get("total_liquido", 0) for i in all_items)
        t_cst = sum(i.get("custo_total_empresa", 0) for i in all_items)
        await db.payroll_runs.update_one({"id": run_id}, {"$set": {
            "total_iliquido": round(t_il, 2),
            "total_liquido": round(t_liq, 2),
            "total_custo_empresa": round(t_cst, 2),
        }})

        updated = await db.payroll_items.find_one({"id": item_id}, {"_id": 0})
        return updated

    @payroll_router.post("/runs/{run_id}/close")
    async def close_run(run_id: str, user=Depends(get_current_user)):
        run = await db.payroll_runs.find_one({"id": run_id}, {"_id": 0})
        if not run:
            raise HTTPException(status_code=404, detail="Processamento não encontrado")
        if run.get("status") == "fechado":
            raise HTTPException(status_code=400, detail="Já está fechado")
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.payroll_runs.update_one({"id": run_id}, {"$set": {"status": "fechado", "closed_at": now_iso}})
        await db.payroll_items.update_many({"payroll_run_id": run_id}, {"$set": {"status": "fechado"}})
        return {"ok": True, "closed_at": now_iso}

    @payroll_router.post("/runs/{run_id}/reopen")
    async def reopen_run(run_id: str, user=Depends(get_current_user)):
        run = await db.payroll_runs.find_one({"id": run_id}, {"_id": 0})
        if not run:
            raise HTTPException(status_code=404, detail="Processamento não encontrado")
        await db.payroll_runs.update_one({"id": run_id}, {"$set": {"status": "rascunho", "closed_at": None}})
        await db.payroll_items.update_many({"payroll_run_id": run_id}, {"$set": {"status": "rascunho"}})
        return {"ok": True}

    @payroll_router.delete("/runs/{run_id}")
    async def delete_run(run_id: str, user=Depends(get_current_user)):
        run = await db.payroll_runs.find_one({"id": run_id}, {"_id": 0})
        if not run:
            raise HTTPException(status_code=404, detail="Processamento não encontrado")
        if run.get("status") == "fechado":
            raise HTTPException(status_code=400, detail="Não pode eliminar processamento fechado. Reabra primeiro.")
        await db.payroll_items.delete_many({"payroll_run_id": run_id})
        await db.payroll_runs.delete_one({"id": run_id})
        return {"ok": True}

    # ----- Dashboard summary -----
    @payroll_router.get("/summary")
    async def summary(user=Depends(get_current_user)):
        total_employees = await db.employees.count_documents({"active": True})
        # Find current month processamento
        now = datetime.now(timezone.utc)
        current_run = await db.payroll_runs.find_one({"month": now.month, "year": now.year}, {"_id": 0})
        # Latest 6 runs
        recent_runs = await db.payroll_runs.find({}, {"_id": 0}).sort([("year", -1), ("month", -1)]).to_list(6)
        # Attendance this month
        prefix = f"{now.year:04d}-{now.month:02d}"
        att_count = await db.attendance.count_documents({"date": {"$regex": f"^{prefix}"}})
        ot_att = await db.attendance.find({"date": {"$regex": f"^{prefix}"}}, {"_id": 0, "overtime_hours": 1}).to_list(2000)
        total_ot = sum(a.get("overtime_hours", 0) or 0 for a in ot_att)
        faltas_att = await db.attendance.count_documents({"date": {"$regex": f"^{prefix}"}, "day_type": "falta_i"})
        return {
            "active_employees": total_employees,
            "current_run": current_run,
            "recent_runs": recent_runs,
            "attendance_count_month": att_count,
            "total_overtime_month": round(total_ot, 2),
            "faltas_injustificadas_month": faltas_att,
        }

    # ----- Item Payments (plano semanal/quinzenal/mensal) -----
    def _build_payment_plan(item: dict) -> List[dict]:
        """Generate suggested payment plan based on payment_frequency.
        Returns list of {date, amount, label} with NO id (these are suggestions)."""
        from datetime import date as _date_cls, timedelta as _timedelta
        freq = (item.get("payment_frequency") or "mensal").lower()
        total = float(item.get("total_liquido", 0) or 0)
        year = int(item.get("year"))
        month = int(item.get("month"))

        # Last day of month
        if month == 12:
            last_day = _date_cls(year + 1, 1, 1) - _timedelta(days=1)
        else:
            last_day = _date_cls(year, month + 1, 1) - _timedelta(days=1)

        if freq == "semanal":
            # Find every Friday inside the month; if last week ends after last_day, include too
            d = _date_cls(year, month, 1)
            fridays = []
            while d.month == month:
                if d.weekday() == 4:    # 4 = Friday
                    fridays.append(d)
                d += _timedelta(days=1)
            if not fridays:
                fridays = [last_day]
            n = len(fridays)
            slice_amt = round(total / n, 2)
            plan = []
            paid_so_far = 0.0
            for i, fri in enumerate(fridays):
                if i == n - 1:
                    amt = round(total - paid_so_far, 2)        # acerto na última semana
                else:
                    amt = slice_amt
                    paid_so_far += amt
                plan.append({
                    "date": fri.isoformat(),
                    "amount": amt,
                    "label": f"Semana {i + 1}/{n}",
                })
            return plan

        if freq == "quinzenal":
            day15 = _date_cls(year, month, 15)
            half = round(total / 2, 2)
            return [
                {"date": day15.isoformat(), "amount": half, "label": "1ª quinzena"},
                {"date": last_day.isoformat(), "amount": round(total - half, 2), "label": "2ª quinzena"},
            ]

        # mensal (default)
        return [{"date": last_day.isoformat(), "amount": total, "label": "Mensal"}]

    @payroll_router.get("/items/{item_id}")
    async def get_item(item_id: str, user=Depends(get_current_user)):
        item = await db.payroll_items.find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Item não encontrado")
        return item

    @payroll_router.get("/items/{item_id}/plan")
    async def get_payment_plan(item_id: str, user=Depends(get_current_user)):
        item = await db.payroll_items.find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Item não encontrado")
        plan = _build_payment_plan(item)
        payments = item.get("payments", [])
        amount_paid = round(sum(float(p.get("amount", 0) or 0) for p in payments), 2)
        balance = round(float(item.get("total_liquido", 0) or 0) - amount_paid, 2)
        return {
            "payment_frequency": item.get("payment_frequency", "mensal"),
            "total_liquido": item.get("total_liquido", 0),
            "amount_paid": amount_paid,
            "balance": balance,
            "plan": plan,
            "payments": payments,
        }

    @payroll_router.post("/items/{item_id}/payment")
    async def add_item_payment(item_id: str, input: PayrollPaymentInput, user=Depends(get_current_user)):
        item = await db.payroll_items.find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Item não encontrado")
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
        await db.payroll_items.update_one({"id": item_id}, {"$push": {"payments": payment}})
        return await db.payroll_items.find_one({"id": item_id}, {"_id": 0})

    @payroll_router.put("/items/{item_id}/payment/{payment_id}")
    async def update_item_payment(item_id: str, payment_id: str, input: PayrollPaymentUpdate, user=Depends(get_current_user)):
        item = await db.payroll_items.find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Item não encontrado")
        payments = item.get("payments", [])
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
        await db.payroll_items.update_one({"id": item_id}, {"$set": {"payments": payments}})
        return await db.payroll_items.find_one({"id": item_id}, {"_id": 0})

    @payroll_router.delete("/items/{item_id}/payment/{payment_id}")
    async def delete_item_payment(item_id: str, payment_id: str, user=Depends(get_current_user)):
        item = await db.payroll_items.find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Item não encontrado")
        payments = [p for p in item.get("payments", []) if p.get("id") != payment_id]
        await db.payroll_items.update_one({"id": item_id}, {"$set": {"payments": payments}})
        return await db.payroll_items.find_one({"id": item_id}, {"_id": 0})

    return payroll_router
