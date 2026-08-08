# Obelisco Manager - PRD

## Problem Statement
Build "Obelisco Manager" - an internal management panel for Obelisco Radical (electrical/telecom services company in Grande Lisboa).

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI + Recharts (port 3000)
- **Backend**: FastAPI + MongoDB (port 8001)
- **Auth**: JWT (localStorage Bearer tokens)
- **PDF**: jsPDF + jspdf-autotable
- **AI**: Emergent LLM Key → GPT-4o-mini (bank categorization), **GPT-5.4 (CFO Virtual)**, Gemini 3.1 Pro (OCR, invoice extraction, PDF bank statement extraction)
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
- **CFO Virtual / Recuperação & Reestruturação de Crédito** (`/cfo-virtual` — diagnóstico financeiro rigoroso com cruzamento obrigatório de saldo real, extratos recentes, custos fixos, dívidas ativas, recebimentos urgentes e oportunidades de margem em obras)
- **Coleção de Dívidas Ativas** (`active_debts` com CRUD visual + backend FastAPI para passivo fiscal, segurança social, fornecedores e dívida bancária)
- **Simulador de Fôlego Financeiro** (projeção tática com cortes exequíveis, cobrança extra, limites realistas e comentário do CFO sem promessas mágicas)
- **Contas Previstas com Filtros** (filtro por categoria + intervalo de datas diretamente na página `/contas-previstas`)
- **Mini gráfico mensal receitas vs despesas** (dashboard principal com leitura dos últimos 6 meses baseada em pagamentos recebidos vs despesas+salários)
- **Mapa GPS da Equipa** (`/relatorios-ponto` com última posição por técnico, KPIs do mapa e trilho diário do técnico selecionado)
- **Hardening Segurança Fase 1** (CORS allow-list baseado em env + regex emergent, rate limiting de rotas públicas, headers de segurança no backend e CSP no frontend)

## Atualização 2026-08-08 — CFO Virtual / Recuperação de Crédito
- Entregue o novo módulo **Gabinete do CFO** com rota protegida `GET /cfo-virtual` e entrada própria na sidebar
- Backend novo (`/app/backend/cfo_virtual.py`):
  - `GET /api/cfo-virtual/dashboard`
  - `GET/POST/PUT/DELETE /api/cfo-virtual/debts`
  - `POST /api/cfo-virtual/analyze`
  - `POST /api/cfo-virtual/simulator`
- Regras críticas implementadas:
  - bloqueio do diagnóstico/simulador sem extrato bancário carregado
  - **anti-ilusão**: sem caixa livre, não existe sugestão de pagamento positivo
  - alocação de caixa exata calculada no backend antes da IA responder
  - uso obrigatório de dados reais: saldo do último extrato, movimentos recentes, custos fixos, dívidas, recebimentos urgentes e margem/cobrança de obras
- Frontend novo:
  - `CfoVirtualPage.jsx`
  - `CfoDebtsTable.jsx`
  - `CfoSimulator.jsx`
- Persistência nova:
  - `active_debts`
  - `cfo_virtual_reports`
  - `cfo_virtual_simulations`
- Testado com sucesso:
  - curl/manual: login, dashboard, CRUD dívida, análise e simulador
  - testing agent iteration 54: backend 22/22 + frontend 100%

## Atualização 2026-08-08 — P2 concluído (filtros, mini gráfico, GPS equipa, segurança)
- **Contas Previstas**
  - nova barra de filtros por `categoria`, `data inicial` e `data final`
  - estado vazio específico quando os filtros não devolvem resultados
- **Dashboard principal**
  - novo bloco `monthly_revenue_vs_expenses` em `GET /api/dashboard/overview`
  - mini gráfico mensal de receitas vs despesas com base real em pagamentos recebidos, despesas e salários
- **Relatórios de Ponto**
  - novo endpoint `GET /api/service-orders/timeclock/team-map`
  - KPIs do mapa, lista de últimas posições, foco por técnico e trilho diário por data
  - componente visual `TeamGeoMap.jsx`
- **Hardening Segurança**
  - CORS allow-list baseado em `CORS_ORIGINS` / `FRONTEND_URL`
  - rate limit em login, refresh, disponibilidade pública, links públicos e uploads públicos
  - headers: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
  - CSP também adicionada ao `frontend/public/index.html`
- Testado com sucesso:
  - self-test backend (headers, rate limit, team-map, dashboard overview)
  - smoke test visual dashboard + contas previstas + relatórios ponto
  - auto_frontend_testing_agent 100%
  - deep_testing_backend_v2 aprovado
  - testing agent iteration 55: backend 30/30 + frontend 100%

## Atualização 2026-08-08 — Code Quality / Fase 1
- **Testes backend sem segredos hardcoded**
  - criado `backend/tests/auth_test_helpers.py` para ler credenciais de teste por env ou `/app/memory/test_credentials.md`
  - removidos valores fixos dos testes-alvo reportados na revisão de código
- **Auth frontend endurecido sem localStorage sensível**
  - `src/lib/api.js`: tokens migrados de `localStorage` para `sessionStorage` + memória
  - `src/contexts/AuthContext.js`: `obelisco_user_kind` migrado para `sessionStorage`
  - criado `src/lib/browserStorage.js` para acesso seguro ao storage do browser
- **Sessões de UI técnica movidas para sessionStorage**
  - `LegendaQuadroPage.jsx` e `MascaraDinPage.jsx` deixaram de usar `localStorage`
- **Melhorias de qualidade adicional nesta fase**
  - `PontoGPSPage.jsx`: hooks estabilizados com `useCallback/useMemo` e tratamento de erros melhorado
  - chaves React estabilizadas em `DashboardPage.jsx`, `DashboardFinanceiroPage.jsx`, `CfoVirtualPage.jsx` e `CfoSimulator.jsx`
  - criado `/app/auth_testing.md` para guiar a validação desta ronda
- **Validação formal**
  - testing agent iteration 56: backend 64/64 passed (4 skipped), frontend 100%
  - verificado: login admin/técnico, persistência por sessão, ausência de tokens em `localStorage`, páginas críticas sem regressão

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
### P0
- Migração Multiempresa / SaaS Fase 1 (`company_id` em coleções core + isolamento por tenant)

### P1
- Automação Máscara DIN (importar da Legenda)
- Módulo Salarial Fase 2: recibos PDF
- Exportar Custos Recorrentes
- Code Quality Fase 2: sweep de hook dependencies remanescentes + empty catches + mais index keys

### P2
- TOC Online integration (se credenciais fornecidas)
- Alertas Telegram automáticos de IVA/PPC perto do vencimento
- Refactor server.py (>4000 linhas)
- Code Quality Fase 3: refactor de componentes grandes + refactor de complexidade em `bank_analysis.py`
