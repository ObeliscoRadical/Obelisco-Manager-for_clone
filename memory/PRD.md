# Obelisco Manager - PRD

## Problem Statement
Build "Obelisco Manager" - an internal management panel for Obelisco Radical (electrical/telecom services company in Grande Lisboa).

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI + Recharts (port 3000)
- **Backend**: FastAPI + MongoDB (port 8001)
- **Auth**: JWT (localStorage Bearer tokens)
- **PDF**: jsPDF + jspdf-autotable
- **AI**: Emergent LLM Key → GPT-5.4-mini (categorization), Gemini 3.1 Pro (OCR, chat)
- **Integrations**: Telegram Bot, Google Calendar, Emergent Email, Web Push (VAPID)
- **Design**: Dark theme (zinc-950 bg, yellow-400 accent)

## All Implemented Features
- JWT login + granular module permissions
- Dashboard, Budgets, Proposals (3-tier + PDF + digital signature)
- Works management + execution tracking
- Calendar/Agenda + Google Calendar
- Materials/Labor/Productivities DBs
- Stock + invoice import (AI OCR)
- Transport Guides + tech portal
- Invoices + WhatsApp reminders
- Expenses + AI OCR (sequential upload fix)
- Financial dashboard + Annual reports
- Payroll (employees, attendance, processing)
- Break-even calculator + Accountant AI chat
- Service Orders + Telegram + Google Calendar + WhatsApp
- Public widget for client requests
- GPS Timeclock + Telegram + Reports + CSV
- Perfil 360° Cliente (mini-CRM)
- Web Push Notifications (VAPID)
- Bank Statement Analysis (CSV/Excel/OFX, AI categorization, recurring, cash flow projection)
- **Tax Alerts** (PT fiscal calendar: IVA, IRC-PPC, Modelo 22, TSU, IRS retenções)
- **Bank-to-Expenses Sync** (duplicate detection by ID + date/amount/supplier fuzzy match)

## Backlog
### P1
- Automação Máscara DIN
- Módulo Salarial Fase 2: recibos PDF

### P2
- Mapa de equipa GPS
- Hardening segurança
- TOC Online integration
