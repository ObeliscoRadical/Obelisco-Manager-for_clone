"""
Importar propostas antigas em PDF e converter para o formato interno
(Orçamento + itens) usando Gemini 2.5 Pro via emergentintegrations.

Endpoint principal:
- POST /api/proposal-import/extract  (upload PDF -> JSON estruturado, sem gravar)

O commit final é feito pelo cliente chamando os endpoints já existentes:
- POST /api/budgets
- POST /api/budgets/{id}/generate-proposals
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pathlib import Path
import os
import json
import uuid
import logging

from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

logger = logging.getLogger(__name__)

IMPORTS_DIR = Path("/app/backend/uploads/proposal_imports")
IMPORTS_DIR.mkdir(parents=True, exist_ok=True)

proposal_import_router = APIRouter(prefix="/api/proposal-import", tags=["proposal-import"])


SYSTEM_PROMPT = (
    "És um assistente especializado em analisar propostas comerciais portuguesas "
    "de instalação elétrica e telecomunicações. Extrais os dados de uma proposta "
    "antiga (PDF) e devolves um JSON estruturado. Responde APENAS com JSON válido, "
    "sem markdown e sem texto antes ou depois. "
    "Valores monetários em euros como número puro (sem € e sem separadores de milhar)."
)

USER_PROMPT = """Analisa esta proposta comercial (PDF). Extrai os dados em JSON com a estrutura EXACTA abaixo.

REGRAS DE EXTRAÇÃO:
1. Se a proposta tiver itens detalhados (linhas com descrição, quantidade e preço), extrai LINHA A LINHA cada item.
2. Se a proposta for resumida (apenas cliente + valor total + descrição geral) e não conseguires isolar linhas de itens claros, cria UM ÚNICO item chamado "Trabalho contratado (importado da proposta original)" com quantity=1 e sale_price = valor total da proposta.
3. Valores unitários (unit_cost) — se não estiverem visíveis, deixa a 0 e o utilizador ajustará depois; deixa também sale_price_hint com o valor de venda unitário extraído da proposta (não deixes a 0 se conseguires ler).
4. Se não tiveres a certeza absoluta, marca "confidence" como "medium" ou "low".

FORMATO OBRIGATÓRIO (retorna EXATAMENTE este JSON, preenchido):
{
  "title": "título da proposta / obra",
  "client_name": "nome do cliente",
  "client_phone": "telefone se visível",
  "client_email": "email se visível",
  "client_nif": "NIF do cliente se visível (9 dígitos)",
  "proposal_date": "data da proposta YYYY-MM-DD se visível",
  "proposal_number": "número/referência da proposta se visível",
  "notes": "observações, condições de pagamento ou descrição geral",
  "detected_total": valor total detectado (com ou sem IVA, o que estiver mais claro) como número,
  "detected_total_includes_vat": true/false,
  "vat_rate": taxa de IVA em % (6, 13 ou 23) se visível, senão 23,
  "items": [
    {
      "category": "categoria (ex: Elétrica, Telecomunicações, Iluminação, Materiais, Mão de obra, Outros)",
      "name": "descrição da linha",
      "unit": "unidade (un, m, m2, h, etc)",
      "quantity": quantidade numérica,
      "unit_cost": custo unitário se detectável, senão 0,
      "sale_price_hint": preço de venda unitário lido da proposta (ou 0 se não visível),
      "line_total_hint": total da linha lido da proposta (ou 0)
    }
  ],
  "is_summary": true se caiu no caso resumido (único item),
  "confidence": "high" | "medium" | "low",
  "raw_summary": "resumo curto do que foi lido da proposta"
}

