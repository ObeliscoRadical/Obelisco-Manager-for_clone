# Obelisco Manager - PRD

## Problem Statement
Build "Obelisco Manager" - an internal management panel for Obelisco Radical (electrical/telecom services company in Grande Lisboa). Features: Dashboard, Budgeting with margin calculation & AI price lookup, Proposal generation (3 tiers) with PDF export + QR code, Works management, Calendar/Agenda, Professional Engine (Materials DB, Labor DB, Productivities, Negotiation simulator, Templates, Versioning, Excel Import/Export).

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI (port 3000)
- **Backend**: FastAPI + MongoDB (port 8001)
- **Auth**: JWT cookie-based (httpOnly cookies, access+refresh)
- **PDF**: jsPDF + jspdf-autotable (frontend generation)
- **Excel**: openpyxl (backend import/export)
- **AI**: Emergent LLM Key → GPT-5.2 for price/margin lookup
- **Design**: Dark theme (zinc-950 bg, yellow-400 accent)

## User Personas
- Admin/Owner: Manages budgets, proposals, works, and appointments
- Team members (roles): View and manage assigned works

## Core Requirements
- [x] JWT login with admin seeding
- [x] Dashboard with KPIs
- [x] Budget CRUD with dynamic items, categories, auto-save
- [x] AI price lookup (individual + "Pesquisar Todos" batch)
- [x] 3-tier proposals (Básico / Profissional / Premium)
- [x] PDF export (PVP only, custom logo, payment terms, QR code)
- [x] Works management with real vs estimated cost
- [x] Calendar/Agenda with overlap detection
- [x] Materials DB, Labor DB, Productivities
- [x] Negotiation / Margin simulator
- [x] Templates library
- [x] Budget versioning + duplication
- [x] Excel Import / Export
- [x] Multi-role user management

## Changelog

### Feb 18, 2026 (v3)
- **Feature**: Todas as propostas (Básico/Profissional/Premium) agora têm **garantia de 2 anos** uniforme (antes eram 1/2/5 anos).
- **Feature**: "IVA NÃO incluído (a acrescer a taxa legal em vigor)" aparece obrigatoriamente no PDF em duas localizações: (a) descrição do tier da proposta, (b) condições gerais forçadas (mesmo que o utilizador remova das settings, o PDF injeta-as).
- **Migration**: 18 propostas antigas atualizadas em DB para refletir nova descrição.

### Feb 18, 2026 (v2)
- **Feature**: Budget-level discount system (both per-item AND global). Each item has its own `discount_type` (percentage/value) and `discount_value`. Global discount applies on top of subtotal. Discount does NOT appear as separate line in PDF - silently reduces final total (user choice).
- **Feature**: Per-budget payment methods, conditions and observation notes (replaces global-only settings). Payment methods = multi-select chips; conditions = preset options + custom text; notes = free-form textarea. Validation enforces required payment fields before save. Proposals inherit budget's payment config, PDF uses per-proposal data (fallback to global settings).
- **Testing**: 45/45 backend + frontend tests passed.

### Feb 18, 2026
- **P0 FIX**: Excel import (`/api/budgets/import-excel`) now works with header-less Excel files (user's "Mapa Quantidades IEE+ITED+CCTV"). Rewrote auto-detection to use per-column statistics: detects unit column by matching values against known unit tokens (un/mt/ml/vg/m/m²/h/kg/etc), picks name as non-numeric column with longest avg text length (excluding unit col), picks quantity as first numeric column after anchor. Items now include `unit` field. 164 items correctly parsed with full descriptions, units, and quantities.
- **P1 FIX**: `searchAllPrices` crash (`insertBefore` DOM error) resolved with batched state update (collect all prices first, then single setItems call).
- **Regression**: Full end-to-end test passed (34/34 backend + frontend flows).

### Apr 17, 2026
- Full backend API (21+ endpoints)
- 13+ frontend pages
- Phase 1, 2, 3 Professional Engine complete
- Auth system with admin seeding
- PDF generation with jsPDF (PVP only, QR code, custom logo)

## Prioritized Backlog

### P0 (Critical) - Done

### P1 (Important)
- Email integration (SendGrid/Resend) for sending proposals
- WhatsApp via Twilio for sending proposals (currently only wa.me link)
- ~~Google Maps for travel cost calculation~~ (DEFERRED by user)
- Dashboard charts (Recharts)

### P2 (Nice to have)
- Client database/CRM linked to budgets/works
- Photo upload for works (before/after)
- Financial reports export
- Notifications for appointments

### Refactoring
- `/app/backend/server.py` >2000 lines — split into `routes/`, `models/`, `services/`
- Add `/app/backend/tests` with pytest for regression

## Next Tasks
1. Email integration for proposal sending (user said "I'll send manually" for now)
2. Google Maps travel cost integration
3. Dashboard charts with Recharts
4. Refactor server.py into modules
