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
- **Design**: Tema escuro adaptativo com branding dinâmico por tenant (logo + paleta extraída automaticamente)

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
- **White Label / Branding por tenant** (upload de logo em Definições, extração automática de paleta, tema dinâmico no login/dashboard/sidebar e branding nos PDFs)

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

## Atualização 2026-08-08 — Code Quality / Fase 2
- **Hook dependencies / callbacks estabilizados**
  - `TechPerfilPage.jsx`: `loadProfile` refeito com `useCallback` + `useEffect`
  - `TechPedidosPage.jsx`: `headers`, `fetchOrders`, `fetchOrder`, `addNote` e `uploadPhoto` estabilizados
  - `PontoEquilibrioPage.jsx`: cálculo grande dividido em vários `useMemo` menores
- **Empty catch blocks removidos**
  - `TechPontoPage.jsx`
  - `WidgetPedidoPage.jsx`
  - `AgendaPage.jsx`
- **Array index keys substituídas por chaves estáveis**
  - `ProcessamentoSalarialPage.jsx`
  - `ObrasPage.jsx`
  - `MateriaisPage.jsx`
  - `DespesasPage.jsx`
  - `GuiasPage.jsx`
  - `CaixaObraPage.jsx`
  - `TechObraDetailPage.jsx`
  - `ConfiguracoesSalariaisPage.jsx`
  - `SupplierRequestDialog.jsx`
  - `ImportarPropostaButton.jsx`
  - `CustosFixosPage.jsx`
- **Bug real corrigido durante a fase**
  - `AuthContext.js` voltou a expor `token` no contexto para páginas que dependem dele
  - `service_orders.py` passou a aceitar token técnico em `GET /api/service-orders`, `GET /api/service-orders/{id}`, `POST /api/service-orders/{id}/notes` e `POST /api/service-orders/{id}/photos`, sempre filtrando por `assigned_technician_id`
  - Resultado: `/tech/pedidos` deixou de disparar toast de erro e volta a abrir normalmente para técnicos
- **Validação formal**
  - testing agent iteration 57: tudo aprovado
  - backend: `28/28` testes aprovados
  - frontend: páginas técnicas e admin críticas sem erros JS
  - nota cosmética apenas: aviso de dimensão do gráfico em `DespesasPage` quando o chart ainda não está visível no viewport

## Atualização 2026-08-08 — Code Quality / Fase 3
- **Componentes grandes divididos**
  - `DespesasPage.jsx` dividido em:
    - `ExpensesToolbar.jsx`
    - `ExpensesOverview.jsx`
    - `ExpensesTable.jsx`
    - `ExpenseAuditReports.jsx`
    - `ExpenseFormDialog.jsx`
  - `FaturasPage.jsx` dividido em:
    - `InvoicesToolbar.jsx`
    - `InvoicesSummaryFilters.jsx`
    - `InvoicesTable.jsx`
    - `InvoiceFormDialog.jsx`
    - `InvoicePaymentsDialog.jsx`
  - `GuiasPage.jsx` dividido em:
    - `GuidesToolbar.jsx`
    - `GuidesGrid.jsx`
    - `GuideCreateDialog.jsx`
    - `GuideDetailDialog.jsx`
- **Complexidade reduzida em `bank_analysis.py`**
  - `_build_treasury_projection` foi repartida em helpers menores:
    - `_collect_predicted_bill_projection_data`
    - `_collect_recurring_master_projection_items`
    - `_group_projection_items_by_date`
    - `_build_daily_projection_series`
    - `_summarize_projection_window`
    - `_mark_projection_critical_dates`
    - `_build_projection_top_days`
    - `_build_projection_critical_windows`
- **Higiene de testes**
  - `test_treasury_insights.py` passou a usar `auth_test_helpers.get_base_url()` e `get_admin_credentials()`
- **Validação formal**
  - testing agent iteration 58: tudo aprovado
  - backend: `11/11` testes de tesouraria aprovados
  - frontend: `/despesas`, `/faturas`, `/guias` validadas sem erros JS e com diálogos funcionais
  - nota apenas cosmética: warning de dimensão do chart em `DespesasPage` quando o gráfico ainda não entrou no viewport

## Atualização 2026-08-08 — Bugfix Agenda Técnica / Pagamentos Futuros
- Corrigido o filtro de `GET /api/tech/appointments/my` em `backend/tech_extras.py`
- Regra aplicada:
  - **admin em modo supervisor** continua a ver todos os compromissos, incluindo `is_predicted_bill=true`
  - **técnico real** vê apenas compromissos operacionais atribuídos a si e **nunca** contas previstas/pagamentos futuros
- Implementação: query de técnico passou a incluir `"is_predicted_bill": {"$ne": True}`
- Validação formal: testing agent iteration 59
  - backend: `6/6` testes aprovados
  - frontend: admin vê pagamentos futuros em `/tech/agenda`; técnico vê estado vazio/compromissos operacionais sem pagamentos
