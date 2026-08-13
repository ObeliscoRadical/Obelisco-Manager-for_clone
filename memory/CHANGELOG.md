## 2026-08-13 — Branding de ícones global
- Novo ícone oficial da app aplicado a favicon, apple-touch-icon, PWA icons e atalhos mobile/tablet/desktop
- Assets públicos regenerados a partir da imagem fornecida pelo utilizador e guardados em `frontend/public/`
- `index.html` atualizado com `shortcut icon` e `application-name` = `Obelisco Manager`
- Validação: testing agent iteration 66 (frontend 100%, assets e referências OK)

## 2026-08-13 — Bugfix auth: admin em /tech/visitas
- Corrigido `frontend/src/lib/api.js`: endpoints `/tech/*` deixam de bloquear refresh para admins com `refresh_token` válido
- Mantido comportamento correto para técnicos reais: sem refresh token, sem auto-refresh em rotas técnicas
- Resolve o erro **"não autenticado"** reportado por admin ao abrir **Relação de Visita** via menu do Portal Técnico e via botão dentro da obra
- Validação: smoke test com access token admin inválido + refresh válido e testing agent iteration 65 (4/4 frontend)

## 2026-08-13 — Relação de Visita em Obra no Portal do Técnico
- Novo módulo técnico em `/tech/visitas` com formulário mobile-first, lista de relatórios e preview oficial da Obelisco Radical
- Backend novo `tech_visit_reports.py` com CRUD completo em `/api/tech/visit-reports` + helper `/helpers/works`, sempre ligado ao `technician_id`
- Novo seletor visual de serviços com ícones (`VisitServicePicker`), preview final (`VisitReportPreview`) e exportação PDF (`visitReportPdf.js`)
- Atalhos integrados no dashboard técnico, detalhe da obra e navegação principal do portal técnico
- Validação: pytest `test_tech_visit_reports.py` (1 passed) + smoke visual autenticado + testing agent iteration 64 (backend 100%, frontend 100%)

## 2026-08-11 — White Label / Branding por empresa concluído
- `system_settings.branding` passa a suportar logo custom, reset e paleta automática por tenant
- Novas APIs públicas/tenant-aware: `GET /api/public/branding`, `GET /api/logo`, `GET /api/settings/logo`
- Frontend com `BrandingContext`, novo tab **Branding** em `/definicoes`, `BrandLogo` reutilizável e tema aplicado em `/login`, sidebar e dashboard
- PDFs alinhados ao branding via `pdfBranding.js` (`workReportPdf`, `guidePdf`, `checklistPdf`, `annualReportPdf`)
- Validação: pytest `test_white_label_branding.py` (3 passed) + self-test API + smoke visual + testing agent iteration 63 (backend 100%, frontend 100%) + auto_frontend_testing_agent aprovado + deep_testing_backend_v2 6/6

## 2026-08-11 — Multiempresa / SaaS Fase 1 concluída
- Backend multiempresa concluído com coleção `companies`, migração idempotente de `company_id`, `company_access_ids` e índices por tenant
- Auth admin/técnico passa a devolver contexto multiempresa; novo `active_company_id` + suporte `X-Company-Id`
- Novas APIs: `GET /api/companies`, `GET /api/companies/current`, `POST /api/companies`, `POST /api/companies/select`
- Frontend com seletor de empresa (`CompanySwitcher`) na sidebar admin e no portal técnico
- Validação: self-test API + smoke visual + testing agent iteration 60 (backend 11/11, frontend 100%) + pytest `test_multitenancy.py` (11 passed)

## 2026-08-11 — Multiempresa / SaaS Fase 2 concluída
- Nova página `/empresas` com listagem visual de tenants, métricas por empresa e edição de dados do tenant
- Gestão de acessos multiempresa em **duas frentes**: modal por tenant em `/empresas` e painel completo em `/utilizadores`
- Backend expandido com `PUT /api/companies/{company_id}`, `GET /api/companies/{company_id}/users` e atualização robusta de `company_access_ids` / `company_id` em `/api/users/{id}`
- `/api/users` agora inclui utilizadores com acesso ao tenant atual mesmo quando a empresa principal é outra
- Validação: self-test API Fase 2 + smoke visual autenticado + testing agent iteration 61 (backend 20/20, frontend 100%)

