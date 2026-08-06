"""
Bank Statement Analysis module.
Uploads bank statements (CSV/Excel/OFX), uses AI to categorize transactions,
detects recurring payments, projects cash flow, and estimates Portuguese taxes (IRC).
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import defaultdict
import uuid, logging, os, io, json, re, math

logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent / "bank_uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# Portuguese known suppliers (electrical/construction)
KNOWN_SUPPLIERS = {
    "worten": "obra", "leroy merlin": "obra", "aki": "obra", "bricomarche": "obra",
    "megaelectro": "obra", "janz": "obra", "schneider": "obra", "hager": "obra",
    "legrand": "obra", "abb": "obra", "siemens": "obra", "efapel": "obra",
    "cembre": "obra", "general cable": "obra", "cabelte": "obra", "solidal": "obra",
    "philips": "obra", "osram": "obra", "ledvance": "obra", "gewiss": "obra",
    "material electrico": "obra", "material eletrico": "obra", "electricidade": "obra",
    "ferragem": "obra", "ferreteria": "obra", "cimpor": "obra", "secil": "obra",
    "maxmat": "obra", "bigmat": "obra", "sotecnisol": "obra", "saint-gobain": "obra",
    # Fixed costs patterns
    "vodafone": "fixo", "meo": "fixo", "nos ": "fixo", "nowo": "fixo",
    "edp": "fixo", "galp": "fixo", "endesa": "fixo", "iberdrola": "fixo",
    "agua": "fixo", "epal": "fixo", "seguro": "fixo", "fidelidade": "fixo",
    "allianz": "fixo", "tranquilidade": "fixo", "ageas": "fixo", "ok teleseguros": "fixo",
    "renda": "fixo", "aluguer": "fixo", "arrendamento": "fixo",
    "contabilidade": "fixo", "contabilista": "fixo", "toc": "fixo",
    "seg social": "fixo", "seguranca social": "fixo",
    "at.gov": "fixo", "autoridade tributaria": "fixo", "impostos": "fixo",
    # Variable costs
    "combustivel": "variavel", "gasolina": "variavel", "gasoleo": "variavel",
    "bp ": "variavel", "cepsa": "variavel", "repsol": "variavel", "prio": "variavel",
    "portagem": "variavel", "via verde": "variavel", "scut": "variavel",
    "estacionamento": "variavel", "parking": "variavel",
    "restaurante": "variavel", "refeicao": "variavel", "cafe": "variavel",
    "supermercado": "variavel", "pingo doce": "variavel", "continente": "variavel", "lidl": "variavel",
    "uber": "variavel", "bolt": "variavel", "taxi": "variavel",
}


def _parse_csv(content: bytes, filename: str) -> list:
    """Parse CSV bank statement. Tries multiple common formats."""
    import pandas as pd
    # Try different encodings and separators
    for enc in ['utf-8', 'latin-1', 'cp1252']:
        for sep in [';', ',', '\t']:
            try:
                df = pd.read_csv(io.BytesIO(content), encoding=enc, sep=sep, dtype=str)
                if len(df.columns) >= 3 and len(df) > 0:
                    return _normalize_df(df, filename)
            except Exception:
                continue
    raise ValueError("Formato CSV não reconhecido. Verifique se o ficheiro tem pelo menos colunas de data, descrição e valor.")


def _parse_excel(content: bytes, filename: str) -> list:
    """Parse Excel bank statement."""
    import pandas as pd
    try:
        df = pd.read_excel(io.BytesIO(content), dtype=str)
        if len(df.columns) >= 3 and len(df) > 0:
            return _normalize_df(df, filename)
    except Exception:
        pass
    raise ValueError("Formato Excel não reconhecido.")


def _parse_ofx(content: bytes, filename: str) -> list:
    """Parse OFX/QFX bank statement."""
    try:
        from ofxparse import OfxParser
        ofx = OfxParser.parse(io.BytesIO(content))
        txns = []
        for acc in [ofx.account] if hasattr(ofx, 'account') else []:
            for t in acc.statement.transactions:
                txns.append({
                    "date": t.date.strftime("%Y-%m-%d") if t.date else "",
                    "description": str(t.memo or t.payee or "").strip(),
                    "amount": float(t.amount),
                    "type": "credit" if float(t.amount) > 0 else "debit",
                })
        return txns
    except Exception as e:
        raise ValueError(f"Erro ao ler OFX: {e}")


def _normalize_df(df, filename: str) -> list:
    """Normalize a pandas DataFrame into a list of transactions."""
    import pandas as pd
    cols = [c.lower().strip() for c in df.columns]
    df.columns = cols

    # Find date column
    date_col = next((c for c in cols if any(k in c for k in ['data', 'date', 'dt', 'mov'])), cols[0])
    # Find description column
    desc_col = next((c for c in cols if any(k in c for k in ['descri', 'description', 'detalhe', 'referencia', 'ref', 'memo', 'nome'])), cols[1] if len(cols) > 1 else cols[0])
    # Find amount columns (debit/credit or single amount)
    amount_col = None
    debit_col = None
    credit_col = None
    for c in cols:
        if any(k in c for k in ['debito', 'debit', 'saida', 'valor debito']):
            debit_col = c
        elif any(k in c for k in ['credito', 'credit', 'entrada', 'valor credito']):
            credit_col = c
        elif any(k in c for k in ['valor', 'amount', 'montante', 'importancia']):
            amount_col = c

    txns = []
    for _, row in df.iterrows():
        try:
            # Parse date
            raw_date = str(row.get(date_col, "")).strip()
            parsed_date = None
            for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y"]:
                try:
                    parsed_date = datetime.strptime(raw_date, fmt).strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue
            if not parsed_date:
                continue

            desc = str(row.get(desc_col, "")).strip()
            if not desc:
                continue

            # Parse amount
            if debit_col and credit_col:
                deb = _parse_amount(str(row.get(debit_col, "0")))
                cred = _parse_amount(str(row.get(credit_col, "0")))
                amt = cred - deb if cred > 0 else -abs(deb)
            elif amount_col:
                amt = _parse_amount(str(row.get(amount_col, "0")))
            else:
                continue

            if amt == 0:
                continue

            txns.append({
                "date": parsed_date,
                "description": desc,
                "amount": round(amt, 2),
                "type": "credit" if amt > 0 else "debit",
            })
        except Exception:
            continue

    return txns


def _parse_amount(s: str) -> float:
    """Parse Portuguese/European number format."""
    s = s.strip().replace(" ", "").replace("€", "").replace("EUR", "")
    if not s or s in ('-', 'nan', 'None', ''):
        return 0.0
    # Handle European format: 1.234,56 → 1234.56
    if ',' in s and '.' in s:
        if s.index(',') > s.index('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s:
        s = s.replace(',', '.')
    return float(s)


def _pre_categorize(desc: str) -> Optional[str]:
    """Pre-categorize based on known supplier patterns. More specific matches first."""
    d = desc.lower()

    # Revenue patterns (check first — transfers from clients)
    revenue_patterns = ["transferencia de cliente", "transf cliente", "pagamento recebido", "deposito", "cobranca"]
    for p in revenue_patterns:
        if p in d:
            return "receita"

    # Salary patterns
    salary_patterns = ["ordenado", "salario", "subsidio ferias", "subsidio natal", "vencimento"]
    for p in salary_patterns:
        if p in d:
            return "salario"

    # Tax patterns
    tax_patterns = ["autoridade tributaria", "at.gov", "irs ", "irc ", "iva ", "imposto"]
    for p in tax_patterns:
        if p in d:
            return "imposto"

    # Fixed costs — specific brands/entities first (before generic words)
    fixed_brands = [
        "vodafone", "meo", "nos ", "nowo", "edp", "galp", "endesa", "iberdrola",
        "epal", "agua de", "fidelidade", "allianz", "tranquilidade", "ageas", "ok teleseguros",
        "contabilidade", "contabilista", "toc online",
        "seg social", "seguranca social", "seguro",
        "renda", "aluguer", "arrendamento",
    ]
    for p in fixed_brands:
        if p in d:
            return "fixo"

    # Construction/electrical suppliers (obra)
    for pattern, cat in KNOWN_SUPPLIERS.items():
        if cat == "obra" and pattern in d:
            return "obra"

    # Variable costs
    for pattern, cat in KNOWN_SUPPLIERS.items():
        if cat == "variavel" and pattern in d:
            return "variavel"

    return None


async def _ai_categorize_batch(transactions: list) -> list:
    """Use AI to categorize transactions in batch."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        EKEY = os.environ.get("EMERGENT_LLM_KEY")
        if not EKEY:
            return transactions

        # Prepare batch (max 50 at a time)
        uncategorized = [t for t in transactions if not t.get("category")]
        if not uncategorized:
            return transactions

        batches = [uncategorized[i:i+40] for i in range(0, len(uncategorized), 40)]

        for batch in batches:
            items = "\n".join([f"{i}: {t['description']} | {t['amount']}€" for i, t in enumerate(batch)])
            prompt = f"""Categoriza estas transações bancárias de uma empresa portuguesa de eletricidade (Obelisco Radical).
Para cada linha, responde APENAS com o número e a categoria, uma por linha.

Categorias possíveis:
- fixo (rendas, seguros, telecoms, contabilidade, seg social)
- variavel (combustível, portagens, refeições, material escritório)
- obra (material elétrico, construção, fornecedores de obra)
- receita (pagamentos de clientes, transferências recebidas)
- imposto (IRC, IVA, IRS, retenções)
- salario (ordenados, subsídios férias/natal)
- financeiro (juros, comissões bancárias, spreads)
- outro

Transações:
{items}

Responde EXACTAMENTE no formato: NUMERO:CATEGORIA (uma por linha, sem espaços extra)"""

            chat = LlmChat(api_key=EKEY, session_id=f"bank-{uuid.uuid4()}")
            chat = chat.with_model("openai", "gpt-5.4-mini")
            resp = await chat.send_message(UserMessage(text=prompt))

            for line in resp.strip().split("\n"):
                line = line.strip()
                if ":" not in line:
                    continue
                parts = line.split(":", 1)
                try:
                    idx = int(parts[0].strip())
                    cat = parts[1].strip().lower()
                    if 0 <= idx < len(batch) and cat in ("fixo", "variavel", "obra", "receita", "imposto", "salario", "financeiro", "outro"):
                        batch[idx]["category"] = cat
                except (ValueError, IndexError):
                    continue

        # Fallback: any still uncategorized → "outro"
        for t in transactions:
            if not t.get("category"):
                t["category"] = "outro"

    except Exception as e:
        logger.warning(f"AI categorization failed: {e}")
        for t in transactions:
            if not t.get("category"):
                t["category"] = "outro"

    return transactions