Responde APENAS com JSON válido."""


async def _extract_via_llm(file_path: Path) -> dict:
    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        return {"error": "EMERGENT_LLM_KEY not set"}

    chat = LlmChat(
        api_key=api_key,
        session_id=f"prop-import-{uuid.uuid4().hex[:8]}",
        system_message=SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-3.1-pro-preview")

    attach = FileContentWithMimeType(file_path=str(file_path), mime_type="application/pdf")

    try:
        response = await chat.send_message(UserMessage(text=USER_PROMPT, file_contents=[attach]))
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return {"error": f"Falha na análise IA: {e}"}

    text = (response or "").strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    if text.endswith("```"):
        text = text[:-3].strip()

    try:
        data = json.loads(text)
    except Exception as e:
        logger.error(f"Invalid JSON from LLM: {e}. Text: {text[:400]}")
        return {"error": "Resposta da IA não é JSON válido.", "raw": text[:1200]}
    return data


def _normalize(data: dict) -> dict:
    """Normaliza os dados extraídos para o formato aceite pelo BudgetCreate."""
    def s(v, d=""):
        return str(v or d).strip()
    def f(v, d=0.0):
        try: return float(v or 0)
        except Exception: return float(d)
    def i(v, d=0):
        try: return int(float(v or 0))
        except Exception: return int(d)

    raw_items = data.get("items") or []
    items = []
    for it in raw_items:
        items.append({
            "category": s(it.get("category")),
            "name": s(it.get("name")) or "Item importado",
            "unit": s(it.get("unit"), "un"),
            "quantity": f(it.get("quantity"), 1),
            "unit_cost": f(it.get("unit_cost"), 0),
            "sale_price_hint": f(it.get("sale_price_hint"), 0),
            "line_total_hint": f(it.get("line_total_hint"), 0),
            "margin": 0.6,
            "discount_type": "percentage",
            "discount_value": 0,
        })

    # Fallback: se veio vazio, criar item único com detected_total
    if not items:
        items = [{
            "category": "Outros",
            "name": "Trabalho contratado (importado da proposta original)",
            "unit": "un",
            "quantity": 1,
            "unit_cost": 0,
            "sale_price_hint": f(data.get("detected_total"), 0),
            "line_total_hint": f(data.get("detected_total"), 0),
            "margin": 0.6,
            "discount_type": "percentage",
            "discount_value": 0,
        }]

    return {
        "title": s(data.get("title")) or "Proposta importada",
        "client_name": s(data.get("client_name")) or "Cliente importado",
        "client_phone": s(data.get("client_phone")),
        "client_email": s(data.get("client_email")),
        "client_nif": s(data.get("client_nif")),
        "proposal_date": s(data.get("proposal_date"))[:10],
        "proposal_number": s(data.get("proposal_number")),
        "notes": s(data.get("notes")),
        "detected_total": f(data.get("detected_total"), 0),
        "detected_total_includes_vat": bool(data.get("detected_total_includes_vat", False)),
        "vat_rate": f(data.get("vat_rate"), 23),
        "is_summary": bool(data.get("is_summary", False)),
        "confidence": s(data.get("confidence"), "medium"),
        "raw_summary": s(data.get("raw_summary")),
        "items": items,
    }


def create_proposal_import_router(get_current_user):

    @proposal_import_router.post("/extract")
    async def extract_proposal_pdf(file: UploadFile = File(...), user=Depends(get_current_user)):
        """Faz upload de PDF e devolve JSON estruturado extraído. NÃO grava nada."""
        filename = file.filename or "proposta.pdf"
        ext = Path(filename).suffix.lower()
        if ext != ".pdf":
            raise HTTPException(status_code=400, detail="Só é suportado PDF nesta versão.")

        saved_name = f"{uuid.uuid4().hex}.pdf"
        saved_path = IMPORTS_DIR / saved_name
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Ficheiro vazio.")
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="PDF demasiado grande (máx. 25 MB).")
        saved_path.write_bytes(content)

        extracted = await _extract_via_llm(saved_path)
        if isinstance(extracted, dict) and extracted.get("error"):
            return {
                "file_name": saved_name,
                "original_name": filename,
                "error": extracted.get("error"),
                "raw": extracted.get("raw"),
            }

        normalized = _normalize(extracted or {})
        return {
            "file_name": saved_name,
            "original_name": filename,
            "file_size": len(content),
            "extracted": normalized,
        }

    return proposal_import_router