## 2026-08-11 — Registo self-service no login
- Novo separador **Criar conta** dentro de `/login`, com criação de nova empresa + novo admin + login automático
- Backend com `POST /api/auth/register` para nascer um tenant totalmente isolado com `system_settings` inicial
- Frontend do login refeito com tabs `Entrar / Criar conta`, formulário de onboarding curto e caixa explicativa do fluxo
- Validação: self-test API + smoke visual do registo + testing agent iteration 62 (backend 13/13, frontend 100%)

# Obelisco Manager - CHANGELOG

---

## Aug 08, 2026 — Tech Agenda bugfix: predicted bills only for admin

### Fix
- `backend/tech_extras.py` → `GET /api/tech/appointments/my`
- Técnicos reais agora recebem query com `is_predicted_bill: { $ne: true }`
- Admin em modo supervisor continua a ver contas previstas na agenda técnica

### Validation
- **testing agent iteration 59**: backend 6/6 + frontend 100%
- Admin `/tech/agenda`: 4 compromissos, 3 contas previstas visíveis
- Técnico `/tech/agenda`: 0 contas previstas, estado vazio correto

### Production note
- Bug report veio de produção; fix foi aplicado e validado em preview e precisa de redeploy para produção

---

## Aug 08, 2026 — Code Quality Phase 3

### Frontend modularization
- `DespesasPage.jsx` dividido em 5 componentes (`ExpensesToolbar`, `ExpensesOverview`, `ExpensesTable`, `ExpenseAuditReports`, `ExpenseFormDialog`)
- `FaturasPage.jsx` dividido em 5 componentes (`InvoicesToolbar`, `InvoicesSummaryFilters`, `InvoicesTable`, `InvoiceFormDialog`, `InvoicePaymentsDialog`)
- `GuiasPage.jsx` dividido em 4 componentes (`GuidesToolbar`, `GuidesGrid`, `GuideCreateDialog`, `GuideDetailDialog`)

### Backend complexity reduction
- `bank_analysis.py`: `_build_treasury_projection` repartida em helpers menores para projeção, agrupamento, sumários e pressure map

### Test hygiene
- `test_treasury_insights.py` alinhado com `auth_test_helpers.py`

### Validação
- **testing agent iteration 58**: backend 11/11 + frontend 100%
- `/despesas`, `/faturas`, `/guias` sem regressão funcional; diálogos abrem corretamente
- `GET /api/bank-analysis/treasury/insights` mantém estrutura esperada

---

## Aug 08, 2026 — Code Quality Phase 2

### Hook dependencies / callbacks
- `TechPerfilPage.jsx`: `loadProfile` estabilizado com `useCallback`
- `TechPedidosPage.jsx`: headers memoizados + callbacks do detalhe estabilizados
- `PontoEquilibrioPage.jsx`: cálculo repartido em vários `useMemo`

### Empty catches removidos
- `TechPontoPage.jsx`
- `WidgetPedidoPage.jsx`
- `AgendaPage.jsx`

### Array index keys removidas dos alvos desta fase
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

### Bugfix descoberto durante a fase
- `AuthContext.js` volta a expor `token` no contexto
- `service_orders.py` aceita token técnico nos pedidos do portal com filtro por `assigned_technician_id`
- `/tech/pedidos` volta a abrir sem toast de erro

### Validação
- **testing agent iteration 57**: backend 28/28 + frontend 100%
- páginas validadas: `/tech/pedidos`, `/tech/ponto`, `/tech/perfil`, `/ponto-equilibrio`, `/agenda`, `/obras`, `/despesas`

---

## Aug 08, 2026 — Code Quality Phase 1

### Segurança / testes
- Criado `backend/tests/auth_test_helpers.py`
- Removidas credenciais hardcoded dos testes-alvo reportados pela revisão de código