def _detect_recurring(transactions: list) -> list:
    """Detect recurring payments (same supplier, similar amount, monthly pattern)."""
    by_desc = defaultdict(list)
    for t in transactions:
        if t["type"] == "debit":
            # Normalize description
            key = re.sub(r'[0-9/\-]+', '', t["description"].lower()).strip()[:40]
            by_desc[key].append(t)

    recurring = []
    for key, txns in by_desc.items():
        if len(txns) < 2:
            continue
        # Check if amounts are similar (within 15%)
        amounts = [abs(t["amount"]) for t in txns]
        avg = sum(amounts) / len(amounts)
        if avg == 0:
            continue
        similar = all(abs(a - avg) / avg < 0.15 for a in amounts)
        if not similar:
            continue
        # Check regularity (monthly-ish: 20-40 day intervals)
        dates = sorted([datetime.strptime(t["date"], "%Y-%m-%d") for t in txns])
        if len(dates) >= 2:
            intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
            avg_interval = sum(intervals) / len(intervals)
            if 15 <= avg_interval <= 45:
                recurring.append({
                    "description": txns[0]["description"],
                    "avg_amount": round(avg, 2),
                    "frequency": "mensal" if 25 <= avg_interval <= 35 else "irregular",
                    "occurrences": len(txns),
                    "category": txns[0].get("category", "outro"),
                    "last_date": max(t["date"] for t in txns),
                })

    return sorted(recurring, key=lambda r: r["avg_amount"], reverse=True)


