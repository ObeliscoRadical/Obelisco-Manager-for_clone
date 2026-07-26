"""
Endpoints extra do Portal Técnico:
- Ponto (clock in/out) → collection `attendance`
- Chat/Mensagens (técnico ↔ escritório) → collection `tech_messages`
- Agenda (obras/appointments do técnico)
- Perfil pessoal + upload de fotos
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Literal
from datetime import datetime, timezone, date as date_cls
from pathlib import Path
import os
import uuid
import shutil
import logging
import jwt

logger = logging.getLogger(__name__)

# Directório para fotos de obras
UPLOAD_DIR = Path("/app/backend/uploads/tech_photos")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_EXT = {"jpg", "jpeg", "png", "webp", "heic", "heif"}
MAX_FILE_MB = 10


# ------------ Modelos ------------
class ClockPunch(BaseModel):
    action: Literal['in', 'out', 'break_start', 'break_end']
    work_id: Optional[str] = None
    note: Optional[str] = None


class TechMessageCreate(BaseModel):
    text: str
    work_id: Optional[str] = None


# ------------ Helpers ------------
def _today_iso():
    return date_cls.today().isoformat()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _get_tech_user_dep(db):
    """Factory pública para expor a dependência get_tech_user a outros módulos."""
    JWT_SECRET = os.environ["JWT_SECRET"]
    JWT_ALGO = "HS256"

    async def get_tech_user(request: Request):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Não autenticado")
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGO])
            ttype = payload.get("type")
            if ttype == "tech":
                emp = await db.employees.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
                if not emp or not emp.get("active", True):
                    raise HTTPException(status_code=401, detail="Funcionário inactivo")
                return {**emp, "_is_admin": False}
            elif ttype == "access":
                from bson import ObjectId as _OID
                u = await db.users.find_one({"_id": _OID(payload["sub"])})
                if not u:
                    raise HTTPException(status_code=403, detail="Utilizador não encontrado")
                is_admin = u.get("role") == "admin"
                perms = u.get("module_permissions") or {}
                if not is_admin and not perms.get("tech_portal"):
                    raise HTTPException(status_code=403, detail="Sem permissão para o portal técnico")
                return {
                    "id": str(u["_id"]),
                    "name": u.get("name"),
                    "email": u.get("email"),
                    "role": u.get("role"),
                    "_is_admin": True,
                }
            raise HTTPException(status_code=401, detail="Token inválido")
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    return get_tech_user


def create_tech_extras_router(db, get_current_user):
    """Cria router com dependências independentes (tech auth próprio)."""
    tech_extra_router = APIRouter(prefix="/api/tech", tags=["tech-extras"])
    get_tech_user = _get_tech_user_dep(db)

    # ============================================================
    # PONTO (Timesheet / Clock in-out)
    # ============================================================
    @tech_extra_router.get("/timesheet/today")
    async def get_today_timesheet(user=Depends(get_tech_user)):
        emp_id = user.get("id")
        today = _today_iso()
        att = await db.attendance.find_one(
            {"employee_id": emp_id, "date": today}, {"_id": 0}
        )
        return att or {"employee_id": emp_id, "date": today, "punches": [], "total_hours": 0}

    @tech_extra_router.post("/timesheet/punch")
    async def punch_timesheet(input: ClockPunch, user=Depends(get_tech_user)):
        emp_id = user.get("id")
        today = _today_iso()
        now = _now_iso()

        att = await db.attendance.find_one({"employee_id": emp_id, "date": today})
        punches = (att or {}).get("punches", [])
        punches.append({
            "id": str(uuid.uuid4()),
            "action": input.action,
            "at": now,
            "work_id": input.work_id,
            "note": input.note,
        })

        # Calcula horas trabalhadas somando pares in→out
        total = 0.0
        stack = None
        for p in sorted(punches, key=lambda x: x["at"]):
            if p["action"] == "in" and stack is None:
                stack = datetime.fromisoformat(p["at"])
            elif p["action"] == "out" and stack is not None:
                delta = (datetime.fromisoformat(p["at"]) - stack).total_seconds() / 3600
                total += max(0, delta)
                stack = None

        doc = {
            "employee_id": emp_id,
            "date": today,
            "punches": punches,
            "total_hours": round(total, 2),
            "updated_at": now,
        }
        if att:
            await db.attendance.update_one({"employee_id": emp_id, "date": today}, {"$set": doc})
        else:
            doc["id"] = str(uuid.uuid4())
            doc["created_at"] = now
            await db.attendance.insert_one(doc)

        doc.pop("_id", None)
        return doc

    @tech_extra_router.get("/timesheet/week")
    async def get_week_timesheet(user=Depends(get_tech_user)):
        """Últimos 7 dias."""
        from datetime import timedelta
        emp_id = user.get("id")
        today = date_cls.today()
        dates = [(today - timedelta(days=i)).isoformat() for i in range(7)]
        recs = await db.attendance.find(
            {"employee_id": emp_id, "date": {"$in": dates}}, {"_id": 0}
        ).sort("date", -1).to_list(20)
        return recs

    # ============================================================
    # AGENDA — Obras / Compromissos do técnico
    # ============================================================
    @tech_extra_router.get("/works/my")
    async def list_my_works(user=Depends(get_tech_user)):
        emp_id = user.get("id")
        # Obras onde o técnico está atribuído (assigned_employee_ids)
        works = await db.works.find(
            {"$or": [
                {"assigned_employee_ids": emp_id},
                {"assigned_employees": emp_id},
                {"team_member_ids": emp_id},
            ]},
            {"_id": 0}
        ).sort("scheduled_date", 1).to_list(100)
        return works

    @tech_extra_router.get("/appointments/my")
    async def list_my_appointments(user=Depends(get_tech_user)):
        """Agenda do técnico — próximos 30 dias filtrada por employee_id (ou tudo se admin)."""
        emp_id = user.get("id")
        from datetime import timedelta
        today = date_cls.today()
        end = (today + timedelta(days=30)).isoformat()
        date_filter = {"date": {"$gte": today.isoformat(), "$lte": end}}
        if user.get("_is_admin"):
            q = date_filter
        else:
            q = {**date_filter, "employee_ids": emp_id}
        appts = await db.appointments.find(q, {"_id": 0}).sort("date", 1).to_list(200)
        return appts

    # ============================================================
    # EXECUÇÃO DA OBRA (read-only)
    # ============================================================
    @tech_extra_router.get("/works")
    async def tech_list_works(user=Depends(get_tech_user)):
        """Lista todas as obras (light). Read-only para técnicos."""
        works = await db.works.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        # calcular progresso rápido
        result = []
        for w in works:
            items = w.get("items") or []
            sale_total = 0.0
            executed = 0.0
            done = in_prog = pending = 0
            for it in items:
                qty = float(it.get("quantity") or 0)
                uc = float(it.get("predicted_unit_cost") or 0)
                marg = float(it.get("margin") or 0)
                line_sale = uc * (1 + marg) * qty
                sale_total += line_sale
                st = it.get("execution_status") or "pending"
                exec_q = float(it.get("executed_quantity") or 0)
                if st == "done":
                    done += 1
                    executed += line_sale
                elif st == "in_progress":
                    in_prog += 1
                    executed += (line_sale * (exec_q / qty)) if qty > 0 else 0
                else:
                    pending += 1
            pct = round((executed / sale_total * 100) if sale_total > 0 else 0, 1)
            result.append({
                "id": w.get("id"),
                "title": w.get("title"),
                "client_name": w.get("client_name"),
                "status": w.get("status"),
                "start_date": w.get("start_date"),
                "items_total": len(items),
                "items_done": done,
                "items_in_progress": in_prog,
                "items_pending": pending,
                "execution_pct": pct,
            })
        return result

    @tech_extra_router.get("/works/{work_id}/execution")
    async def tech_work_execution(work_id: str, user=Depends(get_tech_user)):
        """Detalhe read-only da execução de uma obra."""
        w = await db.works.find_one({"id": work_id}, {"_id": 0})
        if not w:
            raise HTTPException(status_code=404, detail="Obra não encontrada")
        return {
            "id": w.get("id"),
            "title": w.get("title"),
            "client_name": w.get("client_name"),
            "status": w.get("status"),
            "items": [{
                "id": it.get("id"),
                "name": it.get("name"),
                "category": it.get("category"),
                "unit": it.get("unit"),
                "quantity": it.get("quantity"),
                "executed_quantity": it.get("executed_quantity", 0),
                "execution_status": it.get("execution_status", "pending"),
                "is_extra": it.get("is_extra", False),
            } for it in (w.get("items") or [])],
        }

    # ============================================================
    # CHAT / MENSAGENS
    # ============================================================
    @tech_extra_router.get("/messages")
    async def list_messages(user=Depends(get_tech_user)):
        """Todas as mensagens deste técnico (com o escritório)."""
        emp_id = user.get("id")
        msgs = await db.tech_messages.find(
            {"employee_id": emp_id}, {"_id": 0}
        ).sort("created_at", 1).to_list(500)
        # marca como lidas pelo técnico
        await db.tech_messages.update_many(
            {"employee_id": emp_id, "from_role": "admin", "read_by_tech": {"$ne": True}},
            {"$set": {"read_by_tech": True}}
        )
        return msgs

    @tech_extra_router.post("/messages")
    async def create_tech_message(input: TechMessageCreate, user=Depends(get_tech_user)):
        emp_id = user.get("id")
        doc = {
            "id": str(uuid.uuid4()),
            "employee_id": emp_id,
            "employee_name": user.get("name"),
            "from_role": "tech",
            "text": input.text,
            "work_id": input.work_id,
            "read_by_tech": True,
            "read_by_admin": False,
            "created_at": _now_iso(),
        }
        await db.tech_messages.insert_one(doc)
        doc.pop("_id", None)
        # Notificar todos os admins
        try:
            from notifications import create_notification
            admins = await db.users.find({"role": "admin"}, {"password_hash": 0}).to_list(50)
            preview = (input.text or "")[:80]
            for a in admins:
                admin_id = str(a.get("_id") or a.get("id") or "")
                if not admin_id:
                    continue
                await create_notification(
                    db, user_id=admin_id, user_kind="user", type="chat",
                    title=f"Nova mensagem de {user.get('name', 'técnico')}",
                    message=preview,
                    link="/mensagens-tecnicos",
                    meta={"employee_id": emp_id, "message_id": doc["id"]},
                )
        except Exception as e:
            import logging as _log
            _log.getLogger(__name__).warning(f"notify admins on tech message failed: {e}")
        return doc

    # Admin: ver todas as threads
    @tech_extra_router.get("/admin/messages/threads")
    async def list_message_threads_admin(user=Depends(get_current_user)):
        """Uma linha por técnico com contagem de não-lidas."""
        pipeline = [
            {"$sort": {"created_at": -1}},
            {"$group": {
                "_id": "$employee_id",
                "employee_name": {"$first": "$employee_name"},
                "last_message": {"$first": "$text"},
                "last_at": {"$first": "$created_at"},
                "unread": {"$sum": {"$cond": [
                    {"$and": [{"$eq": ["$from_role", "tech"]}, {"$ne": ["$read_by_admin", True]}]}, 1, 0
                ]}},
            }},
            {"$project": {"_id": 0, "employee_id": "$_id", "employee_name": 1, "last_message": 1, "last_at": 1, "unread": 1}},
            {"$sort": {"last_at": -1}}
        ]
        threads = await db.tech_messages.aggregate(pipeline).to_list(100)
        return threads

    @tech_extra_router.get("/admin/messages/{employee_id}")
    async def list_messages_admin(employee_id: str, user=Depends(get_current_user)):
        msgs = await db.tech_messages.find(
            {"employee_id": employee_id}, {"_id": 0}
        ).sort("created_at", 1).to_list(500)
        # marca como lidas pelo admin
        await db.tech_messages.update_many(
            {"employee_id": employee_id, "from_role": "tech", "read_by_admin": {"$ne": True}},
            {"$set": {"read_by_admin": True}}
        )
        return msgs

    @tech_extra_router.post("/admin/messages/{employee_id}")
    async def create_admin_message(employee_id: str, input: TechMessageCreate, user=Depends(get_current_user)):
        emp = await db.employees.find_one({"id": employee_id}, {"_id": 0, "name": 1})
        if not emp:
            raise HTTPException(status_code=404, detail="Funcionário não encontrado")
        doc = {
            "id": str(uuid.uuid4()),
            "employee_id": employee_id,
            "employee_name": emp.get("name"),
            "from_role": "admin",
            "admin_name": user.get("name", "Escritório"),
            "text": input.text,
            "work_id": input.work_id,
            "read_by_tech": False,
            "read_by_admin": True,
            "created_at": _now_iso(),
        }
        await db.tech_messages.insert_one(doc)
        doc.pop("_id", None)
        # Notificar o técnico
        try:
            from notifications import create_notification
            await create_notification(
                db, user_id=employee_id, user_kind="employee", type="chat",
                title=f"Nova mensagem de {user.get('name', 'Escritório')}",
                message=(input.text or "")[:80],
                link="/tech/chat",
                meta={"message_id": doc["id"]},
            )
        except Exception as e:
            import logging as _log
            _log.getLogger(__name__).warning(f"notify tech on admin message failed: {e}")
        return doc

    # ============================================================
    # PERFIL
    # ============================================================
    @tech_extra_router.get("/profile")
    async def get_profile(user=Depends(get_tech_user)):
        if user.get("_is_admin"):
            # Admin em modo supervisor — devolve os próprios dados de admin
            return {
                "id": user.get("id"),
                "name": user.get("name"),
                "email": user.get("email"),
                "role": user.get("role"),
                "active": True,
                "_is_admin_view": True,
            }
        emp = await db.employees.find_one({"id": user.get("id")}, {"_id": 0, "password_hash": 0})
        if not emp:
            raise HTTPException(status_code=404, detail="Funcionário não encontrado")
        return emp

    # ============================================================
    # UPLOAD DE FOTOS (obra / material)
    # ============================================================
    @tech_extra_router.post("/upload/photo")
    async def upload_photo(
        file: UploadFile = File(...),
        guide_id: Optional[str] = Form(None),
        work_id: Optional[str] = Form(None),
        caption: Optional[str] = Form(None),
        user=Depends(get_tech_user),
    ):
        emp_id = user.get("id")
        if '.' not in (file.filename or ''):
            raise HTTPException(status_code=400, detail="Ficheiro sem extensão")
        ext = file.filename.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(status_code=400, detail=f"Formato não suportado. Use: {', '.join(ALLOWED_EXT)}")

        # Validação de tamanho
        contents = await file.read()
        if len(contents) > MAX_FILE_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"Ficheiro maior que {MAX_FILE_MB}MB")

        filename = f"{uuid.uuid4().hex}.{ext}"
        dest = UPLOAD_DIR / filename
        with open(dest, "wb") as f:
            f.write(contents)

        doc = {
            "id": str(uuid.uuid4()),
            "employee_id": emp_id,
            "filename": filename,
            "original_name": file.filename,
            "guide_id": guide_id,
            "work_id": work_id,
            "caption": caption,
            "url": f"/api/tech/photos/{filename}",
            "created_at": _now_iso(),
        }
        await db.tech_photos.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @tech_extra_router.get("/photos/{filename}")
    async def get_photo(filename: str):
        # Público (protegido pelo hash uuid — segurança por obscuridade + serve renders locais)
        path = UPLOAD_DIR / filename
        if not path.exists():
            raise HTTPException(status_code=404, detail="Foto não encontrada")
        return FileResponse(path)

    @tech_extra_router.get("/photos")
    async def list_my_photos(guide_id: Optional[str] = None, work_id: Optional[str] = None, user=Depends(get_tech_user)):
        q = {"employee_id": user.get("id")}
        if guide_id: q["guide_id"] = guide_id
        if work_id: q["work_id"] = work_id
        photos = await db.tech_photos.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
        return photos

    return tech_extra_router