### Frontend auth/storage
- `src/lib/api.js`: fallback auth passou de `localStorage` para `sessionStorage` + memória
- `src/contexts/AuthContext.js`: `obelisco_user_kind` passou para `sessionStorage`
- Novo helper `src/lib/browserStorage.js`

### Outras melhorias desta fase
- `LegendaQuadroPage.jsx` e `MascaraDinPage.jsx`: migração de storage para `sessionStorage`
- `PontoGPSPage.jsx`: hooks e tratamento de erros melhorados
- Chaves React estabilizadas em páginas do Dashboard e CFO
- Criado `/app/auth_testing.md`

### Validação
- **testing agent iteration 56**: backend 64/64 passed (4 skipped) + frontend 100%
- Confirmado: tokens ausentes de `localStorage`, presentes apenas em `sessionStorage`, login admin/técnico OK, reload OK, páginas críticas sem regressão

---

## Aug 08, 2026 — P2: Filtros, mini gráfico, GPS equipa e segurança

### Contas Previstas
- **Frontend** (`ContasPrevistasPage.jsx`): nova barra de filtros por categoria + intervalo de datas
- Estado vazio específico quando os filtros não devolvem linhas

### Dashboard principal
- **Backend** (`server.py`): `GET /api/dashboard/overview` agora devolve `monthly_revenue_vs_expenses`
- **Frontend** (`DashboardPage.jsx`): novo mini gráfico mensal receitas vs despesas (últimos 6 meses)

### GPS da equipa
- **Backend** (`service_orders.py`): novo endpoint `GET /api/service-orders/timeclock/team-map`
  - devolve `latest_positions`, `history_entries`, `summary`, `bounds`
- **Frontend**:
  - novo componente `TeamGeoMap.jsx`
  - `RelatoriosPontoPage.jsx` agora mostra KPIs do mapa, última posição por técnico e trilho diário

### Hardening segurança
- **Backend** (`server.py`):
  - CORS allow-list baseado em env + regex para domínios emergent
  - rate limiting em rotas públicas (login, refresh, disponibilidade pública, propostas públicas, uploads públicos)
  - headers de segurança em todas as respostas API
- **Frontend** (`public/index.html`): meta CSP adicionada

### Testes
- Self-test backend/manual aprovado
- `auto_frontend_testing_agent`: 100%
- `deep_testing_backend_v2`: aprovado
- **testing agent iteration 55**: backend 30/30 + frontend 100%

---

## Aug 08, 2026 — CFO Virtual / Recuperação e Reestruturação de Crédito

### Novo módulo financeiro executivo
- **Backend novo** (`cfo_virtual.py`):
  - `GET /api/cfo-virtual/dashboard`
  - `GET/POST/PUT/DELETE /api/cfo-virtual/debts`
  - `POST /api/cfo-virtual/analyze`
  - `POST /api/cfo-virtual/simulator`
- **Frontend novo**:
  - `CfoVirtualPage.jsx`
  - `CfoDebtsTable.jsx`
  - `CfoSimulator.jsx`
  - nova entrada **CFO Virtual** na sidebar + rota protegida `/cfo-virtual`

### Regras de decisão entregues
- O motor cruza **saldo real do último extrato**, **movimentos bancários recentes**, **custos fixos**, **dívidas ativas**, **recebimentos urgentes** e **margens / cobrança de obras** antes de gerar ordens do dia
- Regra **anti-ilusão** aplicada no backend:
  - sem caixa livre → sem sugestão de pagamento positivo
  - alocação de caixa é calculada deterministicamente antes da IA responder
- O simulador limita automaticamente:
  - `effective_cut <= max_cut_feasible`
  - `effective_collection <= max_urgent_collection`

### Persistência nova
- Collections MongoDB:
  - `active_debts`
  - `cfo_virtual_reports`
  - `cfo_virtual_simulations`

### Testes
- Self-test manual: login, dashboard, CRUD dívida, análise IA e simulador OK
- **Testing agent iteration 54**: backend 22/22 + frontend 100%

