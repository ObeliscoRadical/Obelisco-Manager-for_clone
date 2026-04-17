from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
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
    quantity: float = 1
    unit_cost: float = 0
    margin: float = 0.6

class BudgetCreate(BaseModel):
    title: str
    client_name: str
    client_phone: str = ""
    items: List[BudgetItemModel] = []

class BudgetUpdate(BaseModel):
    title: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    items: Optional[List[BudgetItemModel]] = None
    status: Optional[str] = None

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

def calc_budget_totals(items):
    total_cost = sum(i.get("unit_cost", 0) * i.get("quantity", 0) for i in items)
    total_price = sum(i.get("unit_cost", 0) * (1 + i.get("margin", 0)) * i.get("quantity", 0) for i in items)
    return round(total_cost, 2), round(total_price, 2)

@api_router.get("/budgets")
async def get_budgets(user=Depends(get_current_user)):
    budgets = await db.budgets.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return budgets

@api_router.post("/budgets")
async def create_budget(input: BudgetCreate, user=Depends(get_current_user)):
    items = [item.model_dump() for item in input.items]
    total_cost, total_price = calc_budget_totals(items)
    doc = {
        "id": str(uuid.uuid4()),
        "title": input.title,
        "client_name": input.client_name,
        "client_phone": input.client_phone,
        "items": items,
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
        total_cost, total_price = calc_budget_totals(update_data["items"])
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
        {"tier": "basico", "label": "Basico", "multiplier": 1.0, "description": "Servico padrao com materiais standard. Garantia de 1 ano."},
        {"tier": "profissional", "label": "Profissional", "multiplier": 1.15, "description": "Materiais premium, garantia estendida de 2 anos, suporte prioritario."},
        {"tier": "premium", "label": "Premium", "multiplier": 1.30, "description": "Materiais top de gama, garantia de 5 anos, execucao prioritaria, suporte 24/7."},
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
    "warranty_text": "Garantia conforme a proposta selecionada",
    "conditions": [
        "Valores em EUR com IVA incluido",
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
    return CATEGORIES_CATALOG


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
    logger.info("Obelisco Manager API iniciada")

app.include_router(api_router)

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
