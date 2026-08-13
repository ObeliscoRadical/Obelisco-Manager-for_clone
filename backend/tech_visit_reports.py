from datetime import datetime, timezone
from typing import List, Literal, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from tech_extras import _get_tech_user_dep


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class VisitHeaderInput(BaseModel):
    visit_date: str
    client_name: str
    client_phone: str = ""
    work_reference: str
    work_id: Optional[str] = None


class VisitScopeInput(BaseModel):
    title: str
    description: str = ""


class VisitCircuitInput(BaseModel):
    id: Optional[str] = None
    icon_key: str = "plug-zap"
    service_key: str = "tomada"
    description: str
    quantity: int = Field(default=1, ge=1)
    circuit_type: str = ""
    usage_point: str = ""


class VisitDistributionBoardInput(BaseModel):
    photo_data_url: Optional[str] = None
    modules: str = ""
    dimensions: str = ""
    installation_type: str = ""
    purpose: str = ""


class VisitReportInput(BaseModel):
    header: VisitHeaderInput
    scope: VisitScopeInput
    circuits: List[VisitCircuitInput] = []
    distribution_board: VisitDistributionBoardInput = Field(default_factory=VisitDistributionBoardInput)
    status: Literal["rascunho", "final"] = "rascunho"


def _normalize_circuits(circuits: List[VisitCircuitInput]) -> list[dict]:
    normalized = []
    for item in circuits:
        payload = item.model_dump()
        payload["id"] = payload.get("id") or str(uuid.uuid4())
        normalized.append(payload)
    return normalized


def _build_report_payload(payload: VisitReportInput, user: dict, existing: Optional[dict] = None) -> dict:
    now = _now_iso()
    created_at = (existing or {}).get("created_at") or now
    report_id = (existing or {}).get("id") or str(uuid.uuid4())
    work_id = payload.header.work_id or None
    header = payload.header.model_dump()
    header["work_id"] = work_id

    return {
        "id": report_id,
        "status": payload.status,
        "header": header,
        "scope": payload.scope.model_dump(),
        "circuits": _normalize_circuits(payload.circuits),
        "distribution_board": payload.distribution_board.model_dump(),
        "technician_id": user.get("id"),
        "technician_name": user.get("name") or user.get("email") or "Técnico",
        "technician_email": user.get("email") or "",
        "work_id": work_id,
        "created_at": created_at,
        "updated_at": now,
    }


def _can_access_report(report: dict, user: dict) -> bool:
    if user.get("_is_admin"):
        return True
    return str(report.get("technician_id") or "") == str(user.get("id") or "")


def create_tech_visit_reports_router(db):
    router = APIRouter(prefix="/api/tech/visit-reports", tags=["tech-visit-reports"])
    get_tech_user = _get_tech_user_dep(db)

    @router.get("")
    async def list_visit_reports(user=Depends(get_tech_user)):
        query = {}
        if not user.get("_is_admin"):
            query["technician_id"] = user.get("id")
        reports = await db.tech_visit_reports.find(query, {"_id": 0}).sort("updated_at", -1).to_list(200)
        return reports

    @router.get("/helpers/works")
    async def list_my_works_for_visits(user=Depends(get_tech_user)):
        if user.get("_is_admin"):
            query = {}
        else:
            emp_id = user.get("id")
            query = {
                "$or": [
                    {"assigned_employee_ids": emp_id},
                    {"assigned_employees": emp_id},
                    {"team_member_ids": emp_id},
                ]
            }
        works = await db.works.find(
            query,
            {
                "_id": 0,
                "id": 1,
                "title": 1,
                "client_name": 1,
                "client_phone": 1,
                "status": 1,
                "start_date": 1,
                "end_date": 1,
            },
        ).sort("created_at", -1).to_list(100)
        return works

    @router.post("")
    async def create_visit_report(payload: VisitReportInput, user=Depends(get_tech_user)):
        report = _build_report_payload(payload, user)
        await db.tech_visit_reports.insert_one(dict(report))
        return report

    @router.get("/{report_id}")
    async def get_visit_report(report_id: str, user=Depends(get_tech_user)):
        report = await db.tech_visit_reports.find_one({"id": report_id}, {"_id": 0})
        if not report:
            raise HTTPException(status_code=404, detail="Relação de visita não encontrada")
        if not _can_access_report(report, user):
            raise HTTPException(status_code=403, detail="Sem acesso a esta relação de visita")
        return report

    @router.put("/{report_id}")
    async def update_visit_report(report_id: str, payload: VisitReportInput, user=Depends(get_tech_user)):
        existing = await db.tech_visit_reports.find_one({"id": report_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Relação de visita não encontrada")
        if not _can_access_report(existing, user):
            raise HTTPException(status_code=403, detail="Sem acesso a esta relação de visita")
        report = _build_report_payload(payload, user, existing=existing)
        await db.tech_visit_reports.update_one({"id": report_id}, {"$set": report})
        return report

    @router.delete("/{report_id}")
    async def delete_visit_report(report_id: str, user=Depends(get_tech_user)):
        report = await db.tech_visit_reports.find_one({"id": report_id}, {"_id": 0})
        if not report:
            raise HTTPException(status_code=404, detail="Relação de visita não encontrada")
        if not _can_access_report(report, user):
            raise HTTPException(status_code=403, detail="Sem acesso a esta relação de visita")
        await db.tech_visit_reports.delete_one({"id": report_id})
        return {"ok": True, "id": report_id}

    return router