---

## Aug 06, 2026 (Fork 2d) — Duplicidade Fuzzy por Nome + PDF Stale Detection

### Deteção de Duplicados Fuzzy por Nome de Fornecedor
- **Backend** (`bank_analysis.py`): Nova lógica `_extract_significant_words()` + `_fuzzy_match_supplier()`
  - Extrai palavras significativas (>=4 chars) da descrição do extrato, removendo prefixos bancários (COMPRA EL-E, TRF SEPA+), datas, números de referência e ruído (LDA, COMERCIO, PORTUGAL, LISBOA...)
  - Compara com palavras do fornecedor nas despesas existentes
  - Se houver match de nome + (mesma data OU valor similar ±5%) → marca como possível duplicado
  - Exemplo: extrato "COMPRA EL-E 3148056/04 JOTEILUX LDA QUELUZ" ↔ despesa "JOTEILUX-COMERCIO DE MATERIAL ELECTRICO LDA" → **MATCH por JOTEILUX**
- **Frontend**: Painel de duplicados separado (orange) mostra fornecedor da despesa existente, data e valor para comparação
- Painel de duplicados agora visível independentemente de haver itens pendentes

### PDF Stale Processing Detection
- **Backend**: Endpoint `/status` agora deteta análises "presas" (>10 min) e marca-as automaticamente como falhadas
- Mensagem: "Processamento expirou (>10 min). Por favor tente novamente."

### Testes
- **Iteration 43**: 11/11 backend aprovado
- Cobertura: fuzzy matching JOTEILUX/ARMASUL/SONEPAR/SERVELEC, stale detection, CSV upload com duplicados fuzzy

---

## Aug 06, 2026 (Fork 2c) — Aprendizagem de Categorias + Aprovação de Sync

### Category Learning (Aprendizagem)
- **Backend** (`bank_analysis.py`): Novo collection `category_overrides` — guarda regras aprendidas
- PATCH transação → guarda `desc_key` normalizado (sem datas/refs, lowercase) + categoria
- `_pre_categorize()` agora verifica overrides do utilizador ANTES de keywords/IA (prioridade máxima)
- Match exato + match parcial (primeiros 20 chars)
- `GET /api/bank-analysis/category-overrides/list` — listar regras aprendidas
- `DELETE /api/bank-analysis/category-overrides/{desc_key}` — remover regra

### Aprovação de Importação (Sync Preview)
- **Backend**: Substituído `_auto_sync_expenses()` por `_prepare_sync_preview()` — NÃO importa automaticamente
- Análises agora incluem `sync_preview: {pending: [...], duplicates: [...]}` com itens pendentes de aprovação
- Novo endpoint `POST /api/bank-analysis/{id}/approve-sync` — aceita `{approved_ids: [ids]}` e cria despesas apenas para os aprovados
- Após aprovação: `sync_preview.pending` é atualizado, `sync_approved.created` guardado
- **Frontend** (`AnaliseBancariaPage.jsx`):
  - Painel de aprovação (`sync-approval-panel`) com checkboxes por transação
  - Botões "Selecionar tudo" / "Desmarcar tudo" + "Aprovar (N)"
  - Duplicados mostrados em secção colapsável
  - Toast de aprendizagem: "o sistema aprendeu esta correção para futuros extratos"

### Testes
- **Iteration 42**: 7/7 backend + 100% frontend aprovado
- Cobertura: upload CSV com preview, approve-sync parcial, learning override, re-upload com override aplicado, UI panel

---

## Aug 06, 2026 (Fork 2b) — Auto-Sync Despesas + Calendário + Re-Categorização IA

### Auto-Sync Bancário → Despesas
- **Backend** (`bank_analysis.py`): Novas funções `_auto_sync_expenses()` e `_auto_feed_calendar()` — executam automaticamente após cada upload (PDF ou CSV/Excel/OFX)
- Resultados guardados no documento de análise (`auto_sync`, `auto_calendar`)
- Deteção de duplicados: bank_txn_id + data/valor/fornecedor fuzzy
- Upload CSV síncrono e upload PDF assíncrono ambos incluem auto-sync

