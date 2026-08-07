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
- **Custos Recorrentes** (página /custos-recorrentes — vista consolidada master de pagamentos recorrentes com edição inline, dia do mês, categoria, modelo, valor médio)
- **Tesouraria Preditiva** (Análise Bancária + Dashboard + Dashboard Financeiro — projeção automática 30/60 dias só com saídas previstas, saldo inicial automático + ajuste manual, detetor de anomalias por limiar configurável, mapa de pressão financeira e badges de dias críticos)
- **Reconciliação Mensal de Despesas** (botão manual em Despesas + Análise Bancária para preview + aplicação de reconciliação fiscal/banco e limpeza de hard duplicates no mês/filtro selecionado)
- **Auditoria de Reconciliação** (relatórios Excel persistidos por operação, com download posterior e histórico visível em Despesas)
- **AI Expense Re-Categorization** (bulk re-categorize existing expenses using keyword matching + GPT-4o-mini)
- **Category Overrides Management** (Definições > Regras IA — view, edit inline, and delete learned category rules)

## Atualização 2026-08-07
- Entregue o novo bloco de **Tesouraria Preditiva** com endpoint `GET /api/bank-analysis/treasury/insights`
- Novo parâmetro em **Definições > Tesouraria**: `treasury_settings.anomaly_threshold_pct`
- Resumo de tesouraria agora visível em:
  - Dashboard principal
  - Dashboard Financeiro
  - Análise Bancária (topo da listagem)
  - Tab dedicada **Tesouraria** dentro do detalhe da análise
- Corrigido warning técnico de render instável em `DespesasPage.jsx`
- Testado com sucesso: curl/manual + testing agent iteration 49 (backend 11/11, frontend 100%)

## Atualização 2026-08-07 (reconciliação bulk)
- Entregue o botão **🔍 Reconciliar & Validar Duplicados** em **Despesas** e **Análise Bancária**
- Novo fluxo com preview + confirmação antes de aplicar reconciliação/limpeza
- Backend novo:
  - `GET /api/expenses/reconcile-preview`
  - `POST /api/expenses/reconcile-apply`
- Regras suportadas:
  - match fiscal ↔ bancário por valor exato e data ±2 dias
  - 1 despesa canónica com prioridade aos dados fiscais
  - remoção automática do hard duplicate mais fraco no período filtrado
- Testado com sucesso: testing agent iteration 50 (dedupe base) + iteration 51 (bulk button/preview/apply), ambos 100%

## Atualização 2026-08-07 (auditoria Excel)
- Relatório Excel persistido após cada reconciliação aplicada
- Nova lista de auditoria em **Despesas** com histórico e botão de download posterior
- O relatório inclui:
  - itens reconciliados/removidos
  - totais
  - utilizador
  - data/hora
  - motivo e regra aplicada
- Backend novo:
  - `GET /api/expenses/reconcile-reports`
  - `GET /api/expenses/reconcile-reports/{report_id}/download`
- Testado com sucesso: testing agent iteration 52 (backend 10/10, frontend 100%)

## Backlog
### P1
- Automação Máscara DIN (importar da Legenda)
- Módulo Salarial Fase 2: recibos PDF
- Exportar Custos Recorrentes

### P2
- Filtros em Contas Previstas
- Mini gráfico receitas vs despesas no dashboard
- Mapa de equipa GPS
- Hardening segurança (CORS allow-list, rate limiting, CSP)
- TOC Online integration (se credenciais fornecidas)
- Alertas Telegram automáticos de IVA/PPC perto do vencimento
- Refactor server.py (>4000 linhas)