- Nota operacional: o utilizador reportou o problema em produção; a correção foi aplicada e validada em preview, exigindo redeploy para chegar à produção

## Atualização 2026-08-11 — Multiempresa / SaaS Fase 1
- **Infraestrutura multitenant concluída no backend**
  - `companies` como nova coleção base
  - `company_id` aplicado às coleções core via wrapper `MultiTenantDatabase`
  - `company_access_ids` adicionado/migrado para utilizadores com acesso cruzado a tenants
  - `merge_company_filter` endurecido para impedir bypass por query manual com `company_id`
- **Auth e contexto de tenant**
  - `GET /api/auth/me`, `POST /api/auth/login` e `POST /api/auth/refresh` devolvem agora contexto multiempresa completo
  - novo cookie `active_company_id` + suporte a `X-Company-Id`
  - login técnico e dependências do portal técnico/ordens de serviço mantêm o tenant correcto
- **APIs novas / multiempresa**
  - `GET /api/companies`
  - `GET /api/companies/current`
  - `POST /api/companies`
  - `POST /api/companies/select`
- **Migração idempotente**
  - dados históricos migrados para o tenant inicial Obelisco Radical
  - índices por `company_id` garantidos nas coleções críticas
  - `system_settings` passa a existir por tenant
- **Frontend**
  - novo `CompanySwitcher.jsx` com `data-testid` completo
  - seletor visível na sidebar admin e no cabeçalho do portal técnico
  - `api.js` envia `X-Company-Id` automaticamente
  - `AuthContext.js` mantém tenant activo em sessão e suporta troca sem reload manual
- **Validação formal**
  - self-test backend: criação de tenant, troca de tenant, criação de utilizador no tenant novo, isolamento entre `/api/users`, login técnico
  - smoke test visual frontend: login admin + seletor visível
  - testing agent iteration 60: backend `11/11`, frontend `100%`
  - pytest adicional: `/app/backend/tests/test_multitenancy.py` → `11 passed`

## Atualização 2026-08-11 — Multiempresa / SaaS Fase 2
- **Gestão visual de tenants**
  - nova página protegida `/empresas`
  - cards por empresa com métricas (`users_count`, `budgets_count`, `works_count`, `invoices_count`)
  - criação e edição visual de tenants (`POST /api/companies`, `PUT /api/companies/{company_id}`)
- **Acessos multiempresa por utilizador**
  - `UtilizadoresPage.jsx` agora permite editar `company_access_ids` e `company_id` (empresa principal)
  - utilizadores com acesso ao tenant atual aparecem em `/api/users` mesmo quando a empresa principal é outra
  - `PUT /api/users/{id}` normaliza acessos, garante empresa principal válida e impede empresas fora do alcance do admin
- **Gestão por tenant também na página Empresas**
  - modal “Acessos Multiempresa” por tenant
  - novo endpoint `GET /api/companies/{company_id}/users`
  - flags de resposta: `has_access_to_company`, `is_primary_for_company`, `company_access_ids`, `accessible_companies`
- **Contexto e navegação**
  - `CompanySwitcher` continua funcional e agora reflete tenants criados/editados
  - portal técnico mantém nome da empresa no cabeçalho sem regressões
- **Validação formal**
  - self-test API Fase 2: criar/editar tenant, atribuir múltiplas empresas a utilizador, definir empresa principal, validar `/api/companies/{id}/users`
  - smoke test visual autenticado em `/empresas` com modal de acessos aberto
  - testing agent iteration 61: backend `20/20`, frontend `100%`
  - suites pytest validadas: `test_multitenancy.py` + `test_multitenancy_phase2.py`

## Atualização 2026-08-11 — Registo self-service no Login
- **Novo fluxo de criação de conta no próprio `/login`**
  - separadores `Entrar / Criar conta`
  - o tab **Criar conta** pede:
    - nome do responsável
    - nome da empresa
    - email
    - password
- **Backend auth expandido**
  - novo endpoint `POST /api/auth/register`
  - cria automaticamente:
    - nova empresa/tenant (`companies`)
    - `system_settings` inicial do tenant
    - primeiro utilizador administrador com acesso total
  - aplica login automático via `access_token`, `refresh_token` e `active_company_id`
- **Frontend login redesenhado**
  - `LoginPage.jsx` agora alterna entre formulário de entrada e formulário de registo
  - caixa informativa explica claramente que nasce uma nova gestão isolada
  - redireciona automaticamente para o dashboard após registo
- **Validação formal**
  - self-test API: registo cria empresa + admin e `GET /api/auth/me` / `GET /api/companies/current` confirmam o novo tenant
  - smoke test visual completo do registo com redirecionamento ao dashboard
  - testing agent iteration 62: backend `13/13`, frontend `100%`
  - pytest adicional: `/app/backend/tests/test_self_service_registration.py` → `13 passed`