### Re-Categorização IA de Despesas Existentes
- **Backend** (`expenses.py`): Novo endpoint `POST /api/expenses/ai-categorize`
  - Fase 1: Palavras-chave (instant) — `_smart_category_from_supplier()` + `_smart_type_from_supplier()`
  - Fase 2: GPT-4o-mini para despesas restantes em "Outros" (batches de 40)
  - Retorna: `{total, updated_keywords, updated_ai, unchanged, message}`
- **Frontend** (`DespesasPage.jsx`): Botão "Categorizar com IA" (roxo) na barra de ações

### Frontend — Auto-Sync UI
- **AnaliseBancariaPage.jsx**: Banner `auto-sync-banner` mostra resultados automáticos (despesas importadas, duplicados, calendário)
- Toasts de sucesso para auto-sync tanto em CSV como em PDF (polling)
- Botão manual "Sincronizar com Despesas" continua disponível para re-sync

### Testes
- **Iteration 41**: 8/8 backend + 100% frontend aprovado
- Cobertura: CSV upload com auto_sync, duplicados no re-upload, ai-categorize endpoint, UI buttons + banner

---

## Aug 06, 2026 (Fork 2) — Fix: PDF Upload Assíncrono

### Bug
- **Problema**: Upload de PDF no módulo Análise Bancária dava sempre "Erro ao processar extrato" (502 Cloudflare timeout — Gemini demora 2-4 min)
- **Causa raiz**: O endpoint `/api/bank-analysis/upload` era síncrono; o proxy Cloudflare tem timeout ~60s

### Solução
- **Backend** (`bank_analysis.py`): Upload de PDF agora é assíncrono:
  - Cria registo com `status: "processing"` na DB e retorna imediatamente
  - Processamento Gemini AI executa em `asyncio.create_task` (background)
  - Novo endpoint `GET /api/bank-analysis/{id}/status` para polling
  - Listing endpoint agora inclui campos `status` e `error`
  - Quando termina: actualiza DB para `status: "completed"` ou `status: "failed"`
- **Backend**: Corrigido `_ai_categorize_batch()` — faltava `system_message` no `LlmChat` constructor
- **Frontend** (`AnaliseBancariaPage.jsx`):
  - Ao receber `status: "processing"`, mostra banner com animação e mensagem específica para PDF
  - Polling automático a cada 5s até `completed` ou `failed`
  - Lista mostra badge "A processar..." com spinner para items em processamento
  - Items `processing`/`failed` não são clicáveis
- **Uploads CSV/Excel/OFX**: Continuam síncronos (rápidos, sem alteração)

### Testes
- **Iteration 40**: 10/10 backend + 100% frontend aprovado
- Teste manual com PDF real BPI: 134 transações extraídas com sucesso em ~3 min

---

## Aug 06, 2026 — Despesas: Categorização IA + Duplicados + Extratos PDF

### Despesas — Auto-Categorização Inteligente
- **Backend** (`expenses.py`): Novo `_SUPPLIER_CATEGORY_MAP` com ~60 fornecedores portugueses → categoria automática (Material, Combustível, Alimentação, Viatura, Comunicações, Rendas, Seguros, Ferramentas, etc.)
- **Backend**: `_smart_category_from_supplier()` determina categoria por palavras-chave do fornecedor
- **Backend**: `extract_invoice_data` agora retorna `category_source` (IA, palavras-chave, histórico, genérico)
- **Backend**: Sugestões por histórico — procura despesas anteriores do mesmo fornecedor, usa categoria dominante
- **Prioridade**: histórico > palavras-chave > IA/OCR > "Outros"
- **Backend**: Tipo automático (fixo/variavel/obra) já existente com `_SUPPLIER_TYPE_MAP`