def _project_cashflow(transactions: list, months_ahead: int = 6) -> list:
    """Project cash flow based on historical averages."""
    monthly = defaultdict(lambda: {"income": 0, "expenses": 0})
    for t in transactions:
        month_key = t["date"][:7]  # YYYY-MM
        if t["amount"] > 0:
            monthly[month_key]["income"] += t["amount"]
        else:
            monthly[month_key]["expenses"] += abs(t["amount"])

    if not monthly:
        return []

    months_sorted = sorted(monthly.keys())
    # Use last 3-6 months average
    recent = months_sorted[-min(6, len(months_sorted)):]
    avg_income = sum(monthly[m]["income"] for m in recent) / len(recent)
    avg_expenses = sum(monthly[m]["expenses"] for m in recent) / len(recent)

    # Historical data
    history = []
    for m in months_sorted:
        d = monthly[m]
        history.append({
            "month": m,
            "income": round(d["income"], 2),
            "expenses": round(d["expenses"], 2),
            "balance": round(d["income"] - d["expenses"], 2),
            "projected": False,
        })

    # Projections
    last_month = datetime.strptime(months_sorted[-1] + "-01", "%Y-%m-%d")
    for i in range(1, months_ahead + 1):
        proj_date = last_month + timedelta(days=32 * i)
        proj_month = proj_date.strftime("%Y-%m")
        # Add slight variance for realism
        variance = 1 + (0.02 * (i - 1))  # Slight growth assumption
        history.append({
            "month": proj_month,
            "income": round(avg_income * variance, 2),
            "expenses": round(avg_expenses * (1 + 0.01 * i), 2),  # Slight cost increase
            "balance": round(avg_income * variance - avg_expenses * (1 + 0.01 * i), 2),
            "projected": True,
        })

    return history


