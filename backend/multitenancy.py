from __future__ import annotations

from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Iterable
import re
import uuid


CURRENT_COMPANY_ID: ContextVar[str | None] = ContextVar("current_company_id", default=None)
_DEFAULT_COMPANY_ID: str | None = None


TENANT_SCOPED_COLLECTIONS = {
    "active_debts",
    "appointments",
    "attendance",
    "bank_analyses",
    "budget_versions",
    "budgets",
    "category_overrides",
    "cfo_virtual_reports",
    "cfo_virtual_simulations",
    "contabilista_chats",
    "employee_loans",
    "employees",
    "expense_reconciliation_reports",
    "expenses",
    "favorites",
    "fixed_cost_instances",
    "fixed_cost_templates",
    "invoices",
    "labor_db",
    "materials_db",
    "notification_dispatches",
    "notifications",
    "payroll_items",
    "payroll_runs",
    "payroll_settings",
    "productivity_db",
    "proposal_settings",
    "proposals",
    "push_subscriptions",
    "recurring_masters",
    "service_orders",
    "service_timeclock",
    "stock_movements",
    "system_settings",
    "tech_messages",
    "tech_photos",
    "telegram_reminders",
    "text_templates",
    "transport_guides",
    "users",
    "works",
}


CORE_COLLECTIONS_FOR_MIGRATION = sorted(TENANT_SCOPED_COLLECTIONS)
INDEXED_COMPANY_COLLECTIONS = {
    "active_debts",
    "appointments",
    "bank_analyses",
    "budgets",
    "employees",
    "expenses",
    "fixed_cost_instances",
    "fixed_cost_templates",
    "invoices",
    "notifications",
    "payroll_items",
    "payroll_runs",
    "proposals",
    "push_subscriptions",
    "service_orders",
    "service_timeclock",
    "system_settings",
    "tech_messages",
    "transport_guides",
    "users",
    "works",
}


def slugify_company_name(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (value or "empresa").strip().lower())
    base = re.sub(r"-+", "-", base).strip("-")
    return base or "empresa"


def set_default_company_id(company_id: str | None):
    global _DEFAULT_COMPANY_ID
    _DEFAULT_COMPANY_ID = company_id


def get_default_company_id() -> str | None:
    return _DEFAULT_COMPANY_ID


def set_request_company_id(company_id: str | None):
    return CURRENT_COMPANY_ID.set(company_id)


def reset_request_company_id(token):
    CURRENT_COMPANY_ID.reset(token)


def get_request_company_id() -> str | None:
    return CURRENT_COMPANY_ID.get()


def is_tenant_scoped_collection(collection_name: str) -> bool:
    return collection_name in TENANT_SCOPED_COLLECTIONS


def get_effective_company_id(explicit_company_id: str | None = None) -> str | None:
    return explicit_company_id or get_request_company_id() or get_default_company_id()


def normalize_company_ids(*values) -> list[str]:
    normalized: list[str] = []
    for value in values:
        if isinstance(value, str):
            candidate = value.strip()
            if candidate and candidate not in normalized:
                normalized.append(candidate)
        elif isinstance(value, Iterable) and not isinstance(value, (dict, bytes, bytearray)):
            for item in value:
                candidate = str(item or "").strip()
                if candidate and candidate not in normalized:
                    normalized.append(candidate)
    return normalized


def get_subject_company_ids(subject_doc: dict | None) -> list[str]:
    subject = subject_doc or {}
    company_ids = normalize_company_ids(
        subject.get("company_id"),
        subject.get("company_access_ids") or subject.get("accessible_company_ids") or [],
    )
    if not company_ids and get_default_company_id():
        return [get_default_company_id()]
    return company_ids


def merge_company_filter(collection_name: str, query: dict | None) -> dict:
    base_query = dict(query or {})
    if not is_tenant_scoped_collection(collection_name):
        return base_query
    company_id = get_request_company_id()
    if not company_id:
        return base_query
    if not base_query:
        return {"company_id": company_id}
    return {"$and": [{"company_id": company_id}, base_query]}


def stamp_document_company(collection_name: str, doc: dict | None) -> dict | None:
    if not doc or not is_tenant_scoped_collection(collection_name):
        return doc
    stamped = dict(doc)
    if not stamped.get("company_id"):
        company_id = get_effective_company_id()
        if company_id:
            stamped["company_id"] = company_id
    return stamped


def stamp_documents_company(collection_name: str, docs: Iterable[dict]) -> list[dict]:
    return [stamp_document_company(collection_name, doc) for doc in docs]


def stamp_update_with_company(collection_name: str, update: dict | None, *, upsert: bool = False) -> dict | None:
    if not update or not is_tenant_scoped_collection(collection_name) or not upsert:
        return update
    company_id = get_effective_company_id()
    if not company_id:
        return update
    update_doc = dict(update)
    set_on_insert = dict(update_doc.get("$setOnInsert") or {})
    set_on_insert.setdefault("company_id", company_id)
    update_doc["$setOnInsert"] = set_on_insert
    return update_doc