### Despesas — Detecção de Duplicados Melhorada
- **Backend**: 3 camadas: 1) nº fatura exacto, 2) data+valor+fornecedor fuzzy (±1%), 3) bank_txn_id
- **Backend**: HTTP 409 com `duplicate_invoice` code ao criar/editar, bypass com `?force=true`
- **Frontend**: Substituído `window.confirm` por painel visual `save-duplicate-confirm` com dados da despesa existente
- **Frontend**: Botões "Criar Mesmo Assim" / "Cancelar" no painel de confirmação
- **Frontend**: Banner de aviso `duplicate-warning` ao detectar duplicado na extracção OCR

### Despesas — UI de Sugestão
- **Frontend**: Banner `suggestion-banner` mostra fonte da categorização (histórico, palavras-chave, IA)
- **Frontend**: Badge `category-source-badge` junto ao dropdown de Categoria
- **Frontend**: Badge "auto" junto ao campo Tipo quando auto-categorizado
- **Frontend**: Categoria e tipo editáveis manualmente (badge desaparece ao alterar)

### Análise Bancária — Suporte a PDF
- **Backend** (`bank_analysis.py`): Nova função `_parse_pdf()` — envia PDF ao Gemini 3.1 Pro para extrair transações
- **Backend**: Upload endpoint aceita `.pdf` como formato válido
- **Backend**: Erros de parsing (ValueError) convertidos em HTTP 400 (em vez de 500)
- **Frontend** (`AnaliseBancariaPage.jsx`): Input de ficheiro aceita `.pdf`, texto atualizado

### Testes
- **Iteration 39**: 15/15 backend + 100% frontend aprovado
- Cobertura: categorização inteligente, duplicados 409, bypass force, PDF aceite, .doc rejeitado, UI completa

---

## Aug 05, 2026 — Fusão Obelisco-Tecnicos-main → Obelisco Manager
- **Pedido**: Unificar o app "Obelisco-Tecnicos-main" (gestão de pedidos de serviço, ponto GPS, widget público) dentro do app principal "Obelisco Manager" para ficar com apenas UM projecto.
- **Backend novo** (`/app/backend/service_orders.py`):
  - `POST /api/service-orders` — endpoint público para clientes submeterem pedidos sem auth
  - `POST /api/service-orders/admin` — admin cria pedido (auth)
  - `GET/PATCH/DELETE /api/service-orders/{id}` — CRUD completo
  - `POST/PUT/DELETE /api/service-orders/{id}/notes` — sistema de notas
  - `POST/DELETE /api/service-orders/{id}/photos` — upload de fotos (auth e público)
  - `GET /api/service-orders/dashboard/stats` — stats (total, pendentes, em progresso, concluídos)
  - `PUT /api/service-orders/{id}/reassign` — atribuir técnico
  - `GET /api/service-orders/helpers/technicians` — lista de técnicos para dropdown
  - `POST /api/service-orders/timeclock` — registo ponto GPS (entrada/saída com lat/lng/morada)
  - `GET /api/service-orders/timeclock/my-status` — status actual + registos hoje
  - `GET /api/service-orders/timeclock/today` — registos hoje (admin=todos, tech=próprio)
  - `GET /api/service-orders/timeclock/all` — relatórios admin com filtros de data
  - `GET /api/service-orders/timeclock/export` — export CSV
  - Notificações Telegram (ponto + novos pedidos) — preparado, ativa com TELEGRAM_BOT_TOKEN
- **Frontend novo**:
  - `PedidosServicoPage.jsx` — dashboard + lista + detalhe + criação + notas/fotos/atribuição/PDF
  - `WidgetPedidoPage.jsx` — formulário público `/pedido-servico` (sem login) com upload fotos
  - `PontoGPSPage.jsx` — registo entrada/saída com localização GPS + morada auto-resolvida
  - `RelatoriosPontoPage.jsx` — tabela admin com filtros (hoje/semana/mês/custom) + export CSV
  - `TechPedidosPage.jsx` — lista de pedidos no Portal Técnico com detalhe + notas/fotos
