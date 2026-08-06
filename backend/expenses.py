"""
Modulo de Custos / Despesas com extracao automatica de faturas via IA (Gemini 2.5 Pro).
Funcionalidades:
- Upload de factura (PDF/JPG/PNG)
- Extracao IA de NIF, fornecedor, valor, IVA, data, numero
- Classificacao por categoria e tipo (fixo/variavel/obra)
- Associacao a obra especifica (centro de custo)
- Dashboard mensal: total gasto, por categoria, por obra
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import os
import json
import logging
import base64
from pathlib import Path

from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

logger = logging.getLogger(__name__)

EXPENSES_DIR = Path("/app/backend/uploads/expenses")
EXPENSES_DIR.mkdir(parents=True, exist_ok=True)

expenses_router = APIRouter(prefix="/api/expenses", tags=["expenses"])

CATEGORIES = [
    "Combustível",
    "Material",
    "Fornecedor",
    "Serviços",
    "Comunicações",
    "Rendas",
    "Seguros",
    "Contabilidade/Advogado",
    "Ferramentas",
    "Viatura",
    "Alimentação",
    "Imposto/Taxa",
    "Outros",
]


class ExpenseCreate(BaseModel):
    date: str              # YYYY-MM-DD
    supplier: str = ""
    nif: str = ""
    invoice_number: str = ""
    category: str = "Outros"
    type: str = "variavel"    # fixo, variavel, obra
    obra_id: Optional[str] = None
    obra_name: Optional[str] = None
    value_net: float = 0       # sem IVA
    vat_rate: float = 23       # taxa IVA %
    vat_amount: float = 0      # valor do IVA
    value_gross: float = 0     # com IVA
    payment_method: str = ""
    notes: str = ""
    invoice_file: Optional[str] = None    # filename


class ExpenseUpdate(BaseModel):
    date: Optional[str] = None
    supplier: Optional[str] = None
    nif: Optional[str] = None
    invoice_number: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    obra_id: Optional[str] = None
    obra_name: Optional[str] = None
    value_net: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = None
    value_gross: Optional[float] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


async def extract_invoice_data(file_path: Path, mime_type: str) -> dict:
    """Use Gemini to extract structured data from a PT invoice."""
    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        return {"error": "EMERGENT_LLM_KEY not set"}

    system = (
        "És um assistente especializado em extrair dados de faturas portuguesas. "
        "Responde APENAS com JSON válido, sem texto antes ou depois. "
        "Se um campo não for visível na fatura, devolve string vazia ou 0. "
        "Valores monetários em euros como número (não como string com €)."
    )

    prompt = (
        "Analisa esta fatura portuguesa e extrai os seguintes dados em JSON:\n"
        "{\n"
        '  "supplier": "nome completo do fornecedor/emitente",\n'
        '  "nif": "NIF do fornecedor (9 dígitos)",\n'
        '  "invoice_number": "número da fatura",\n'
        '  "date": "data da fatura YYYY-MM-DD",\n'
        '  "value_net": valor líquido sem IVA (number),\n'
        '  "vat_rate": taxa de IVA em % (6, 13 ou 23),\n'
        '  "vat_amount": valor do IVA (number),\n'
        '  "value_gross": valor total com IVA (number),\n'
        '  "category": "uma de: Combustível, Material Elétrico, Material de Obra, Fornecedor, Serviços, Comunicações, Rendas, Seguros, Contabilidade/Advogado, Ferramentas, Viatura, Alimentação, Imposto/Taxa, Outros",\n'
        '  "description": "breve descrição do que foi faturado"\n'
        "}\n\n"
        "Responde APENAS com o JSON, sem markdown ```."
    )

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"invoice-{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("gemini", "gemini-3.1-pro-preview")

        attach = FileContentWithMimeType(file_path=str(file_path), mime_type=mime_type)
        response = await chat.send_message(UserMessage(text=prompt, file_contents=[attach]))

        # Clean possible markdown code fences
        text = response.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        if text.endswith("```"):
            text = text[:-3].strip()

        data = json.loads(text)
        result = {
            "supplier": str(data.get("supplier", "")).strip(),
            "nif": str(data.get("nif", "")).strip().replace(" ", ""),
            "invoice_number": str(data.get("invoice_number", "")).strip(),
            "date": str(data.get("date", "")).strip()[:10],
            "value_net": float(data.get("value_net", 0) or 0),
            "vat_rate": float(data.get("vat_rate", 23) or 23),
            "vat_amount": float(data.get("vat_amount", 0) or 0),
            "value_gross": float(data.get("value_gross", 0) or 0),
            "category": str(data.get("category", "Outros")).strip() or "Outros",
            "description": str(data.get("description", "")).strip(),
        }

        # Smart categorization: apply bank analysis patterns
        result["type"] = _smart_type_from_supplier(result["supplier"], result["category"])
        # Smart category from keywords (override AI if AI gave generic/Outros)
        kw_cat = _smart_category_from_supplier(result["supplier"])
        if kw_cat:
            if result["category"] in ("Outros", ""):
                result["category"] = kw_cat
                result["category_source"] = "palavras-chave"
            else:
                result["category_source"] = "IA"
        else:
            result["category_source"] = "IA" if result["category"] != "Outros" else "genérico"
        return result
    except Exception as e:
        logger.error(f"Invoice extraction failed: {e}")
        return {"error": str(e)}


# ── Smart categorization (same intelligence as bank analysis) ──────
_SUPPLIER_TYPE_MAP = {
    # Obra (electrical/construction suppliers)
    "worten": "obra", "leroy merlin": "obra", "aki": "obra", "bricomarche": "obra",
    "megaelectro": "obra", "janz": "obra", "schneider": "obra", "hager": "obra",
    "legrand": "obra", "abb": "obra", "siemens": "obra", "efapel": "obra",
    "cembre": "obra", "general cable": "obra", "cabelte": "obra", "solidal": "obra",
    "philips": "obra", "osram": "obra", "ledvance": "obra", "gewiss": "obra",
    "maxmat": "obra", "bigmat": "obra", "sotecnisol": "obra", "saint-gobain": "obra",
    # Fixo (utilities, insurance, rent)
    "vodafone": "fixo", "meo": "fixo", "nos ": "fixo", "nowo": "fixo",
    "edp": "fixo", "galp energia": "fixo", "endesa": "fixo", "iberdrola": "fixo",
    "epal": "fixo", "fidelidade": "fixo", "allianz": "fixo", "tranquilidade": "fixo",
    "ageas": "fixo", "ok teleseguros": "fixo", "contabilidade": "fixo",
    "contabilista": "fixo", "seguro": "fixo",
    # Variavel (fuel, meals, parking)
    "bp ": "variavel", "cepsa": "variavel", "repsol": "variavel", "prio": "variavel",
    "via verde": "variavel", "restaurante": "variavel", "estacionamento": "variavel",
}

_CATEGORY_TYPE_MAP = {
    "Material Elétrico": "obra", "Material de Obra": "obra", "Material": "obra",
    "Ferramentas": "obra", "Fornecedor": "obra",
    "Combustível": "variavel", "Viatura": "variavel", "Alimentação": "variavel",
    "Comunicações": "fixo", "Rendas": "fixo", "Seguros": "fixo",
    "Contabilidade/Advogado": "fixo", "Imposto/Taxa": "fixo",
    "Serviços": "variavel", "Outros": "variavel",
}


def _smart_type_from_supplier(supplier: str, ai_category: str) -> str:
    """Determine expense type (fixo/variavel/obra) from supplier name and AI category."""
    s = (supplier or "").lower()
    # 1. Check supplier name against known patterns
    for pattern, etype in _SUPPLIER_TYPE_MAP.items():
        if pattern in s:
            return etype
    # 2. Fall back to AI category mapping
    return _CATEGORY_TYPE_MAP.get(ai_category, "variavel")


# ── Smart category from supplier keywords ──────────────────────
_SUPPLIER_CATEGORY_MAP = {
    # Combustível
    "bp ": "Combustível", "cepsa": "Combustível", "repsol": "Combustível",
    "prio": "Combustível", "gasolina": "Combustível", "gasoleo": "Combustível",
    "combustivel": "Combustível", "galp": "Combustível",
    # Material (electrical/construction suppliers)
    "leroy merlin": "Material", "aki": "Material", "bricomarche": "Material",
    "worten": "Material", "megaelectro": "Material", "maxmat": "Material",
    "bigmat": "Material", "janz": "Material", "schneider": "Material",
    "hager": "Material", "legrand": "Material", "abb": "Material",
    "siemens": "Material", "efapel": "Material", "gewiss": "Material",
    "cembre": "Material", "general cable": "Material", "cabelte": "Material",
    "solidal": "Material", "philips": "Material", "osram": "Material",
    "ledvance": "Material", "sotecnisol": "Fornecedor", "saint-gobain": "Fornecedor",
    "material electrico": "Material", "material eletrico": "Material",
    # Ferramentas
    "ferramentas": "Ferramentas", "bosch": "Ferramentas", "dewalt": "Ferramentas",
    "makita": "Ferramentas", "hilti": "Ferramentas", "stanley": "Ferramentas",
    # Comunicações
    "vodafone": "Comunicações", "meo": "Comunicações", "nos ": "Comunicações", "nowo": "Comunicações",
    # Rendas
    "renda": "Rendas", "aluguer": "Rendas", "arrendamento": "Rendas",
    # Seguros
    "fidelidade": "Seguros", "allianz": "Seguros", "tranquilidade": "Seguros",
    "ageas": "Seguros", "ok teleseguros": "Seguros", "seguro": "Seguros",
    # Contabilidade/Advogado
    "contabilidade": "Contabilidade/Advogado", "contabilista": "Contabilidade/Advogado",
    "advogado": "Contabilidade/Advogado", "advocacia": "Contabilidade/Advogado",
    # Imposto/Taxa
    "at.gov": "Imposto/Taxa", "autoridade tributaria": "Imposto/Taxa",
    "impostos": "Imposto/Taxa", "seg social": "Imposto/Taxa",
    "seguranca social": "Imposto/Taxa",
    # Alimentação
    "restaurante": "Alimentação", "refeicao": "Alimentação", "cafe": "Alimentação",
    "supermercado": "Alimentação", "pingo doce": "Alimentação",
    "continente": "Alimentação", "lidl": "Alimentação",
    # Viatura (portagens, estacionamento)
    "via verde": "Viatura", "portagem": "Viatura", "estacionamento": "Viatura",
    "parking": "Viatura", "scut": "Viatura",
    # Serviços (energia/água)
    "edp": "Serviços", "endesa": "Serviços", "iberdrola": "Serviços", "epal": "Serviços",
}


def _smart_category_from_supplier(supplier: str) -> Optional[str]:
    """Determine expense category from supplier name using keyword matching."""
    s = (supplier or "").lower()
    for pattern, cat in _SUPPLIER_CATEGORY_MAP.items():
        if pattern in s:
            return cat
    return None


def _month_prefix(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def create_expenses_router(db, get_current_user):

    async def _find_duplicate(invoice_number: str, nif: str = "", supplier: str = "", exclude_id: Optional[str] = None) -> Optional[dict]:
        """Match on (invoice_number) AND (NIF OR supplier). Case-insensitive, trimmed."""
        inv = (invoice_number or "").strip()
        if not inv:
            return None
        import re as _re
        inv_re = f"^{_re.escape(inv)}$"
        or_clauses = []
        if nif and nif.strip():
            or_clauses.append({"nif": nif.strip()})
        if supplier and supplier.strip():
            or_clauses.append({"supplier": {"$regex": f"^{_re.escape(supplier.strip())}$", "$options": "i"}})
        if not or_clauses:
            return None
        query = {
            "invoice_number": {"$regex": inv_re, "$options": "i"},
            "$or": or_clauses,
        }
        if exclude_id:
            query["id"] = {"$ne": exclude_id}
        return await db.expenses.find_one(query, {"_id": 0})

    @expenses_router.get("/categories")
    async def get_categories(user=Depends(get_current_user)):
        return CATEGORIES

    @expenses_router.post("/extract")
    async def extract_from_upload(file: UploadFile = File(...), user=Depends(get_current_user)):
        """Upload a file and get AI-extracted invoice data with smart categorization and duplicate detection."""
        filename = file.filename or "invoice"
        ext = Path(filename).suffix.lower() or ".bin"
        if ext not in [".pdf", ".jpg", ".jpeg", ".png", ".webp"]:
            raise HTTPException(status_code=400, detail="Formato não suportado. Use PDF, JPG, PNG ou WEBP.")

        mime_map = {
            ".pdf": "application/pdf",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
        }
        mime = mime_map[ext]

        # Save to disk (for persistence)
        saved_name = f"{uuid.uuid4().hex}{ext}"
        saved_path = EXPENSES_DIR / saved_name
        content = await file.read()
        saved_path.write_bytes(content)

        # Call AI
        extracted = await extract_invoice_data(saved_path, mime)

        if isinstance(extracted, dict) and extracted.get("error"):
            return {"file_name": saved_name, "original_name": filename, "file_size": len(content), "extracted": extracted, "duplicate": None, "suggestions": None}

        # ── Smart suggestions from expense history ──────────────
        suggestions = None
        if isinstance(extracted, dict) and extracted.get("supplier"):
            supplier_lower = extracted["supplier"].lower()
            # Check historical expenses for this supplier
            hist = await db.expenses.find(
                {"supplier": {"$regex": extracted["supplier"][:20], "$options": "i"}},
                {"_id": 0, "category": 1, "type": 1, "obra_id": 1, "obra_name": 1}
            ).sort("created_at", -1).to_list(5)
            if hist:
                from collections import Counter
                cats = Counter(h.get("category", "Outros") for h in hist)
                types = Counter(h.get("type", "variavel") for h in hist)
                most_cat = cats.most_common(1)[0][0]
                most_type = types.most_common(1)[0][0]
                last_obra = next((h for h in hist if h.get("obra_id")), None)
                suggestions = {
                    "category": most_cat,
                    "type": most_type,
                    "source": "histórico",
                    "confidence": round(cats.most_common(1)[0][1] / len(hist) * 100),
                    "obra_id": last_obra.get("obra_id") if last_obra else None,
                    "obra_name": last_obra.get("obra_name") if last_obra else None,
                }
                # History overrides AI/keywords if AI didn't have a strong opinion
                if most_cat != "Outros":
                    extracted["category"] = most_cat
                    extracted["category_source"] = "histórico"
                if most_type:
                    extracted["type"] = most_type

        # ── Duplicate detection (3 layers) ──────────────────────
        duplicate = None
        # Layer 1: Exact invoice number match
        if isinstance(extracted, dict) and extracted.get("invoice_number"):
            dup = await _find_duplicate(
                extracted.get("invoice_number", ""),
                extracted.get("nif", ""),
                extracted.get("supplier", ""),
            )
            if dup:
                duplicate = {
                    "id": dup.get("id"),
                    "supplier": dup.get("supplier"),
                    "invoice_number": dup.get("invoice_number"),
                    "date": dup.get("date"),
                    "value_gross": dup.get("value_gross"),
                    "reason": "Mesmo número de fatura e fornecedor",
                }

        # Layer 2: Date + amount + supplier similarity (fuzzy)
        if not duplicate and isinstance(extracted, dict) and extracted.get("date") and extracted.get("value_gross"):
            fuzzy_q = {"date": extracted["date"]}
            gross = extracted["value_gross"]
            # Match within 1% of amount
            fuzzy_q["value_gross"] = {"$gte": gross * 0.99, "$lte": gross * 1.01}
            if extracted.get("supplier"):
                import re as _re
                fuzzy_q["supplier"] = {"$regex": _re.escape(extracted["supplier"][:15]), "$options": "i"}
            match = await db.expenses.find_one(fuzzy_q, {"_id": 0, "id": 1, "supplier": 1, "date": 1, "value_gross": 1, "invoice_number": 1})
            if match:
                duplicate = {
                    "id": match.get("id"),
                    "supplier": match.get("supplier"),
                    "invoice_number": match.get("invoice_number"),
                    "date": match.get("date"),
                    "value_gross": match.get("value_gross"),
                    "reason": "Mesma data, valor e fornecedor similar",
                }

        # Layer 3: Bank sync check (bank_txn_id)
        if not duplicate and isinstance(extracted, dict) and extracted.get("date") and extracted.get("value_gross"):
            bank_match = await db.expenses.find_one(
                {"bank_txn_id": {"$exists": True, "$ne": None}, "date": extracted["date"],
                 "value_gross": {"$gte": extracted["value_gross"] * 0.99, "$lte": extracted["value_gross"] * 1.01}},
                {"_id": 0, "id": 1, "supplier": 1, "date": 1, "value_gross": 1}
            )
            if bank_match:
                duplicate = {
                    "id": bank_match.get("id"),
                    "supplier": bank_match.get("supplier"),
                    "date": bank_match.get("date"),
                    "value_gross": bank_match.get("value_gross"),
                    "reason": "Já importado do extrato bancário",
                }

        return {
            "file_name": saved_name,
            "original_name": filename,
            "file_size": len(content),
            "extracted": extracted,
            "duplicate": duplicate,
            "suggestions": suggestions,
        }

    @expenses_router.post("")
    async def create_expense(input: ExpenseCreate, force: bool = False, user=Depends(get_current_user)):
        # Duplicate guard: invoice_number + (NIF or supplier)
        if not force and (input.invoice_number or "").strip():
            dup = await _find_duplicate(input.invoice_number, input.nif, input.supplier)
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "duplicate_invoice",
                        "message": f"Fatura {input.invoice_number} já registada para {dup.get('supplier', '—')} em {dup.get('date', '—')}.",
                        "existing": dup,
                    },
                )
        doc = {
            **input.model_dump(),
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user["id"],
        }
        # If gross not set but net+vat set, compute gross
        if not doc.get("value_gross") and doc.get("value_net"):
            doc["value_gross"] = round(doc["value_net"] * (1 + doc.get("vat_rate", 23) / 100), 2)
            doc["vat_amount"] = round(doc["value_gross"] - doc["value_net"], 2)
        await db.expenses.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @expenses_router.get("")
    async def list_expenses(
        month: Optional[int] = None,
        year: Optional[int] = None,
        category: Optional[str] = None,
        type: Optional[str] = None,
        obra_id: Optional[str] = None,
        user=Depends(get_current_user),
    ):
        q = {}
        if year and month:
            q["date"] = {"$regex": f"^{_month_prefix(year, month)}"}
        elif year:
            q["date"] = {"$regex": f"^{year:04d}"}
        if category:
            q["category"] = category
        if type:
            q["type"] = type
        if obra_id:
            q["obra_id"] = obra_id
        expenses = await db.expenses.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
        return expenses

    @expenses_router.get("/summary")
    async def summary(year: Optional[int] = None, month: Optional[int] = None, user=Depends(get_current_user)):
        now = datetime.now(timezone.utc)
        y = year or now.year
        all_exp = await db.expenses.find({"date": {"$regex": f"^{y:04d}"}}, {"_id": 0}).to_list(5000)

        by_month = {m: 0 for m in range(1, 13)}
        iva_by_month = {m: 0 for m in range(1, 13)}
        count_by_month = {m: 0 for m in range(1, 13)}
        by_category = {}
        by_type = {"fixo": 0, "variavel": 0, "obra": 0}
        by_obra = {}
        total_year = 0
        total_iva = 0

        for e in all_exp:
            try:
                m = int(e.get("date", "")[5:7])
            except Exception:
                m = 0
            gross = e.get("value_gross", 0) or 0
            iva = e.get("vat_amount", 0) or 0
            total_year += gross
            total_iva += iva
            if m:
                by_month[m] = round(by_month.get(m, 0) + gross, 2)
                iva_by_month[m] = round(iva_by_month.get(m, 0) + iva, 2)
                count_by_month[m] = count_by_month.get(m, 0) + 1
            cat = e.get("category", "Outros")
            by_category[cat] = round(by_category.get(cat, 0) + gross, 2)
            tp = e.get("type", "variavel")
            by_type[tp] = round(by_type.get(tp, 0) + gross, 2)
            if e.get("obra_id"):
                ob = e.get("obra_name") or e["obra_id"]
                by_obra[ob] = round(by_obra.get(ob, 0) + gross, 2)

        # Selected month: defaults to current month if same year, else December
        selected_month = month if (month and 1 <= month <= 12) else (now.month if now.year == y else 12)

        return {
            "year": y,
            "selected_month": selected_month,
            "total_year": round(total_year, 2),
            "total_iva": round(total_iva, 2),
            "count_year": len(all_exp),
            "month_total": round(by_month.get(selected_month, 0), 2),
            "month_iva": round(iva_by_month.get(selected_month, 0), 2),
            "month_count": count_by_month.get(selected_month, 0),
            "current_month_total": round(by_month.get(selected_month, 0), 2),  # backward compat
            "count": len(all_exp),  # backward compat
            "by_month": by_month,
            "iva_by_month": iva_by_month,
            "count_by_month": count_by_month,
            "by_category": by_category,
            "by_type": by_type,
            "by_obra": by_obra,
        }

    @expenses_router.get("/{expense_id}")
    async def get_expense(expense_id: str, user=Depends(get_current_user)):
        e = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        if not e:
            raise HTTPException(status_code=404, detail="Despesa não encontrada")
        return e

    @expenses_router.put("/{expense_id}")
    async def update_expense(expense_id: str, input: ExpenseUpdate, force: bool = False, user=Depends(get_current_user)):
        data = input.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Nada para atualizar")
        # Duplicate guard if invoice fields changed
        if not force and "invoice_number" in data and data.get("invoice_number"):
            current = await db.expenses.find_one({"id": expense_id}, {"_id": 0}) or {}
            nif = data.get("nif", current.get("nif", ""))
            sup = data.get("supplier", current.get("supplier", ""))
            dup = await _find_duplicate(data["invoice_number"], nif, sup, exclude_id=expense_id)
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "duplicate_invoice",
                        "message": f"Fatura {data['invoice_number']} já registada para {dup.get('supplier', '—')} em {dup.get('date', '—')}.",
                        "existing": dup,
                    },
                )
        r = await db.expenses.update_one({"id": expense_id}, {"$set": data})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Despesa não encontrada")
        e = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        return e

    @expenses_router.delete("/{expense_id}")
    async def delete_expense(expense_id: str, user=Depends(get_current_user)):
        e = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        if not e:
            raise HTTPException(status_code=404, detail="Despesa não encontrada")
        # Delete file
        if e.get("invoice_file"):
            fp = EXPENSES_DIR / e["invoice_file"]
            if fp.exists():
                try:
                    fp.unlink()
                except Exception:
                    pass
        await db.expenses.delete_one({"id": expense_id})
        return {"ok": True}

    @expenses_router.get("/file/{filename}")
    async def get_invoice_file(filename: str, user=Depends(get_current_user)):
        """Serve an uploaded invoice file (PDF/image)."""
        from fastapi.responses import FileResponse
        fp = EXPENSES_DIR / filename
        if not fp.exists():
            raise HTTPException(status_code=404, detail="Ficheiro não encontrado")
        return FileResponse(fp)

    @expenses_router.post("/ai-categorize")
    async def ai_categorize_expenses(user=Depends(get_current_user)):
        """Re-categorize all expenses using AI (keyword matching + LLM fallback).
        Only touches expenses with category 'Outros' or missing type."""
        api_key = os.environ.get("EMERGENT_LLM_KEY", "")

        all_exp = await db.expenses.find({}, {"_id": 0}).to_list(5000)
        updated = 0
        ai_batch = []

        for e in all_exp:
            eid = e.get("id")
            supplier = e.get("supplier", "")
            old_cat = e.get("category", "Outros")
            old_type = e.get("type", "variavel")
            changes = {}

            # 1. Keyword-based categorization
            kw_cat = _smart_category_from_supplier(supplier)
            if kw_cat and old_cat in ("Outros", "", "outro", "Outro"):
                changes["category"] = kw_cat

            # 2. Type inference from supplier
            new_type = _smart_type_from_supplier(supplier, changes.get("category", old_cat))
            if new_type != old_type:
                changes["type"] = new_type

            if changes:
                await db.expenses.update_one({"id": eid}, {"$set": changes})
                updated += 1
            elif old_cat in ("Outros", "", "outro", "Outro"):
                # Queue for AI categorization
                ai_batch.append(e)

        # 3. AI batch for remaining uncategorized
        ai_updated = 0
        if ai_batch and api_key:
            try:
                batches = [ai_batch[i:i+40] for i in range(0, len(ai_batch), 40)]
                for batch in batches:
                    items = "\n".join([f"{i}: {e.get('supplier','')} | {e.get('value_gross',0)}€ | {e.get('notes','')}" for i, e in enumerate(batch)])
                    prompt = f"""Categoriza estas despesas de uma empresa portuguesa de eletricidade (Obelisco Radical).