class TenantAwareCollection:
    def __init__(self, raw_collection, collection_name: str):
        self._raw = raw_collection
        self._name = collection_name

    def find(self, *args, **kwargs):
        query = args[0] if args else None
        next_args = list(args)
        if next_args:
            next_args[0] = merge_company_filter(self._name, query)
        else:
            next_args = [merge_company_filter(self._name, None)]
        return self._raw.find(*next_args, **kwargs)

    async def find_one(self, *args, **kwargs):
        query = args[0] if args else None
        next_args = list(args)
        if next_args:
            next_args[0] = merge_company_filter(self._name, query)
        else:
            next_args = [merge_company_filter(self._name, None)]
        return await self._raw.find_one(*next_args, **kwargs)

    async def count_documents(self, query, *args, **kwargs):
        return await self._raw.count_documents(merge_company_filter(self._name, query), *args, **kwargs)

    async def distinct(self, key, filter=None, *args, **kwargs):
        return await self._raw.distinct(key, merge_company_filter(self._name, filter), *args, **kwargs)

    async def insert_one(self, document, *args, **kwargs):
        return await self._raw.insert_one(stamp_document_company(self._name, document), *args, **kwargs)

    async def insert_many(self, documents, *args, **kwargs):
        return await self._raw.insert_many(stamp_documents_company(self._name, documents), *args, **kwargs)

    async def update_one(self, query, update, *args, **kwargs):
        scoped_query = merge_company_filter(self._name, query)
        scoped_update = stamp_update_with_company(self._name, update, upsert=bool(kwargs.get("upsert")))
        return await self._raw.update_one(scoped_query, scoped_update, *args, **kwargs)

    async def update_many(self, query, update, *args, **kwargs):
        scoped_query = merge_company_filter(self._name, query)
        scoped_update = stamp_update_with_company(self._name, update, upsert=bool(kwargs.get("upsert")))
        return await self._raw.update_many(scoped_query, scoped_update, *args, **kwargs)

    async def delete_one(self, query, *args, **kwargs):
        return await self._raw.delete_one(merge_company_filter(self._name, query), *args, **kwargs)

    async def delete_many(self, query, *args, **kwargs):
        return await self._raw.delete_many(merge_company_filter(self._name, query), *args, **kwargs)

    def aggregate(self, pipeline, *args, **kwargs):
        if is_tenant_scoped_collection(self._name) and get_request_company_id():
            scoped_pipeline = [{"$match": {"company_id": get_request_company_id()}}] + list(pipeline or [])
            return self._raw.aggregate(scoped_pipeline, *args, **kwargs)
        return self._raw.aggregate(pipeline, *args, **kwargs)

    async def create_index(self, *args, **kwargs):
        return await self._raw.create_index(*args, **kwargs)

    async def drop_index(self, *args, **kwargs):
        return await self._raw.drop_index(*args, **kwargs)

    async def index_information(self, *args, **kwargs):
        return await self._raw.index_information(*args, **kwargs)

    def __getattr__(self, item):
        return getattr(self._raw, item)


class MultiTenantDatabase:
    def __init__(self, raw_db):
        self.raw = raw_db

    def __getattr__(self, item):
        raw_collection = getattr(self.raw, item)
        return TenantAwareCollection(raw_collection, item)

    def __getitem__(self, item):
        raw_collection = self.raw[item]
        return TenantAwareCollection(raw_collection, item)

    async def list_collection_names(self, *args, **kwargs):
        return await self.raw.list_collection_names(*args, **kwargs)


def _company_doc_from_info(company_info: dict | None) -> dict:
    info = company_info or {}
    name = (info.get("name") or "Obelisco Radical").strip()
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "slug": slugify_company_name(name),
        "subtitle": info.get("subtitle", ""),
        "phone": info.get("phone", ""),
        "email": info.get("email", ""),
        "website": info.get("website", ""),
        "address": info.get("address", ""),
        "nif": info.get("nif", ""),
        "status": "active",
        "is_default": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def ensure_default_company(raw_db, company_info: dict | None = None) -> dict:
    desired = _company_doc_from_info(company_info)
    existing = await raw_db.companies.find_one({"is_default": True}, {"_id": 0})
    if not existing:
        existing = await raw_db.companies.find_one({"slug": desired["slug"]}, {"_id": 0})
    if existing:
        await raw_db.companies.update_one(
            {"id": existing["id"]},
            {
                "$set": {
                    "name": desired["name"],
                    "subtitle": desired["subtitle"],
                    "phone": desired["phone"],
                    "email": desired["email"],
                    "website": desired["website"],
                    "address": desired["address"],
                    "nif": desired["nif"],
                    "status": "active",
                    "is_default": True,
                }
            },
        )
        refreshed = await raw_db.companies.find_one({"id": existing["id"]}, {"_id": 0})
        set_default_company_id(refreshed.get("id"))
        return refreshed

    await raw_db.companies.insert_one(desired)
    set_default_company_id(desired["id"])
    return desired


