"""
Client Profile 360° — mini-CRM endpoint.
Aggregates proposals, works, invoices, expenses and service orders for a given client.
"""
from fastapi import APIRouter, Depends
from typing import Optional
from datetime import datetime, timezone
import logging, re

logger = logging.getLogger(__name__)


def create_client_profile_router(db, get_current_user):
    router = APIRouter(prefix="/api/clients", tags=["clients"])

    def _norm(name: str) -> str:
        """Normalise client name for matching."""
        return re.sub(r'\s+', ' ', (name or '').strip().lower())

    @router.get("")
    async def list_clients(user=Depends(get_current_user)):
        """Return distinct client names across all modules."""
        names = set()
        for col, field in [
            ("proposals", "client_name"),
            ("works", "client_name"),
            ("invoices", "client_name"),
            ("expenses", "supplier"),
            ("service_orders", "client_name"),
        ]:
            try:
                vals = await db[col].distinct(field)
                for v in vals:
                    if v and isinstance(v, str) and v.strip():
                        names.add(v.strip())
            except Exception:
                pass
        return sorted(names, key=str.lower)

    @router.get("/profile")
    async def client_profile(name: str, user=Depends(get_current_user)):
        """Full 360° profile for a client by name (case-insensitive exact match)."""
        pattern = re.compile(r'^' + re.escape(name.strip()) + r'$', re.IGNORECASE)

        # ── Proposals ─────────────────────────────────────────────
        proposals_cursor = db.proposals.find(
            {"client_name": pattern},
            {"_id": 0, "id": 1, "title": 1, "client_name": 1, "tier": 1, "status": 1, "total_pvp": 1, "created_at": 1, "signed_at": 1}
        ).sort("created_at", -1)
        proposals = await proposals_cursor.to_list(100)

        # ── Works ─────────────────────────────────────────────────
        works_cursor = db.works.find(
            {"client_name": pattern},
            {"_id": 0, "id": 1, "title": 1, "client_name": 1, "status": 1, "created_at": 1}
        ).sort("created_at", -1)
        works = await works_cursor.to_list(100)

        # ── Invoices ──────────────────────────────────────────────
        invoices_cursor = db.invoices.find(
            {"client_name": pattern},
            {"_id": 0, "id": 1, "number": 1, "client_name": 1, "client_nif": 1, "value_total": 1,
             "status": 1, "issue_date": 1, "due_date": 1, "payments": 1}
        ).sort("issue_date", -1)
        invoices = await invoices_cursor.to_list(200)

        # ── Service Orders ────────────────────────────────────────
        orders_cursor = db.service_orders.find(
            {"client_name": pattern},
            {"_id": 0, "id": 1, "client_name": 1, "service_type": 1, "status": 1, "description": 1, "created_at": 1}
        ).sort("created_at", -1)
        service_orders = await orders_cursor.to_list(100)

        # ── KPIs ──────────────────────────────────────────────────
        total_invoiced = sum(i.get("value_total", 0) or 0 for i in invoices)
        total_received = sum(
            sum(p.get("amount", 0) or 0 for p in (i.get("payments") or []))
            for i in invoices
        )
        total_pending = total_invoiced - total_received

        # Average payment days
        payment_days = []
        for inv in invoices:
            issue = inv.get("issue_date")
            payments = inv.get("payments") or []
            if issue and payments:
                try:
                    issue_dt = datetime.fromisoformat(issue.replace("Z", "+00:00")) if isinstance(issue, str) else issue
                    for pay in payments:
                        pay_date = pay.get("date")
                        if pay_date:
                            pay_dt = datetime.fromisoformat(pay_date.replace("Z", "+00:00")) if isinstance(pay_date, str) else pay_date
                            if hasattr(issue_dt, 'date') and hasattr(pay_dt, 'date'):
                                diff = (pay_dt.date() if hasattr(pay_dt, 'date') else pay_dt) - (issue_dt.date() if hasattr(issue_dt, 'date') else issue_dt)
                                if hasattr(diff, 'days'):
                                    payment_days.append(diff.days)
                except Exception:
                    pass

        avg_payment_days = round(sum(payment_days) / len(payment_days)) if payment_days else None

        # NIF from invoices
        nif = None
        for inv in invoices:
            if inv.get("client_nif"):
                nif = inv["client_nif"]
                break

        # Proposals stats
        proposals_total_pvp = sum(p.get("total_pvp", 0) or 0 for p in proposals)
        proposals_accepted = len([p for p in proposals if p.get("status") == "aceite"])

        return {
            "name": name.strip(),
            "nif": nif,
            "kpis": {
                "total_invoiced": round(total_invoiced, 2),
                "total_received": round(total_received, 2),
                "total_pending": round(total_pending, 2),
                "avg_payment_days": avg_payment_days,
                "proposals_count": len(proposals),
                "proposals_accepted": proposals_accepted,
                "proposals_total_pvp": round(proposals_total_pvp, 2),
                "works_count": len(works),
                "invoices_count": len(invoices),
                "service_orders_count": len(service_orders),
            },
            "proposals": proposals,
            "works": works,
            "invoices": invoices,
            "service_orders": service_orders,
        }

    return router
