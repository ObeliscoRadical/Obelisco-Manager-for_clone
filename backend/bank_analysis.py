"""
Bank Statement Analysis module.
Uploads bank statements (CSV/Excel/OFX), uses AI to categorize transactions,
detects recurring payments, projects cash flow, and estimates Portuguese taxes (IRC).
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
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


async def _parse_pdf(content: bytes, filename: str) -> list:
    """Parse PDF bank statement using AI (Gemini) to extract transactions."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        raise ValueError("EMERGENT_LLM_KEY não configurada para leitura de PDF.")

    # Save temp file for Gemini
    tmp_path = UPLOADS_DIR / f"_tmp_{uuid.uuid4().hex}.pdf"
    tmp_path.write_bytes(content)

    try:
        system = (
            "És um assistente especializado em ler extratos bancários portugueses em PDF. "
            "Responde APENAS com JSON válido — um array de objetos. Sem texto antes ou depois."
        )
        prompt = (
            "Analisa este extrato bancário em PDF e extrai TODAS as transações.\n"
            "Para cada transação, devolve um objeto JSON com:\n"
            '{\n'
            '  "date": "YYYY-MM-DD",\n'
            '  "description": "descrição/referência do movimento",\n'
            '  "amount": número (positivo = crédito/entrada, negativo = débito/saída)\n'
            '}\n\n'
            "Regras:\n"
            "- Datas em formato YYYY-MM-DD.\n"
            "- Valores em euros como número (sem € nem texto).\n"
            "- Débitos/saídas devem ser negativos.\n"
            "- Créditos/entradas devem ser positivos.\n"
            "- Inclui TODOS os movimentos visíveis, mesmo se forem muitos.\n"
            "- Se houver colunas separadas de débito e crédito, combina-as.\n"
            "- Ignora linhas de saldo, cabeçalhos e resumos.\n\n"
            "Responde APENAS com o array JSON, sem markdown ```."
        )

        chat = LlmChat(
            api_key=api_key,
            session_id=f"bank-pdf-{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("gemini", "gemini-3.1-pro-preview")

        attach = FileContentWithMimeType(file_path=str(tmp_path), mime_type="application/pdf")
        response = await chat.send_message(UserMessage(text=prompt, file_contents=[attach]))

        # Clean markdown fences
        text = response.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        if text.endswith("```"):
            text = text[:-3].strip()

        data = json.loads(text)
        if not isinstance(data, list):
            raise ValueError("Resposta da IA não é uma lista de transações.")

        txns = []
        for item in data:
            try:
                date_str = str(item.get("date", "")).strip()[:10]
                desc = str(item.get("description", "")).strip()
                amt = float(item.get("amount", 0) or 0)
                if not date_str or not desc or amt == 0:
                    continue
                # Validate date format
                datetime.strptime(date_str, "%Y-%m-%d")
                txns.append({
                    "date": date_str,
                    "description": desc,
                    "amount": round(amt, 2),
                    "type": "credit" if amt > 0 else "debit",
                })
            except (ValueError, TypeError):
                continue

        if not txns:
            raise ValueError("A IA não conseguiu extrair transações do PDF. Verifique se é um extrato bancário legível.")

        return txns
    finally:
        try:
            tmp_path.unlink()
        except Exception:
            pass


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


def _normalize_desc_key(desc: str) -> str:
    """Normalize a transaction description to a stable key for learning overrides.
    Removes dates, numbers/refs, and lowercases."""
    d = re.sub(r'\d{2}/\d{2}', '', desc)           # Remove dd/mm dates
    d = re.sub(r'\d{4,}[/\-]?\d*', '', d)          # Remove long numbers (refs, card numbers)
    d = re.sub(r'\s+', ' ', d).strip().lower()[:60]
    return d


async def _get_user_overrides(db) -> dict:
    """Load all user category overrides as {normalized_key: category}."""
    overrides = await db.category_overrides.find({}, {"_id": 0}).to_list(5000)
    return {o["desc_key"]: o["category"] for o in overrides}


def _pre_categorize(desc: str, user_overrides: dict = None) -> Optional[str]:
    """Pre-categorize based on user overrides first, then known supplier patterns."""
    d = desc.lower()

    # 0. User overrides (learned from manual corrections) — HIGHEST PRIORITY
    if user_overrides:
        norm_key = _normalize_desc_key(desc)
        if norm_key in user_overrides:
            return user_overrides[norm_key]
        # Also try partial matching (first 20 chars of normalized key)
        for ok, ov in user_overrides.items():
            if len(ok) >= 8 and ok[:20] in norm_key:
                return ov

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

            chat = LlmChat(api_key=EKEY, session_id=f"bank-{uuid.uuid4()}", system_message="És um assistente de categorização de transações bancárias portuguesas.")
            chat = chat.with_model("openai", "gpt-4o-mini")
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
    """Detect recurring payments with day-of-month intelligence.
    Groups by normalised supplier, checks amount similarity and date regularity.
    Outputs: frequency (mensal/trimestral/irregular), typical_day, next_expected_date.
    """
    by_desc = defaultdict(list)
    for t in transactions:
        if t["type"] == "debit":
            key = re.sub(r'[0-9/\-]+', '', t["description"].lower()).strip()[:40]
            by_desc[key].append(t)

    recurring = []
    for key, txns in by_desc.items():
        if len(txns) < 2:
            continue
        amounts = [abs(t["amount"]) for t in txns]
        avg = sum(amounts) / len(amounts)
        if avg == 0:
            continue
        similar = all(abs(a - avg) / avg < 0.20 for a in amounts)
        if not similar:
            continue

        dates = sorted([datetime.strptime(t["date"], "%Y-%m-%d") for t in txns])
        if len(dates) < 2:
            continue

        intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
        avg_interval = sum(intervals) / len(intervals)

        # Determine frequency
        if 25 <= avg_interval <= 35:
            frequency = "mensal"
        elif 80 <= avg_interval <= 100:
            frequency = "trimestral"
        else:
            continue  # Not a recognisable pattern

        # Day-of-month intelligence
        days_of_month = [d.day for d in dates]
        from collections import Counter
        day_counts = Counter(days_of_month)
        typical_day = day_counts.most_common(1)[0][0]
        day_consistency = day_counts.most_common(1)[0][1] / len(days_of_month)

        # Calculate next expected date
        last_date = dates[-1]
        if frequency == "mensal":
            next_month = last_date.month + 1
            next_year = last_date.year
            if next_month > 12:
                next_month = 1
                next_year += 1
            try:
                next_expected = datetime(next_year, next_month, min(typical_day, 28))
            except ValueError:
                next_expected = datetime(next_year, next_month, 28)
        elif frequency == "trimestral":
            next_month = last_date.month + 3
            next_year = last_date.year
            while next_month > 12:
                next_month -= 12
                next_year += 1
            try:
                next_expected = datetime(next_year, next_month, min(typical_day, 28))
            except ValueError:
                next_expected = datetime(next_year, next_month, 28)
        else:
            next_expected = last_date + timedelta(days=int(avg_interval))

        recurring.append({
            "description": txns[0]["description"],
            "avg_amount": round(avg, 2),
            "frequency": frequency,
            "occurrences": len(txns),
            "category": txns[0].get("category", "outro"),
            "last_date": max(t["date"] for t in txns),
            "typical_day": typical_day,
            "day_consistency": round(day_consistency * 100),  # % consistency
            "next_expected": next_expected.strftime("%Y-%m-%d"),
            "avg_interval_days": round(avg_interval),
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


def _build_analysis_data(transactions, filename, user_name, user_overrides=None):
    """Build the full analysis dict from parsed transactions."""
    # Pre-categorize with known patterns + user overrides
    for t in transactions:
        cat = _pre_categorize(t["description"], user_overrides)
        if cat:
            t["category"] = cat
        if "id" not in t:
            t["id"] = str(uuid.uuid4())

    return transactions


def _extract_significant_words(text: str) -> set:
    """Extract significant words (>=4 chars) from a description for fuzzy matching.
    Removes dates, reference numbers, common prefixes like COMPRA EL-E."""
    t = text.upper()
    # Remove common bank statement prefixes
    for prefix in ["COMPRA EL-E", "LEV. ATM EL-E", "TRF SEPA+", "PAG.AUT.", "INST ", "P/"]:
        t = t.replace(prefix, "")
    # Remove dates and reference numbers
    t = re.sub(r'\d{2}/\d{2}', '', t)
    t = re.sub(r'\d{5,}[/\-]?\d*', '', t)
    t = re.sub(r'PT\d+', '', t)
    # Split and keep words >= 4 chars (skip common noise)
    noise = {"LDA", "LTD", "LTDA", "UNIPESSOAL", "COMERCIO", "PORTUGAL", "LISBOA", "SEDE", "SANTA", "MARTA", "QUELUZ", "OEIRAS", "AMADORA", "POVOA", "INST"}
    words = set()
    for w in re.split(r'[\s\-/,\.]+', t):
        w = w.strip()
        if len(w) >= 4 and w not in noise and not w.isdigit():
            words.add(w)
    return words


def _fuzzy_match_supplier(txn_desc: str, expense_supplier: str) -> bool:
    """Check if a bank transaction description matches an expense supplier by significant word overlap."""
    txn_words = _extract_significant_words(txn_desc)
    exp_words = _extract_significant_words(expense_supplier)
    if not txn_words or not exp_words:
        return False
    # Match if any significant word appears in both
    common = txn_words & exp_words
    return len(common) > 0


async def _prepare_sync_preview(db, analysis_id, analysis_doc):
    """Prepare sync preview — does NOT create expenses. Returns pending items + possible duplicates for user review.
    Uses fuzzy name matching: extracts significant words from bank descriptions and expense suppliers."""
    try:
        expense_cats = ("fixo", "variavel", "obra", "imposto", "financeiro", "outro")
        to_sync = [t for t in analysis_doc.get("transactions", []) if t["amount"] < 0 and t.get("category") in expense_cats]

        existing_expenses = await db.expenses.find(
            {}, {"_id": 0, "id": 1, "date": 1, "supplier": 1, "value_gross": 1, "invoice_number": 1, "bank_txn_id": 1}
        ).to_list(5000)

        existing_by_txn = {e.get("bank_txn_id") for e in existing_expenses if e.get("bank_txn_id")}

        pending = []
        duplicates = []

        for t in to_sync:
            # Layer 1: Already synced by ID
            if t["id"] in existing_by_txn:
                duplicates.append({"id": t["id"], "description": t["description"], "amount": t["amount"], "date": t["date"],
                                   "category": t.get("category", "outro"), "reason": "Já sincronizado (ID)", "match_type": "exact"})
                continue

            # Layer 2: Fuzzy name + (date OR value) matching
            txn_amount = abs(t["amount"])
            txn_date = t["date"]
            found_match = None

            for e in existing_expenses:
                exp_amount = abs(e.get("value_gross", 0) or 0)
                exp_date = e.get("date", "")
                exp_supplier = e.get("supplier", "")

                # Check fuzzy name match
                if not _fuzzy_match_supplier(t["description"], exp_supplier):
                    continue

                # Name matches — check date AND/OR value
                date_match = txn_date == exp_date
                value_match = exp_amount > 0 and abs(txn_amount - exp_amount) / max(exp_amount, 0.01) < 0.05  # within 5%

                if date_match and value_match:
                    found_match = {"expense_id": e.get("id"), "expense_supplier": exp_supplier, "expense_date": exp_date,
                                   "expense_value": exp_amount, "reason": f"Possível duplicado: {exp_supplier} — mesma data e valor similar",
                                   "match_type": "fuzzy_date_value"}
                    break
                elif date_match:
                    found_match = {"expense_id": e.get("id"), "expense_supplier": exp_supplier, "expense_date": exp_date,
                                   "expense_value": exp_amount, "reason": f"Possível duplicado: {exp_supplier} — mesma data ({exp_date})",
                                   "match_type": "fuzzy_date"}
                elif value_match:
                    # Only flag if amounts are very close (within 1%)
                    if abs(txn_amount - exp_amount) / max(exp_amount, 0.01) < 0.01:
                        found_match = {"expense_id": e.get("id"), "expense_supplier": exp_supplier, "expense_date": exp_date,
                                       "expense_value": exp_amount, "reason": f"Possível duplicado: {exp_supplier} — mesmo valor ({exp_amount:.2f}€)",
                                       "match_type": "fuzzy_value"}

            if found_match:
                duplicates.append({
                    "id": t["id"], "description": t["description"], "amount": t["amount"], "date": t["date"],
                    "category": t.get("category", "outro"),
                    **found_match,
                })
            else:
                pending.append({
                    "id": t["id"],
                    "date": t["date"],
                    "description": t["description"],
                    "amount": t["amount"],
                    "category": t.get("category", "outro"),
                })

        result = {"pending": pending, "duplicates": duplicates, "pending_count": len(pending), "duplicate_count": len(duplicates), "total_processed": len(to_sync)}
        logger.info(f"Sync preview for {analysis_id}: {len(pending)} pending, {len(duplicates)} duplicates")
        return result
    except Exception as e:
        logger.error(f"Sync preview failed for {analysis_id}: {e}")
        return {"pending": [], "duplicates": [], "pending_count": 0, "duplicate_count": 0, "error": str(e)}


async def _auto_feed_calendar(db, analysis_id, analysis_doc, months_ahead=6):
    """Automatically create calendar appointments for predicted recurring expenses."""
    try:
        recurring = analysis_doc.get("recurring", [])
        if not recurring:
            return {"created": 0, "skipped": 0, "total_recurring": 0, "message": "Nenhum pagamento recorrente detectado"}

        today = datetime.now(timezone.utc)
        created = 0
        skipped = 0
        today_naive = today.replace(tzinfo=None)

        for r in recurring:
            typical_day = r.get("typical_day", 15)
            freq = r.get("frequency", "mensal")
            desc = r.get("description", "")[:60]
            amount = r.get("avg_amount", 0)
            cat = r.get("category", "outro")

            future_dates = []
            if freq == "mensal":
                for i in range(1, months_ahead + 1):
                    m = today.month + i
                    y = today.year
                    while m > 12:
                        m -= 12
                        y += 1
                    try:
                        future_dates.append(datetime(y, m, min(typical_day, 28)))
                    except ValueError:
                        future_dates.append(datetime(y, m, 28))
            elif freq == "trimestral":
                for i in range(1, (months_ahead // 3) + 2):
                    m = today.month + (3 * i)
                    y = today.year
                    while m > 12:
                        m -= 12
                        y += 1
                    try:
                        future_dates.append(datetime(y, m, min(typical_day, 28)))
                    except ValueError:
                        future_dates.append(datetime(y, m, 28))

            for fd in future_dates:
                if fd <= today_naive:
                    continue
                date_str = fd.strftime("%Y-%m-%d")

                existing = await db.appointments.find_one({
                    "date": date_str,
                    "title": {"$regex": re.escape(desc[:30]), "$options": "i"},
                    "notes": {"$regex": "Conta Prevista"},
                })
                if existing:
                    skipped += 1
                    continue

                CAT_LABELS = {"fixo": "Custo Fixo", "variavel": "Variável", "obra": "Obra", "imposto": "Imposto", "financeiro": "Financeiro"}
                cat_label = CAT_LABELS.get(cat, cat)

                appointment = {
                    "id": str(uuid.uuid4()),
                    "title": f"💰 {desc}",
                    "client_name": "",
                    "date": date_str,
                    "time_start": "09:00",
                    "time_end": "09:30",
                    "notes": f"Conta Prevista ({cat_label}) · Valor estimado: {amount:.2f}€ · {freq} · Dia típico: {typical_day}",
                    "employee_ids": [],
                    "location": "",
                    "work_id": None,
                    "is_predicted_bill": True,
                    "predicted_amount": amount,
                    "predicted_category": cat,
                    "source_analysis_id": analysis_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.appointments.insert_one(appointment)
                created += 1

        result = {"created": created, "skipped": skipped, "total_recurring": len(recurring),
                  "message": f"{created} contas previstas adicionadas ao calendário"}
        logger.info(f"Auto-feed calendar for {analysis_id}: {created} created, {skipped} skipped")
        return result
    except Exception as e:
        logger.error(f"Auto-feed calendar failed for {analysis_id}: {e}")
        return {"created": 0, "skipped": 0, "total_recurring": 0, "error": str(e)}


async def _finalize_analysis(db, analysis_id, transactions, filename, user_name):
    """Run AI categorization and compute all analytics, then update the DB record.
    Also auto-syncs to expenses and feeds the recurring calendar."""
    try:
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

        analysis_doc = {
            "id": analysis_id,
            "filename": filename,
            "transactions": transactions,
            "recurring": recurring,
            "cashflow": cashflow,
            "taxes": taxes,
            "by_category": by_category,
            "by_month": by_month,
            "date_from": date_from,
            "date_to": date_to,
            "transaction_count": len(transactions),
        }

        # Prepare sync preview (pending user approval — NOT auto-imported)
        sync_preview = await _prepare_sync_preview(db, analysis_id, analysis_doc)
        # Auto-feed recurring calendar (this is safe to auto-run)
        calendar_result = await _auto_feed_calendar(db, analysis_id, analysis_doc)

        await db.bank_analyses.update_one(
            {"id": analysis_id},
            {"$set": {
                "status": "completed",
                "date_from": date_from,
                "date_to": date_to,
                "transaction_count": len(transactions),
                "transactions": transactions,
                "recurring": recurring,
                "cashflow": cashflow,
                "taxes": taxes,
                "by_category": by_category,
                "by_month": by_month,
                "sync_preview": sync_preview,
                "auto_calendar": calendar_result,
            }}
        )
        logger.info(f"Analysis {analysis_id} completed: {len(transactions)} txns, pending_sync={sync_preview.get('pending_count',0)}, calendar={calendar_result.get('created',0)}")
    except Exception as e:
        logger.error(f"Background analysis {analysis_id} failed: {e}")
        await db.bank_analyses.update_one(
            {"id": analysis_id},
            {"$set": {"status": "failed", "error": str(e)}}
        )


async def _process_pdf_background(db, analysis_id, content, filename, user_name):
    """Background task: parse PDF with AI, then finalize."""
    try:
        transactions = await _parse_pdf(content, filename)
        if not transactions:
            await db.bank_analyses.update_one(
                {"id": analysis_id},
                {"$set": {"status": "failed", "error": "Nenhuma transação encontrada no PDF."}}
            )
            return
        user_overrides = await _get_user_overrides(db)
        transactions = _build_analysis_data(transactions, filename, user_name, user_overrides)
        await _finalize_analysis(db, analysis_id, transactions, filename, user_name)
    except Exception as e:
        logger.error(f"PDF background processing failed for {analysis_id}: {e}")
        await db.bank_analyses.update_one(
            {"id": analysis_id},
            {"$set": {"status": "failed", "error": str(e)}}
        )


def create_bank_analysis_router(db, get_current_user):
    import asyncio
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

        analysis_id = str(uuid.uuid4())
        user_name = user.get("name", "")

        # PDF: async background processing (Gemini takes 2-4 min)
        if ext == ".pdf":
            pending = {
                "id": analysis_id,
                "filename": filename,
                "status": "processing",
                "transaction_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": user_name,
            }
            await db.bank_analyses.insert_one(pending)
            asyncio.create_task(_process_pdf_background(db, analysis_id, content, filename, user_name))
            pending.pop("_id", None)
            return pending

        # Non-PDF: synchronous (fast)
        try:
            if ext in (".csv", ".txt"):
                transactions = _parse_csv(content, filename)
            elif ext in (".xlsx", ".xls"):
                transactions = _parse_excel(content, filename)
            elif ext in (".ofx", ".qfx"):
                transactions = _parse_ofx(content, filename)
            else:
                raise HTTPException(400, f"Formato não suportado: {ext}. Use CSV, Excel, OFX ou PDF.")
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(400, str(e))
        except Exception as e:
            logger.error(f"Erro ao processar ficheiro {filename}: {e}")
            raise HTTPException(400, f"Erro ao processar ficheiro: {str(e)}")

        if not transactions:
            raise HTTPException(400, "Nenhuma transação encontrada no ficheiro.")

        transactions = _build_analysis_data(transactions, filename, user_name, await _get_user_overrides(db))

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
            "id": analysis_id,
            "filename": filename,
            "status": "completed",
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
            "created_by": user_name,
        }

        # Prepare sync preview (pending user approval) + auto calendar
        sync_preview = await _prepare_sync_preview(db, analysis_id, analysis)
        calendar_result = await _auto_feed_calendar(db, analysis_id, analysis)
        analysis["sync_preview"] = sync_preview
        analysis["auto_calendar"] = calendar_result

        await db.bank_analyses.insert_one(analysis)
        analysis.pop("_id", None)

        return analysis

    @router.get("")
    async def list_analyses(user=Depends(get_current_user)):
        """List all saved analyses."""
        cursor = db.bank_analyses.find(
            {}, {"_id": 0, "id": 1, "filename": 1, "date_from": 1, "date_to": 1,
                 "transaction_count": 1, "created_at": 1, "created_by": 1,
                 "status": 1, "error": 1,
                 "sync_preview.pending_count": 1, "sync_preview.duplicate_count": 1,
                 "sync_approved": 1, "auto_calendar": 1,
                 "taxes.total_income": 1, "taxes.total_expenses": 1}
        ).sort("created_at", -1)
        return await cursor.to_list(50)

    @router.get("/{analysis_id}/status")
    async def get_analysis_status(analysis_id: str, user=Depends(get_current_user)):
        """Check processing status of an analysis (used for PDF polling).
        Auto-detects stale processing records (>10 min) and marks them as failed."""
        doc = await db.bank_analyses.find_one(
            {"id": analysis_id},
            {"_id": 0, "id": 1, "status": 1, "error": 1, "transaction_count": 1, "filename": 1, "created_at": 1}
        )
        if not doc:
            raise HTTPException(404, "Análise não encontrada")
        # Detect stale processing (>10 min)
        if doc.get("status") == "processing" and doc.get("created_at"):
            try:
                created = datetime.fromisoformat(doc["created_at"].replace("Z", "+00:00"))
                age_min = (datetime.now(timezone.utc) - created).total_seconds() / 60
                if age_min > 10:
                    await db.bank_analyses.update_one(
                        {"id": analysis_id, "status": "processing"},
                        {"$set": {"status": "failed", "error": "Processamento expirou (>10 min). Por favor tente novamente."}}
                    )
                    doc["status"] = "failed"
                    doc["error"] = "Processamento expirou (>10 min). Por favor tente novamente."
            except Exception:
                pass
        doc.pop("created_at", None)
        return doc

    # ── Recurring Costs Consolidation ─────────────────────────────
    def _clean_description(desc: str) -> str:
        """Clean a bank transaction description to a readable supplier/contract name."""
        d = desc.strip()
        d = re.sub(r'^\d{2}/\d{2}(/\d{2,4})?\s*', '', d)
        for pfx in ["COMPRA EL-E", "LEV. ATM EL-E", "LEV.ATM EL-E", "TRF SEPA+ INST", "TRF SEPA+", "PAG.AUT.CARTAO", "PAG.AUT."]:
            if d.upper().startswith(pfx):
                d = d[len(pfx):].strip()
        d = re.sub(r'\b\d{6,}[/\-]?\d*\b', '', d)
        d = re.sub(r'\bPT\d{10,}\b', '', d)
        d = re.sub(r'\s+', ' ', d).strip()
        return d if d else desc[:60]

    def _detect_payment_type(desc: str) -> str:
        """Detect payment type from description."""
        d = desc.upper()
        if "PAG.AUT." in d or "DEBITO DIRETO" in d:
            return "Débito Direto"
        if "TRF SEPA" in d or "TRANSFERENCIA" in d or "TRF " in d:
            return "Transferência"
        if "COMPRA EL-E" in d or "COMPRA" in d:
            return "Compra Cartão"
        if "LEV. ATM" in d or "LEV.ATM" in d:
            return "Levantamento ATM"
        return "Outro"

    @router.get("/recurring-consolidated")
    async def get_recurring_consolidated(user=Depends(get_current_user)):
        """Consolidate recurring transactions across ALL bank analyses into master entries."""
        saved = await db.recurring_masters.find({}, {"_id": 0}).sort("avg_amount", -1).to_list(500)
        if saved:
            return {"masters": saved, "source": "saved"}

        analyses = await db.bank_analyses.find(
            {"status": {"$ne": "failed"}}, {"_id": 0, "transactions": 1, "filename": 1}
        ).to_list(100)

        all_txns = []
        for a in analyses:
            for t in a.get("transactions", []):
                if t.get("amount", 0) < 0:
                    all_txns.append(t)

        if not all_txns:
            return {"masters": [], "source": "computed"}

        from collections import Counter
        groups = defaultdict(list)
        for t in all_txns:
            key = _normalize_desc_key(t["description"])
            if key and len(key) >= 4:
                groups[key].append(t)

        masters = []
        for key, txns in groups.items():
            if len(txns) < 2:
                continue
            amounts = [abs(t["amount"]) for t in txns]
            avg_amount = sum(amounts) / len(amounts)
            consistent = all(abs(a - avg_amount) / max(avg_amount, 0.01) < 0.30 for a in amounts)
            days = []
            months_seen = set()
            for t in txns:
                try:
                    dt = datetime.strptime(t["date"], "%Y-%m-%d")
                    days.append(dt.day)
                    months_seen.add(t["date"][:7])
                except (ValueError, KeyError):
                    pass
            if len(months_seen) < 2:
                continue
            day_counts = Counter(days)
            typical_day = day_counts.most_common(1)[0][0] if day_counts else 0
            day_range = f"Dia {min(days)}" if max(days) - min(days) <= 2 else f"Dia {min(days)}-{max(days)}"
            frequency = "Mensal"
            clean_name = _clean_description(txns[0]["description"])
            payment_type = _detect_payment_type(txns[0]["description"])
            category = txns[0].get("category", "outro")
            masters.append({
                "id": str(uuid.uuid4()), "desc_key": key, "description": clean_name,
                "day_of_month": day_range, "typical_day": typical_day, "category": category,
                "payment_type": payment_type, "frequency": frequency,
                "avg_amount": round(avg_amount, 2), "min_amount": round(min(amounts), 2),
                "max_amount": round(max(amounts), 2), "occurrences": len(txns),
                "months_seen": len(months_seen), "amount_consistent": consistent,
                "notes": "", "last_date": max(t["date"] for t in txns),
                "first_date": min(t["date"] for t in txns),
            })
        masters.sort(key=lambda m: m["avg_amount"], reverse=True)
        if masters:
            await db.recurring_masters.delete_many({})
            await db.recurring_masters.insert_many([{**m} for m in masters])
        return {"masters": masters, "source": "computed"}

    @router.post("/recurring-consolidated/refresh")
    async def refresh_recurring_consolidated(user=Depends(get_current_user)):
        """Force re-computation of recurring consolidated data from all analyses."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")
        await db.recurring_masters.delete_many({})
        return await get_recurring_consolidated(user=user)

    @router.patch("/recurring-consolidated/{master_id}")
    async def update_recurring_master(master_id: str, request: Request, user=Depends(get_current_user)):
        """Update a consolidated recurring entry."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")
        body = await request.json()
        updates = {}
        for field in ("description", "category", "payment_type", "frequency", "notes", "day_of_month"):
            if field in body:
                updates[field] = body[field]
        if "avg_amount" in body:
            updates["avg_amount"] = float(body["avg_amount"])
        if not updates:
            raise HTTPException(400, "Nada para atualizar")
        result = await db.recurring_masters.update_one({"id": master_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(404, "Registo não encontrado")
        doc = await db.recurring_masters.find_one({"id": master_id}, {"_id": 0})
        return doc

    @router.delete("/recurring-consolidated/{master_id}")
    async def delete_recurring_master(master_id: str, user=Depends(get_current_user)):
        """Remove a recurring master entry."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")
        result = await db.recurring_masters.delete_one({"id": master_id})
        if result.deleted_count == 0:
            raise HTTPException(404, "Registo não encontrado")
        return {"ok": True}

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
        """Manually override a transaction's category AND save as learned rule for future extracts."""
        valid = ("fixo", "variavel", "obra", "receita", "imposto", "salario", "financeiro", "outro")
        if category not in valid:
            raise HTTPException(400, f"Categoria inválida. Use: {', '.join(valid)}")

        # Update the transaction
        result = await db.bank_analyses.update_one(
            {"id": analysis_id, "transactions.id": txn_id},
            {"$set": {"transactions.$.category": category}},
        )
        if result.matched_count == 0:
            raise HTTPException(404, "Transação não encontrada")

        # Learn: save override for future use
        analysis = await db.bank_analyses.find_one({"id": analysis_id}, {"_id": 0, "transactions": 1})
        txn = next((t for t in (analysis or {}).get("transactions", []) if t.get("id") == txn_id), None)
        if txn:
            desc_key = _normalize_desc_key(txn["description"])
            if desc_key and len(desc_key) >= 4:
                await db.category_overrides.update_one(
                    {"desc_key": desc_key},
                    {"$set": {
                        "desc_key": desc_key,
                        "category": category,
                        "original_description": txn["description"][:100],
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "updated_by": user.get("name", ""),
                    }},
                    upsert=True,
                )
                logger.info(f"Category override learned: '{desc_key}' → {category}")

        return {"ok": True, "learned": True}

    @router.get("/category-overrides/list")
    async def list_category_overrides(user=Depends(get_current_user)):
        """List all learned category overrides."""
        overrides = await db.category_overrides.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)
        return overrides

    @router.delete("/category-overrides/{desc_key}")
    async def delete_category_override(desc_key: str, user=Depends(get_current_user)):
        """Delete a learned category override."""
        result = await db.category_overrides.delete_one({"desc_key": desc_key})
        if result.deleted_count == 0:
            raise HTTPException(404, "Override não encontrado")
        return {"ok": True}

    @router.patch("/category-overrides/{desc_key}")
    async def update_category_override(desc_key: str, request: Request, user=Depends(get_current_user)):
        """Update the category of a learned override. Body: {"category": "obra"}"""
        body = await request.json()
        new_cat = body.get("category", "").strip()
        valid = ("fixo", "variavel", "obra", "receita", "imposto", "salario", "financeiro", "outro")
        if new_cat not in valid:
            raise HTTPException(400, f"Categoria inválida. Use: {', '.join(valid)}")
        result = await db.category_overrides.update_one(
            {"desc_key": desc_key},
            {"$set": {"category": new_cat, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": user.get("name", "")}},
        )
        if result.matched_count == 0:
            raise HTTPException(404, "Override não encontrado")
        return {"ok": True, "category": new_cat}

    @router.post("/{analysis_id}/approve-sync")
    async def approve_sync(analysis_id: str, request: Request, user=Depends(get_current_user)):
        """Approve selected transactions for import into expenses.
        Body: {"approved_ids": ["txn_id1", "txn_id2", ...]}
        If approved_ids is empty or missing, imports ALL pending items."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")

        body = await request.json()
        approved_ids = set(body.get("approved_ids", []))

        analysis = await db.bank_analyses.find_one({"id": analysis_id}, {"_id": 0})
        if not analysis:
            raise HTTPException(404, "Análise não encontrada")

        # Get pending items from sync_preview
        preview = analysis.get("sync_preview", {})
        pending = preview.get("pending", [])
        if not pending:
            return {"created": 0, "message": "Nenhuma transação pendente para importar"}

        # Filter by approved IDs (if provided)
        to_import = pending if not approved_ids else [p for p in pending if p["id"] in approved_ids]

        # Get all transactions for full data
        txn_map = {t["id"]: t for t in analysis.get("transactions", [])}
        cat_to_type = {"fixo": "fixo", "variavel": "variavel", "obra": "obra", "imposto": "fixo", "financeiro": "fixo", "outro": "variavel"}

        created = 0
        for p in to_import:
            t = txn_map.get(p["id"], p)
            expense = {
                "id": str(uuid.uuid4()),
                "date": t.get("date", p.get("date", "")),
                "supplier": t.get("description", p.get("description", ""))[:100],
                "nif": "",
                "invoice_number": "",
                "category": t.get("category", p.get("category", "outro")).capitalize(),
                "type": cat_to_type.get(t.get("category", p.get("category", "")), "variavel"),
                "obra_id": None,
                "obra_name": None,
                "value_net": round(abs(t.get("amount", p.get("amount", 0))) / 1.23, 2),
                "vat_rate": 23,
                "vat_amount": round(abs(t.get("amount", p.get("amount", 0))) - abs(t.get("amount", p.get("amount", 0))) / 1.23, 2),
                "value_gross": round(abs(t.get("amount", p.get("amount", 0))), 2),
                "payment_method": "Transferência Bancária",
                "notes": f"Importado do extrato bancário: {analysis.get('filename', '')}",
                "invoice_file": None,
                "bank_txn_id": t.get("id", p.get("id")),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.expenses.insert_one(expense)
            created += 1

        # Update sync_preview: remove approved items from pending
        imported_ids = {p["id"] for p in to_import}
        remaining = [p for p in pending if p["id"] not in imported_ids]
        await db.bank_analyses.update_one(
            {"id": analysis_id},
            {"$set": {
                "sync_preview.pending": remaining,
                "sync_preview.pending_count": len(remaining),
                "sync_approved": {"created": created, "approved_at": datetime.now(timezone.utc).isoformat()},
            }}
        )

        return {"created": created, "remaining": len(remaining), "message": f"{created} despesas importadas com sucesso"}

    # ── Tax Alerts ────────────────────────────────────────────────
    @router.get("/tax-alerts/upcoming")
    async def get_tax_alerts(user=Depends(get_current_user)):
        """Return upcoming tax payment deadlines based on PT fiscal calendar."""
        today = datetime.now(timezone.utc)
        year = today.year

        PT_MONTHS = {1:"Janeiro",2:"Fevereiro",3:"Março",4:"Abril",5:"Maio",6:"Junho",7:"Julho",8:"Agosto",9:"Setembro",10:"Outubro",11:"Novembro",12:"Dezembro"}
        month_name = PT_MONTHS.get(today.month, "")
        next_m = today.replace(day=1) + timedelta(days=35)
        next_month_name = PT_MONTHS.get(next_m.month, "")

        # Portuguese fiscal calendar
        deadlines = [
            # IVA Trimestral (regime trimestral)
            {"date": f"{year}-02-15", "type": "IVA", "label": f"IVA 4.º Trimestre {year-1}", "desc": "Entrega da declaração periódica do IVA referente ao 4.º trimestre do ano anterior"},
            {"date": f"{year}-05-15", "type": "IVA", "label": f"IVA 1.º Trimestre {year}", "desc": "Entrega da declaração periódica do IVA referente ao 1.º trimestre"},
            {"date": f"{year}-08-15", "type": "IVA", "label": f"IVA 2.º Trimestre {year}", "desc": "Entrega da declaração periódica do IVA referente ao 2.º trimestre"},
            {"date": f"{year}-11-15", "type": "IVA", "label": f"IVA 3.º Trimestre {year}", "desc": "Entrega da declaração periódica do IVA referente ao 3.º trimestre"},
            # IRC - Pagamento por Conta (3 prestações)
            {"date": f"{year}-07-31", "type": "IRC-PPC", "label": f"1.ª Prestação PPC {year}", "desc": "Primeiro pagamento por conta do IRC"},
            {"date": f"{year}-09-30", "type": "IRC-PPC", "label": f"2.ª Prestação PPC {year}", "desc": "Segundo pagamento por conta do IRC"},
            {"date": f"{year}-12-15", "type": "IRC-PPC", "label": f"3.ª Prestação PPC {year}", "desc": "Terceiro pagamento por conta do IRC"},
            # IRC - Modelo 22
            {"date": f"{year}-05-31", "type": "IRC-MOD22", "label": f"IRC Modelo 22 ({year-1})", "desc": "Entrega da declaração Modelo 22 do IRC do exercício anterior"},
            # TSU mensal
            {"date": f"{year}-{today.month:02d}-20", "type": "TSU", "label": f"TSU {month_name} {year}", "desc": "Entrega das contribuições à Segurança Social"},
            # IRS Retenções
            {"date": f"{year}-{today.month:02d}-20", "type": "IRS-RET", "label": f"IRS Retenções {month_name} {year}", "desc": "Entrega das retenções de IRS ao Estado"},
        ]

        # Add next month deadlines for TSU/IRS
        deadlines.append({"date": next_m.strftime(f"%Y-%m-20"), "type": "TSU", "label": f"TSU {next_month_name} {next_m.year}", "desc": "Entrega das contribuições à Segurança Social"})

        # Filter: only future or within last 5 days (overdue)
        alerts = []
        for d in deadlines:
            try:
                dl_date = datetime.strptime(d["date"], "%Y-%m-%d")
                days_until = (dl_date - today.replace(tzinfo=None)).days
                if days_until >= -5 and days_until <= 90:
                    d["days_until"] = days_until
                    d["status"] = "overdue" if days_until < 0 else ("urgent" if days_until <= 7 else ("soon" if days_until <= 30 else "upcoming"))
                    alerts.append(d)
            except ValueError:
                continue

        # Get latest tax estimates from most recent analysis
        latest = await db.bank_analyses.find_one({}, {"_id": 0, "taxes": 1}, sort=[("created_at", -1)])
        estimates = latest.get("taxes", {}) if latest else {}

        return {"alerts": sorted(alerts, key=lambda a: a["date"]), "estimates": estimates}

    # ── Sync to Expenses (with duplicate detection) ───────────────
    @router.post("/{analysis_id}/sync-expenses")
    async def sync_to_expenses(analysis_id: str, user=Depends(get_current_user)):
        """Import debit transactions from bank analysis into expenses module, detecting duplicates."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")

        analysis = await db.bank_analyses.find_one({"id": analysis_id}, {"_id": 0})
        if not analysis:
            raise HTTPException(404, "Análise não encontrada")

        # Only sync expenses (debit transactions, excluding receita/salario)
        expense_cats = ("fixo", "variavel", "obra", "imposto", "financeiro", "outro")
        to_sync = [t for t in analysis.get("transactions", []) if t["amount"] < 0 and t.get("category") in expense_cats]

        # Get existing expenses for duplicate detection
        existing_expenses = await db.expenses.find(
            {}, {"_id": 0, "date": 1, "supplier": 1, "value_gross": 1, "invoice_number": 1, "bank_txn_id": 1}
        ).to_list(5000)

        # Build lookup sets for duplicate detection
        existing_by_txn = {e.get("bank_txn_id") for e in existing_expenses if e.get("bank_txn_id")}
        existing_by_match = set()
        for e in existing_expenses:
            key = f"{e.get('date', '')}|{abs(e.get('value_gross', 0)):.2f}|{(e.get('supplier', '') or '').lower()[:20]}"
            existing_by_match.add(key)

        created = 0
        skipped = 0
        duplicates = []

        cat_to_type = {"fixo": "fixo", "variavel": "variavel", "obra": "obra", "imposto": "fixo", "financeiro": "fixo", "outro": "variavel"}

        for t in to_sync:
            # Check if already synced by ID
            if t["id"] in existing_by_txn:
                skipped += 1
                duplicates.append({"description": t["description"], "amount": t["amount"], "reason": "Já sincronizado (ID)"})
                continue

            # Check by date + amount + supplier similarity
            match_key = f"{t['date']}|{abs(t['amount']):.2f}|{t['description'].lower()[:20]}"
            if match_key in existing_by_match:
                skipped += 1
                duplicates.append({"description": t["description"], "amount": t["amount"], "reason": "Duplicado (data + valor + fornecedor)"})
                continue

            # Create expense
            expense = {
                "id": str(uuid.uuid4()),
                "date": t["date"],
                "supplier": t["description"][:100],
                "nif": "",
                "invoice_number": "",
                "category": t.get("category", "outro").capitalize(),
                "type": cat_to_type.get(t.get("category", ""), "variavel"),
                "obra_id": None,
                "obra_name": None,
                "value_net": round(abs(t["amount"]) / 1.23, 2),
                "vat_rate": 23,
                "vat_amount": round(abs(t["amount"]) - abs(t["amount"]) / 1.23, 2),
                "value_gross": round(abs(t["amount"]), 2),
                "payment_method": "Transferência Bancária",
                "notes": f"Importado do extrato bancário: {analysis.get('filename', '')}",
                "invoice_file": None,
                "bank_txn_id": t["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.expenses.insert_one(expense)
            existing_by_txn.add(t["id"])
            existing_by_match.add(match_key)
            created += 1

        return {
            "created": created,
            "skipped": skipped,
            "duplicates": duplicates,
            "total_processed": len(to_sync),
        }

    # ── Check duplicates before sync (preview) ───────────────────
    @router.get("/{analysis_id}/check-duplicates")
    async def check_duplicates(analysis_id: str, user=Depends(get_current_user)):
        """Preview which transactions would be synced vs skipped."""
        analysis = await db.bank_analyses.find_one({"id": analysis_id}, {"_id": 0})
        if not analysis:
            raise HTTPException(404, "Análise não encontrada")

        expense_cats = ("fixo", "variavel", "obra", "imposto", "financeiro", "outro")
        to_check = [t for t in analysis.get("transactions", []) if t["amount"] < 0 and t.get("category") in expense_cats]

        existing = await db.expenses.find(
            {}, {"_id": 0, "date": 1, "supplier": 1, "value_gross": 1, "bank_txn_id": 1}
        ).to_list(5000)

        existing_ids = {e.get("bank_txn_id") for e in existing if e.get("bank_txn_id")}
        existing_keys = set()
        for e in existing:
            key = f"{e.get('date', '')}|{abs(e.get('value_gross', 0)):.2f}|{(e.get('supplier', '') or '').lower()[:20]}"
            existing_keys.add(key)

        new_items = []
        dup_items = []
        for t in to_check:
            if t["id"] in existing_ids:
                dup_items.append({**t, "dup_reason": "Já sincronizado"})
            elif f"{t['date']}|{abs(t['amount']):.2f}|{t['description'].lower()[:20]}" in existing_keys:
                dup_items.append({**t, "dup_reason": "Data + valor + fornecedor similar"})
            else:
                new_items.append(t)

        return {"new": new_items, "duplicates": dup_items, "new_count": len(new_items), "dup_count": len(dup_items)}

    # ── Auto-feed Calendar with predicted bills ───────────────────
    @router.post("/{analysis_id}/feed-calendar")
    async def feed_calendar(analysis_id: str, months_ahead: int = 6, user=Depends(get_current_user)):
        """Create calendar appointments for predicted recurring expenses (Contas Previstas).
        Projects each recurring pattern forward for `months_ahead` months."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")

        analysis = await db.bank_analyses.find_one({"id": analysis_id}, {"_id": 0})
        if not analysis:
            raise HTTPException(404, "Análise não encontrada")

        recurring = analysis.get("recurring", [])
        if not recurring:
            return {"created": 0, "message": "Nenhum pagamento recorrente detectado"}

        today = datetime.now(timezone.utc)
        created = 0
        skipped = 0
        appointments_created = []
        today_naive = today.replace(tzinfo=None)  # for comparison with naive datetimes

        for r in recurring:
            typical_day = r.get("typical_day", 15)
            freq = r.get("frequency", "mensal")
            desc = r.get("description", "")[:60]
            amount = r.get("avg_amount", 0)
            cat = r.get("category", "outro")

            # Generate future dates
            future_dates = []
            if freq == "mensal":
                for i in range(1, months_ahead + 1):
                    m = today.month + i
                    y = today.year
                    while m > 12:
                        m -= 12
                        y += 1
                    try:
                        future_dates.append(datetime(y, m, min(typical_day, 28)))
                    except ValueError:
                        future_dates.append(datetime(y, m, 28))
            elif freq == "trimestral":
                for i in range(1, (months_ahead // 3) + 2):
                    m = today.month + (3 * i)
                    y = today.year
                    while m > 12:
                        m -= 12
                        y += 1
                    try:
                        future_dates.append(datetime(y, m, min(typical_day, 28)))
                    except ValueError:
                        future_dates.append(datetime(y, m, 28))

            for fd in future_dates:
                if fd <= today_naive:
                    continue
                date_str = fd.strftime("%Y-%m-%d")

                # Check if already exists in calendar
                existing = await db.appointments.find_one({
                    "date": date_str,
                    "title": {"$regex": re.escape(desc[:30]), "$options": "i"},
                    "notes": {"$regex": "Conta Prevista"},
                })
                if existing:
                    skipped += 1
                    continue

                CAT_LABELS = {"fixo": "Custo Fixo", "variavel": "Variável", "obra": "Obra", "imposto": "Imposto", "financeiro": "Financeiro"}
                cat_label = CAT_LABELS.get(cat, cat)

                appointment = {
                    "id": str(uuid.uuid4()),
                    "title": f"💰 {desc}",
                    "client_name": "",
                    "date": date_str,
                    "time_start": "09:00",
                    "time_end": "09:30",
                    "notes": f"Conta Prevista ({cat_label}) · Valor estimado: {amount:.2f}€ · {freq} · Dia típico: {typical_day}",
                    "employee_ids": [],
                    "location": "",
                    "work_id": None,
                    "is_predicted_bill": True,
                    "predicted_amount": amount,
                    "predicted_category": cat,
                    "source_analysis_id": analysis_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.appointments.insert_one(appointment)
                created += 1
                appointments_created.append({
                    "title": appointment["title"],
                    "date": date_str,
                    "amount": amount,
                    "frequency": freq,
                })

        return {
            "created": created,
            "skipped": skipped,
            "total_recurring": len(recurring),
            "appointments": appointments_created[:20],
            "message": f"{created} contas previstas adicionadas ao calendário para os próximos {months_ahead} meses",
        }

    # ── Remove predicted bills from calendar ──────────────────────
    @router.delete("/{analysis_id}/calendar-predictions")
    async def remove_calendar_predictions(analysis_id: str, user=Depends(get_current_user)):
        """Remove all predicted bills from calendar for this analysis."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")
        result = await db.appointments.delete_many({"source_analysis_id": analysis_id, "is_predicted_bill": True})
        return {"removed": result.deleted_count}

    # ── Predicted Bills CRUD ──────────────────────────────────────
    @router.get("/predicted-bills/list")
    async def list_predicted_bills(user=Depends(get_current_user)):
        """List all predicted bill calendar entries."""
        bills = await db.appointments.find(
            {"is_predicted_bill": True},
            {"_id": 0}
        ).sort("date", 1).to_list(500)
        return bills

    @router.post("/predicted-bills")
    async def create_predicted_bill(request: Request, user=Depends(get_current_user)):
        """Manually create a predicted bill calendar entry."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")
        body = await request.json()
        title = (body.get("title") or "").strip()
        date = (body.get("date") or "").strip()
        amount = float(body.get("amount", 0) or 0)
        category = (body.get("category") or "outro").strip()
        frequency = (body.get("frequency") or "mensal").strip()
        if not title or not date:
            raise HTTPException(400, "Título e data são obrigatórios")

        CAT_LABELS = {"fixo": "Custo Fixo", "variavel": "Variável", "obra": "Obra", "imposto": "Imposto", "financeiro": "Financeiro"}
        cat_label = CAT_LABELS.get(category, category)

        bill = {
            "id": str(uuid.uuid4()),
            "title": title,
            "client_name": "",
            "date": date,
            "time_start": "09:00",
            "time_end": "09:30",
            "notes": f"Conta Prevista ({cat_label}) · Valor estimado: {amount:.2f}€ · {frequency}",
            "employee_ids": [],
            "location": "",
            "work_id": None,
            "is_predicted_bill": True,
            "predicted_amount": amount,
            "predicted_category": category,
            "predicted_frequency": frequency,
            "source_analysis_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.appointments.insert_one(bill)
        bill.pop("_id", None)
        return bill

    @router.patch("/predicted-bills/{bill_id}")
    async def update_predicted_bill(bill_id: str, request: Request, user=Depends(get_current_user)):
        """Update a predicted bill."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")
        body = await request.json()
        updates = {}
        if "title" in body: updates["title"] = body["title"]
        if "date" in body: updates["date"] = body["date"]
        if "amount" in body:
            updates["predicted_amount"] = float(body["amount"])
        if "category" in body:
            updates["predicted_category"] = body["category"]
        if "frequency" in body:
            updates["predicted_frequency"] = body["frequency"]
        if not updates:
            raise HTTPException(400, "Nada para atualizar")

        # Rebuild notes
        if any(k in body for k in ("amount", "category", "frequency")):
            doc = await db.appointments.find_one({"id": bill_id, "is_predicted_bill": True}, {"_id": 0})
            if doc:
                amt = updates.get("predicted_amount", doc.get("predicted_amount", 0))
                cat = updates.get("predicted_category", doc.get("predicted_category", "outro"))
                freq = updates.get("predicted_frequency", doc.get("predicted_frequency", "mensal"))
                CAT_LABELS = {"fixo": "Custo Fixo", "variavel": "Variável", "obra": "Obra", "imposto": "Imposto", "financeiro": "Financeiro"}
                updates["notes"] = f"Conta Prevista ({CAT_LABELS.get(cat, cat)}) · Valor estimado: {amt:.2f}€ · {freq}"

        result = await db.appointments.update_one(
            {"id": bill_id, "is_predicted_bill": True},
            {"$set": updates}
        )
        if result.matched_count == 0:
            raise HTTPException(404, "Conta prevista não encontrada")
        updated = await db.appointments.find_one({"id": bill_id}, {"_id": 0})
        return updated

    @router.delete("/predicted-bills/{bill_id}")
    async def delete_predicted_bill(bill_id: str, user=Depends(get_current_user)):
        """Delete a predicted bill."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")
        result = await db.appointments.delete_one({"id": bill_id, "is_predicted_bill": True})
        if result.deleted_count == 0:
            raise HTTPException(404, "Conta prevista não encontrada")
        return {"ok": True}

    return router
