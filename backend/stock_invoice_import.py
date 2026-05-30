"""
Módulo: Importação de Fatura para Stock via OCR (Gemini 2.5 Pro).

Fluxo:
  1. Admin faz upload de imagem/PDF de uma fatura → POST /api/materials/import-invoice/extract
  2. Backend usa Gemini para extrair: fornecedor + NIF + linhas (descrição/qty/unidade/preço)
  3. Para cada linha, match contra materials_db por (nif, descrição fuzzy)
  4. Devolve preview estruturado com:
     - matched_same_cost: items existentes onde preço == DB → só somar qty
     - matched_cost_changed: items existentes onde preço difere → admin decide
     - new_items: items novos a criar
  5. Admin revê e POST /api/materials/import-invoice/apply com decisões
  6. Backend aplica: cria materials novos, soma qty no stock, atualiza preço se aceite,
     cria stock_movements type='entrada' para cada linha aplicada.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional, Callable
from datetime import datetime, timezone
from pathlib import Path
import os
import uuid
import json
import logging
import re
from difflib import SequenceMatcher

from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

logger = logging.getLogger(__name__)

STOCK_INVOICES_DIR = Path("/app/backend/uploads/stock_invoices")
STOCK_INVOICES_DIR.mkdir(parents=True, exist_ok=True)


def _norm(s: str) -> str:
    """Normaliza string para fuzzy match: lowercase, sem acentos, sem caracteres especiais."""
    if not s:
        return ""
    s = s.lower().strip()
    # remove punctuation
    s = re.sub(r"[^\w\s]", " ", s)
    # collapse spaces
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


async def _ocr_invoice_lines(file_path: Path, mime_type: str) -> dict:
    """Usa Gemini para extrair fornecedor e linhas da fatura."""
    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        return {"error": "EMERGENT_LLM_KEY not set"}

    system = (
        "És um assistente especializado em extrair dados de faturas de materiais (eletricidade, "
        "telecomunicações, construção) em Portugal. Responde APENAS com JSON válido, sem texto "
        "antes ou depois, sem markdown."
    )

    prompt = (
        "Analisa esta fatura PORTUGUESA de fornecimento de materiais e extrai em JSON:\n"
        "{\n"
        '  "supplier": "nome completo do fornecedor",\n'
        '  "nif": "NIF do fornecedor (9 dígitos, sem espaços)",\n'
        '  "invoice_number": "número da fatura",\n'
        '  "date": "data YYYY-MM-DD",\n'
        '  "currency": "EUR",\n'
        '  "lines": [\n'
        '    {\n'
        '      "code": "código/referência se existir (ex: REF, EAN, código fornecedor)",\n'
        '      "description": "descrição completa do material (mantém marca/modelo)",\n'
        '      "brand": "marca se identificável",\n'
        '      "unit": "un|mt|kg|cx|rolo (default un)",\n'
        '      "quantity": número (sempre positivo, mesmo que apareça como negativo no caso de descontos ignora essa linha),\n'
        '      "unit_price": preço unitário SEM IVA (number),\n'
        '      "vat_rate": taxa IVA em % (6, 13 ou 23),\n'
        '      "line_total_net": qty * unit_price (number),\n'
        '      "category": "uma de: Material Eléctrico|Material Telecomunicações|Cabos|Iluminação|"\n'
        '                   "Ferramentas|Caixas|Tubos|Mecanismos|Quadros|Proteções|Outros"\n'
        '    }\n'
        '  ]\n'
        "}\n\n"
        "Regras:\n"
        "- Ignora linhas de descontos globais, transportes, taxas ambientais, embalagem retornável.\n"
        "- Se uma linha for descrita em várias linhas físicas (continuação), junta tudo na 'description'.\n"
        "- Se o preço unitário não estiver explícito, calcula a partir do total da linha / qty.\n"
        "- 'unit' deve ser uma das opções listadas — se a fatura mostrar 'metros' usa 'mt', 'caixas' usa 'cx'.\n"
        "- NÃO inventes dados. Se um campo não existe, deixa string vazia ou 0.\n"
        "- Responde APENAS com o JSON."
    )

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"stock-invoice-{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("gemini", "gemini-2.5-pro")

        attach = FileContentWithMimeType(file_path=str(file_path), mime_type=mime_type)
        response = await chat.send_message(UserMessage(text=prompt, file_contents=[attach]))

        text = response.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        if text.endswith("```"):
            text = text[:-3].strip()

        data = json.loads(text)
        lines = []
        for ln in data.get("lines", []):
            try:
                qty = float(ln.get("quantity") or 0)
                unit_price = float(ln.get("unit_price") or 0)
            except (TypeError, ValueError):
                continue
            if qty <= 0:
                continue
            lines.append({
                "code": str(ln.get("code", "")).strip(),
                "description": str(ln.get("description", "")).strip(),
                "brand": str(ln.get("brand", "")).strip(),
                "unit": (str(ln.get("unit", "")).strip().lower() or "un"),
                "quantity": qty,
                "unit_price": unit_price,
                "vat_rate": float(ln.get("vat_rate") or 23),
                "line_total_net": float(ln.get("line_total_net") or (qty * unit_price)),
                "category": str(ln.get("category", "Outros")).strip() or "Outros",
            })
        return {
            "supplier": str(data.get("supplier", "")).strip(),
            "nif": str(data.get("nif", "")).strip().replace(" ", ""),
            "invoice_number": str(data.get("invoice_number", "")).strip(),
            "date": str(data.get("date", "")).strip(),
            "currency": "EUR",
            "lines": lines,
        }
    except Exception as e:
        logger.exception("Stock invoice OCR error: %s", e)
        return {"error": f"Erro a processar fatura: {e}"}


# ----- Models de apply -----

class ApplyLineDecision(BaseModel):
    action: str                  # "create" | "update_stock_only" | "update_stock_and_price" | "skip"
    description: str
    quantity: float
    unit_price: float
    code: str = ""
    brand: str = ""
    unit: str = "un"
    category: str = ""
    vat_rate: float = 23
    existing_material_id: Optional[str] = None  # se "update_*"


class ApplyImportInput(BaseModel):
    supplier: str = ""
    nif: str = ""
    invoice_number: str = ""
    date: str = ""
    file_ref: Optional[str] = None
    lines: List[ApplyLineDecision]


def create_stock_import_router(db, get_current_user: Callable):
    router = APIRouter(prefix="/api/materials/import-invoice", tags=["stock-invoice-import"])

    SIMILARITY_THRESHOLD_HIGH = 0.85    # match forte
    SIMILARITY_THRESHOLD_LOW = 0.65     # fuzzy match (precisa confirmação)

    @router.post("/extract")
    async def extract(file: UploadFile = File(...), user=Depends(get_current_user)):
        """1) Upload da fatura. 2) OCR. 3) Match com DB. 4) Devolve preview agrupado."""
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

        saved_name = f"{uuid.uuid4().hex}{ext}"
        saved_path = STOCK_INVOICES_DIR / saved_name
        content = await file.read()
        saved_path.write_bytes(content)

        extracted = await _ocr_invoice_lines(saved_path, mime)
        if "error" in extracted:
            raise HTTPException(status_code=500, detail=extracted["error"])

        supplier = extracted.get("supplier", "")
        nif = extracted.get("nif", "")
        lines = extracted.get("lines", [])

        if not lines:
            raise HTTPException(status_code=422, detail="Não foi possível extrair items desta fatura. Tira foto com mais nitidez ou faz upload do PDF original.")

        # 1) Recolher candidatos da DB: prioridade aos com mesmo NIF.
        candidate_query = {}
        if nif:
            # Materiais cujo supplier_nif == nif (criados a partir deste fornecedor antes)
            # OR sem nif mas com mesmo nome de fornecedor
            candidate_query = {"$or": [{"supplier_nif": nif}, {"supplier": supplier} if supplier else {"supplier_nif": nif}]}
        materials_pool = await db.materials_db.find(candidate_query if candidate_query else {}, {"_id": 0}).to_list(5000)
        # Se vazio com filtro de NIF, abrir para todos (fornecedor novo)
        if not materials_pool:
            materials_pool = await db.materials_db.find({}, {"_id": 0}).to_list(5000)

        preview_lines = []
        for ln in lines:
            desc = ln["description"]
            code = ln.get("code", "")
            # 2) Match por código exacto
            best = None
            best_score = 0.0
            for m in materials_pool:
                # match forte se mesmo NIF E (mesmo código ou alta similaridade do nome)
                if code and m.get("code") and code.lower() == m["code"].lower():
                    best = m
                    best_score = 1.0
                    break
                sim = _similarity(desc, m.get("description", ""))
                # bónus se for mesmo fornecedor (nif ou nome)
                if nif and m.get("supplier_nif") == nif:
                    sim = min(1.0, sim + 0.10)
                elif supplier and _norm(supplier) == _norm(m.get("supplier", "")):
                    sim = min(1.0, sim + 0.05)
                if sim > best_score:
                    best = m
                    best_score = sim

            current_price = float((best or {}).get("purchase_price", 0) or 0)
            new_price = float(ln.get("unit_price", 0) or 0)
            price_diff = new_price - current_price
            price_diff_pct = (price_diff / current_price * 100) if current_price > 0 else None

            if best and best_score >= SIMILARITY_THRESHOLD_HIGH:
                # Match forte
                same_cost = abs(price_diff) < 0.005 or (current_price == 0 and new_price == 0)
                preview_lines.append({
                    **ln,
                    "match_status": "matched_same_cost" if same_cost else "matched_cost_changed",
                    "match_score": round(best_score, 3),
                    "existing_material_id": best["id"],
                    "existing_description": best.get("description", ""),
                    "existing_code": best.get("code", ""),
                    "existing_unit": best.get("unit", "un"),
                    "existing_stock_current": float(best.get("stock_current", 0) or 0),
                    "existing_purchase_price": current_price,
                    "price_diff": round(price_diff, 4),
                    "price_diff_pct": round(price_diff_pct, 1) if price_diff_pct is not None else None,
                    "suggested_action": "update_stock_only" if same_cost else "update_stock_and_price",
                })
            elif best and best_score >= SIMILARITY_THRESHOLD_LOW:
                # Match fraco — admin confirma
                preview_lines.append({
                    **ln,
                    "match_status": "fuzzy",
                    "match_score": round(best_score, 3),
                    "existing_material_id": best["id"],
                    "existing_description": best.get("description", ""),
                    "existing_purchase_price": current_price,
                    "existing_stock_current": float(best.get("stock_current", 0) or 0),
                    "price_diff": round(price_diff, 4),
                    "price_diff_pct": round(price_diff_pct, 1) if price_diff_pct is not None else None,
                    "suggested_action": "create",  # default seguro: criar novo
                })
            else:
                preview_lines.append({
                    **ln,
                    "match_status": "new",
                    "match_score": round(best_score, 3) if best else 0,
                    "suggested_action": "create",
                })

        summary = {
            "matched_same_cost": sum(1 for x in preview_lines if x["match_status"] == "matched_same_cost"),
            "matched_cost_changed": sum(1 for x in preview_lines if x["match_status"] == "matched_cost_changed"),
            "fuzzy": sum(1 for x in preview_lines if x["match_status"] == "fuzzy"),
            "new": sum(1 for x in preview_lines if x["match_status"] == "new"),
            "total_lines": len(preview_lines),
            "total_value_net": round(sum(x["line_total_net"] for x in preview_lines), 2),
        }

        return {
            "file_ref": saved_name,
            "supplier": supplier,
            "nif": nif,
            "invoice_number": extracted.get("invoice_number", ""),
            "date": extracted.get("date", ""),
            "summary": summary,
            "lines": preview_lines,
        }

    @router.post("/apply")
    async def apply(input: ApplyImportInput, user=Depends(get_current_user)):
        """Aplica as decisões do admin: cria/atualiza materiais, cria movimentos de stock."""
        if not input.lines:
            raise HTTPException(status_code=400, detail="Sem linhas para processar")

        created = []
        updated_stock = []
        updated_price = []
        skipped = []
        movements = []

        for ln in input.lines:
            if ln.action == "skip":
                skipped.append(ln.description)
                continue

            qty = float(ln.quantity or 0)
            new_price = float(ln.unit_price or 0)
            if qty <= 0:
                skipped.append(f"{ln.description} (qty <= 0)")
                continue

            if ln.action == "create":
                mat = {
                    "id": str(uuid.uuid4()),
                    "code": ln.code or "",
                    "description": ln.description,
                    "category": ln.category or "Outros",
                    "subcategory": "",
                    "brand": ln.brand or "",
                    "supplier": input.supplier or "",
                    "supplier_nif": input.nif or "",
                    "unit": ln.unit or "un",
                    "purchase_price": new_price,
                    "market_price": 0,
                    "waste_pct": 5,
                    "stock_current": qty,
                    "stock_min": 0,
                    "vat_rate": float(ln.vat_rate or 23),
                    "notes": f"Criado a partir de fatura {input.invoice_number} ({input.supplier})",
                    "active": True,
                    "price_history": [{"price": new_price, "date": datetime.now(timezone.utc).isoformat(), "source": f"invoice {input.invoice_number}"}],
                    "price_updated_at": datetime.now(timezone.utc).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.materials_db.insert_one(mat)
                created.append({"id": mat["id"], "description": mat["description"], "qty": qty})
                # movimento de stock
                mov = {
                    "id": str(uuid.uuid4()),
                    "material_id": mat["id"],
                    "material_name": mat["description"],
                    "type": "entrada",
                    "quantity": qty,
                    "balance_after": qty,
                    "reason": f"Importação fatura {input.invoice_number} ({input.supplier})",
                    "invoice_number": input.invoice_number,
                    "supplier_nif": input.nif,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "created_by": user.get("id", ""),
                }
                await db.stock_movements.insert_one(mov)
                movements.append(mov["id"])

            elif ln.action in ("update_stock_only", "update_stock_and_price"):
                if not ln.existing_material_id:
                    skipped.append(f"{ln.description} (sem material_id)")
                    continue
                mat = await db.materials_db.find_one({"id": ln.existing_material_id}, {"_id": 0})
                if not mat:
                    skipped.append(f"{ln.description} (material já não existe)")
                    continue
                old_price = float(mat.get("purchase_price", 0) or 0)
                old_stock = float(mat.get("stock_current", 0) or 0)
                new_stock = old_stock + qty
                update_doc = {"stock_current": new_stock}
                if ln.action == "update_stock_and_price" and abs(new_price - old_price) > 0.0001:
                    update_doc["purchase_price"] = new_price
                    update_doc["price_updated_at"] = datetime.now(timezone.utc).isoformat()
                    history = mat.get("price_history", [])
                    history.append({"price": new_price, "date": datetime.now(timezone.utc).isoformat(), "source": f"invoice {input.invoice_number}", "previous": old_price})
                    update_doc["price_history"] = history
                    updated_price.append({"id": mat["id"], "description": mat["description"], "from": old_price, "to": new_price})
                # garante supplier_nif persistido se ainda não tinha
                if input.nif and not mat.get("supplier_nif"):
                    update_doc["supplier_nif"] = input.nif
                if input.supplier and not mat.get("supplier"):
                    update_doc["supplier"] = input.supplier
                await db.materials_db.update_one({"id": mat["id"]}, {"$set": update_doc})
                updated_stock.append({"id": mat["id"], "description": mat["description"], "qty_added": qty, "stock_after": new_stock})

                mov = {
                    "id": str(uuid.uuid4()),
                    "material_id": mat["id"],
                    "material_name": mat["description"],
                    "type": "entrada",
                    "quantity": qty,
                    "balance_after": new_stock,
                    "reason": f"Importação fatura {input.invoice_number} ({input.supplier})",
                    "invoice_number": input.invoice_number,
                    "supplier_nif": input.nif,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "created_by": user.get("id", ""),
                }
                await db.stock_movements.insert_one(mov)
                movements.append(mov["id"])
            else:
                skipped.append(f"{ln.description} (action='{ln.action}' inválida)")

        return {
            "ok": True,
            "summary": {
                "created": len(created),
                "updated_stock": len(updated_stock),
                "updated_price": len(updated_price),
                "skipped": len(skipped),
                "stock_movements": len(movements),
            },
            "created": created,
            "updated_stock": updated_stock,
            "updated_price": updated_price,
            "skipped": skipped,
        }

    return router
