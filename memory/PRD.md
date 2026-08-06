# Obelisco Manager - PRD

## Problem Statement
Build "Obelisco Manager" - an internal management panel for Obelisco Radical (electrical/telecom services company in Grande Lisboa).

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI + Recharts (port 3000)
- **Backend**: FastAPI + MongoDB (port 8001)
- **Auth**: JWT (localStorage Bearer tokens)
- **PDF**: jsPDF + jspdf-autotable
- **AI**: Emergent LLM Key → GPT-4o-mini (bank categorization), Gemini 3.1 Pro (OCR, invoice extraction, PDF bank statement extraction)
- **Integrations**: Telegram Bot (Ponto + Manager), Google Calendar, Emergent Email, Web Push (VAPID)
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
- Bank Statement Analysis (CSV/Excel/OFX/PDF, AI categorization, recurring, cash flow projection)
- **Tax Alerts** (PT fiscal calendar: IVA, IRC-PPC, Modelo 22, TSU, IRS retenções)
- **Bank-to-Expenses Sync** (duplicate detection by ID + date/amount/supplier fuzzy match)
- **Recurring financial detection** + calendar feed (mensal/trimestral, dia típico, próxima data)
- **Telegram Bot Manager** (lembretes, /status, alertas) + **Bot Ponto** (entrada/saída)
- **Dashboard Fiscal** (KPIs IRC, IVA, TSU, carga fiscal)
- **Expenses Smart Categorization** (auto-category from supplier keywords + AI + history, auto-type fixo/variavel/obra)
- **Expenses Duplicate Detection** (3 layers: invoice number, date+amount+supplier fuzzy, bank sync)
- **Expenses Suggestion System** (historical supplier pattern, keyword match, AI fallback with category_source tracking)
- **Bank Analysis PDF Support** (Gemini AI extracts transactions from PDF bank statements, async background processing with polling)
- **Auto-Sync Bank → Expenses** (prepares sync preview with duplicate detection; user approves before import)
- **Auto-Feed Calendar** (automatic creation of recurring payment predictions in calendar after analysis)
- **AI Expense Re-Categorization** (bulk re-categorize existing expenses using keyword matching + GPT-4o-mini)
- **Category Overrides Management** (Definições > Regras IA — view, edit inline, and delete learned category rules)

## Backlog
### P1
- Automação Máscara DIN (importar da Legenda)
- Módulo Salarial Fase 2: recibos PDF
- Mini gráfico receitas vs despesas no dashboard

### P2
- Mapa de equipa GPS
- Hardening segurança (CORS allow-list, rate limiting, CSP)
- TOC Online integration (se credenciais fornecidas)
- Alertas Telegram automáticos de IVA/PPC perto do vencimento
- Refactor server.py (>4000 linhas)