def _estimate_taxes(transactions: list, year: int) -> dict:
    """Estimate Portuguese taxes for IRC regime."""
    total_income = sum(t["amount"] for t in transactions if t["amount"] > 0)
    total_expenses = sum(abs(t["amount"]) for t in transactions if t["amount"] < 0)
    taxable_income = max(0, total_income - total_expenses)

    # IRC 2026 Portugal
    irc_rate = 0.21
    irc_small = 0.17  # PME rate for first 50k
    pme_threshold = 50000

    if taxable_income <= pme_threshold:
        irc_estimate = taxable_income * irc_small
    else:
        irc_estimate = pme_threshold * irc_small + (taxable_income - pme_threshold) * irc_rate

    # Derrama municipal (max 1.5%)
    derrama = taxable_income * 0.015

    # IVA estimation (quarterly)
    iva_collected = total_income * 0.23  # Assume 23% IVA on services
    iva_deductible = sum(abs(t["amount"]) * 0.23 / 1.23 for t in transactions if t.get("category") in ("obra", "variavel", "fixo") and t["amount"] < 0)
    iva_quarterly = max(0, iva_collected - iva_deductible) / 4

    # TSU (employer contribution 23.75% on salaries)
    salary_expenses = sum(abs(t["amount"]) for t in transactions if t.get("category") == "salario" and t["amount"] < 0)
    tsu_estimate = salary_expenses * 0.2375

    # Pagamento por conta (3 installments of 95% of prior year IRC / 3)
    ppc_installment = (irc_estimate * 0.95) / 3

    return {
        "year": year,
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "taxable_income": round(taxable_income, 2),
        "irc_estimate": round(irc_estimate, 2),
        "irc_rate_effective": round((irc_estimate / taxable_income * 100) if taxable_income > 0 else 0, 1),
        "derrama_municipal": round(derrama, 2),
        "iva_quarterly_estimate": round(iva_quarterly, 2),
        "iva_annual_estimate": round(iva_quarterly * 4, 2),
        "tsu_estimate": round(tsu_estimate, 2),
        "ppc_installment": round(ppc_installment, 2),
        "total_tax_burden": round(irc_estimate + derrama + iva_quarterly * 4 + tsu_estimate, 2),
        "tax_rate_effective": round(((irc_estimate + derrama + iva_quarterly * 4 + tsu_estimate) / total_income * 100) if total_income > 0 else 0, 1),
    }


