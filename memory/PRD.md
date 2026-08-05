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
- **Integrations**: Telegram Bot, Google Calendar (optional), Gemini AI (OCR/chat)

## User Personas
- Admin/Owner: Manages budgets, proposals, works, appointments, client profiles
- Team members (roles): View and manage assigned works
- Técnicos: Use Portal Técnico for works, guides, attendance, service orders, chat

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
- [x] Multi-role user management with granular permissions
- [x] Service Orders (Pedidos de Serviço) — migrated from Obelisco-Tecnicos-main
- [x] Public Widget for client service requests (/pedido-servico)
- [x] GPS Timeclock (Ponto GPS)
- [x] Timeclock Reports with CSV export
- [x] Telegram notifications (new orders + ponto entries)
- [x] Google Calendar integration (availability check + auto-events)
- [x] WhatsApp share link for widget
- [x] Perfil 360° do Cliente (mini-CRM)

## Prioritized Backlog

### P1 (Important)
- Google Calendar credentials file (google_credentials.json) — code is ready, needs Service Account file
- Módulo Salarial Fase 2: recibos PDF por funcionário, envio email/WhatsApp
- Automação Máscara DIN (auto-atribuir cor por tipo de módulo ao importar da Legenda)
- Email integration (Emergent Resend) for sending proposals and notifications

### P2 (Nice to have)
- Hardening de segurança (CORS restrito, rate limiting login, limites upload, CSP)
- Integração formal com TOC Online
- RBAC integral no backend (endpoints não totalmente blindados)
- Dashboard charts (Recharts)

### Refactoring
- `/app/backend/server.py` >4300 lines — split into `routes/`, `models/`, `services/`

## Next Tasks
1. Provide google_credentials.json to activate Google Calendar
2. Módulo Salarial Fase 2
3. Automação Máscara DIN
4. Refactor server.py into modules