## Atualização 2026-08-11 — White Label / Branding por empresa
- **Backend branding multiempresa concluído**
  - `system_settings.branding` passa a guardar logo, origem e paleta por tenant
  - extração automática de cores a partir do logótipo com geração de paleta completa (`primary`, `secondary`, `accent`, `surface`, `border`, charts)
  - novo branding público por tenant com:
    - `GET /api/public/branding`
    - `GET /api/logo`
    - `GET /api/settings/logo` (compatibilidade)
  - `PUT /api/system-settings` aceita agora `branding.logo_data_url` e `branding.clear_logo`
- **Frontend white label aplicado**
  - novo `BrandingContext.jsx` para carregar/cachar/aplicar branding do tenant ativo
  - `branding.js` injeta CSS variables dinâmicas em toda a app
  - `BrandLogo.jsx` reutilizado no login, sidebar, dashboard e preview de branding
  - novo separador **Branding** em `/definicoes` com preview, swatches, upload e reset
  - `LoginPage.jsx`, `Sidebar.jsx` e `DashboardPage.jsx` passam a refletir o branding da empresa ativa
- **PDFs alinhados ao branding**
  - novo helper `pdfBranding.js`
  - branding aplicado em `workReportPdf.js`, `guidePdf.js`, `checklistPdf.js` e `annualReportPdf.js`
  - páginas que geram relatórios passaram a ler `system-settings` do tenant atual
- **Validação formal**
  - pytest novo: `/app/backend/tests/test_white_label_branding.py` → `3 passed`
  - self-test API: upload, persistência, reset e isolamento por tenant validados
  - smoke test visual: `/login` + `/definicoes > Branding`
  - testing agent iteration 63: backend `100%` + frontend `100%`
  - auto_frontend_testing_agent: aprovado
  - deep_testing_backend_v2: `6/6` cenários aprovados

## Atualização 2026-08-13 — Relação de Visita em Obra no Portal do Técnico
- **Novo módulo exclusivo do Portal do Técnico**
  - nova rota protegida `/tech/visitas`
  - acesso rápido a partir do dashboard técnico e atalho dentro do detalhe da obra
  - navegação técnica expandida com entrada **Visitas**
- **Formulário mobile-first para uso em campo**
  - secções de cabeçalho, escopo, lista dinâmica de circuitos e quadro de distribuição
  - seletor visual de serviços com ícones em drawer, pesquisa e defaults automáticos por tipo
  - upload de foto do quadro preparado para câmara móvel (`accept=image/*` + `capture=environment`) com otimização client-side
- **Backend dedicado ao contexto técnico**
  - novo módulo `backend/tech_visit_reports.py`
  - endpoints:
    - `GET /api/tech/visit-reports`
    - `POST /api/tech/visit-reports`
    - `GET /api/tech/visit-reports/{id}`
    - `PUT /api/tech/visit-reports/{id}`
    - `DELETE /api/tech/visit-reports/{id}`
    - `GET /api/tech/visit-reports/helpers/works`
  - cada relatório fica associado a `technician_id`, `technician_name` e respeita controlo de acesso por técnico
- **Visual final oficial + PDF**
  - novo componente `VisitReportPreview.jsx` com cabeçalho preto, detalhes mostarda, linhas zebradas e bloco do quadro com checkmarks amarelos
  - novo gerador `visitReportPdf.js` com exportação PDF pronta para cliente/administração
- **Validação formal**
  - pytest novo: `/app/backend/tests/test_tech_visit_reports.py` → `1 passed`
  - smoke test visual autenticado no preview: módulo carregado com sucesso
  - testing agent iteration 64: backend `100%` + frontend `100%`

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
- Validação do utilizador em produção:
  - totais de despesas
  - email nativo Emergent
  - push notifications em dispositivos físicos

### P1
- Melhorias ao onboarding de nova conta:
  - wizard pós-registo para completar NIF, telefone e morada da empresa
- Automação Máscara DIN (importar da Legenda)
- Módulo Salarial Fase 2: recibos PDF
- Possível extensão do módulo de visita:
  - envio direto para administração por email
  - associação automática a obra ao abrir pelo detalhe da obra com pré-preenchimento adicional
- Exportar Custos Recorrentes
- Code Quality Fase 4: reduzir componentes grandes remanescentes (`MateriaisPage`, `MascaraDinPage`, `DashboardPage`) + continuar type hints

### P2
- TOC Online integration (se credenciais fornecidas)
- Alertas Telegram automáticos de IVA/PPC perto do vencimento
- Refactor server.py (>4000 linhas)
- Hardening de CSP para scripts externos legítimos sem warnings cosméticos no browser
- Code Quality Fase 5: refactor adicional de complexidade em `_build_recurring_masters_from_analyses`, `_normalize_df`, `_detect_recurring`, `_pre_categorize`, `_ai_categorize_batch`, `_parse_pdf`
