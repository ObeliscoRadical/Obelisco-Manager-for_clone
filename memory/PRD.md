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
- Técnicos: Use Portal Técnico for works, guides, attendance, service orders

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
- [x] Service Orders (Pedidos de Serviço) — migrated from Obelisco-Tecnicos-main
- [x] Public Widget for client service requests
- [x] GPS Timeclock (Ponto GPS)
- [x] Timeclock Reports with CSV export

## Prioritized Backlog

### P0 (Critical) - Done

### P1 (Important)
- Perfil 360° do Cliente (mini-CRM): histórico, propostas, obras, faturas e prazo médio de pagamento
- Módulo Salarial Fase 2: recibos PDF por funcionário, envio email/WhatsApp
- Google Calendar integration for service orders (availability checking, auto-events)
- Telegram notifications (ponto + guias) — prepared, needs TELEGRAM_BOT_TOKEN in .env
- Automação Máscara DIN (auto-atribuir cor por tipo de módulo ao importar da Legenda)

### P2 (Nice to have)
- Hardening de segurança (CORS restrito, rate limiting login, limites upload, CSP)
- Integração formal com TOC Online
- RBAC integral no backend (endpoints não totalmente blindados)
- Email integration (Emergent Resend) for sending proposals and notifications
- Dashboard charts (Recharts)

### Refactoring
- `/app/backend/server.py` >4300 lines — split into `routes/`, `models/`, `services/`
- Add `/app/backend/tests` with pytest for regression

## Next Tasks
1. Perfil 360° do Cliente (mini-CRM)
2. Google Calendar integration for service orders
3. Telegram bot configuration (user to provide tokens)
4. Refactor server.py into modules