async def sync_company_profile(raw_db, company_id: str, company_info: dict | None):
    if not company_id:
        return None
    payload = _company_doc_from_info(company_info)
    payload["id"] = company_id
    update_fields = {
        "name": payload["name"],
        "subtitle": payload["subtitle"],
        "phone": payload["phone"],
        "email": payload["email"],
        "website": payload["website"],
        "address": payload["address"],
        "nif": payload["nif"],
        "status": "active",
    }
    existing = await raw_db.companies.find_one({"id": company_id}, {"_id": 0})
    if existing:
        await raw_db.companies.update_one({"id": company_id}, {"$set": update_fields})
    else:
        await raw_db.companies.insert_one({**payload, "is_default": False})
    return await raw_db.companies.find_one({"id": company_id}, {"_id": 0})


async def list_company_summaries(raw_db, company_ids: Iterable[str]) -> list[dict]:
    ids = normalize_company_ids(company_ids)
    if not ids:
        return []
    companies = await raw_db.companies.find({"id": {"$in": ids}}, {"_id": 0}).to_list(len(ids))
    by_id = {company.get("id"): company for company in companies}
    return [
        {
            "id": company_id,
            "name": (by_id.get(company_id) or {}).get("name", ""),
            "slug": (by_id.get(company_id) or {}).get("slug", ""),
            "status": (by_id.get(company_id) or {}).get("status", "active"),
        }
        for company_id in ids
        if by_id.get(company_id)
    ]


async def resolve_company_context(raw_db, subject_doc: dict | None, preferred_company_id: str | None = None) -> dict:
    primary_company_id = (subject_doc or {}).get("company_id") or get_default_company_id()
    available_company_ids = get_subject_company_ids(subject_doc)
    available_companies = await list_company_summaries(raw_db, available_company_ids)
    available_company_map = {company.get("id"): company for company in available_companies}

    company_id = preferred_company_id if preferred_company_id in available_company_map else None
    if not company_id:
        company_id = primary_company_id if primary_company_id in available_company_map else None
    if not company_id and available_companies:
        company_id = available_companies[0].get("id")
    if not company_id:
        company_id = get_default_company_id()

    company = available_company_map.get(company_id)
    if not company and company_id:
        company = await raw_db.companies.find_one({"id": company_id}, {"_id": 0})
        if company:
            available_companies = [*available_companies, {"id": company.get("id", ""), "name": company.get("name", ""), "slug": company.get("slug", ""), "status": company.get("status", "active")}]
    if company_id:
        set_request_company_id(company_id)
    return {
        "company_id": company_id or "",
        "company_name": (company or {}).get("name", ""),
        "company_slug": (company or {}).get("slug", ""),
        "primary_company_id": primary_company_id or company_id or "",
        "available_companies": available_companies,
    }


async def migrate_existing_company_ids(raw_db, default_company_id: str) -> dict:
    stats = {}
    missing_company_query = {
        "$or": [
            {"company_id": {"$exists": False}},
            {"company_id": None},
            {"company_id": ""},
        ]
    }
    for collection_name in CORE_COLLECTIONS_FOR_MIGRATION:
        result = await raw_db[collection_name].update_many(missing_company_query, {"$set": {"company_id": default_company_id}})
        if result.modified_count:
            stats[collection_name] = result.modified_count

    user_access_result = await raw_db.users.update_many(
        {
            "$or": [
                {"company_access_ids": {"$exists": False}},
                {"company_access_ids": None},
                {"company_access_ids": []},
            ]
        },
        [{"$set": {"company_access_ids": [{"$ifNull": ["$company_id", default_company_id]}]}}],
    )
    if user_access_result.modified_count:
        stats["users_company_access_ids"] = user_access_result.modified_count
    return stats


async def ensure_company_indexes(raw_db):
    await raw_db.companies.create_index("id", unique=True, name="uniq_company_id")
    await raw_db.companies.create_index("slug", unique=True, sparse=True, name="uniq_company_slug")
    await raw_db.users.create_index("company_access_ids", name="idx_users_company_access_ids")

    for collection_name in sorted(INDEXED_COMPANY_COLLECTIONS):
        await raw_db[collection_name].create_index("company_id", name=f"idx_{collection_name}_company_id")

    info = await raw_db.expenses.index_information()
    if "uniq_expenses_hard_dedupe_key" in info:
        await raw_db.expenses.drop_index("uniq_expenses_hard_dedupe_key")

    await raw_db.expenses.create_index(
        [("company_id", 1), ("hard_dedupe_key", 1)],
        unique=True,
        partialFilterExpression={
            "company_id": {"$exists": True},
            "hard_dedupe_key": {"$exists": True},
            "dedupe_exempt": False,
        },
        name="uniq_expenses_company_hard_dedupe_key",
    )