# Obelisco Manager - PRD

## Problem Statement
Build "Obelisco Manager" - an internal management panel for Obelisco Radical (electrical/telecom services company in Grande Lisboa).

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI + Recharts (port 3000)
- **Backend**: FastAPI + MongoDB (port 8001)
- **Auth**: JWT (access+refresh tokens, localStorage)
- **PDF**: jsPDF + jspdf-autotable (frontend generation)
- **AI**: Emergent LLM Key → GPT-5.4-mini (categorization), Gemini 3.1 Pro (OCR, chat)
- **Integrations**: Telegram Bot, Google Calendar, Emergent Email, Web Push (VAPID)
- **Design**: Dark theme (zinc-950 bg, yellow-400 accent)

## Core Requirements (All Complete)
- [x] JWT login + granular module permissions
- [x] Dashboard with KPIs
- [x] Budget CRUD with AI price lookup
- [x] 3-tier proposals with PDF + digital signature
- [x] Works management with execution tracking
- [x] Calendar/Agenda with Google Calendar integration
- [x] Materials/Labor/Productivities DBs
- [x] Stock management with invoice import (AI OCR)
- [x] Transport Guides with tech portal
- [x] Invoices with WhatsApp reminders
- [x] Expenses with AI OCR (sequential upload fix)
- [x] Financial dashboard + Annual reports
- [x] Payroll (employees, attendance, salary processing)
- [x] Break-even calculator
- [x] Accountant AI chat
- [x] Service Orders with Telegram + Google Calendar + WhatsApp
- [x] Public widget for client service requests
- [x] GPS Timeclock + Telegram notifications
- [x] Timeclock Reports with CSV export
- [x] Perfil 360° do Cliente (mini-CRM)
- [x] Web Push Notifications (VAPID)
- [x] **Bank Statement Analysis** (CSV/Excel/OFX upload, AI categorization, recurring detection, cash flow projection, IRC tax estimation)

## Prioritized Backlog

### P1
- Automação Máscara DIN
- Módulo Salarial Fase 2: recibos PDF

### P2
- Mapa de equipa (GPS técnicos)
- Hardening de segurança
- Integração TOC Online

### Refactoring
- server.py >4400 lines — split into modules
