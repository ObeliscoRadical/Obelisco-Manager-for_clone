from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import List, Optional

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# App
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# JWT Config
JWT_ALGORITHM = "HS256"

def get_jwt_secret():
    return os.environ["JWT_SECRET"]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Nao autenticado")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token invalido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utilizador nao encontrado")
        return {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user.get("role", "user")
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalido")
    except Exception:
        raise HTTPException(status_code=401, detail="Erro de autenticacao")


# --- Models ---

class LoginInput(BaseModel):
    email: str
    password: str

class BudgetItemModel(BaseModel):
    category: str = ""
    name: str = ""
    unit: str = ""
    quantity: float = 1
    unit_cost: float = 0
    margin: float = 0.6
    discount_type: str = "percentage"  # "percentage" or "value"
    discount_value: float = 0

class BudgetCreate(BaseModel):
    title: str
    client_name: str
    client_phone: str = ""
    items: List[BudgetItemModel] = []
    discount_type: str = "percentage"  # "percentage" or "value"
    discount_value: float = 0
    payment_methods: List[str] = []
    payment_split: str = ""
    payment_notes: str = ""

class BudgetUpdate(BaseModel):
    title: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    items: Optional[List[BudgetItemModel]] = None
    status: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    payment_methods: Optional[List[str]] = None
    payment_split: Optional[str] = None
    payment_notes: Optional[str] = None

class StatusUpdate(BaseModel):
    status: str

class WorkCreate(BaseModel):
    title: str
    client_name: str
    client_phone: str = ""
    budget_id: str = ""
    proposal_id: str = ""
    status: str = "orcamento"
    predicted_cost: float = 0
    real_cost: float = 0
    notes: str = ""
    start_date: str = ""
    end_date: str = ""

class WorkUpdate(BaseModel):
    title: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    status: Optional[str] = None
    predicted_cost: Optional[float] = None
    real_cost: Optional[float] = None
    notes: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class AppointmentCreate(BaseModel):
    title: str
    client_name: str = ""
    date: str
    time_start: str
    time_end: str
    notes: str = ""


# --- Auth Endpoints ---

@api_router.post("/auth/login")
async def login(input: LoginInput, response: Response):
    email = input.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou password incorretos")

    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)

    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

    return {"id": user_id, "email": user["email"], "name": user["name"], "role": user.get("role", "user")}

@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return user

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logout com sucesso"}

