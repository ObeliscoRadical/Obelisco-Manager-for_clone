# Obelisco Manager - PRD

## Problem Statement
Build "Obelisco Manager" - an internal management panel for Obelisco Radical (electrical/telecom services company in Grande Lisboa).

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI (port 3000)
- **Backend**: FastAPI + MongoDB (port 8001)
- **Auth**: JWT (access+refresh tokens, localStorage)
- **PDF**: jsPDF + jspdf-autotable (frontend generation)
- **AI**: Emergent LLM Key → Gemini 3.1 Pro (OCR, chat)
- **Integrations**: Telegram Bot, Google Calendar, Emergent Email, Web Push (VAPID)
- **Design**: Dark theme (zinc-950 bg, yellow-400 accent)

## Core Requirements (All Complete)
- [x] JWT login with admin seeding + granular module permissions
- [x] Dashboard with KPIs
- [x] Budget CRUD with AI price lookup
- [x] 3-tier proposals with PDF + digital signature
- [x] Works management with execution tracking
- [x] Calendar/Agenda with Google Calendar integration
- [x] Materials/Labor/Productivities DBs
- [x] Stock management with invoice import (AI OCR)
- [x] Transport Guides with tech portal
- [x] Invoices with WhatsApp reminders
- [x] Expenses with AI OCR (sequential upload fix applied)
- [x] Financial dashboard + Annual reports
- [x] Payroll (employees, attendance, salary processing)
- [x] Break-even calculator
- [x] Accountant AI chat
- [x] Service Orders with Telegram + Google Calendar + WhatsApp updates
- [x] Public widget for client service requests
- [x] GPS Timeclock in Tech Portal + Telegram notifications on punch
- [x] Timeclock Reports with CSV export
- [x] Perfil 360° do Cliente (mini-CRM)
- [x] WhatsApp share + update buttons
- [x] Email system (Emergent native — auto-provisioned on deploy)
- [x] Web Push Notifications (VAPID) — smartwatch, phone, desktop
- [x] Code quality: test secrets externalized, hook deps fixed, array keys fixed

## Prioritized Backlog

### P1 (Important)
- Automação Máscara DIN (auto-atribuir cor por tipo de módulo)
- Módulo Salarial Fase 2: recibos PDF por funcionário

### P2 (Nice to have)
- Hardening de segurança (CORS, rate limiting, CSP)
- Integração TOC Online
- Dashboard charts (Recharts)
- Mapa de equipa em tempo real (GPS dos técnicos)

### Refactoring
- `/app/backend/server.py` >4400 lines — split into modules
- Large frontend components (OrcamentosPage 750L, FaturasPage 634L, etc.)