def create_bank_analysis_router(db, get_current_user):
    router = APIRouter(prefix="/api/bank-analysis", tags=["bank-analysis"])

    @router.post("/upload")
    async def upload_statement(file: UploadFile = File(...), user=Depends(get_current_user)):
        """Upload and analyze a bank statement."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")

        filename = file.filename or "statement"
        ext = Path(filename).suffix.lower()
        content = await file.read()

        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(400, "Ficheiro demasiado grande (máx 10MB)")

        # Parse file
        if ext in (".csv", ".txt"):
            transactions = _parse_csv(content, filename)
        elif ext in (".xlsx", ".xls"):
            transactions = _parse_excel(content, filename)
        elif ext in (".ofx", ".qfx"):
            transactions = _parse_ofx(content, filename)
        else:
            raise HTTPException(400, f"Formato não suportado: {ext}. Use CSV, Excel ou OFX.")

        if not transactions:
            raise HTTPException(400, "Nenhuma transação encontrada no ficheiro.")

        # Pre-categorize with known patterns
        for t in transactions:
            cat = _pre_categorize(t["description"])
            if cat:
                t["category"] = cat
            t["id"] = str(uuid.uuid4())

        # AI categorization for unknowns
        transactions = await _ai_categorize_batch(transactions)

        # Detect recurring payments
        recurring = _detect_recurring(transactions)

        # Date range
        dates = [t["date"] for t in transactions]
        date_from = min(dates)
        date_to = max(dates)
        year = int(date_to[:4])

        # Cash flow projection
        cashflow = _project_cashflow(transactions, months_ahead=6)

        # Tax estimation
        taxes = _estimate_taxes(transactions, year)

        # Summary by category
        by_category = defaultdict(lambda: {"count": 0, "total": 0})
        for t in transactions:
            cat = t.get("category", "outro")
            by_category[cat]["count"] += 1
            by_category[cat]["total"] += t["amount"]
        by_category = {k: {"count": v["count"], "total": round(v["total"], 2)} for k, v in by_category.items()}

        # Monthly summary
        by_month = defaultdict(lambda: {"income": 0, "expenses": 0})
        for t in transactions:
            m = t["date"][:7]
            if t["amount"] > 0:
                by_month[m]["income"] += t["amount"]
            else:
                by_month[m]["expenses"] += abs(t["amount"])
        by_month = {k: {"income": round(v["income"], 2), "expenses": round(v["expenses"], 2)} for k, v in sorted(by_month.items())}

        # Save analysis
        analysis = {
            "id": str(uuid.uuid4()),
            "filename": filename,
            "date_from": date_from,
            "date_to": date_to,
            "transaction_count": len(transactions),
            "transactions": transactions,
            "recurring": recurring,
            "cashflow": cashflow,
            "taxes": taxes,
            "by_category": by_category,
            "by_month": by_month,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("name", ""),
        }
        await db.bank_analyses.insert_one(analysis)
        analysis.pop("_id", None)

        return analysis

    @router.get("")
    async def list_analyses(user=Depends(get_current_user)):
        """List all saved analyses."""
        cursor = db.bank_analyses.find(
            {}, {"_id": 0, "id": 1, "filename": 1, "date_from": 1, "date_to": 1,
                 "transaction_count": 1, "created_at": 1, "created_by": 1,
                 "taxes.total_income": 1, "taxes.total_expenses": 1}
        ).sort("created_at", -1)
        return await cursor.to_list(50)

    @router.get("/{analysis_id}")
    async def get_analysis(analysis_id: str, user=Depends(get_current_user)):
        """Get full analysis by ID."""
        doc = await db.bank_analyses.find_one({"id": analysis_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Análise não encontrada")
        return doc

    @router.delete("/{analysis_id}")
    async def delete_analysis(analysis_id: str, user=Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")
        result = await db.bank_analyses.delete_one({"id": analysis_id})
        if result.deleted_count == 0:
            raise HTTPException(404, "Análise não encontrada")
        return {"message": "Análise eliminada"}

    @router.patch("/{analysis_id}/transactions/{txn_id}")
    async def update_transaction_category(analysis_id: str, txn_id: str, category: str, user=Depends(get_current_user)):
        """Manually override a transaction's category."""
        valid = ("fixo", "variavel", "obra", "receita", "imposto", "salario", "financeiro", "outro")
        if category not in valid:
            raise HTTPException(400, f"Categoria inválida. Use: {', '.join(valid)}")
        result = await db.bank_analyses.update_one(
            {"id": analysis_id, "transactions.id": txn_id},
            {"$set": {"transactions.$.category": category}},
        )
        if result.matched_count == 0:
            raise HTTPException(404, "Transação não encontrada")
        return {"ok": True}

    return router