@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Sem refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token invalido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utilizador nao encontrado")
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["email"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
        return {"id": user_id, "email": user["email"], "name": user["name"], "role": user.get("role", "user")}
    except Exception:
        raise HTTPException(status_code=401, detail="Refresh token invalido")


# --- Budget Endpoints ---

def calc_budget_totals(items, discount_type="percentage", discount_value=0):
    total_cost = sum(i.get("unit_cost", 0) * i.get("quantity", 0) for i in items)
    # Price per item = unit_cost * (1 + margin) * qty, then apply per-item discount
    total_price = 0
    for i in items:
        line = i.get("unit_cost", 0) * (1 + i.get("margin", 0)) * i.get("quantity", 0)
        dtype = i.get("discount_type", "percentage")
        dval = i.get("discount_value", 0) or 0
        if dval > 0:
            if dtype == "percentage":
                line = line * (1 - dval / 100)
            else:
                line = max(0, line - dval)
        total_price += line
    # Apply global discount
    if discount_value and discount_value > 0:
        if discount_type == "percentage":
            total_price = total_price * (1 - discount_value / 100)
        else:
            total_price = max(0, total_price - discount_value)
    return round(total_cost, 2), round(total_price, 2)

@api_router.get("/budgets")
async def get_budgets(user=Depends(get_current_user)):
    budgets = await db.budgets.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return budgets

@api_router.post("/budgets")
async def create_budget(input: BudgetCreate, user=Depends(get_current_user)):
    items = [item.model_dump() for item in input.items]
    total_cost, total_price = calc_budget_totals(items, input.discount_type, input.discount_value)
    doc = {
        "id": str(uuid.uuid4()),
        "title": input.title,
        "client_name": input.client_name,
        "client_phone": input.client_phone,
        "items": items,
        "discount_type": input.discount_type,
        "discount_value": input.discount_value,
        "payment_methods": input.payment_methods,
        "payment_split": input.payment_split,
        "payment_notes": input.payment_notes,
        "total_cost": total_cost,
        "total_price": total_price,
        "status": "rascunho",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    await db.budgets.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/budgets/{budget_id}")
async def get_budget(budget_id: str, user=Depends(get_current_user)):
    budget = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    if not budget:
        raise HTTPException(status_code=404, detail="Orcamento nao encontrado")
    return budget

@api_router.put("/budgets/{budget_id}")
async def update_budget(budget_id: str, input: BudgetUpdate, user=Depends(get_current_user)):
    update_data = {}
    input_dict = input.model_dump(exclude_none=True)
    for k, v in input_dict.items():
        if k == "items":
            update_data["items"] = [i.model_dump() if hasattr(i, 'model_dump') else i for i in v]
        else:
            update_data[k] = v

    if "items" in update_data:
        # Merge with existing budget to get latest discount values
        existing = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
        dtype = update_data.get("discount_type", existing.get("discount_type", "percentage") if existing else "percentage")
        dval = update_data.get("discount_value", existing.get("discount_value", 0) if existing else 0)
        total_cost, total_price = calc_budget_totals(update_data["items"], dtype, dval)
        update_data["total_cost"] = total_cost
        update_data["total_price"] = total_price
    elif "discount_type" in update_data or "discount_value" in update_data:
        existing = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
        if existing:
            dtype = update_data.get("discount_type", existing.get("discount_type", "percentage"))
            dval = update_data.get("discount_value", existing.get("discount_value", 0))
            total_cost, total_price = calc_budget_totals(existing.get("items", []), dtype, dval)
            update_data["total_cost"] = total_cost
            update_data["total_price"] = total_price

    if not update_data:
        raise HTTPException(status_code=400, detail="Nada para atualizar")

    result = await db.budgets.update_one({"id": budget_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Orcamento nao encontrado")
    updated = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    return updated

@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str, user=Depends(get_current_user)):
    result = await db.budgets.delete_one({"id": budget_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Orcamento nao encontrado")
    return {"message": "Orcamento eliminado"}


# --- Proposal Endpoints ---

@api_router.post("/budgets/{budget_id}/generate-proposals")
async def generate_proposals(budget_id: str, user=Depends(get_current_user)):
    budget = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    if not budget:
        raise HTTPException(status_code=404, detail="Orcamento nao encontrado")

    await db.proposals.delete_many({"budget_id": budget_id})

    base_price = budget["total_price"]
    tiers = [
        {"tier": "basico", "label": "Basico", "multiplier": 1.0, "description": "Servico padrao com materiais standard. Garantia de 2 anos. IVA nao incluido."},
        {"tier": "profissional", "label": "Profissional", "multiplier": 1.15, "description": "Materiais premium, garantia de 2 anos, suporte prioritario. IVA nao incluido."},
        {"tier": "premium", "label": "Premium", "multiplier": 1.30, "description": "Materiais top de gama, garantia de 2 anos, execucao prioritaria, suporte 24/7. IVA nao incluido."},
    ]

    proposals = []
    for t in tiers:
        prop = {
            "id": str(uuid.uuid4()),
            "budget_id": budget_id,
            "tier": t["tier"],
            "label": t["label"],
            "title": f"Proposta {t['label']} - {budget['title']}",
            "client_name": budget["client_name"],
            "client_phone": budget.get("client_phone", ""),
            "items": budget["items"],
            "base_value": round(base_price, 2),
            "multiplier": t["multiplier"],
            "final_value": round(base_price * t["multiplier"], 2),
            "description": t["description"],
            "status": "pendente",
            "payment_methods": budget.get("payment_methods", []),
            "payment_split": budget.get("payment_split", ""),
            "payment_notes": budget.get("payment_notes", ""),
            "discount_type": budget.get("discount_type", "percentage"),
            "discount_value": budget.get("discount_value", 0),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.proposals.insert_one(prop)
        prop.pop("_id", None)
        proposals.append(prop)

    await db.budgets.update_one({"id": budget_id}, {"$set": {"status": "proposta_gerada"}})
    return proposals

@api_router.get("/proposals")
async def get_proposals(user=Depends(get_current_user)):
    proposals = await db.proposals.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return proposals

@api_router.get("/proposals/{proposal_id}")
async def get_proposal(proposal_id: str, user=Depends(get_current_user)):
    proposal = await db.proposals.find_one({"id": proposal_id}, {"_id": 0})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta nao encontrada")
    return proposal

@api_router.put("/proposals/{proposal_id}/status")
async def update_proposal_status(proposal_id: str, input: StatusUpdate, user=Depends(get_current_user)):
    result = await db.proposals.update_one({"id": proposal_id}, {"$set": {"status": input.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Proposta nao encontrada")
    updated = await db.proposals.find_one({"id": proposal_id}, {"_id": 0})
    return updated

@api_router.delete("/proposals/{proposal_id}")
async def delete_proposal(proposal_id: str, user=Depends(get_current_user)):
    result = await db.proposals.delete_one({"id": proposal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Proposta nao encontrada")
    return {"message": "Proposta eliminada"}


# --- Works Endpoints ---

@api_router.get("/works")
async def get_works(user=Depends(get_current_user)):
    works = await db.works.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return works

@api_router.post("/works")
async def create_work(input: WorkCreate, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        **input.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    await db.works.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/works/{work_id}")
async def get_work(work_id: str, user=Depends(get_current_user)):
    work = await db.works.find_one({"id": work_id}, {"_id": 0})
    if not work:
        raise HTTPException(status_code=404, detail="Obra nao encontrada")
    return work

@api_router.put("/works/{work_id}")
async def update_work(work_id: str, input: WorkUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    result = await db.works.update_one({"id": work_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Obra nao encontrada")
    updated = await db.works.find_one({"id": work_id}, {"_id": 0})
    return updated

@api_router.delete("/works/{work_id}")
async def delete_work(work_id: str, user=Depends(get_current_user)):
    result = await db.works.delete_one({"id": work_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Obra nao encontrada")
    return {"message": "Obra eliminada"}

@api_router.post("/works/from-proposal/{proposal_id}")
async def create_work_from_proposal(proposal_id: str, user=Depends(get_current_user)):
    proposal = await db.proposals.find_one({"id": proposal_id}, {"_id": 0})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta nao encontrada")
    doc = {
        "id": str(uuid.uuid4()),
        "title": proposal["title"],
        "client_name": proposal["client_name"],
        "client_phone": proposal.get("client_phone", ""),
        "budget_id": proposal.get("budget_id", ""),
        "proposal_id": proposal_id,
        "status": "orcamento",
        "predicted_cost": proposal["final_value"],
        "real_cost": 0,
        "notes": f"Criada a partir da proposta {proposal['label']}",
        "start_date": "",
        "end_date": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    await db.works.insert_one(doc)
    doc.pop("_id", None)
    return doc


# --- Appointment Endpoints ---

@api_router.get("/appointments")
async def get_appointments(user=Depends(get_current_user)):
    appointments = await db.appointments.find({}, {"_id": 0}).sort("date", 1).to_list(1000)
    return appointments

@api_router.post("/appointments")
async def create_appointment(input: AppointmentCreate, user=Depends(get_current_user)):
    existing = await db.appointments.find_one({
        "date": input.date,
        "time_start": {"$lt": input.time_end},
        "time_end": {"$gt": input.time_start}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ja existe um agendamento nesse horario. Escolha outro horario.")
    doc = {
        "id": str(uuid.uuid4()),
        **input.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.appointments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/appointments/{appointment_id}")
async def update_appointment(appointment_id: str, input: AppointmentCreate, user=Depends(get_current_user)):
    existing = await db.appointments.find_one({
        "id": {"$ne": appointment_id},
        "date": input.date,
        "time_start": {"$lt": input.time_end},
        "time_end": {"$gt": input.time_start}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Conflito de horario com outro agendamento.")
    result = await db.appointments.update_one({"id": appointment_id}, {"$set": input.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Agendamento nao encontrado")
    updated = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    return updated

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, user=Depends(get_current_user)):
    result = await db.appointments.delete_one({"id": appointment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agendamento nao encontrado")
    return {"message": "Agendamento eliminado"}


# --- Dashboard ---

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user=Depends(get_current_user)):
    total_obras = await db.works.count_documents({})
    obras_em_andamento = await db.works.count_documents({"status": "em_execucao"})
    obras_finalizadas = await db.works.count_documents({"status": "finalizado"})

    works_data = await db.works.find({}, {"_id": 0, "predicted_cost": 1, "real_cost": 1}).to_list(1000)
    total_predicted = sum(w.get("predicted_cost", 0) for w in works_data)
    total_real = sum(w.get("real_cost", 0) for w in works_data)

    total_orcamentos = await db.budgets.count_documents({})
    total_propostas = await db.proposals.count_documents({})

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    appointments_today = await db.appointments.count_documents({"date": today})

    recent_works = await db.works.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_budgets = await db.budgets.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    return {
        "total_obras": total_obras,
        "obras_em_andamento": obras_em_andamento,
        "obras_finalizadas": obras_finalizadas,
        "lucro_estimado": round(total_predicted - total_real, 2),
        "total_orcamentos": total_orcamentos,
        "total_propostas": total_propostas,
        "appointments_today": appointments_today,
        "total_predicted": round(total_predicted, 2),
        "total_real": round(total_real, 2),
        "recent_works": recent_works,
        "recent_budgets": recent_budgets
    }


from emergentintegrations.llm.chat import LlmChat, UserMessage
import json as json_module


# --- Catalogo de Categorias e Itens para Eletricistas/Telecom ---

CATEGORIES_CATALOG = [
    {
        "id": "cabos_fios",
        "name": "Cabos e Fios",
        "items": [
            {"name": "Cabo H05VV-F 3G2,5mm", "unit": "metro"},
            {"name": "Cabo H05VV-F 3G1,5mm", "unit": "metro"},
            {"name": "Cabo H05VV-F 5G2,5mm", "unit": "metro"},
            {"name": "Cabo VV 3x2,5mm", "unit": "metro"},
            {"name": "Cabo VV 3x4mm", "unit": "metro"},
            {"name": "Fio H07V-U 2,5mm (azul/castanho/verde-amarelo)", "unit": "metro"},
            {"name": "Fio H07V-U 1,5mm", "unit": "metro"},
            {"name": "Fio H07V-U 4mm", "unit": "metro"},
            {"name": "Fio H07V-U 6mm", "unit": "metro"},
            {"name": "Cabo coaxial RG6", "unit": "metro"},
            {"name": "Cabo UTP Cat5e", "unit": "metro"},
            {"name": "Cabo UTP Cat6", "unit": "metro"},
            {"name": "Cabo UTP Cat6 (bobine 305m)", "unit": "unidade"},
            {"name": "Cabo fibra optica monomodo", "unit": "metro"},
            {"name": "Cabo de alarme 4 condutores", "unit": "metro"},
            {"name": "Cabo LSZH 3G2,5mm", "unit": "metro"},
        ]
    },
    {
        "id": "quadros_protecao",
        "name": "Quadros e Protecao",
        "items": [
            {"name": "Quadro eletrico 12 modulos", "unit": "unidade"},
            {"name": "Quadro eletrico 24 modulos", "unit": "unidade"},
            {"name": "Quadro eletrico 36 modulos", "unit": "unidade"},
            {"name": "Disjuntor monofasico 10A", "unit": "unidade"},
            {"name": "Disjuntor monofasico 16A", "unit": "unidade"},
            {"name": "Disjuntor monofasico 20A", "unit": "unidade"},
            {"name": "Disjuntor monofasico 32A", "unit": "unidade"},
            {"name": "Disjuntor trifasico 32A", "unit": "unidade"},
            {"name": "Diferencial 40A 30mA bipolar", "unit": "unidade"},
            {"name": "Diferencial 63A 30mA tetrapolar", "unit": "unidade"},
            {"name": "Descarregador de sobretensao Tipo 2", "unit": "unidade"},
            {"name": "Contactor 25A", "unit": "unidade"},
            {"name": "Rele horario digital", "unit": "unidade"},
            {"name": "Barramento de ligacao", "unit": "unidade"},
        ]
    },
    {
        "id": "tomadas_interruptores",
        "name": "Tomadas e Interruptores",
        "items": [
            {"name": "Tomada Schuko encastrar (branca)", "unit": "unidade"},
            {"name": "Tomada Schuko dupla encastrar", "unit": "unidade"},
            {"name": "Interruptor simples encastrar", "unit": "unidade"},
            {"name": "Interruptor duplo encastrar", "unit": "unidade"},
            {"name": "Comutador de escada", "unit": "unidade"},
            {"name": "Comutador de lustre", "unit": "unidade"},
            {"name": "Inversor de grupo", "unit": "unidade"},
            {"name": "Tomada RJ45 Cat6 encastrar", "unit": "unidade"},
            {"name": "Tomada TV/SAT encastrar", "unit": "unidade"},
            {"name": "Espelho/Placa 1 posto", "unit": "unidade"},
            {"name": "Espelho/Placa 2 postos", "unit": "unidade"},
            {"name": "Tomada industrial CEE 16A", "unit": "unidade"},
            {"name": "Tomada industrial CEE 32A", "unit": "unidade"},
            {"name": "Regulador de intensidade (dimmer)", "unit": "unidade"},
        ]
    },
    {
        "id": "iluminacao",
        "name": "Iluminacao",
        "items": [
            {"name": "Downlight LED encastrar 12W", "unit": "unidade"},
            {"name": "Downlight LED encastrar 18W", "unit": "unidade"},
            {"name": "Projetor LED exterior 30W", "unit": "unidade"},
            {"name": "Projetor LED exterior 50W", "unit": "unidade"},
            {"name": "Projetor LED exterior 100W", "unit": "unidade"},
            {"name": "Fita LED 5m branco quente", "unit": "unidade"},
            {"name": "Fita LED 5m RGB", "unit": "unidade"},
            {"name": "Lampada LED E27 10W", "unit": "unidade"},
            {"name": "Lampada LED E14 6W", "unit": "unidade"},
            {"name": "Lampada LED GU10 7W", "unit": "unidade"},
            {"name": "Armadura estanque LED 36W 120cm", "unit": "unidade"},
            {"name": "Painel LED 60x60 40W", "unit": "unidade"},
            {"name": "Aplique LED exterior", "unit": "unidade"},
            {"name": "Sensor de movimento PIR", "unit": "unidade"},
            {"name": "Sensor crepuscular", "unit": "unidade"},
        ]
    },
    {
        "id": "calhas_tubos",
        "name": "Calhas e Tubos",
        "items": [
            {"name": "Tubo VD 20mm (vara 3m)", "unit": "unidade"},
            {"name": "Tubo VD 25mm (vara 3m)", "unit": "unidade"},
            {"name": "Tubo VD 32mm (vara 3m)", "unit": "unidade"},
            {"name": "Tubo corrugado 20mm (rolo 50m)", "unit": "unidade"},
            {"name": "Tubo corrugado 25mm (rolo 50m)", "unit": "unidade"},
            {"name": "Tubo corrugado 32mm (rolo 25m)", "unit": "unidade"},
            {"name": "Calha DLP 40x25mm (2m)", "unit": "unidade"},
            {"name": "Calha DLP 60x40mm (2m)", "unit": "unidade"},
            {"name": "Calha de chao 50x12mm", "unit": "metro"},
            {"name": "Caixa de derivacao 100x100", "unit": "unidade"},
            {"name": "Caixa de derivacao 150x150", "unit": "unidade"},
            {"name": "Caixa de aparelhagem (fundo)", "unit": "unidade"},
            {"name": "Braçadeira clip 20mm", "unit": "unidade"},
            {"name": "Braçadeira clip 25mm", "unit": "unidade"},
            {"name": "Abraçadeira nylon 200mm (saco 100)", "unit": "unidade"},
        ]
    },
    {
        "id": "telecomunicacoes",
        "name": "Telecomunicacoes",
        "items": [
            {"name": "Router WiFi 6 dual band", "unit": "unidade"},
            {"name": "Access Point WiFi 6", "unit": "unidade"},
            {"name": "Switch Gigabit 8 portas", "unit": "unidade"},
            {"name": "Switch Gigabit 16 portas", "unit": "unidade"},
            {"name": "Switch PoE 8 portas", "unit": "unidade"},
            {"name": "Patch panel 24 portas Cat6", "unit": "unidade"},
            {"name": "Conector RJ45 Cat6 (saco 100)", "unit": "unidade"},
            {"name": "Patch cord Cat6 1m", "unit": "unidade"},
            {"name": "Patch cord Cat6 3m", "unit": "unidade"},
            {"name": "Bastidor rack 6U parede", "unit": "unidade"},
            {"name": "Bastidor rack 12U parede", "unit": "unidade"},
            {"name": "Bastidor rack 42U chao", "unit": "unidade"},
            {"name": "Organizador de cabos 1U", "unit": "unidade"},
            {"name": "Tomada fibra optica SC/APC", "unit": "unidade"},
            {"name": "Camera IP PoE 4MP", "unit": "unidade"},
            {"name": "NVR 8 canais PoE", "unit": "unidade"},
        ]
    },
    {
        "id": "ferramentas_acessorios",
        "name": "Ferramentas e Acessorios",
        "items": [
            {"name": "Multimetro digital profissional", "unit": "unidade"},
            {"name": "Alicate de corte diagonal", "unit": "unidade"},
            {"name": "Alicate universal isolado 1000V", "unit": "unidade"},
            {"name": "Alicate de cravar RJ45", "unit": "unidade"},
            {"name": "Alicate descarnar cabos", "unit": "unidade"},
            {"name": "Detetor de tensao sem contacto", "unit": "unidade"},
            {"name": "Chave de fendas isolada 1000V (jogo)", "unit": "unidade"},
            {"name": "Fita isoladora preta 20m", "unit": "unidade"},
            {"name": "Fita isoladora (pack 10 cores)", "unit": "unidade"},
            {"name": "Terminais de cravar (caixa sortida)", "unit": "unidade"},
            {"name": "Passa fios aço 20m", "unit": "unidade"},
            {"name": "Passa fios nylon 15m", "unit": "unidade"},
            {"name": "Testador de cabos RJ45/RJ11", "unit": "unidade"},
        ]
    },
    {
        "id": "carregamento_ev",
        "name": "Carregamento Veiculo Eletrico",
        "items": [
            {"name": "Wallbox monofasico 7.4kW", "unit": "unidade"},
            {"name": "Wallbox trifasico 11kW", "unit": "unidade"},
            {"name": "Wallbox trifasico 22kW", "unit": "unidade"},
            {"name": "Cabo de carregamento Tipo 2 (5m)", "unit": "unidade"},
            {"name": "Protecao diferencial Tipo B 40A", "unit": "unidade"},
        ]
    },
    {
        "id": "energia_solar",
        "name": "Energia Solar",
        "items": [
            {"name": "Painel solar fotovoltaico 400W", "unit": "unidade"},
            {"name": "Painel solar fotovoltaico 550W", "unit": "unidade"},
            {"name": "Inversor hibrido monofasico 5kW", "unit": "unidade"},
            {"name": "Inversor string trifasico 10kW", "unit": "unidade"},
            {"name": "Bateria de litio 5kWh", "unit": "unidade"},
            {"name": "Bateria de litio 10kWh", "unit": "unidade"},
            {"name": "Estrutura montagem telhado (kit 4 paineis)", "unit": "unidade"},
            {"name": "Cabo solar 6mm (vermelho)", "unit": "metro"},
            {"name": "Cabo solar 6mm (preto)", "unit": "metro"},
            {"name": "Conector MC4 (par)", "unit": "unidade"},
        ]
    },
    {
        "id": "domotica",
        "name": "Domotica e Automacao",
        "items": [
            {"name": "Interruptor inteligente WiFi", "unit": "unidade"},
            {"name": "Tomada inteligente WiFi", "unit": "unidade"},
            {"name": "Lampada inteligente E27 WiFi RGB", "unit": "unidade"},
            {"name": "Controlador de estores WiFi", "unit": "unidade"},
            {"name": "Hub Zigbee/Z-Wave", "unit": "unidade"},
            {"name": "Sensor de porta/janela", "unit": "unidade"},
            {"name": "Sensor de temperatura/humidade", "unit": "unidade"},
            {"name": "Campainha video WiFi (video doorbell)", "unit": "unidade"},
            {"name": "Fechadura inteligente", "unit": "unidade"},
        ]
    },
    {
        "id": "mao_obra_eletricista",
        "name": "Mao de Obra - Eletricista",
        "items": [
            {"name": "Instalacao de ponto de luz (completo)", "unit": "unidade"},
            {"name": "Instalacao de tomada (completo)", "unit": "unidade"},
            {"name": "Instalacao de interruptor/comutador", "unit": "unidade"},
            {"name": "Montagem de quadro eletrico residencial", "unit": "unidade"},
            {"name": "Montagem de quadro eletrico industrial", "unit": "unidade"},
            {"name": "Substituicao de quadro eletrico", "unit": "unidade"},
            {"name": "Passagem de cabos (por metro linear)", "unit": "metro"},
            {"name": "Abertura de roco em parede (por metro)", "unit": "metro"},
            {"name": "Instalacao de disjuntor/diferencial", "unit": "unidade"},
            {"name": "Instalacao de descarregador de sobretensao", "unit": "unidade"},
            {"name": "Verificacao e teste de instalacao eletrica", "unit": "unidade"},
            {"name": "Diagnostico de avaria eletrica", "unit": "unidade"},
            {"name": "Reparacao de curto-circuito", "unit": "unidade"},
            {"name": "Instalacao de projetor LED exterior", "unit": "unidade"},
            {"name": "Instalacao de downlight encastrado", "unit": "unidade"},
            {"name": "Instalacao de fita LED (por metro)", "unit": "metro"},
            {"name": "Instalacao de sensor de movimento", "unit": "unidade"},
            {"name": "Instalacao de wallbox carregamento EV", "unit": "unidade"},
            {"name": "Instalacao de painel solar (por painel)", "unit": "unidade"},
            {"name": "Instalacao de inversor solar", "unit": "unidade"},
            {"name": "Ligacao a rede eletrica (RESP)", "unit": "unidade"},
            {"name": "Certificacao de instalacao eletrica", "unit": "unidade"},
            {"name": "Manutencao preventiva de quadro eletrico", "unit": "unidade"},
            {"name": "Medicao de terra e resistencia de isolamento", "unit": "unidade"},
            {"name": "Instalacao de sistema de terra", "unit": "unidade"},
            {"name": "Hora de trabalho eletricista (normal)", "unit": "hora"},
            {"name": "Hora de trabalho eletricista (urgente/noturno)", "unit": "hora"},
            {"name": "Deslocacao tecnica (Grande Lisboa)", "unit": "unidade"},
            {"name": "Deslocacao tecnica (fora de Lisboa)", "unit": "unidade"},
        ]
    },
    {
        "id": "mao_obra_telecom",
        "name": "Mao de Obra - Telecomunicacoes",
        "items": [
            {"name": "Instalacao de ponto de rede Cat6 (completo)", "unit": "unidade"},
            {"name": "Instalacao de ponto de rede Cat5e (completo)", "unit": "unidade"},
            {"name": "Cablagem estruturada residencial (ate 8 pontos)", "unit": "unidade"},
            {"name": "Cablagem estruturada escritorio (ate 24 pontos)", "unit": "unidade"},
            {"name": "Montagem de bastidor/rack com patch panel", "unit": "unidade"},
            {"name": "Organizacao de cablagem em bastidor", "unit": "unidade"},
            {"name": "Certificacao de ponto de rede Cat6", "unit": "unidade"},
            {"name": "Instalacao de router/access point WiFi", "unit": "unidade"},
            {"name": "Configuracao de rede WiFi (SSID, seguranca, mesh)", "unit": "unidade"},
            {"name": "Instalacao de switch gerido", "unit": "unidade"},
            {"name": "Instalacao de switch PoE", "unit": "unidade"},
            {"name": "Passagem de cabo UTP (por metro)", "unit": "metro"},
            {"name": "Passagem de fibra optica (por metro)", "unit": "metro"},
            {"name": "Fusao de fibra optica (por fusao)", "unit": "unidade"},
            {"name": "Instalacao de tomada fibra optica", "unit": "unidade"},
            {"name": "Instalacao de camera IP/CCTV", "unit": "unidade"},
            {"name": "Configuracao de NVR/DVR", "unit": "unidade"},
            {"name": "Instalacao de sistema CCTV completo (ate 4 cameras)", "unit": "unidade"},
            {"name": "Instalacao de sistema CCTV completo (ate 8 cameras)", "unit": "unidade"},
            {"name": "Instalacao de videoporteiro/video doorbell", "unit": "unidade"},
            {"name": "Instalacao de sistema de alarme", "unit": "unidade"},
            {"name": "Configuracao de acesso remoto (VPN/DDNS)", "unit": "unidade"},
            {"name": "Diagnostico de rede/conectividade", "unit": "unidade"},
            {"name": "Instalacao de central telefonica IP", "unit": "unidade"},
            {"name": "Instalacao de sistema IPTV/distribuicao TV", "unit": "unidade"},
            {"name": "Hora de trabalho tecnico telecom (normal)", "unit": "hora"},
            {"name": "Hora de trabalho tecnico telecom (urgente/noturno)", "unit": "hora"},
        ]
    },
]


# --- Categories & Price Lookup Endpoints ---

class PriceLookupRequest(BaseModel):
    item_name: str

class ProposalSettingsUpdate(BaseModel):
    payment_methods: Optional[List[str]] = None
    payment_split: Optional[str] = None
    validity_days: Optional[int] = None
    warranty_text: Optional[str] = None
    conditions: Optional[List[str]] = None
    notes: Optional[str] = None


# --- Logo endpoint (serves logo as base64 to avoid CORS) ---

@api_router.get("/logo")
async def get_logo():
    logo_path = Path(__file__).parent / "logo.png"
    if not logo_path.exists():
        raise HTTPException(status_code=404, detail="Logo nao encontrado")
    import base64
    with open(logo_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return {"logo": f"data:image/png;base64,{b64}"}


# --- Proposal Settings ---

DEFAULT_PROPOSAL_SETTINGS = {
    "payment_methods": ["Transferencia Bancaria", "MB Way", "Multibanco", "Cartao de Credito/Debito"],
    "payment_split": "50% no inicio dos trabalhos, 50% na conclusao",
    "validity_days": 30,
    "warranty_text": "Garantia de 2 anos sobre mao de obra e materiais fornecidos",
    "conditions": [
        "Valores em EUR, IVA NAO incluido (a acrescer a taxa legal em vigor)",
        "Deslocacao incluida na zona da Grande Lisboa",
        "Material e mao de obra incluidos",
        "Alteracoes ao orcamento podem afetar o valor final",
    ],
    "notes": "",
}

@api_router.get("/proposal-settings")
async def get_proposal_settings(user=Depends(get_current_user)):
    settings = await db.proposal_settings.find_one({}, {"_id": 0})
    if not settings:
        return DEFAULT_PROPOSAL_SETTINGS
    return settings

@api_router.put("/proposal-settings")
async def update_proposal_settings(input: ProposalSettingsUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    existing = await db.proposal_settings.find_one({})
    if existing:
        await db.proposal_settings.update_one({"_id": existing["_id"]}, {"$set": update_data})
    else:
        doc = {**DEFAULT_PROPOSAL_SETTINGS, **update_data}
        await db.proposal_settings.insert_one(doc)
    settings = await db.proposal_settings.find_one({}, {"_id": 0})
    return settings


@api_router.get("/categories")
async def get_categories(user=Depends(get_current_user)):
    # Merge static catalog with custom items from materials_db
    import copy
    result = copy.deepcopy(CATEGORIES_CATALOG)
    cat_map = {c["name"]: c for c in result}

    # Get custom items from materials_db that are not in the static catalog
    custom_materials = await db.materials_db.find({"active": True, "custom": True}, {"_id": 0}).to_list(2000)
    for mat in custom_materials:
        cat_name = mat.get("category", "")
        if not cat_name:
            continue
        if cat_name in cat_map:
            # Add to existing category if not already there
            existing_names = {i["name"] for i in cat_map[cat_name]["items"]}
            if mat["description"] not in existing_names:
                cat_map[cat_name]["items"].append({"name": mat["description"], "unit": mat.get("unit", "unidade")})
        else:
            # Create new category
            new_cat = {"id": cat_name.lower().replace(" ", "_"), "name": cat_name, "items": [{"name": mat["description"], "unit": mat.get("unit", "unidade")}]}
            result.append(new_cat)
            cat_map[cat_name] = new_cat

    return result


class SaveCustomItemInput(BaseModel):
    category: str
    name: str
    unit_cost: float = 0
    unit: str = "unidade"

@api_router.post("/categories/save-item")
async def save_custom_item(input: SaveCustomItemInput, user=Depends(get_current_user)):
    """Save a custom item to the materials database so it appears in future category dropdowns"""
    if not input.name or not input.category:
        raise HTTPException(status_code=400, detail="Nome e categoria obrigatorios")

    # Check if already exists
    existing = await db.materials_db.find_one({"description": input.name, "category": input.category})
    if existing:
        # Update price if changed
        if input.unit_cost > 0 and input.unit_cost != existing.get("purchase_price", 0):
            history = existing.get("price_history", [])
            history.append({"price": input.unit_cost, "date": datetime.now(timezone.utc).isoformat()})
            await db.materials_db.update_one(
                {"_id": existing["_id"]},
                {"$set": {"purchase_price": input.unit_cost, "market_price": input.unit_cost, "price_history": history, "price_updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        return {"message": "Item atualizado", "new": False}

    # Create new material
    doc = {
        "id": str(uuid.uuid4()), "code": "", "description": input.name,
        "category": input.category, "subcategory": "", "brand": "", "supplier": "",
        "unit": input.unit, "purchase_price": input.unit_cost, "market_price": input.unit_cost,
        "waste_pct": 5, "notes": "Adicionado automaticamente via orcamento", "active": True,
        "custom": True,
        "price_history": [{"price": input.unit_cost, "date": datetime.now(timezone.utc).isoformat()}] if input.unit_cost > 0 else [],
        "price_updated_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.materials_db.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "Item guardado na categoria", "new": True, "item": doc}


@api_router.post("/price-lookup")
async def price_lookup(input: PriceLookupRequest, user=Depends(get_current_user)):
    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    if not llm_key:
        raise HTTPException(status_code=500, detail="Chave LLM nao configurada")

    try:
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"price-{uuid.uuid4()}",
            system_message=(
                "Es um especialista em precos de material eletrico e telecomunicacoes em Portugal, "
                "com experiencia em orcamentacao para empresas de eletricistas na zona de Lisboa. "
                "O utilizador vai dar-te o nome de um item/material. "
                "Deves responder APENAS com um objeto JSON valido com estes campos: "
                '{"price": <preco medio de compra em EUR>, '
                '"price_min": <preco minimo>, '
                '"price_max": <preco maximo>, '
                '"margin": <margem recomendada como decimal, ex: 0.65 para 65%>, '
                '"install_cost": <custo estimado de instalacao/mao de obra por unidade em EUR>, '
                '"unit": "metro/unidade/pack", '
                '"source": "<breve descricao>"} '
                "REGRAS PARA A MARGEM: "
                "- A margem deve cobrir: mao de obra do eletricista (media 15-25 EUR/hora em Lisboa), "
                "deslocacao (taxa media 35 EUR na Grande Lisboa), "
                "desgaste de ferramentas, seguro, impostos da empresa, e lucro. "
                "- Para itens simples (cabos, tomadas, interruptores): margem entre 0.80 e 1.20 (80-120%). "
                "- Para itens complexos (quadros, wallbox, paineis solares): margem entre 0.40 e 0.70 (40-70%). "
                "- Para ferramentas (sem instalacao): margem entre 0.15 e 0.30 (15-30%). "
                "- install_cost e o valor aproximado da mao de obra para instalar 1 unidade desse item. "
                "Baseia-te em precos de retalho em Portugal (Leroy Merlin, Voltimum, Material Eletrico Online, Jolar, etc). "
                "Se nao conseguires estimar, devolve price: 0. "
                "NAO incluas texto adicional, apenas o JSON."
            )
        ).with_model("openai", "gpt-5.2")

        user_msg = UserMessage(text=f"Preco medio de compra e margem de instalacao em Lisboa para: {input.item_name}")
        response = await chat.send_message(user_msg)

        # Parse the JSON response
        response_text = response.strip()
        # Handle markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1] if "\n" in response_text else response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

        price_data = json_module.loads(response_text)
        return {
            "item_name": input.item_name,
            "price": price_data.get("price", 0),
            "price_min": price_data.get("price_min", 0),
            "price_max": price_data.get("price_max", 0),
            "margin": price_data.get("margin", 0.6),
            "install_cost": price_data.get("install_cost", 0),
            "unit": price_data.get("unit", "unidade"),
            "source": price_data.get("source", "Estimativa IA"),
        }
    except json_module.JSONDecodeError:
        logger.error(f"Price lookup JSON parse error for: {input.item_name}, response: {response_text}")
        return {
            "item_name": input.item_name,
            "price": 0,
            "price_min": 0,
            "price_max": 0,
            "margin": 0.6,
            "install_cost": 0,
            "unit": "unidade",
            "source": "Erro ao interpretar resposta",
        }
    except Exception as e:
        logger.error(f"Price lookup error for: {input.item_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro na pesquisa de preco: {str(e)}")


# ============================================================
# PROFESSIONAL BUDGETING ENGINE
# ============================================================

SPECIALTIES = [
    {"id": "instalacoes_eletricas", "name": "Instalacoes Eletricas"},
    {"id": "ited", "name": "ITED / Telecomunicacoes"},
    {"id": "cctv", "name": "CCTV / Videovigilancia"},
    {"id": "intrusao", "name": "Sistemas de Intrusao"},
    {"id": "bastidores", "name": "Bastidores / Sala Tecnica"},
    {"id": "engenharia", "name": "Engenharia / Certificacao"},
    {"id": "trabalhos_prep", "name": "Trabalhos Preparatorios"},
]

DEFAULT_LABOR = [
    {"id": "eletricista", "type": "eletricista", "description": "Eletricista certificado", "cost_hour": 15, "sell_hour": 35, "charges": "SS+seguro", "notes": ""},
    {"id": "ajudante", "type": "ajudante", "description": "Ajudante de eletricista", "cost_hour": 10, "sell_hour": 22, "charges": "SS+seguro", "notes": ""},
    {"id": "tecnico_ited", "type": "tecnico_ited", "description": "Tecnico ITED certificado", "cost_hour": 18, "sell_hour": 40, "charges": "SS+seguro+cert", "notes": ""},
    {"id": "tecnico_cctv", "type": "tecnico_cctv", "description": "Tecnico CCTV", "cost_hour": 16, "sell_hour": 38, "charges": "SS+seguro", "notes": ""},
    {"id": "tecnico_intrusao", "type": "tecnico_intrusao", "description": "Tecnico sistemas intrusao", "cost_hour": 16, "sell_hour": 38, "charges": "SS+seguro", "notes": ""},
    {"id": "encarregado", "type": "encarregado", "description": "Encarregado de obra", "cost_hour": 20, "sell_hour": 45, "charges": "SS+seguro", "notes": ""},
    {"id": "engenheiro", "type": "engenheiro", "description": "Engenheiro / Direcao tecnica", "cost_hour": 30, "sell_hour": 65, "charges": "SS+seguro", "notes": ""},
]

DEFAULT_PRODUCTIVITIES = [
    {"item": "Tomada simples encastrar", "unit": "un", "time_min": 20, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 5},
    {"item": "Tomada dupla encastrar", "unit": "un", "time_min": 25, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 5},
    {"item": "Interruptor simples", "unit": "un", "time_min": 15, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 5},
    {"item": "Comutador de escada", "unit": "un", "time_min": 20, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 5},
    {"item": "Ponto de luz completo", "unit": "un", "time_min": 30, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 10},
    {"item": "Downlight LED encastrar", "unit": "un", "time_min": 25, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 5},
    {"item": "Projetor LED exterior", "unit": "un", "time_min": 35, "difficulty": "media", "technician": "eletricista", "loss_pct": 5},
    {"item": "Passagem de cabo (metro)", "unit": "m", "time_min": 3, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 10},
    {"item": "Passagem de tubo embebido", "unit": "m", "time_min": 8, "difficulty": "media", "technician": "eletricista", "loss_pct": 10},
    {"item": "Abertura de roco", "unit": "m", "time_min": 15, "difficulty": "alta", "technician": "eletricista", "loss_pct": 15},
    {"item": "Quadro eletrico residencial", "unit": "un", "time_min": 240, "difficulty": "alta", "technician": "eletricista", "loss_pct": 10},
    {"item": "Quadro eletrico industrial", "unit": "un", "time_min": 480, "difficulty": "muito_alta", "technician": "eletricista", "loss_pct": 15},
    {"item": "Disjuntor/Diferencial", "unit": "un", "time_min": 10, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 0},
    {"item": "Wallbox carregamento EV", "unit": "un", "time_min": 180, "difficulty": "alta", "technician": "eletricista", "loss_pct": 10},
    {"item": "Painel solar (por painel)", "unit": "un", "time_min": 60, "difficulty": "alta", "technician": "eletricista", "loss_pct": 5},
    {"item": "Inversor solar", "unit": "un", "time_min": 120, "difficulty": "alta", "technician": "eletricista", "loss_pct": 5},
    {"item": "Ponto rede Cat6", "unit": "un", "time_min": 30, "difficulty": "media", "technician": "tecnico_ited", "loss_pct": 10},
    {"item": "Ponto rede Cat5e", "unit": "un", "time_min": 25, "difficulty": "media", "technician": "tecnico_ited", "loss_pct": 10},
    {"item": "Passagem cabo UTP", "unit": "m", "time_min": 3, "difficulty": "baixa", "technician": "tecnico_ited", "loss_pct": 10},
    {"item": "Passagem fibra optica", "unit": "m", "time_min": 5, "difficulty": "media", "technician": "tecnico_ited", "loss_pct": 5},
    {"item": "Fusao fibra optica", "unit": "un", "time_min": 15, "difficulty": "alta", "technician": "tecnico_ited", "loss_pct": 5},
    {"item": "Montagem bastidor/rack", "unit": "un", "time_min": 240, "difficulty": "alta", "technician": "tecnico_ited", "loss_pct": 5},
    {"item": "Camera IP CCTV", "unit": "un", "time_min": 90, "difficulty": "media", "technician": "tecnico_cctv", "loss_pct": 5},
    {"item": "NVR/DVR configuracao", "unit": "un", "time_min": 120, "difficulty": "media", "technician": "tecnico_cctv", "loss_pct": 5},
    {"item": "Detetor de intrusao", "unit": "un", "time_min": 30, "difficulty": "media", "technician": "tecnico_intrusao", "loss_pct": 5},
    {"item": "Central de alarme", "unit": "un", "time_min": 180, "difficulty": "alta", "technician": "tecnico_intrusao", "loss_pct": 5},
    {"item": "Videoporteiro", "unit": "un", "time_min": 120, "difficulty": "media", "technician": "tecnico_ited", "loss_pct": 5},
    {"item": "Certificacao instalacao", "unit": "un", "time_min": 120, "difficulty": "media", "technician": "engenheiro", "loss_pct": 0},
    {"item": "Sensor movimento PIR", "unit": "un", "time_min": 20, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 5},
    {"item": "Fita LED por metro", "unit": "m", "time_min": 10, "difficulty": "baixa", "technician": "eletricista", "loss_pct": 10},
]

DEFAULT_SYSTEM_SETTINGS = {
    "iva_rate": 23,
    "min_margin": 15,
    "target_margin": 30,
    "indirect_costs": {
        "deslocacao": 3, "ferramentas": 2, "consumiveis": 1.5,
        "gestao_obra": 4, "supervisao": 3, "logistica": 2,
        "seguros": 1.5, "administrativos": 3,
    },
    "risk_levels": {"baixo": 3, "medio": 5, "alto": 8, "muito_alto": 12},
    "proposal_modes": {
        "basico": {"margin_factor": 0.85, "risk": "baixo", "label": "Basico - Margem reduzida para fechar obra"},
        "profissional": {"margin_factor": 1.0, "risk": "medio", "label": "Profissional - Margem equilibrada"},
        "premium": {"margin_factor": 1.20, "risk": "alto", "label": "Premium - Margem alta com protecao"},
    },
    "company_info": {
        "name": "Obelisco Radical", "subtitle": "Eletricidade & Telecomunicacoes",
        "phone": "+351 911 132 401", "email": "obeliscoradical@gmail.com",
        "website": "www.obeliscoradical.pt", "address": "Grande Lisboa", "nif": "",
    },
}


# --- Pro Models ---

class LaborInput(BaseModel):
    type: str
    description: str = ""
    cost_hour: float = 0
    sell_hour: float = 0
    charges: str = ""
    notes: str = ""

class ProductivityInput(BaseModel):
    item: str
    unit: str = "un"
    time_min: float = 0
    difficulty: str = "media"
    technician: str = "eletricista"
    loss_pct: float = 5
    notes: str = ""

class MaterialInput(BaseModel):
    code: str = ""
    description: str
    category: str = ""
    subcategory: str = ""
    brand: str = ""
    supplier: str = ""
    unit: str = "un"
    purchase_price: float = 0
    market_price: float = 0
    waste_pct: float = 5
    notes: str = ""
    active: bool = True

class SystemSettingsInput(BaseModel):
    iva_rate: Optional[float] = None
    min_margin: Optional[float] = None
    target_margin: Optional[float] = None
    indirect_costs: Optional[dict] = None
    risk_levels: Optional[dict] = None
    proposal_modes: Optional[dict] = None
    company_info: Optional[dict] = None

class ProBudgetItem(BaseModel):
    category: str = ""
    name: str = ""
    quantity: float = 1
    unit_cost: float = 0
    margin: float = 0
    specialty: str = "instalacoes_eletricas"
    labor_type: str = "eletricista"
    labor_cost_hour: float = 0
    productivity_min: float = 0
    waste_pct: float = 5
    supply_type: str = "included"

class ProBudgetCreate(BaseModel):
    title: str
    client_name: str
    client_phone: str = ""
    items: List[ProBudgetItem] = []
    risk_level: str = "medio"
    global_margin: float = 0
    notes: str = ""


# --- System Settings Endpoints ---

@api_router.get("/system-settings")
async def get_system_settings(user=Depends(get_current_user)):
    s = await db.system_settings.find_one({}, {"_id": 0})
    return s or DEFAULT_SYSTEM_SETTINGS

@api_router.put("/system-settings")
async def update_system_settings(input: SystemSettingsInput, user=Depends(get_current_user)):
    data = {k: v for k, v in input.model_dump().items() if v is not None}
    existing = await db.system_settings.find_one({})
    if existing:
        await db.system_settings.update_one({"_id": existing["_id"]}, {"$set": data})
    else:
        await db.system_settings.insert_one({**DEFAULT_SYSTEM_SETTINGS, **data})
    return await db.system_settings.find_one({}, {"_id": 0}) or DEFAULT_SYSTEM_SETTINGS

@api_router.get("/specialties")
async def get_specialties(user=Depends(get_current_user)):
    return SPECIALTIES


# --- Labor Endpoints ---

@api_router.get("/labor")
async def get_labor(user=Depends(get_current_user)):
    items = await db.labor_db.find({}, {"_id": 0}).to_list(100)
    return items

@api_router.post("/labor")
async def create_labor(input: LaborInput, user=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **input.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.labor_db.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/labor/{labor_id}")
async def update_labor(labor_id: str, input: LaborInput, user=Depends(get_current_user)):
    data = input.model_dump()
    result = await db.labor_db.update_one({"id": labor_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tipo de mao de obra nao encontrado")
    return await db.labor_db.find_one({"id": labor_id}, {"_id": 0})

@api_router.delete("/labor/{labor_id}")
async def delete_labor(labor_id: str, user=Depends(get_current_user)):
    r = await db.labor_db.delete_one({"id": labor_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nao encontrado")
    return {"message": "Eliminado"}


# --- Productivity Endpoints ---

@api_router.get("/productivity")
async def get_productivity(user=Depends(get_current_user)):
    items = await db.productivity_db.find({}, {"_id": 0}).to_list(500)
    return items

@api_router.post("/productivity")
async def create_productivity(input: ProductivityInput, user=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **input.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.productivity_db.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/productivity/{prod_id}")
async def update_productivity(prod_id: str, input: ProductivityInput, user=Depends(get_current_user)):
    result = await db.productivity_db.update_one({"id": prod_id}, {"$set": input.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Nao encontrado")
    return await db.productivity_db.find_one({"id": prod_id}, {"_id": 0})

@api_router.delete("/productivity/{prod_id}")
async def delete_productivity(prod_id: str, user=Depends(get_current_user)):
    r = await db.productivity_db.delete_one({"id": prod_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nao encontrado")
    return {"message": "Eliminado"}


# --- Materials DB Endpoints ---

@api_router.get("/materials")
async def get_materials(user=Depends(get_current_user)):
    items = await db.materials_db.find({}, {"_id": 0}).sort("category", 1).to_list(2000)
    return items

@api_router.post("/materials")
async def create_material(input: MaterialInput, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()), **input.model_dump(),
        "price_history": [{"price": input.purchase_price, "date": datetime.now(timezone.utc).isoformat()}],
        "price_updated_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.materials_db.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/materials/{mat_id}")
async def update_material(mat_id: str, input: MaterialInput, user=Depends(get_current_user)):
    old = await db.materials_db.find_one({"id": mat_id}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Material nao encontrado")
    data = input.model_dump()
    # Keep price history
    history = old.get("price_history", [])
    if data["purchase_price"] != old.get("purchase_price", 0):
        history.append({"price": data["purchase_price"], "date": datetime.now(timezone.utc).isoformat()})
        data["price_updated_at"] = datetime.now(timezone.utc).isoformat()
    data["price_history"] = history
    await db.materials_db.update_one({"id": mat_id}, {"$set": data})
    return await db.materials_db.find_one({"id": mat_id}, {"_id": 0})

@api_router.delete("/materials/{mat_id}")
async def delete_material(mat_id: str, user=Depends(get_current_user)):
    r = await db.materials_db.delete_one({"id": mat_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nao encontrado")
    return {"message": "Eliminado"}


# --- Budget Calculation Engine ---

@api_router.post("/calculate-budget")
async def calculate_budget(input: ProBudgetCreate, user=Depends(get_current_user)):
    settings = await db.system_settings.find_one({}, {"_id": 0}) or DEFAULT_SYSTEM_SETTINGS
    labor_list = await db.labor_db.find({}, {"_id": 0}).to_list(100)
    labor_map = {lb["type"]: lb for lb in labor_list}

    iva_rate = settings.get("iva_rate", 23)
    indirect_pcts = settings.get("indirect_costs", {})
    total_indirect_pct = sum(indirect_pcts.values())
    risk_pct = settings.get("risk_levels", {}).get(input.risk_level, 5)
    global_margin = input.global_margin if input.global_margin > 0 else settings.get("target_margin", 30)

    items_calc = []
    specialty_totals = {}
    total_material = 0
    total_labor = 0
    total_hours = 0
    alerts = []

    for item in input.items:
        # Material cost
        mat_cost = item.unit_cost * item.quantity * (1 + item.waste_pct / 100)

        # Labor cost
        labor_info = labor_map.get(item.labor_type, {})
        cost_h = item.labor_cost_hour if item.labor_cost_hour > 0 else labor_info.get("cost_hour", 15)
        sell_h = labor_info.get("sell_hour", 35)
        prod_min = item.productivity_min if item.productivity_min > 0 else 20
        time_hours = (item.quantity * prod_min) / 60
        labor_cost = time_hours * cost_h
        labor_sell = time_hours * sell_h

        # Direct cost
        direct = mat_cost + labor_cost

        # Item margin (use item margin if set, otherwise global)
        item_margin = item.margin if item.margin > 0 else global_margin

        # Indirect costs for this item
        indirect_val = direct * (total_indirect_pct / 100)
        risk_val = (direct + indirect_val) * (risk_pct / 100)
        subtotal = direct + indirect_val + risk_val
        margin_val = subtotal * (item_margin / 100)
        sale_price = subtotal + margin_val

        total_material += mat_cost
        total_labor += labor_cost
        total_hours += time_hours

        # Specialty aggregation
        sp = item.specialty or "instalacoes_eletricas"
        if sp not in specialty_totals:
            specialty_totals[sp] = {"material": 0, "labor": 0, "direct": 0, "sale": 0, "hours": 0}
        specialty_totals[sp]["material"] += mat_cost
        specialty_totals[sp]["labor"] += labor_cost
        specialty_totals[sp]["direct"] += direct
        specialty_totals[sp]["sale"] += sale_price
        specialty_totals[sp]["hours"] += time_hours

        # Alerts per item
        if item.unit_cost == 0:
            alerts.append({"type": "warning", "msg": f"Item '{item.name}' sem preco de material"})
        if item.productivity_min == 0:
            alerts.append({"type": "info", "msg": f"Item '{item.name}' sem produtividade definida"})
        if sale_price < direct:
            alerts.append({"type": "danger", "msg": f"Item '{item.name}' com preco venda abaixo do custo!"})

        items_calc.append({
            "name": item.name, "category": item.category, "specialty": sp,
            "quantity": item.quantity, "unit_cost": item.unit_cost,
            "waste_pct": item.waste_pct, "material_cost": round(mat_cost, 2),
            "labor_type": item.labor_type, "time_hours": round(time_hours, 2),
            "labor_cost": round(labor_cost, 2), "labor_sell": round(labor_sell, 2),
            "direct_cost": round(direct, 2), "indirect_cost": round(indirect_val, 2),
            "risk_cost": round(risk_val, 2), "margin_pct": item_margin,
            "margin_value": round(margin_val, 2), "sale_price": round(sale_price, 2),
            "supply_type": item.supply_type,
        })

    total_direct = total_material + total_labor
    total_indirect_val = total_direct * (total_indirect_pct / 100)
    total_risk_val = (total_direct + total_indirect_val) * (risk_pct / 100)
    subtotal_before_margin = total_direct + total_indirect_val + total_risk_val
    total_margin_val = subtotal_before_margin * (global_margin / 100)
    total_sale = subtotal_before_margin + total_margin_val
    iva_val = total_sale * (iva_rate / 100)

    if global_margin < settings.get("min_margin", 15):
        alerts.append({"type": "danger", "msg": f"Margem global ({global_margin}%) abaixo do minimo ({settings.get('min_margin', 15)}%)"})
    if total_sale < total_direct:
        alerts.append({"type": "danger", "msg": "Preco de venda total abaixo do custo direto!"})
    if risk_pct >= 8 and total_risk_val < total_direct * 0.05:
        alerts.append({"type": "warning", "msg": "Risco alto mas provisao insuficiente"})

    # Specialty name mapping
    sp_names = {s["id"]: s["name"] for s in SPECIALTIES}
    specialty_summary = []
    for sp_id, totals in specialty_totals.items():
        specialty_summary.append({"id": sp_id, "name": sp_names.get(sp_id, sp_id), **{k: round(v, 2) for k, v in totals.items()}})

    return {
        "items": items_calc,
        "summary": {
            "total_material": round(total_material, 2),
            "total_labor": round(total_labor, 2),
            "total_direct": round(total_direct, 2),
            "total_indirect_pct": round(total_indirect_pct, 2),
            "total_indirect": round(total_indirect_val, 2),
            "indirect_breakdown": {k: round(total_direct * v / 100, 2) for k, v in indirect_pcts.items()},
            "risk_level": input.risk_level,
            "risk_pct": risk_pct,
            "total_risk": round(total_risk_val, 2),
            "subtotal_before_margin": round(subtotal_before_margin, 2),
            "margin_pct": global_margin,
            "total_margin": round(total_margin_val, 2),
            "total_sale": round(total_sale, 2),
            "iva_rate": iva_rate,
            "iva_value": round(iva_val, 2),
            "total_with_iva": round(total_sale + iva_val, 2),
            "total_hours": round(total_hours, 2),
            "by_specialty": specialty_summary,
        },
        "alerts": alerts,
    }


# --- Alerts Endpoint ---

@api_router.get("/alerts")
async def get_alerts(user=Depends(get_current_user)):
    alerts = []
    # Check budgets without proposals
    drafts = await db.budgets.count_documents({"status": "rascunho"})
    if drafts > 0:
        alerts.append({"type": "info", "msg": f"{drafts} orcamento(s) em rascunho sem proposta gerada"})
    # Check works over budget
    works = await db.works.find({}, {"_id": 0, "title": 1, "predicted_cost": 1, "real_cost": 1, "status": 1}).to_list(100)
    for w in works:
        if w.get("real_cost", 0) > w.get("predicted_cost", 0) and w.get("predicted_cost", 0) > 0:
            alerts.append({"type": "danger", "msg": f"Obra '{w.get('title', '')}' com custo real acima do previsto"})
    # Check materials without price
    no_price = await db.materials_db.count_documents({"purchase_price": 0, "active": True})
    if no_price > 0:
        alerts.append({"type": "warning", "msg": f"{no_price} material(is) sem preco definido"})
    # Check productivities
    no_prod = await db.productivity_db.count_documents({"time_min": 0})
    if no_prod > 0:
        alerts.append({"type": "warning", "msg": f"{no_prod} item(ns) sem produtividade definida"})
    return alerts


# --- Enhanced Dashboard ---

@api_router.get("/dashboard/financial")
async def get_financial_dashboard(user=Depends(get_current_user)):
    sys_settings = await db.system_settings.find_one({}, {"_id": 0}) or DEFAULT_SYSTEM_SETTINGS
    works = await db.works.find({}, {"_id": 0}).to_list(500)
    budgets = await db.budgets.find({}, {"_id": 0}).to_list(500)
    proposals = await db.proposals.find({}, {"_id": 0}).to_list(500)

    total_predicted = sum(w.get("predicted_cost", 0) for w in works)
    total_real = sum(w.get("real_cost", 0) for w in works)
    total_budget_value = sum(b.get("total_price", 0) for b in budgets)
    total_proposals_value = sum(p.get("final_value", 0) for p in proposals)

    materials_count = await db.materials_db.count_documents({"active": True})
    labor_count = await db.labor_db.count_documents({})
    productivity_count = await db.productivity_db.count_documents({})

    return {
        "settings": sys_settings,
        "totals": {
            "obras": len(works),
            "orcamentos": len(budgets),
            "propostas": len(proposals),
            "predicted_revenue": round(total_predicted, 2),
            "real_cost": round(total_real, 2),
            "estimated_profit": round(total_predicted - total_real, 2),
            "margin_pct": round(((total_predicted - total_real) / total_predicted * 100) if total_predicted > 0 else 0, 1),
            "total_budget_value": round(total_budget_value, 2),
            "total_proposals_value": round(total_proposals_value, 2),
        },
        "database": {
            "materials": materials_count,
            "labor_types": labor_count,
            "productivities": productivity_count,
        },
    }


# --- Seed Professional Data ---

async def seed_professional_data():
    # Seed labor
    if await db.labor_db.count_documents({}) == 0:
        for labor_item in DEFAULT_LABOR:
            labor_doc = {**labor_item, "created_at": datetime.now(timezone.utc).isoformat()}
            await db.labor_db.insert_one(labor_doc)
        logger.info(f"Labor DB seeded: {len(DEFAULT_LABOR)} types")

    # Seed productivity
    if await db.productivity_db.count_documents({}) == 0:
        for prod in DEFAULT_PRODUCTIVITIES:
            p_doc = {"id": str(uuid.uuid4()), **prod, "notes": "", "created_at": datetime.now(timezone.utc).isoformat()}
            await db.productivity_db.insert_one(p_doc)
        logger.info(f"Productivity DB seeded: {len(DEFAULT_PRODUCTIVITIES)} items")

    # Seed system settings
    if await db.system_settings.count_documents({}) == 0:
        await db.system_settings.insert_one(DEFAULT_SYSTEM_SETTINGS)
        logger.info("System settings seeded")

    # Seed materials from catalog
    if await db.materials_db.count_documents({}) == 0:
        count = 0
        for cat in CATEGORIES_CATALOG:
            for item in cat["items"]:
                doc = {
                    "id": str(uuid.uuid4()), "code": "", "description": item["name"],
                    "category": cat["name"], "subcategory": "", "brand": "", "supplier": "",
                    "unit": item.get("unit", "unidade"), "purchase_price": 0, "market_price": 0,
                    "waste_pct": 5, "notes": "", "active": True,
                    "price_history": [], "price_updated_at": "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.materials_db.insert_one(doc)
                count += 1
        logger.info(f"Materials DB seeded: {count} items from catalog")


# ============================================================
# FASE 2 - NEGOTIATION, HISTORY, USER MANAGEMENT
# ============================================================

# --- Negotiation / Discount Simulation ---

class NegotiationInput(BaseModel):
    budget_id: str = ""
    original_price: float = 0
    discount_type: str = "percentage"  # percentage or value
    discount_value: float = 0
    items: List[ProBudgetItem] = []
    risk_level: str = "medio"
    global_margin: float = 0

@api_router.post("/simulate-negotiation")
async def simulate_negotiation(input: NegotiationInput, user=Depends(get_current_user)):
    settings = await db.system_settings.find_one({}, {"_id": 0}) or DEFAULT_SYSTEM_SETTINGS
    min_margin = settings.get("min_margin", 15)

    # Calculate real cost from items
    labor_list = await db.labor_db.find({}, {"_id": 0}).to_list(100)
    labor_map = {lb["type"]: lb for lb in labor_list}

    indirect_pcts = settings.get("indirect_costs", {})
    total_indirect_pct = sum(indirect_pcts.values())
    risk_pct = settings.get("risk_levels", {}).get(input.risk_level, 5)

    total_cost = 0
    for item in input.items:
        mat_cost = item.unit_cost * item.quantity * (1 + item.waste_pct / 100)
        labor_info = labor_map.get(item.labor_type, {})
        cost_h = item.labor_cost_hour if item.labor_cost_hour > 0 else labor_info.get("cost_hour", 15)
        prod_min = item.productivity_min if item.productivity_min > 0 else 20
        time_hours = (item.quantity * prod_min) / 60
        labor_cost = time_hours * cost_h
        total_cost += mat_cost + labor_cost

    total_indirect = total_cost * (total_indirect_pct / 100)
    total_risk = (total_cost + total_indirect) * (risk_pct / 100)
    break_even = total_cost + total_indirect + total_risk
    min_price = break_even * (1 + min_margin / 100)

    original = input.original_price if input.original_price > 0 else break_even * 1.3

    if input.discount_type == "percentage":
        discount_amount = original * (input.discount_value / 100)
    else:
        discount_amount = input.discount_value

    final_price = original - discount_amount
    final_margin_pct = ((final_price - break_even) / break_even * 100) if break_even > 0 else 0
    profit = final_price - break_even
    max_discount = original - min_price
    max_discount_pct = (max_discount / original * 100) if original > 0 else 0

    alerts = []
    if final_price < break_even:
        alerts.append({"type": "danger", "msg": "PRECO ABAIXO DO CUSTO! A obra tera prejuizo."})
    elif final_margin_pct < min_margin:
        alerts.append({"type": "warning", "msg": f"Margem ({final_margin_pct:.1f}%) abaixo do minimo ({min_margin}%)"})
    if discount_amount > max_discount:
        alerts.append({"type": "danger", "msg": f"Desconto excede o maximo seguro de {formatEuro_py(max_discount)}"})

    return {
        "original_price": round(original, 2),
        "discount_amount": round(discount_amount, 2),
        "discount_pct": round(input.discount_value if input.discount_type == "percentage" else (discount_amount / original * 100) if original > 0 else 0, 2),
        "final_price": round(final_price, 2),
        "break_even": round(break_even, 2),
        "total_cost": round(total_cost, 2),
        "total_indirect": round(total_indirect, 2),
        "total_risk": round(total_risk, 2),
        "profit": round(profit, 2),
        "final_margin_pct": round(final_margin_pct, 1),
        "min_margin": min_margin,
        "min_price": round(min_price, 2),
        "max_discount": round(max_discount, 2),
        "max_discount_pct": round(max_discount_pct, 1),
        "alerts": alerts,
    }

def formatEuro_py(v):
    return f"{v:,.2f} EUR"


# --- Work History & Comparison ---

class WorkHistoryEntry(BaseModel):
    date: str
    description: str
    hours: float = 0
    cost: float = 0

@api_router.post("/works/{work_id}/history")
async def add_work_history(work_id: str, entry: WorkHistoryEntry, user=Depends(get_current_user)):
    work = await db.works.find_one({"id": work_id})
    if not work:
        raise HTTPException(status_code=404, detail="Obra nao encontrada")
    history_entry = {"id": str(uuid.uuid4()), **entry.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.works.update_one({"id": work_id}, {"$push": {"history": history_entry}})
    updated = await db.works.find_one({"id": work_id}, {"_id": 0})
    return updated

@api_router.get("/works/{work_id}/comparison")
async def get_work_comparison(work_id: str, user=Depends(get_current_user)):
    work = await db.works.find_one({"id": work_id}, {"_id": 0})
    if not work:
        raise HTTPException(status_code=404, detail="Obra nao encontrada")
    predicted = work.get("predicted_cost", 0)
    real = work.get("real_cost", 0)
    history = work.get("history", [])
    total_hours = sum(h.get("hours", 0) for h in history)
    total_history_cost = sum(h.get("cost", 0) for h in history)
    margin_predicted = predicted * 0.3 if predicted > 0 else 0
    margin_real = predicted - real if predicted > 0 else 0
    return {
        "work": work,
        "comparison": {
            "predicted_cost": round(predicted, 2),
            "real_cost": round(real, 2),
            "cost_difference": round(predicted - real, 2),
            "cost_deviation_pct": round(((real - predicted) / predicted * 100) if predicted > 0 else 0, 1),
            "margin_predicted": round(margin_predicted, 2),
            "margin_real": round(margin_real, 2),
            "total_hours_logged": round(total_hours, 1),
            "total_cost_logged": round(total_history_cost, 2),
            "history_entries": len(history),
        }
    }

@api_router.get("/works/comparison-all")
async def get_all_works_comparison(user=Depends(get_current_user)):
    works = await db.works.find({}, {"_id": 0}).to_list(500)
    results = []
    for w in works:
        predicted = w.get("predicted_cost", 0)
        real = w.get("real_cost", 0)
        results.append({
            "id": w["id"], "title": w.get("title", ""), "client_name": w.get("client_name", ""),
            "status": w.get("status", ""), "predicted_cost": predicted, "real_cost": real,
            "deviation": round(real - predicted, 2) if predicted > 0 else 0,
            "deviation_pct": round(((real - predicted) / predicted * 100) if predicted > 0 else 0, 1),
            "margin_real_pct": round(((predicted - real) / predicted * 100) if predicted > 0 else 0, 1),
        })
    return results


# --- User Management ---

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "consulta"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None

VALID_ROLES = ["admin", "orcamentista", "comercial", "tecnico", "consulta"]

ROLE_PERMISSIONS = {
    "admin": {"view_costs": True, "view_margins": True, "view_prices": True, "edit_budgets": True, "edit_settings": True, "manage_users": True},
    "orcamentista": {"view_costs": True, "view_margins": True, "view_prices": True, "edit_budgets": True, "edit_settings": False, "manage_users": False},
    "comercial": {"view_costs": False, "view_margins": False, "view_prices": True, "edit_budgets": False, "edit_settings": False, "manage_users": False},
    "tecnico": {"view_costs": False, "view_margins": False, "view_prices": False, "edit_budgets": False, "edit_settings": False, "manage_users": False},
    "consulta": {"view_costs": False, "view_margins": False, "view_prices": True, "edit_budgets": False, "edit_settings": False, "manage_users": False},
}

@api_router.get("/users")
async def get_users(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Sem permissao")
    users = await db.users.find({}, {"password_hash": 0}).to_list(100)
    return [{"id": str(u["_id"]), "email": u["email"], "name": u["name"], "role": u.get("role", "consulta"), "created_at": u.get("created_at", "")} for u in users]

@api_router.post("/users")
async def create_user(input: UserCreate, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Sem permissao")
    if input.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role invalido. Usar: {VALID_ROLES}")
    existing = await db.users.find_one({"email": input.email.lower().strip()})
    if existing:
        raise HTTPException(status_code=400, detail="Email ja existe")
    doc = {
        "email": input.email.lower().strip(),
        "password_hash": hash_password(input.password),
        "name": input.name,
        "role": input.role,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(doc)
    return {"id": str(result.inserted_id), "email": doc["email"], "name": doc["name"], "role": doc["role"]}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, input: UserUpdate, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Sem permissao")
    data = {k: v for k, v in input.model_dump().items() if v is not None}
    if "role" in data and data["role"] not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role invalido. Usar: {VALID_ROLES}")
    result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilizador nao encontrado")
    return {"message": "Atualizado"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Sem permissao")
    if user_id == user.get("id"):
        raise HTTPException(status_code=400, detail="Nao pode eliminar a si proprio")
    result = await db.users.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nao encontrado")
    return {"message": "Eliminado"}

@api_router.get("/roles")
async def get_roles(user=Depends(get_current_user)):
    return {"roles": VALID_ROLES, "permissions": ROLE_PERMISSIONS}


# ============================================================
# FASE 3 - EXCEL, VERSIONING, TEMPLATES, FAVORITES
# ============================================================

# --- Excel Export ---

@api_router.get("/budgets/{budget_id}/export-excel")
async def export_budget_excel(budget_id: str, user=Depends(get_current_user)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    import io

    budget = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    if not budget:
        raise HTTPException(status_code=404, detail="Orcamento nao encontrado")

    wb = Workbook()
    ws = wb.active
    ws.title = "Orcamento"

    # Styles
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="FACC15", end_color="FACC15", fill_type="solid")
    yellow_font = Font(bold=True, color="FACC15", size=12)

    # Title
    ws.merge_cells("A1:G1")
    ws["A1"] = f"Orcamento: {budget['title']}"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = f"Cliente: {budget['client_name']}"
    ws["A3"] = f"Telefone: {budget.get('client_phone', '')}"
    ws["A4"] = f"Data: {datetime.now(timezone.utc).strftime('%d/%m/%Y')}"

    # Headers
    headers = ["Categoria", "Item", "Quantidade", "Custo Unit. (EUR)", "Margem", "Preco Unit. (EUR)", "Total (EUR)"]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=6, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    # Items
    for i, item in enumerate(budget.get("items", []), 7):
        ws.cell(row=i, column=1, value=item.get("category", ""))
        ws.cell(row=i, column=2, value=item.get("name", ""))
        ws.cell(row=i, column=3, value=item.get("quantity", 0))
        ws.cell(row=i, column=4, value=item.get("unit_cost", 0))
        ws.cell(row=i, column=5, value=f"{item.get('margin', 0) * 100:.0f}%")
        pvp = item.get("unit_cost", 0) * (1 + item.get("margin", 0))
        ws.cell(row=i, column=6, value=round(pvp, 2))
        ws.cell(row=i, column=7, value=round(pvp * item.get("quantity", 0), 2))

    # Totals
    last_row = 7 + len(budget.get("items", []))
    ws.cell(row=last_row + 1, column=6, value="TOTAL:").font = Font(bold=True)
    ws.cell(row=last_row + 1, column=7, value=budget.get("total_price", 0)).font = yellow_font

    # Column widths
    for col_widths in [(1, 20), (2, 40), (3, 12), (4, 15), (5, 10), (6, 15), (7, 15)]:
        ws.column_dimensions[chr(64 + col_widths[0])].width = col_widths[1]

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"orcamento_{budget['title'].replace(' ', '_')}.xlsx"
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                           headers={"Content-Disposition": f"attachment; filename={filename}"})


# --- Excel Import ---

@api_router.post("/budgets/import-excel")
async def import_budget_excel(file: UploadFile = File(...), user=Depends(get_current_user)):
    from openpyxl import load_workbook
    import io
    import re

    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Ficheiro deve ser .xlsx ou .xls")

    content = await file.read()
    wb = load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    def try_float(val, default=0):
        if val is None:
            return default
        if isinstance(val, (int, float)):
            return float(val)
        s = str(val).strip().replace(',', '.').replace('€', '').replace('EUR', '').replace('%', '').strip()
        s = re.sub(r'[^\d.]', '', s)
        try:
            return float(s) if s else default
        except (ValueError, TypeError):
            return default

    def is_numeric(val):
        if val is None:
            return False
        if isinstance(val, (int, float)):
            return True
        try:
            float(str(val).strip().replace(',', '.'))
            return True
        except (ValueError, TypeError):
            return False

    # Read all rows into memory for analysis
    all_rows = []
    for row in ws.iter_rows(values_only=True):
        all_rows.append(list(row))

    if not all_rows:
        raise HTTPException(status_code=400, detail="Ficheiro vazio")

    logger.info(f"Excel import: {len(all_rows)} rows, {len(all_rows[0])} cols in '{file.filename}'")
    # Log first 3 rows for debug
    for ri, row in enumerate(all_rows[:3]):
        logger.info(f"  Row {ri}: {row}")

    # STEP 1: Detect header row (must contain clear header keywords, not data)
    UNIT_TOKENS = {'un', 'un.', 'und', 'und.', 'unid', 'uni', 'pc', 'pcs', 'mt', 'm', 'ml',
                   'm2', 'm²', 'm3', 'm³', 'kg', 'g', 'h', 'hr', 'vg', 'gl', 'cj', 'kit',
                   'lt', 'l', 'cx', 'par', 'rolo', 'saco'}

    header_keywords = {
        'code': ['codigo', 'cod.', 'cod', 'ref.', 'referencia', 'artigo', 'code'],
        'category': ['categoria', 'grupo', 'especialidade'],
        'name': ['descricao', 'descrição', 'designacao', 'designação', 'descr', 'denominacao', 'descritivo'],
        'unit': ['unidade', 'un.', 'und.', 'unid.'],
        'quantity': ['quantidade', 'qtd', 'qtd.', 'qty', 'quant.', 'quant'],
        'cost': ['preco', 'preço', 'custo', 'valor unit', 'p.unit', 'p.u.', 'pu', 'unitario', 'unitário', 'unit price'],
        'total': ['total', 'subtotal', 'parcial', 'valor total'],
        'margin': ['margem', 'margin', 'markup'],
    }

    header_map = {}
    header_row_idx = -1

    def cell_str(v):
        return str(v or '').lower().strip()

    for ri, row in enumerate(all_rows[:10]):
        if not row or not any(row):
            continue
        row_str = [cell_str(c) for c in row]
        # Header row MUST have multiple short non-numeric textual cells
        text_cells = [c for c in row_str if c and not is_numeric(c) and len(c) < 40]
        if len(text_cells) < 2:
            continue

        temp_map = {}
        for col_idx, cell_val in enumerate(row_str):
            if not cell_val or len(cell_val) > 40 or is_numeric(cell_val):
                continue
            for field, keywords in header_keywords.items():
                if field in temp_map:
                    continue
                if any(cell_val == kw or cell_val.startswith(kw) for kw in keywords):
                    temp_map[field] = col_idx
                    break

        # Must explicitly find a "name/descricao" keyword and at least one other header
        if 'name' in temp_map and len(temp_map) >= 2:
            header_map = temp_map
            header_row_idx = ri
            break

    logger.info(f"Excel import: header at row {header_row_idx}, map: {header_map}")

    # STEP 2: If no header, auto-detect by analyzing ALL data rows (column statistics)
    data_start = header_row_idx + 1 if header_row_idx >= 0 else 0

    if not header_map:
        max_cols = max((len(r) for r in all_rows), default=0)
        col_stats = []  # per column: {numeric, text, unit_match, avg_len, total}
        for ci in range(max_cols):
            stats = {'numeric': 0, 'text': 0, 'unit': 0, 'avg_len': 0, 'total': 0, 'int_small': 0}
            lens = []
            for row in all_rows[data_start:]:
                if ci >= len(row):
                    continue
                v = row[ci]
                if v is None or (isinstance(v, str) and not v.strip()):
                    continue
                stats['total'] += 1
                if isinstance(v, (int, float)):
                    stats['numeric'] += 1
                    if float(v) == int(v) and 0 < float(v) <= 9999:
                        stats['int_small'] += 1
                elif isinstance(v, str):
                    s = v.strip()
                    if is_numeric(s):
                        stats['numeric'] += 1
                    else:
                        stats['text'] += 1
                        lens.append(len(s))
                        if s.lower() in UNIT_TOKENS:
                            stats['unit'] += 1
            if lens:
                stats['avg_len'] = sum(lens) / len(lens)
            col_stats.append(stats)

        logger.info(f"Excel import: col_stats={col_stats}")

        # Unit column = column where most text values are unit tokens
        unit_col = None
        best_unit_ratio = 0
        for ci, s in enumerate(col_stats):
            if s['text'] > 0 and s['unit'] / s['text'] >= 0.5:
                ratio = s['unit'] / max(s['total'], 1)
                if ratio > best_unit_ratio:
                    best_unit_ratio = ratio
                    unit_col = ci

        # Name column = non-numeric column with largest avg text length (exclude unit col)
        name_col = None
        best_len = 0
        for ci, s in enumerate(col_stats):
            if ci == unit_col:
                continue
            if s['avg_len'] > best_len and s['text'] >= s['numeric'] and s['avg_len'] > 10:
                best_len = s['avg_len']
                name_col = ci

        # Quantity column = first numeric column after the name col (or after unit col)
        anchor = unit_col if unit_col is not None else name_col
        qty_col = None
        if anchor is not None:
            for ci in range(anchor + 1, len(col_stats)):
                s = col_stats[ci]
                if s['numeric'] > 0 and s['numeric'] >= s['text']:
                    qty_col = ci
                    break
        if qty_col is None:
            # Fallback: any numeric column
            for ci, s in enumerate(col_stats):
                if ci in (name_col,) or ci == unit_col:
                    continue
                if s['numeric'] > 0:
                    qty_col = ci
                    break

        # Cost column = next numeric column after quantity
        cost_col = None
        if qty_col is not None:
            for ci in range(qty_col + 1, len(col_stats)):
                s = col_stats[ci]
                if s['numeric'] > 0:
                    cost_col = ci
                    break

        if name_col is not None:
            header_map['name'] = name_col
        if unit_col is not None:
            header_map['unit'] = unit_col
        if qty_col is not None:
            header_map['quantity'] = qty_col
        if cost_col is not None:
            header_map['cost'] = cost_col

        logger.info(f"Excel import: auto-detected map: {header_map} (unit_col={unit_col}, name_col={name_col}, qty_col={qty_col}, cost_col={cost_col})")

    # STEP 3: Extract items
    items = []
    name_idx = header_map.get('name')
    code_idx = header_map.get('code')
    cat_idx = header_map.get('category')
    unit_idx = header_map.get('unit')
    qty_idx = header_map.get('quantity')
    cost_idx = header_map.get('cost')
    margin_idx = header_map.get('margin')

    for row in all_rows[data_start:]:
        if not row or not any(row):
            continue
        cells = list(row)

        # Get name
        name = ''
        if name_idx is not None and name_idx < len(cells) and cells[name_idx]:
            name = str(cells[name_idx]).strip()
        if not name and code_idx is not None and code_idx < len(cells) and cells[code_idx]:
            name = str(cells[code_idx]).strip()
        if not name:
            # Fallback: longest text cell in row, excluding unit tokens
            longest = ''
            for cv in cells:
                if cv and isinstance(cv, str):
                    s = cv.strip()
                    if len(s) > len(longest) and s.lower() not in UNIT_TOKENS and not is_numeric(s):
                        longest = s
            name = longest
        if not name or len(name) < 2:
            continue

        # Get unit
        unit = ''
        if unit_idx is not None and unit_idx < len(cells) and cells[unit_idx]:
            unit = str(cells[unit_idx]).strip()

        # Get quantity
        qty = 1
        if qty_idx is not None and qty_idx < len(cells):
            qty = try_float(cells[qty_idx], 1)
        if qty <= 0:
            qty = 1

        # Get cost
        cost = 0
        if cost_idx is not None and cost_idx < len(cells):
            cost = try_float(cells[cost_idx], 0)

        # Get category
        category = ''
        if cat_idx is not None and cat_idx < len(cells) and cells[cat_idx]:
            val = cells[cat_idx]
            if isinstance(val, str) and not is_numeric(val):
                category = val.strip()

        # Get margin
        margin = 0.6
        if margin_idx is not None and margin_idx < len(cells):
            m = try_float(cells[margin_idx], 0)
            margin = m / 100 if m > 1 else (m if m > 0 else 0.6)

        items.append({"category": category, "name": name, "unit": unit, "quantity": qty, "unit_cost": cost, "margin": margin, "discount_type": "percentage", "discount_value": 0})
        logger.info(f"  Item: '{name}' qty={qty} cost={cost}")

    if not items:
        raise HTTPException(status_code=400, detail="Nenhum item encontrado. Verifique que o Excel tem colunas com descricao e quantidade.")

    total_cost, total_price = calc_budget_totals(items, "percentage", 0)

    doc = {
        "id": str(uuid.uuid4()),
        "title": f"Importado: {file.filename}",
        "client_name": "A definir",
        "client_phone": "",
        "items": items,
        "discount_type": "percentage",
        "discount_value": 0,
        "payment_methods": [],
        "payment_split": "",
        "payment_notes": "",
        "total_cost": total_cost,
        "total_price": total_price,
        "status": "rascunho",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
    }
    await db.budgets.insert_one(doc)
    doc.pop("_id", None)
    logger.info(f"Excel imported: {len(items)} items, header_map={header_map}")
    return doc


# --- Budget Versioning ---

@api_router.post("/budgets/{budget_id}/save-version")
async def save_budget_version(budget_id: str, user=Depends(get_current_user)):
    budget = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    if not budget:
        raise HTTPException(status_code=404, detail="Orcamento nao encontrado")

    versions = await db.budget_versions.find({"budget_id": budget_id}).to_list(100)
    version_num = len(versions) + 1

    version_doc = {
        "id": str(uuid.uuid4()),
        "budget_id": budget_id,
        "version": version_num,
        "snapshot": budget,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
    }
    await db.budget_versions.insert_one(version_doc)
    version_doc.pop("_id", None)
    return version_doc

@api_router.get("/budgets/{budget_id}/versions")
async def get_budget_versions(budget_id: str, user=Depends(get_current_user)):
    versions = await db.budget_versions.find({"budget_id": budget_id}, {"_id": 0}).sort("version", -1).to_list(100)
    return versions

@api_router.get("/budgets/{budget_id}/versions/{version_id}")
async def get_budget_version(budget_id: str, version_id: str, user=Depends(get_current_user)):
    version = await db.budget_versions.find_one({"id": version_id, "budget_id": budget_id}, {"_id": 0})
    if not version:
        raise HTTPException(status_code=404, detail="Versao nao encontrada")
    return version

@api_router.post("/budgets/{budget_id}/duplicate")
async def duplicate_budget(budget_id: str, user=Depends(get_current_user)):
    budget = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    if not budget:
        raise HTTPException(status_code=404, detail="Orcamento nao encontrado")

    new_doc = {**budget}
    new_doc["id"] = str(uuid.uuid4())
    new_doc["title"] = f"{budget['title']} (copia)"
    new_doc["status"] = "rascunho"
    new_doc["created_at"] = datetime.now(timezone.utc).isoformat()
    new_doc["created_by"] = user["id"]
    await db.budgets.insert_one(new_doc)
    new_doc.pop("_id", None)
    return new_doc


# --- Text Templates ---

class TextTemplateInput(BaseModel):
    name: str
    category: str = "geral"
    content: str = ""

@api_router.get("/text-templates")
async def get_text_templates(user=Depends(get_current_user)):
    templates = await db.text_templates.find({}, {"_id": 0}).to_list(200)
    if not templates:
        defaults = [
            {"id": str(uuid.uuid4()), "name": "Objeto da Empreitada", "category": "proposta", "content": "Fornecimento, montagem, instalacao e ensaio de todas as instalacoes eletricas e de telecomunicacoes, conforme mapa de quantidades anexo."},
            {"id": str(uuid.uuid4()), "name": "Exclusao Fornecimento Dono Obra", "category": "exclusoes", "content": "Exclui-se do presente valor o fornecimento dos materiais/equipamentos a definir pelo Dono de Obra, mantendo-se incluidos, quando aplicavel, os respetivos trabalhos de instalacao, ligacao e ensaio."},
            {"id": str(uuid.uuid4()), "name": "Exclusao Geral", "category": "exclusoes", "content": "Excluem-se trabalhos de construcao civil, pintura, reposicao de pavimentos e quaisquer outros trabalhos nao mencionados no mapa de quantidades."},
            {"id": str(uuid.uuid4()), "name": "Prazo Standard", "category": "prazo", "content": "O prazo de execucao estimado e de [X] dias uteis, contados a partir da data de adjudicacao e disponibilizacao dos espacos para intervencao."},
            {"id": str(uuid.uuid4()), "name": "Garantia Standard", "category": "garantia", "content": "Garantia de [X] anos sobre a mao de obra e de acordo com a garantia do fabricante para os materiais fornecidos."},
            {"id": str(uuid.uuid4()), "name": "Observacoes Tecnicas", "category": "tecnico", "content": "Todos os trabalhos serao executados por tecnicos certificados, de acordo com as normas RTIEBT e regulamentos em vigor. Sera emitido certificado de conformidade no final da obra."},
            {"id": str(uuid.uuid4()), "name": "Condicoes ITED", "category": "tecnico", "content": "As instalacoes ITED serao executadas por instaladores certificados ANACOM, com emissao de ficha tecnica e certificacao obrigatoria."},
            {"id": str(uuid.uuid4()), "name": "Condicoes CCTV", "category": "tecnico", "content": "O sistema de videovigilancia sera instalado em conformidade com a legislacao vigente (Lei 34/2013). A configuracao e registo junto da CNPD e responsabilidade do cliente."},
        ]
        for t in defaults:
            t["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.text_templates.insert_one(t)
        return [{k: v for k, v in t.items() if k != "_id"} for t in defaults]
    return templates

@api_router.post("/text-templates")
async def create_text_template(input: TextTemplateInput, user=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **input.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.text_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/text-templates/{template_id}")
async def update_text_template(template_id: str, input: TextTemplateInput, user=Depends(get_current_user)):
    result = await db.text_templates.update_one({"id": template_id}, {"$set": input.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template nao encontrado")
    return await db.text_templates.find_one({"id": template_id}, {"_id": 0})

@api_router.delete("/text-templates/{template_id}")
async def delete_text_template(template_id: str, user=Depends(get_current_user)):
    r = await db.text_templates.delete_one({"id": template_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nao encontrado")
    return {"message": "Eliminado"}


# --- Favorite Items ---

@api_router.get("/favorites")
async def get_favorites(user=Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    return favs

@api_router.post("/favorites")
async def add_favorite(item: BudgetItemModel, user=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **item.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.favorites.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/favorites/{fav_id}")
async def remove_favorite(fav_id: str, user=Depends(get_current_user)):
    r = await db.favorites.delete_one({"id": fav_id, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nao encontrado")
    return {"message": "Removido"}

async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@obelisco.pt")
    admin_password = os.environ.get("ADMIN_PASSWORD", "obelisco2024")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin criado: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info("Password do admin atualizada")
    await db.users.create_index("email", unique=True)

@app.on_event("startup")
async def startup():
    await seed_admin()
    await seed_professional_data()
    logger.info("Obelisco Manager API iniciada")

app.include_router(api_router)

# Payroll module
from payroll import create_payroll_router
app.include_router(create_payroll_router(db, get_current_user))

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    client.close()