Para cada linha, responde APENAS com o número e a categoria, uma por linha.

Categorias possíveis:
- Combustível, Material, Fornecedor, Serviços, Comunicações, Rendas, Seguros
- Contabilidade/Advogado, Ferramentas, Viatura, Alimentação, Imposto/Taxa, Outros

Despesas:
{items}

Responde EXACTAMENTE no formato: NUMERO:CATEGORIA (uma por linha)"""

                    chat = LlmChat(
                        api_key=api_key,
                        session_id=f"exp-cat-{uuid.uuid4().hex[:8]}",
                        system_message="És um assistente de categorização de despesas empresariais portuguesas.",
                    ).with_model("openai", "gpt-4o-mini")
                    resp = await chat.send_message(UserMessage(text=prompt))

                    for line in resp.strip().split("\n"):
                        line = line.strip()
                        if ":" not in line:
                            continue
                        parts = line.split(":", 1)
                        try:
                            idx = int(parts[0].strip())
                            cat = parts[1].strip()
                            if 0 <= idx < len(batch) and cat in CATEGORIES:
                                eid = batch[idx].get("id")
                                new_type = _smart_type_from_supplier(batch[idx].get("supplier", ""), cat)
                                await db.expenses.update_one({"id": eid}, {"$set": {"category": cat, "type": new_type}})
                                ai_updated += 1
                        except (ValueError, IndexError):
                            continue
            except Exception as ex:
                logger.warning(f"AI expense categorization failed: {ex}")

        return {
            "total": len(all_exp),
            "updated_keywords": updated,
            "updated_ai": ai_updated,
            "unchanged": len(all_exp) - updated - ai_updated,
            "message": f"{updated + ai_updated} despesas recategorizadas ({updated} por palavras-chave, {ai_updated} por IA)",
        }

    return expenses_router
