# Obelisco Manager - PRD

## Problem Statement
Build "Obelisco Manager" - an internal management panel for Obelisco Radical (electrical/telecom services company in Grande Lisboa).

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI (port 3000)
- **Backend**: FastAPI + MongoDB (port 8001)
- **Auth**: JWT (access+refresh tokens, localStorage)
- **PDF**: jsPDF + jspdf-autotable (frontend generation)
- **AI**: Emergent LLM Key → Gemini 3.1 Pro (OCR, chat)
- **Integrations**: Telegram Bot, Google Calendar, Resend Email (optional)
- **Design**: Dark theme (zinc-950 bg, yellow-400 accent)

## Core Requirements (All Complete)
- [x] JWT login with admin seeding + granular module permissions
- [x] Dashboard with KPIs
- [x] Budget CRUD with AI price lookup
- [x] 3-tier proposals with PDF + digital signature
- [x] Works management with execution tracking
- [x] Calendar/Agenda with **Google Calendar integration** (availability check + auto-events)
- [x] Materials/Labor/Productivities DBs
- [x] Stock management with invoice import (AI OCR)
- [x] Transport Guides with tech portal
- [x] Invoices with WhatsApp reminders
- [x] Expenses with AI OCR
- [x] Financial dashboard + Annual reports
- [x] Payroll (employees, attendance, salary processing)
- [x] Break-even calculator
- [x] Accountant AI chat
- [x] Service Orders (migrated from Obelisco-Tecnicos) with Telegram notifications
- [x] Public widget for client service requests
- [x] GPS Timeclock + Reports with CSV export
- [x] Perfil 360° do Cliente (mini-CRM)
- [x] WhatsApp share link for service widget
- [x] Email confirmation (Resend - needs API key)

## Prioritized Backlog

### P1 (Important)
- Resend API key for email confirmation (code ready, needs key)
- Automação Máscara DIN (auto-atribuir cor por tipo de módulo)
- Módulo Salarial Fase 2: recibos PDF por funcionário

### P2 (Nice to have)
- Hardening de segurança (CORS, rate limiting, CSP)
- Integração TOC Online
- Dashboard charts (Recharts)

### Refactoring
- `/app/backend/server.py` >4400 lines — split into modules