- **Sidebar** atualizada: nova secção "Serviço Técnico" com 3 items (Pedidos, Ponto GPS, Relatórios)
- **Portal Técnico** (TechLayout): novo nav item "Pedidos" com ícone Zap
- **Routing** (App.js): 5 novas rotas admin + 1 pública + 1 tech
- **Testado**: 17/17 backend pytest + 100% frontend (widget, dashboard, detalhe, ponto)
- **Collections MongoDB novas**: `service_orders`, `service_timeclock`

## 2026-08-07 — Tesouraria Preditiva no módulo financeiro/bancário
- **Backend novo**:
  - `GET /api/bank-analysis/treasury/insights`
  - Projeção automática de fluxo de caixa 30/60 dias usando apenas saídas previstas
  - Suporte a `opening_balance` manual via query param sem perder a base automática do último extrato
  - Detetor de anomalias para custos recorrentes com limiar configurável por `system_settings.treasury_settings.anomaly_threshold_pct`
  - Merge seguro de defaults em `GET/PUT /api/system-settings`
- **Frontend novo**:
  - `TreasuryInsightsPanel.jsx` com KPIs, gráfico diário, mapa de pressão financeira, anomalias e próximas saídas
  - Resumo `TreasurySummaryStrip` no Dashboard, Dashboard Financeiro e topo da Análise Bancária
  - Nova tab `Tesouraria` no detalhe da Análise Bancária
  - Nova tab `Tesouraria` em Definições com input configurável do limiar de anomalia
- **Fix técnico**:
  - warning de nested component removido em `DespesasPage.jsx`
  - tick component também estabilizado em `DashboardFinanceiroPage.jsx`
- **Testes**:
  - testing agent iteration 49: backend 11/11 pytest e frontend 100%
  - ficheiros: `/app/backend/tests/test_treasury_insights.py`, `/app/test_reports/iteration_49.json`

## 2026-08-07 — Reconciliação bulk manual de despesas
- **Backend novo**:
  - `GET /api/expenses/reconcile-preview`
  - `POST /api/expenses/reconcile-apply`
  - algoritmo mensal/filtrado para:
    - reconciliar despesa fiscal + movimento bancário histórico já existente
    - remover hard duplicates históricos mantendo o registo mais forte
- **Frontend novo**:
  - componente `ReconcileExpensesButton.jsx`
  - botão no cabeçalho de `DespesasPage.jsx`
  - botão no cabeçalho de `AnaliseBancariaPage.jsx`
  - diálogo com preview, contadores, confirmação/cancelamento e bloqueio quando não há ações
- **Refinamentos backend**:
  - merge de histórico bancário/fiscal preservando registo canónico fiscal
  - suporte a reprocessamento manual do mês atual/filtros selecionados
- **Testes**:
  - testing agent iteration 50: dedupe/reconciliação base + alerts treasury 100%
  - testing agent iteration 51: bulk reconciliation button/endpoints 100%
  - ficheiros: `/app/backend/tests/test_dedupe_reconciliation.py`, `/app/backend/tests/test_bulk_reconciliation.py`, `/app/test_reports/iteration_50.json`, `/app/test_reports/iteration_51.json`

## 2026-08-07 — Auditoria Excel da reconciliação
- **Backend novo**:
  - persistência de relatórios em `expense_reconciliation_reports`
  - geração automática de ficheiro `.xlsx` em `/app/backend/uploads/reconciliation_reports/`
  - `GET /api/expenses/reconcile-reports`
  - `GET /api/expenses/reconcile-reports/{id}/download`
- **Estrutura do Excel**:
  - folha `Resumo`
  - folha `Reconciliadas`
  - folha `Duplicados Removidos`
- **Frontend novo**:
  - secção `Auditoria de Reconciliações` em `DespesasPage.jsx`
  - botão separado `Descarregar Excel` por relatório gravado
  - toast a informar que o relatório foi guardado para auditoria
- **Testes**:
  - testing agent iteration 52: backend 10/10 + frontend 100%
  - ficheiros: `/app/backend/tests/test_reconciliation_audit_reports.py`, `/app/test_reports/iteration_52.json`

---

(Ver PRD.md para changelog anterior completo)
