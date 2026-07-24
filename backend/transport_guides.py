"""
Módulo Guias de Transporte (Transport Guides) - Obelisco Manager.

Fluxo:
  1. Gestor cria guia (a partir de Obra ou manual) com lista de materiais e atribui a um técnico.
  2. Ao "emitir" → decrementa stock do armazém + status passa a "emitida".
  3. Técnico faz login na app móvel (tech-app-obelisco), vê as suas guias e confirma receção:
     - qty_received por linha (pode diferir do planeado)
     - damaged_qty + notes por linha
     - fotos da entrega
     - assinatura digital
  4. Se qty_received < qty_planned → diferença é registada como movimento de stock tipo "perda".
  5. Histórico de alterações registado.

Auth:
  - Admin/gestor: usa JWT normal (get_current_user passado pelo server.py)
  - Técnico: JWT específico com type="tech", validado contra db.employees.password_hash
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Optional, Callable
from datetime import datetime, timezone, timedelta
import os
import uuid
import logging
import bcrypt
import jwt
import re

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
TECH_TOKEN_TTL_HOURS = 12


def _get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _create_tech_token(employee_id: str, email: str) -> str:
    payload = {
        "sub": employee_id,
        "email": email,
        "type": "tech",
        "exp": datetime.now(timezone.utc) + timedelta(hours=TECH_TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, _get_jwt_secret(), algorithm=JWT_ALGORITHM)


# ----- Models -----

class SetEmployeePassword(BaseModel):
    password: str


class TechLogin(BaseModel):
    email: str
    password: str


class GuideItem(BaseModel):
    id: Optional[str] = None
    material_id: Optional[str] = None
    name: str
    unit: str = "un"
    category: str = ""
    qty_planned: float = 0
    qty_received: Optional[float] = None
    damaged_qty: float = 0
    qty_used: float = 0
    notes: str = ""


class GuideUsageItem(BaseModel):
    """Item parcial enviado quando técnico actualiza consumo."""
    id: str
    qty_used: float
    notes: Optional[str] = None


class GuideUsageUpdate(BaseModel):
    items: List[GuideUsageItem]
    note: Optional[str] = ""  # nota geral sobre esta atualização (ex: "fim do dia 3/abr")


class GuideReturnInput(BaseModel):
    item_ids: Optional[List[str]] = None  # None = todos os items com sobra > 0
    note: Optional[str] = ""


class GuideCreate(BaseModel):
    work_id: Optional[str] = None
    origin: str = "Armazém Obelisco"
    destination: str = ""
    notes: str = ""
    assigned_employee_id: Optional[str] = None
    items: List[GuideItem] = []
    expected_delivery_date: Optional[str] = None


class GuideUpdate(BaseModel):
    origin: Optional[str] = None
    destination: Optional[str] = None
    notes: Optional[str] = None
    assigned_employee_id: Optional[str] = None
    items: Optional[List[GuideItem]] = None
    expected_delivery_date: Optional[str] = None


class GuideReceive(BaseModel):
    items: List[GuideItem]
    photos: List[str] = []        # base64 strings
    signature_data: str = ""      # base64 of canvas
    signed_by_name: str = ""
    reception_notes: str = ""


def create_transport_guides_router(db, get_current_user: Callable):
    router = APIRouter(prefix="/api", tags=["transport-guides"])

    # ============================================================
    # AUTH para TÉCNICO (employee login)
    # ============================================================

    async def _get_current_tech(request: Request):
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Não autenticado")
        try:
            payload = jwt.decode(token, _get_jwt_secret(), algorithms=[JWT_ALGORITHM])
            ttype = payload.get("type")
            if ttype == "tech":
                emp = await db.employees.find_one({"id": payload["sub"]}, {"_id": 0})
                if not emp or not emp.get("active", True):
                    raise HTTPException(status_code=401, detail="Funcionário inativo ou inexistente")
                emp.pop("password_hash", None)
                emp["_is_admin"] = False
                return emp
            elif ttype == "access":
                # Admin em modo supervisor
                from bson import ObjectId as _OID
                u = await db.users.find_one({"_id": _OID(payload["sub"])})
                if not u or u.get("role") != "admin":
                    raise HTTPException(status_code=403, detail="Sem permissão")
                return {"id": str(u["_id"]), "name": u.get("name"), "email": u.get("email"), "role": u.get("role"), "_is_admin": True, "active": True}
            raise HTTPException(status_code=401, detail="Token inválido")
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    @router.post("/employees/{employee_id}/set-password")
    async def set_employee_password(employee_id: str, input: SetEmployeePassword, user=Depends(get_current_user)):
        """Admin define password para o técnico/funcionário poder fazer login na app móvel."""
        if user.get("role") not in ("admin", "orcamentista"):
            raise HTTPException(status_code=403, detail="Sem permissão")
        if not input.password or len(input.password) < 4:
            raise HTTPException(status_code=400, detail="Password deve ter pelo menos 4 caracteres")
        emp = await db.employees.find_one({"id": employee_id})
        if not emp:
            raise HTTPException(status_code=404, detail="Funcionário não encontrado")
        if not emp.get("email"):
            raise HTTPException(status_code=400, detail="Funcionário precisa de email definido na ficha")
        await db.employees.update_one(
            {"id": employee_id},
            {"$set": {"password_hash": _hash_password(input.password), "password_updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True, "email": emp["email"]}

    @router.post("/tech/auth/login")
    async def tech_login(input: TechLogin):
        email = (input.email or "").lower().strip()
        if not email or not input.password:
            raise HTTPException(status_code=400, detail="Email e password obrigatórios")
        emp = await db.employees.find_one({"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}})
        if not emp or not emp.get("password_hash"):
            raise HTTPException(status_code=401, detail="Credenciais inválidas")
        if not emp.get("active", True):
            raise HTTPException(status_code=403, detail="Conta inativa. Contacta o teu gestor.")
        if not _verify_password(input.password, emp["password_hash"]):
            raise HTTPException(status_code=401, detail="Credenciais inválidas")
        token = _create_tech_token(emp["id"], emp["email"])
        return {
            "access_token": token,
            "token_type": "bearer",
            "employee": {"id": emp["id"], "name": emp.get("name", ""), "email": emp.get("email", ""), "role": emp.get("role", "")},
        }

    @router.get("/tech/auth/me")
    async def tech_me(tech=Depends(_get_current_tech)):
        return tech

    # ============================================================
    # HELPERS internos
    # ============================================================

    async def _next_guide_number() -> str:
        now = datetime.now(timezone.utc)
        prefix = f"GT {now.year}/"
        # find last number for this year
        last = await db.transport_guides.find(
            {"number": {"$regex": f"^{re.escape(prefix)}"}}, {"_id": 0, "number": 1}
        ).sort("number", -1).limit(1).to_list(1)
        next_n = 1
        if last:
            try:
                next_n = int(last[0]["number"].split("/")[1]) + 1
            except Exception:
                next_n = 1
        return f"{prefix}{next_n:04d}"

    async def _resolve_employee(emp_id: Optional[str]):
        if not emp_id:
            return None
        emp = await db.employees.find_one({"id": emp_id}, {"_id": 0, "name": 1, "id": 1, "email": 1})
        return emp

    async def _resolve_work(work_id: Optional[str]):
        if not work_id:
            return None
        w = await db.works.find_one({"id": work_id}, {"_id": 0, "id": 1, "title": 1, "client_name": 1, "budget_id": 1})
        return w

    async def _push_history(guide_id: str, action: str, by: str, payload: dict = None):
        await db.transport_guides.update_one(
            {"id": guide_id},
            {"$push": {"history": {
                "at": datetime.now(timezone.utc).isoformat(),
                "action": action,
                "by": by,
                "payload": payload or {},
            }}},
        )

    # ============================================================
    # ADMIN endpoints (CRUD)
    # ============================================================

    @router.get("/transport-guides")
    async def list_guides(status: Optional[str] = None, work_id: Optional[str] = None, employee_id: Optional[str] = None, user=Depends(get_current_user)):
        q = {}
        if status:
            q["status"] = status
        if work_id:
            q["work_id"] = work_id
        if employee_id:
            q["assigned_employee_id"] = employee_id
        guides = await db.transport_guides.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return guides

    @router.post("/transport-guides")
    async def create_guide(input: GuideCreate, user=Depends(get_current_user)):
        if not input.items:
            raise HTTPException(status_code=400, detail="A guia precisa de pelo menos 1 item")
        work = await _resolve_work(input.work_id) if input.work_id else None
        emp = await _resolve_employee(input.assigned_employee_id) if input.assigned_employee_id else None
        number = await _next_guide_number()
        guide = {
            "id": str(uuid.uuid4()),
            "number": number,
            "status": "rascunho",
            "work_id": input.work_id or "",
            "obra_name": (work or {}).get("title", ""),
            "client_name": (work or {}).get("client_name", ""),
            "budget_id": (work or {}).get("budget_id", ""),
            "assigned_employee_id": input.assigned_employee_id or "",
            "assigned_employee_name": (emp or {}).get("name", ""),
            "assigned_employee_email": (emp or {}).get("email", ""),
            "origin": input.origin or "Armazém Obelisco",
            "destination": input.destination or "",
            "expected_delivery_date": input.expected_delivery_date or "",
            "notes": input.notes or "",
            "items": [
                {
                    "id": str(uuid.uuid4()),
                    "material_id": it.material_id,
                    "name": it.name,
                    "unit": it.unit or "un",
                    "category": it.category or "",
                    "qty_planned": float(it.qty_planned or 0),
                    "qty_received": None,
                    "damaged_qty": float(it.damaged_qty or 0),
                    "qty_used": 0.0,
                    "qty_returned": 0.0,
                    "notes": it.notes or "",
                }
                for it in input.items
            ],
            "reception": None,
            "history": [{
                "at": datetime.now(timezone.utc).isoformat(),
                "action": "created",
                "by": user.get("name") or user.get("email", ""),
                "payload": {"items_count": len(input.items)},
            }],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("id", ""),
            "emitted_at": None,
            "received_at": None,
        }
        await db.transport_guides.insert_one(guide)
        guide.pop("_id", None)
        return guide

    @router.get("/transport-guides/{guide_id}")
    async def get_guide(guide_id: str, user=Depends(get_current_user)):
        g = await db.transport_guides.find_one({"id": guide_id}, {"_id": 0})
        if not g:
            raise HTTPException(status_code=404, detail="Guia não encontrada")
        return g

    @router.put("/transport-guides/{guide_id}")
    async def update_guide(guide_id: str, input: GuideUpdate, user=Depends(get_current_user)):
        g = await db.transport_guides.find_one({"id": guide_id}, {"_id": 0})
        if not g:
            raise HTTPException(status_code=404, detail="Guia não encontrada")
        if g.get("status") in ("recebida", "recebida_com_diferencas"):
            raise HTTPException(status_code=400, detail="Guia já recebida não pode ser editada")
        data = {k: v for k, v in input.model_dump().items() if v is not None}
        if "assigned_employee_id" in data:
            emp = await _resolve_employee(data["assigned_employee_id"])
            data["assigned_employee_name"] = (emp or {}).get("name", "")
            data["assigned_employee_email"] = (emp or {}).get("email", "")
        if "items" in data:
            # garante ids estáveis
            existing_by_id = {it.get("id"): it for it in g.get("items", []) if it.get("id")}
            new_items = []
            for it in data["items"]:
                it = dict(it)
                if not it.get("id") or it["id"] not in existing_by_id:
                    it["id"] = str(uuid.uuid4())
                it["qty_planned"] = float(it.get("qty_planned") or 0)
                if it.get("qty_received") is not None:
                    it["qty_received"] = float(it["qty_received"])
                it["damaged_qty"] = float(it.get("damaged_qty") or 0)
                new_items.append(it)
            data["items"] = new_items
        await db.transport_guides.update_one({"id": guide_id}, {"$set": data})
        await _push_history(guide_id, "updated", user.get("name") or user.get("email", ""), {"fields": list(data.keys())})
        return await db.transport_guides.find_one({"id": guide_id}, {"_id": 0})

    @router.delete("/transport-guides/{guide_id}")
    async def delete_guide(guide_id: str, user=Depends(get_current_user)):
        g = await db.transport_guides.find_one({"id": guide_id})
        if not g:
            raise HTTPException(status_code=404, detail="Guia não encontrada")
        if g.get("status") in ("emitida", "em_transito", "recebida", "recebida_com_diferencas"):
            raise HTTPException(status_code=400, detail="Não é possível eliminar uma guia já emitida ou recebida")
        await db.transport_guides.delete_one({"id": guide_id})
        return {"ok": True}

    @router.post("/transport-guides/{guide_id}/emit")
    async def emit_guide(guide_id: str, user=Depends(get_current_user)):
        """Emite a guia: decrementa stock dos materiais (saída) e muda status."""
        g = await db.transport_guides.find_one({"id": guide_id}, {"_id": 0})
        if not g:
            raise HTTPException(status_code=404, detail="Guia não encontrada")
        if g.get("status") != "rascunho":
            raise HTTPException(status_code=400, detail=f"Guia em status '{g.get('status')}' não pode ser emitida")
        if not g.get("assigned_employee_id"):
            raise HTTPException(status_code=400, detail="Atribua um técnico antes de emitir")

        moves = []
        for it in g.get("items", []):
            mat_id = it.get("material_id")
            qty = float(it.get("qty_planned") or 0)
            if mat_id and qty > 0:
                mat = await db.materials_db.find_one({"id": mat_id}, {"_id": 0})
                if mat:
                    new_stock = float(mat.get("stock_current", 0) or 0) - qty
                    await db.materials_db.update_one({"id": mat_id}, {"$set": {"stock_current": new_stock}})
                    mov = {
                        "id": str(uuid.uuid4()),
                        "material_id": mat_id,
                        "material_name": mat.get("description") or mat.get("name") or it.get("name"),
                        "type": "saida",
                        "quantity": qty,
                        "balance_after": new_stock,
                        "reason": f"Guia de Transporte {g.get('number')}",
                        "guide_id": guide_id,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "created_by": user.get("id", ""),
                    }
                    await db.stock_movements.insert_one(mov)
                    moves.append(mov["id"])

        await db.transport_guides.update_one(
            {"id": guide_id},
            {"$set": {
                "status": "emitida",
                "emitted_at": datetime.now(timezone.utc).isoformat(),
                "emitted_by": user.get("name") or user.get("email", ""),
                "stock_movements_emit": moves,
            }},
        )
        await _push_history(guide_id, "emitted", user.get("name") or user.get("email", ""), {"stock_movements": len(moves)})
        return await db.transport_guides.find_one({"id": guide_id}, {"_id": 0})

    # ============================================================
    # TECH endpoints (mobile)
    # ============================================================

    @router.get("/tech/transport-guides")
    async def tech_list_my_guides(tech=Depends(_get_current_tech)):
        """Lista guias atribuídas ao técnico autenticado (não rascunho). Admin vê TODAS."""
        base_q = {"status": {"$in": ["emitida", "em_transito", "recebida", "recebida_com_diferencas"]}}
        if tech.get("_is_admin"):
            q = base_q
        else:
            q = {**base_q, "assigned_employee_id": tech["id"]}
        guides = await db.transport_guides.find(q, {"_id": 0}).sort("emitted_at", -1).to_list(500)
        return guides

    @router.get("/tech/transport-guides/{guide_id}")
    async def tech_get_guide(guide_id: str, tech=Depends(_get_current_tech)):
        g = await db.transport_guides.find_one({"id": guide_id, "assigned_employee_id": tech["id"]}, {"_id": 0})
        if not g:
            raise HTTPException(status_code=404, detail="Guia não encontrada ou não atribuída a si")
        return g

    @router.post("/tech/transport-guides/{guide_id}/receive")
    async def tech_receive_guide(guide_id: str, input: GuideReceive, tech=Depends(_get_current_tech)):
        g = await db.transport_guides.find_one({"id": guide_id, "assigned_employee_id": tech["id"]}, {"_id": 0})
        if not g:
            raise HTTPException(status_code=404, detail="Guia não encontrada ou não atribuída a si")
        if g.get("status") in ("recebida", "recebida_com_diferencas"):
            raise HTTPException(status_code=400, detail="Guia já foi recebida")
        if g.get("status") not in ("emitida", "em_transito"):
            raise HTTPException(status_code=400, detail=f"Guia em status '{g.get('status')}' não pode ser recebida")

        # map de items planeados por id ou por nome
        planned_by_id = {it["id"]: it for it in g.get("items", [])}
        has_differences = False
        updated_items = []
        loss_movements = []

        for inc in input.items:
            inc_d = inc.model_dump()
            # encontrar item original
            base = None
            inc_id = getattr(inc, "material_id", None) or inc_d.get("material_id")
            # tenta match por id de item (do guide) que vem no campo material_id (legacy) OR procura por nome
            for orig_id, orig in planned_by_id.items():
                if inc_d.get("id") == orig_id or (inc_d.get("name") == orig.get("name") and inc_id == orig.get("material_id")):
                    base = orig
                    break
            if not base:
                # fallback by name
                for orig in g.get("items", []):
                    if orig.get("name") == inc_d.get("name"):
                        base = orig
                        break
            if not base:
                continue
            qty_planned = float(base.get("qty_planned") or 0)
            qty_received = float(inc_d.get("qty_received") if inc_d.get("qty_received") is not None else qty_planned)
            damaged = float(inc_d.get("damaged_qty") or 0)
            if qty_received < qty_planned or damaged > 0:
                has_differences = True
            new_it = {
                **base,
                "qty_received": qty_received,
                "damaged_qty": damaged,
                "qty_used": float(inc_d.get("qty_used") or base.get("qty_used") or 0),
                "qty_returned": float(base.get("qty_returned") or 0),
                "notes": inc_d.get("notes") or base.get("notes", ""),
            }
            updated_items.append(new_it)

            # Stock loss movement se chegou menos
            shortfall = qty_planned - qty_received
            if base.get("material_id") and shortfall > 0:
                mat = await db.materials_db.find_one({"id": base["material_id"]}, {"_id": 0})
                if mat:
                    mov = {
                        "id": str(uuid.uuid4()),
                        "material_id": base["material_id"],
                        "material_name": mat.get("description") or mat.get("name") or base.get("name"),
                        "type": "perda",
                        "quantity": shortfall,
                        "balance_after": float(mat.get("stock_current", 0) or 0),
                        "reason": f"Diferença na receção da Guia {g.get('number')}",
                        "guide_id": guide_id,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "created_by": tech.get("id", ""),
                    }
                    await db.stock_movements.insert_one(mov)
                    loss_movements.append(mov["id"])

        # preserva items que não vieram na receção (raro mas safe)
        seen_ids = {it["id"] for it in updated_items}
        for orig in g.get("items", []):
            if orig["id"] not in seen_ids:
                updated_items.append(orig)

        reception = {
            "received_at": datetime.now(timezone.utc).isoformat(),
            "received_by_id": tech["id"],
            "received_by_name": tech.get("name", ""),
            "signed_by_name": input.signed_by_name or tech.get("name", ""),
            "signature_data": input.signature_data or "",
            "photos": input.photos or [],
            "notes": input.reception_notes or "",
            "stock_movements_loss": loss_movements,
        }
        new_status = "recebida_com_diferencas" if has_differences else "recebida"

        await db.transport_guides.update_one(
            {"id": guide_id},
            {"$set": {
                "items": updated_items,
                "reception": reception,
                "status": new_status,
                "received_at": reception["received_at"],
            }},
        )
        await _push_history(
            guide_id,
            "received_with_differences" if has_differences else "received",
            tech.get("name", ""),
            {"loss_movements": len(loss_movements), "photos": len(reception["photos"])},
        )
        return await db.transport_guides.find_one({"id": guide_id, "assigned_employee_id": tech["id"]}, {"_id": 0})

    # ============================================================
    # USAGE updates (tech + admin) — quantidade utilizada na obra
    # ============================================================

    async def _apply_usage_update(guide_id: str, items_update: List[GuideUsageItem], actor_name: str, actor_id: str, note: str):
        g = await db.transport_guides.find_one({"id": guide_id}, {"_id": 0})
        if not g:
            raise HTTPException(status_code=404, detail="Guia não encontrada")
        if g.get("status") not in ("recebida", "recebida_com_diferencas", "emitida", "em_transito"):
            raise HTTPException(status_code=400, detail=f"Não é possível registar utilização em guia com status '{g.get('status')}'")

        by_id = {it["id"]: it for it in (g.get("items") or [])}
        changes = []
        for upd in items_update:
            base = by_id.get(upd.id)
            if not base:
                continue
            qty_received = float(base.get("qty_received") or 0)
            qty_returned = float(base.get("qty_returned") or 0)
            max_usable = qty_received - qty_returned
            new_used = float(upd.qty_used or 0)
            if new_used < 0:
                raise HTTPException(status_code=400, detail=f"Quantidade utilizada não pode ser negativa em '{base.get('name')}'")
            if new_used > max_usable + 0.0001:
                raise HTTPException(status_code=400, detail=f"Quantidade utilizada ({new_used}) excede o recebido disponível ({max_usable}) em '{base.get('name')}'")
            old_used = float(base.get("qty_used") or 0)
            if abs(new_used - old_used) > 1e-9 or (upd.notes is not None and (upd.notes or "") != (base.get("notes") or "")):
                base["qty_used"] = new_used
                if upd.notes is not None:
                    base["notes"] = upd.notes
                changes.append({"item_id": base["id"], "name": base["name"], "from": old_used, "to": new_used})

        if not changes:
            return g

        await db.transport_guides.update_one({"id": guide_id}, {"$set": {"items": list(by_id.values())}})
        await _push_history(guide_id, "usage_updated", actor_name, {"changes": changes, "note": note or ""})
        return await db.transport_guides.find_one({"id": guide_id}, {"_id": 0})

    @router.post("/tech/transport-guides/{guide_id}/usage")
    async def tech_update_usage(guide_id: str, input: GuideUsageUpdate, tech=Depends(_get_current_tech)):
        """Técnico actualiza qty_used dos items (pode chamar várias vezes)."""
        g = await db.transport_guides.find_one({"id": guide_id, "assigned_employee_id": tech["id"]}, {"_id": 0})
        if not g:
            raise HTTPException(status_code=404, detail="Guia não encontrada ou não atribuída a si")
        return await _apply_usage_update(guide_id, input.items, tech.get("name", ""), tech.get("id", ""), input.note or "")

    @router.post("/transport-guides/{guide_id}/usage")
    async def admin_update_usage(guide_id: str, input: GuideUsageUpdate, user=Depends(get_current_user)):
        """Admin também pode actualizar (correções)."""
        return await _apply_usage_update(guide_id, input.items, user.get("name") or user.get("email", ""), user.get("id", ""), input.note or "")

    @router.post("/transport-guides/{guide_id}/return-to-stock")
    async def admin_return_to_stock(guide_id: str, input: GuideReturnInput, user=Depends(get_current_user)):
        """Devolve ao armazém o material que sobrou (qty_received - qty_used - qty_returned).
        Cria stock_movement type='entrada' para cada item com material_id.
        Actualiza qty_returned no item."""
        g = await db.transport_guides.find_one({"id": guide_id}, {"_id": 0})
        if not g:
            raise HTTPException(status_code=404, detail="Guia não encontrada")

        target_ids = set(input.item_ids or [])
        items = list(g.get("items") or [])
        return_movements = []
        any_returned = False

        for it in items:
            if target_ids and it["id"] not in target_ids:
                continue
            qty_received = float(it.get("qty_received") or 0)
            qty_used = float(it.get("qty_used") or 0)
            qty_returned_already = float(it.get("qty_returned") or 0)
            surplus = qty_received - qty_used - qty_returned_already
            if surplus <= 0.0001:
                continue
            mat_id = it.get("material_id")
            if mat_id:
                mat = await db.materials_db.find_one({"id": mat_id}, {"_id": 0})
                if mat:
                    new_stock = float(mat.get("stock_current", 0) or 0) + surplus
                    await db.materials_db.update_one({"id": mat_id}, {"$set": {"stock_current": new_stock}})
                    mov = {
                        "id": str(uuid.uuid4()),
                        "material_id": mat_id,
                        "material_name": mat.get("description") or mat.get("name") or it.get("name"),
                        "type": "entrada",
                        "quantity": surplus,
                        "balance_after": new_stock,
                        "reason": f"Devolução de sobra da Guia {g.get('number')}",
                        "guide_id": guide_id,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "created_by": user.get("id", ""),
                    }
                    await db.stock_movements.insert_one(mov)
                    return_movements.append(mov["id"])
            it["qty_returned"] = qty_returned_already + surplus
            any_returned = True

        if not any_returned:
            raise HTTPException(status_code=400, detail="Não há sobra disponível para devolver")

        await db.transport_guides.update_one({"id": guide_id}, {"$set": {"items": items}})
        await _push_history(
            guide_id,
            "returned_to_stock",
            user.get("name") or user.get("email", ""),
            {"movements": len(return_movements), "note": input.note or "", "items_count": sum(1 for it in items if (it.get("qty_returned") or 0) > 0)},
        )
        return await db.transport_guides.find_one({"id": guide_id}, {"_id": 0})

    # ============================================================
    # Helpers para frontend (admin): materiais da obra
    # ============================================================

    @router.get("/transport-guides/_helpers/work-materials/{work_id}")
    async def get_work_materials(work_id: str, user=Depends(get_current_user)):
        """Lista materiais do orçamento associado à obra para pré-popular criação de guia."""
        work = await db.works.find_one({"id": work_id}, {"_id": 0})
        if not work:
            raise HTTPException(status_code=404, detail="Obra não encontrada")
        budget_id = work.get("budget_id")
        items_out = []
        if budget_id:
            budget = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
            if budget:
                for it in (budget.get("items") or []):
                    items_out.append({
                        "name": it.get("name", ""),
                        "category": it.get("category", ""),
                        "unit": it.get("unit", "un"),
                        "qty_planned": float(it.get("quantity") or 0),
                        "material_id": None,
                    })
        # Also list materiais que ja foram usados em items da obra (real_quantity)
        for it in (work.get("items") or []):
            if it.get("is_extra"):
                items_out.append({
                    "name": it.get("name", ""),
                    "category": it.get("category", "Extra"),
                    "unit": it.get("unit", "un"),
                    "qty_planned": float(it.get("quantity") or 0),
                    "material_id": None,
                })
        return {"work": {"id": work["id"], "title": work.get("title"), "client_name": work.get("client_name")}, "items": items_out}

    return router
