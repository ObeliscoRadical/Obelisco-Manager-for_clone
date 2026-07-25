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

## User Personas
- Admin/Owner: Manages budgets, proposals, works, and appointments
- Team members (roles): View and manage assigned works

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
- [x] Multi-role user management

## Changelog

### Jul 25, 2026 (v27) — Caixa da Obra (Cash-flow por Obra)
- **Pedido**: dashboard financeiro por obra — recebido, a receber, pago, a pagar, margem prevista vs real, saldo de caixa.
- **Backend novo**: `GET /api/works/{id}/caixa` agrega:
  - Valor venda (soma dos items do orçamento aprovado)
  - Facturas emitidas + `payments[].amount` → `total_received`; `to_receive = invoiced - received`; `to_invoice = sale - invoiced`
  - Despesas linked por `obra_id` (pagas vs por pagar)
  - Custo real (items + expenses), margem prevista, margem real
  - `cash_balance = received - expenses_paid` (dinheiro efectivo hoje)
  - `projected_cash_balance = sale - real_cost` (se tudo cobrado e pago)
- **Frontend novo**: `/caixa-obra` (`CaixaObraPage.jsx`)
  - Selector de obra no topo; 4 KPIs principais (Venda / Recebido / A Receber / Caixa Efectiva)
  - 2 barras de progresso (cobrança + custo)
  - 3 cards de margem (Prevista / Real / Caixa Projectada)
  - Warning banner vermelho quando margem real < 70% da prevista
  - Listas Facturas (com "Falta X€") e Despesas (com badges PAGA / POR PAGAR) lado a lado + botões "Ver todas →"
- **Sidebar**: entrada "Caixa da Obra" (ícone Wallet) logo abaixo de "Obras", gated on module `obras`.
- **Testing (`testing_agent`)**: 7/7 backend pytest + 100% UI. Report `/app/test_reports/iteration_23.json`. Novo teste: `test_caixa_obra.py`. Math consistente: `cash = received - paid`, `to_receive = invoiced - received`.



### Jul 25, 2026 (v26) — Agenda: atribuição de compromissos a técnicos
- **Pedido**: só admin cria/edita compromissos e seleciona os técnicos. Portal Técnico > Agenda passa a mostrar apenas as marcações do próprio.
- **Backend**:
  - `AppointmentCreate` estendido: `employee_ids: List[str]` + `location: str`.
  - POST/PUT/DELETE `/api/appointments` agora exigem `role='admin'` (**403 caso contrário**).
  - Verificação de conflito de horário agora só bloqueia se houver **sobreposição de técnicos** (`employee_ids` intersetam) — dois técnicos podem ter marcações paralelas.
  - `GET /api/tech/appointments/my` filtra por `employee_ids: user.id` (ou tudo se admin em modo supervisor).
- **Frontend**:
  - `AgendaPage.jsx` refeita: checkboxes multi-select dos funcionários activos (fetch `/api/payroll/employees`), campo Local, diálogo Edit (pencil), badges amarelas nas cards a mostrar quem está atribuído.
  - `TechAgendaPage.jsx` mostra hora início–fim + local + notas.
- **Testing (`testing_agent`)**: 6/6 backend + 10/10 UI. Report `/app/test_reports/iteration_22.json`. Confirmado E2E: admin cria → Daniel vê no seu portal; consulta recebe 403 ao tentar criar; conflito por técnico correcto.



### Jul 24, 2026 (v25) — UI Admin do Chat com Técnicos
- **Bug reportado**: técnicos enviavam mensagens mas o admin não tinha onde vê-las nem responder. Backend estava pronto, faltava a UI.
- **Nova página** `/mensagens-tecnicos` (`AdminMensagensTecnicosPage.jsx`):
  - Layout 2-colunas: lista de conversas (threads) à esquerda + conversa activa à direita
  - Cada thread mostra avatar com iniciais, nome, preview da última mensagem, timestamp e badge vermelho com nº de não-lidas
  - Conversa: bolhas amarelas do admin (direita) vs cinzentas do técnico (esquerda), timestamp em cada mensagem
  - Input "Responder ao técnico…" com Enter para enviar
  - Polling: 20s para threads, 10s para conversa activa
  - Ao abrir uma thread → marca como lida (backend actualiza `read_by_admin: true`) → refresca contador imediatamente
- **Sidebar**: entrada "Mensagens Técnicos" (ícone MessageSquare) na secção **Salários**, com badge vermelho de não-lidas (data-testid='sidebar-unread-badge'). Hook `useUnreadAdminMessages` faz polling a 30s.
- **Permissões**: gated on module `funcionarios` — quem não tem essa permissão vê "Sem permissão".
- **Testing (`testing_agent`)**: 10/10 cenários. Backend 100%, Frontend 100%. Report `/app/test_reports/iteration_21.json`.



### Jul 24, 2026 (v24) — Bug Fix: user com tech_portal permission ficava bloqueado
- **Bug reportado**: Admin cria um user em `Utilizadores` com role='tecnico' + só `tech_portal=true` → user faz login → clica Portal Técnico → **"Sem permissão"**.
- **Root cause**: (a) `App.js:TechProtectedRoute` só aceitava `__kind='tech'` (funcionário) OU `role='admin'`; não olhava para `module_permissions.tech_portal`. (b) Backend `get_tech_user` (em `tech_extras.py`) e `_get_current_tech` (em `transport_guides.py`) rejeitavam qualquer user da collection `users` que não tivesse `role='admin'`.
- **Fix aplicado**:
  - Frontend: `TechProtectedRoute` aceita agora `hasTechPerm = user.module_permissions?.tech_portal === true`.
  - Backend: ambos os dependencies aceitam users-collection user com `tech_portal=true` (não só admin) e tratam-no como supervisor (`_is_admin=True` → vê todas as guias).
- **Testing (`testing_agent_v3_fork`)**: 13/13 pytest + 7/7 UI E2E. Report `/app/test_reports/iteration_20.json`. Novo teste: `/app/backend/tests/test_tech_portal_perm_bugfix.py`.
- **Nota importante para o utilizador**: quando cria um user em `Utilizadores` com `tech_portal=true`, ele vê **todas as guias** (modo supervisor). Para técnicos reais que devem ver **apenas as próprias guias**, use antes o módulo `Funcionários` (collection `employees`).



### Jul 24, 2026 (v23) — Permissões Granulares por Módulo + Admin no Portal Técnico
- **Feature**: admin cria utilizadores escolhendo exactamente que módulos cada um pode ver.
- **Backend**:
  - `ALL_MODULES` (22 chaves): dashboard, orcamentos, propostas, obras, pipeline, materiais, transporte_guias, faturas, despesas, custos_fixos, financeiro, ponto_equilibrio, contabilista, salarios, funcionarios, assiduidade, agenda, biblioteca, relatorios, tech_portal, configuracoes, utilizadores.
  - `default_modules_for_role(role)` — pré-definidos por perfil (admin=todos, tecnico=só tech_portal, etc.).
  - `UserCreate/Update` aceita `module_permissions: dict`; se ausente usa defaults do role.
  - `/api/users` GET/POST/PUT devolve/aceita `module_permissions`.
  - `/api/roles` devolve também `all_modules` e `default_modules_per_role`.
  - `/api/auth/me` e login response incluem `module_permissions` (com fallback aos defaults do role — evita "legacy null → show all").
  - `tech_extras.get_tech_user` e `transport_guides._get_current_tech` aceitam token **admin** (type=access) em modo supervisor com `_is_admin=True`.
  - `tech_list_my_guides` devolve TODAS as guias para admin (visão global) e só as suas para o técnico.
- **Frontend**:
  - `UtilizadoresPage.jsx` REFEITA: dialog com 6 grupos de checkboxes (Operacional / Financeiro / RH & Salários / Materiais & Biblioteca / Portal Técnico / Admin sensível), botões "Todos"/"Nenhum" por grupo, aviso quando role=admin (acesso total), pré-população de defaults ao mudar role.
  - `Sidebar.jsx` com `canSee(user, mod)` que filtra items + esconde headers de secção vazios + entrada nova "Portal Técnico" (ícone Wrench).
  - `App.js`: `<ProtectedRoute module="X">` verifica `user.module_permissions[X]` e mostra ecrã "Sem permissão" (data-testid='no-permission-msg') quando não autorizado. `TechProtectedRoute` agora aceita admin.
  - `TechLayout.jsx`: badge amarelo **ADMIN** + botão "Voltar ao Admin" quando admin visita /tech; logout do admin volta a `/` (não faz logout).
  - `hooks/usePermissions.js`: hook `useHasPermission(mod)` para uso futuro.
- **Testing (`testing_agent_v3_fork`)**: 15/15 pytest backend + 20/20 UI + regressão OK. Report `/app/test_reports/iteration_19.json`. Novo teste: `test_module_permissions.py`.
- Fluxo confirmado: admin cria user "consulta" com só Dashboard+Propostas → user faz login → Sidebar mostra só esses 2 → tentar /despesas → ecrã "Sem permissão".



### Jul 24, 2026 (v22) — Portal Técnico Consolidado (2 apps → 1 domínio)
- **Feature completa**: consolidação do tech-app-obelisco externo dentro do Obelisco Manager. Login unificado — detecta admin vs técnico e redireciona para o portal correcto.
- **Bug crítico corrigido (P0 do iter17)**: axios interceptor destruía a sessão tech no reload por chamar refresh no 401 de /auth/me. Fix: interceptor exclui `/auth/me`, `/tech/auth/me` e qualquer `/tech/*`; AuthContext persiste `obelisco_user_kind` em localStorage.
- **Novo backend**: `/app/backend/tech_extras.py` — router `/api/tech/*` com JWT tech próprio:
  - **Ponto**: `GET /timesheet/today`, `POST /timesheet/punch` (Literal in|out|break_start|break_end), `GET /timesheet/week` → collection `attendance`
  - **Agenda**: `GET /works/my`, `GET /appointments/my` (próximos 30 dias)
  - **Chat**: `GET /messages`, `POST /messages` + `GET /admin/messages/threads` (aggregate), `GET /admin/messages/{emp_id}`, `POST /admin/messages/{emp_id}` → collection `tech_messages`
  - **Perfil**: `GET /profile` (password_hash excluído)
  - **Fotos**: `POST /upload/photo` (multipart, max 10MB, ext validada), `GET /photos/{filename}` (FileResponse), `GET /photos?guide_id=X` → collection `tech_photos` + `/app/backend/uploads/tech_photos/`
- **Novo frontend**:
  - `TechLayout.jsx` refeito: header + 5 nav tabs (Guias/Agenda/Ponto/Chat/Perfil) com desktop side-tabs e mobile bottom-nav + badge de mensagens não-lidas.
  - `SignaturePad.jsx` — canvas de assinatura toque/rato com devicePixelRatio + botão limpar.
  - `TechDashboardPage.jsx` — lista de guias com filtros (todas/pendentes/recebidas).
  - `TechGuideDetailPage.jsx` — detalhe + secção Fotos (upload direto do telemóvel via `capture=environment`) + Diálogo de receção com SignaturePad obrigatório + registo de uso (`qty_used`).
  - `TechAgendaPage.jsx` — obras atribuídas + compromissos, com badge HOJE.
  - `TechPontoPage.jsx` — 4 botões grandes (Entrada/Saída/Pausa) com máquina de estados canIn/canOut/canBreakStart/canBreakEnd, total do dia e histórico 7 dias.
  - `TechChatPage.jsx` — chat com escritório com polling 15s.
  - `TechPerfilPage.jsx` — dados pessoais, contrato, remuneração (salário, sub. alim.), dados fiscais (NIF, NISS, IBAN).
  - `useUnreadTechMessages.js` hook — badge vermelho no nav Chat.
- **Cross-role isolation**: tech tentar acedar /despesas → redirect /tech; admin tentar /tech → redirect /. Persistente no reload.
- **Testing (`testing_agent_v3_fork`)**: 29/29 pytest backend + 100% frontend (8 fluxos, 5 páginas). Report `/app/test_reports/iteration_18.json`. Novos testes pytest: `/app/backend/tests/test_tech_extras.py` (15 casos) + `test_tech_portal_auth.py` (14 casos).
- **Security hardening extra**: `ClockPunch.action` agora Literal (não aceita qualquer string) — HTTP 422 para valores inválidos. Validação de extensão de ficheiro robusta.
- **Novas collections Mongo**: `attendance`, `tech_messages`, `tech_photos`.



### Jul 21, 2026 (v21) — Bug Fix: IRS aplicado incorretamente a trabalhador @ RMMG
- **Bug reportado**: "na area de contabilista esta considerando irs para um trabalhador que ganha ordenado minimo e ate onde sei isso e proibido em portugal" — o simulador cobrava IRS a quem ganha o Salário Mínimo Nacional, violando o Art.º 70 CIRS (Mínimo de Existência).
- **Root cause**: `MINIMO_EXISTENCIA` estava com valor de 2025 (12 180€ = 870€×14). Faltava também salvaguarda para garantir que o líquido nunca fica abaixo do mínimo.
- **Fix aplicado** em `/app/frontend/src/lib/ptTax.js`:
  - Nova constante `RMMG_2026 = 920` (Decreto-Lei 139/2025).
  - `MINIMO_EXISTENCIA = RMMG_2026 × 14 = 12 880€`.
  - `calcIRSAnual`: (a) retorna 0 quando rendimento anual ≤ mínimo existência; (b) salvaguarda Art.º 70 para casos-limite (líquido nunca abaixo do mínimo).
- **UI melhorada** em `/app/frontend/src/pages/ContabilistaPage.jsx`:
  - Badge verde `data-testid="badge-isento-irs"` — mostrada quando o trabalhador está isento (com referência ao Art.º 70 CIRS).
  - Warning vermelho `data-testid="warning-abaixo-rmmg"` — quando utilizador insere bruto < 920€ (ilegal em Portugal).
  - Badge de paridade também na Tab Bruto↔Líquido (`data-testid="lb-badge-isento"`).
- **System prompt Chat IA** actualizado em `/app/backend/contabilista.py` com RMMG 920€ e Mínimo de Existência 12 880€ para respostas coerentes.
- **Testing (`testing_agent_v3_fork`)**: 7/7 cenários passaram — bruto 920€ → IRS 0€ e badge visível; bruto 900€ → warning ilegal; bruto 950€ → IRS 420€; chat responde corretamente citando Art.º 70 CIRS. Report `/app/test_reports/iteration_16.json`.



### Jul 21, 2026 (v20) — Contabilista IA (Ano Fiscal PT 2026)
- **Nova página** `/contabilista` (menu Sidebar "Contabilista IA") — 5 tabs com todos os cálculos que um contabilista faz + chat IA especializado.
- **Backend novo**: `/app/backend/contabilista.py`
  - `POST /api/contabilista/chat` — Gemini 3.1-pro-preview via `emergentintegrations`, system prompt especializado em fiscalidade PT 2026 (IRC, IRS, IVA, TSU, Código do Trabalho); persiste histórico em `contabilista_chats`.
  - `GET /api/contabilista/history/{session_id}` — recupera histórico.
- **Frontend**: `/app/frontend/src/pages/ContabilistaPage.jsx` + lib `/app/frontend/src/lib/ptTax.js` (todas as fórmulas fiscais PT 2026).
  - **Tab 1 — Simulador de Contratação**: input bruto → output custo real empresa (TSU patronal 23.75% + Seguro AT 1.75% + FCT+FGCT 1% + Sub Natal + Sub Férias + Sub Alim + Medicina); mostra pirâmide Líquido / Bruto / Custo Empresa e custo por hora efectiva.
  - **Tab 2 — Bruto ↔ Líquido**: conversor bidirecional com IRS 2026 escalões (13% a 48%) + TSU 11% + suporte a dependentes.
  - **Tab 3 — CLT vs Recibo Verde**: para o mesmo custo empresa, calcula quanto o trabalhador recebe líquido em cada regime (com IRS retido 25%, TSU indep. 21.4%, regime simplificado 75%).
  - **Tab 4 — Extras**: IRC (17%/21% + Derrama Lisboa 1.5%), Simulador de Aumento (custo/€ líquido), Indemnização (Art.º 366 CT — 14 dias/ano, teto 12 salários).
  - **Tab 5 — Chat IA**: chat com sugestões pré-definidas, streaming visual (loading dots), respostas em PT com citação de artigos legais.
- **Testing (`testing_agent_v3_fork`)**: 3/3 backend + 100% frontend (5 tabs) + regressão Ponto de Equilíbrio OK. Report `/app/test_reports/iteration_15.json`. Zero issues P0/P1.
- **Novo teste pytest** criado: `/app/backend/tests/test_contabilista.py` (auth 403, chat, history).
- **Nova collection Mongo**: `contabilista_chats` (session_id, user_id, message, response, created_at).



### Jul 21, 2026 (v19) — Ponto de Equilíbrio & Faturamento Ideal
- **Nova página** `/ponto-equilibrio` (menu Sidebar "Ponto Equilíbrio"): calculadora que responde a "quanto tenho de faturar para ter lucro?".
- **Backend novo**: `/app/backend/breakeven.py` — `GET /api/finance/breakeven/prefill`
  - Retorna médias mensais dos últimos 3 meses: `fixed_costs_monthly` (de `fixed_cost_instances`), `payroll_monthly_avg` (de `payroll_runs` × 1.2375 TSU patronal), `variable_expenses_monthly_avg` (de `expenses` tipo variavel/obra), faturação do mês corrente (de `invoices`), `working_days_month` (dias úteis seg-sex) e `working_days_elapsed`.
- **Frontend novo**: `/app/frontend/src/pages/PontoEquilibrioPage.jsx`
  - **Inputs (esquerda)**: Custos Fixos, Salários (auto ×1.2375 TSU), Despesas variáveis, Outros. Modo de custos variáveis por obra: `% s/vendas` | `€ fixo/mês` | `Ambos`. Objectivo de lucro em `%` ou `€`. Switches para incluir IVA (23%) e IRC (21%).
  - **Resultados (direita)**: KPI **Ponto de Equilíbrio** + KPI **Meta com Lucro**; barra de progresso do mês corrente vs meta (com ritmo esperado); repartição semanal / diária / horária; impacto fiscal (IVA a entregar, IRC devido, lucro líquido); accordion com checklist de **custos típicos de PME em Lisboa** (5 categorias, 30+ itens com ranges reais: Instalações, Comunicações, Fiscal, Frota, Operacional).
  - Cálculo 100% client-side reactivo. Fórmula: `BE = F/(1−v%)`; `Meta = (F+Lucro)/(1−v%)` ou `F/(1−v%−lucro%)`.
- **Testing (`testing_agent_v3_fork`)**: 6/6 backend + 100% frontend. Report: `/app/test_reports/iteration_14.json`. Zero issues.



### Jul 09, 2026 (v18) — Fix: Gemini OCR Model Deprecated
- **Bug**: Upload de fatura em `Faturas` falhava com erro `GeminiException 404 - This model models/gemini-2.5-pro is no longer available`. Também afetava Despesas e Stock Import (mesmo modelo).
- **Root cause**: Google/LiteLLM descontinuou `gemini-2.5-pro`.
- **Fix**: Atualizado o nome do modelo para `gemini-3.1-pro-preview` em 3 ficheiros:
  - `/app/backend/invoices.py` (linha 64) — OCR de faturas emitidas.
  - `/app/backend/expenses.py` (linha 117) — OCR de despesas.
  - `/app/backend/stock_invoice_import.py` (linha 101) — OCR de faturas de stock.
- **Testing**: `testing_agent_v3_fork` — 6/6 backend tests passed. Endpoints `/api/invoices/extract`, `/api/expenses/extract`, `/api/materials/import-invoice/extract` todos retornam 200 com dados extraídos. Regressão de criação manual de fatura também OK. Report: `/app/test_reports/iteration_13.json`.



### Feb 21, 2026 (v17) — Importação de Fatura via IA → Stock
- **Backend `stock_invoice_import.py` (novo módulo)**:
  - `POST /api/materials/import-invoice/extract` — recebe imagem/PDF da fatura, usa **Gemini 2.5 Pro** via `emergentintegrations` para extrair fornecedor, NIF, número, data e linhas (descrição/qty/unidade/preço/IVA/categoria). Faz match contra `materials_db`:
    - Match forte (similaridade ≥ 0.85): classifica como `matched_same_cost` ou `matched_cost_changed`.
    - Match fraco (0.65–0.85): `fuzzy` — admin decide.
    - Sem match: `new`.
  - Match prioriza items com `supplier_nif` igual ao da fatura (bónus +10% na similaridade); fallback para mesmo nome de fornecedor.
  - Devolve preview com summary + lines (cada linha tem `suggested_action`, `existing_material_id`, `price_diff`, `price_diff_pct`).
  - `POST /api/materials/import-invoice/apply` — recebe decisões do admin, aplica:
    - `create` → cria material novo com `supplier_nif`, `purchase_price`, `stock_current=qty`, `price_history`, e cria `stock_movement type=entrada`.
    - `update_stock_only` → soma `quantity` ao `stock_current`, mantém preço.
    - `update_stock_and_price` → soma stock + atualiza `purchase_price` + entrada em `price_history` com `previous`.
    - `skip` → ignora.
    - Popula `supplier`/`supplier_nif` em materiais existentes que não os tinham.
  - `MaterialInput` ganhou campos `supplier_nif` e `vat_rate` para consistência.
- **Frontend MateriaisPage**:
  - Botão "Importar Fatura" (ScanLine icon) ao lado de "Novo Material".
  - Dialog 3 fases: upload (drag-and-drop + camera mobile) → extracting (spinner) → review (tabela editável).
  - Review: cabeçalho da fatura, 5 cards de summary (Total/Existem/Preço Mudou/Match Duvidoso/Novos), botões massa (Aceitar todos os preços novos / Manter preços antigos / Ignorar duvidosos), tabela com badge de match + descrição (mostra match), qty, preço fatura vs preço atual com % de variação (vermelho se ↑, verde se ↓), select de acção por linha.
- **Testado E2E**: 16/16 backend (todos os cenários de action: create/update_stock_only/update_stock_and_price/skip + preservação supplier + zero qty + sem material_id) + frontend 100% + regressão Dashboard/Orçamentos/Propostas/Guias/Materiais.

### Feb 21, 2026 (v16) — Quantidade Utilizada na Obra + Devolução ao Armazém
- **Backend `transport_guides.py`**:
  - Novos campos no item da guia: `qty_used` (consumido na obra) e `qty_returned` (já devolvido). Cálculo `sobra = qty_received - qty_used - qty_returned`.
  - `POST /api/tech/transport-guides/{id}/usage` (técnico) e `POST /api/transport-guides/{id}/usage` (admin) — actualiza `qty_used` de múltiplos items numa única chamada. Valida que `qty_used ≤ qty_received - qty_returned`. Cada alteração regista entrada no `history` (com `from→to` por item + nota opcional).
  - `POST /api/transport-guides/{id}/return-to-stock` (admin) — devolve a sobra ao armazém: incrementa `stock_current` dos materiais e cria `stock_movements` type=`entrada`, actualiza `qty_returned` no item. Aceita opcionalmente `item_ids` para devolver apenas alguns.
  - Aceita `qty_used` também no payload de `/receive` (preencher logo na confirmação inicial).
- **Frontend GuiasPage (admin)**:
  - Tabela de detalhe da guia passa de 5 para 8 colunas: Material, Previsto, Recebido, **Utilizado** (azul), **Devolvido**, **Sobra Obra** (amarelo), Danificado, Nota.
  - Banner amarelo "Material em sobra na obra" aparece sempre que existe sobra > 0, com botão **"Devolver sobra ao armazém"** (data-testid `return-to-stock-btn`). Confirma e cria os movimentos de stock.
- **Validado via curl**: criar guia → emitir → receber c/ diff → admin actualiza qty_used (30/40) → devolução cria stock_movement → re-tentativa de devolução devolve 400 ("Sem sobra") → qty_used acima do disponível devolve 400 com nome do item.

### Feb 21, 2026 (v15) — Guias de Transporte + Auth Técnico
- **Backend `transport_guides.py` (novo módulo)**:
  - Auth técnico: `POST /api/employees/{id}/set-password` (admin define), `POST /api/tech/auth/login` (devolve JWT `type=tech` 12h), `GET /api/tech/auth/me`.
  - CRUD admin: `GET/POST/PUT/DELETE /api/transport-guides`, auto-numeração `GT YYYY/NNNN`, status (rascunho → emitida → em_transito → recebida/recebida_com_diferencas), history automático.
  - `POST /api/transport-guides/{id}/emit` — decrementa stock dos materiais com `material_id`, cria stock_movements `saida`.
  - Endpoints técnico: `GET /api/tech/transport-guides` (só atribuídas a mim), `POST /api/tech/transport-guides/{id}/receive` — actualiza qty_received/damaged_qty/notes/fotos/assinatura, cria stock_movement `perda` se qty_received < qty_planned, muda status.
  - Helper: `GET /api/transport-guides/_helpers/work-materials/{work_id}` — items do orçamento + extras da obra.
- **CORS alargado** para `*.emergent.host` e domínio do `tech-app-obelisco` permitirem consumo cross-origin.
- **Frontend** — nova rota `/guias` (sidebar item "Guias Transporte", ícone Truck):
  - `GuiasPage.jsx` — cards filtráveis (all/rascunho/emitida/recebida/c_diferencas), dialog de criação com modos work (puxa items do orçamento) e manual (escolhe do stock), atribuição a técnico activo, guardar rascunho ou criar+emitir, dialog de detalhe com tabela items prev/recebido/danificado + bloco de receção (assinatura, fotos) + histórico, download PDF.
  - `FuncionariosPage.jsx` — botão KeyRound abre dialog "set-password-dialog" para admin definir password do técnico (requer email na ficha).
- **PDF `guidePdf.js`** — A4 retrato com header preto/amarelo Obelisco, bloco info (obra/cliente/origem/destino/técnico/estado), tabela items, QR code com link da guia, espaço para assinatura/data.
- **Testado E2E**: 24/24 backend (incluindo flows tech_login_inactive_403, receive_with_shortfall, perda automática) + frontend 100% + 8/8 regressões.

### Feb 20, 2026 (v14) — Auto-Agendamento a partir de Proposta
- **Backend `server.py`** — novo `POST /api/proposals/{id}/schedule`:
  - Input `{ window: 'any'|'morning'|'afternoon', duration_hours: 2|3|4|8 }` (defaults: any, 4h).
  - Procura próximo slot livre em janelas comerciais (09–13 manhã, 14–18 tarde), dias úteis seg-sex, em passos de 30min, até 60 dias.
  - Bloqueia duplicados: retorna **409** se já existe appointment com o mesmo `proposal_id`, incluindo o appointment existente em `detail.appointment`.
  - Cria appointment com `proposal_id`, `budget_id`, `client_name`, `client_phone`, `title="Obra — <título>"`, `notes` com valor da proposta.
  - Retorna também `widget_url` com query params (`client`, `phone`, `title`, `proposal_id`, `proposal_label`, `value`, `date`, `time_start`, `time_end`) para abrir o widget externo (`https://tech-app-obelisco.emergent.host/widget?...`) pré-preenchido.
- **Frontend `PropostasPage.jsx`** — botão "Agendar" (data-testid `schedule-{id}`) em cada cartão:
  - Dialog `schedule-dialog` com selecção de janela (Indiferente/Manhã/Tarde) e duração (2h/3h/4h/8h).
  - Botão "Encontrar próximo slot e agendar" chama o backend, mostra resultado verde com data+hora.
  - Se já existe → UI amber + appointment existente + dica para ir à Agenda alterar/eliminar antes de re-agendar.
  - Botão "Abrir em Inserir Pedidos pré-preenchido" → `window.open(widget_url)` em nova tab.
- **Testado E2E**: 15/15 backend (todas as combinações de window/duration + 409 duplicado + 422 sem slot + 404 + regressão overlap appointments) + frontend 100% (todos os testids encontrados, Agenda mostra appointment criado).

### Feb 20, 2026 (v13) — Relatório Financeiro Anual em PDF
- **Backend `server.py`** — novo `GET /api/reports/annual?year=&client=&category=` agrega TUDO para o relatório anual:
  - KPIs: `total_in` (pagamentos recebidos), `total_emitted` (faturas emitidas), `total_out` (variáveis+fixas+obra+salários), `result`, `margin_pct`, `vat_paid` / `vat_charged` / `vat_balance` (IVA a entregar/recuperar), `pending_total` (a receber - todos os anos), contadores de invoices/expenses/works/works_in_progress.
  - `monthly[12]` com `entries`, `expenses_variable/fixed/obra`, `payroll`, `total_out`, `net` e `accumulated` (cashflow cumulativo).
  - `categories_expense` (top categorias com pct), `clients_revenue` (top clientes com pct).
  - Listas slim: `invoices[]`, `expenses[]`, `payroll_runs[]`, `works[]`, `works_in_progress[]`.
  - Filtros: ano (default actual); `client` (regex case-insensitive em invoices.client_name e works.client_name — zera despesas/salários porque não são per-client); `category` (exact match em expenses.category).
- **Frontend** — nova rota `/relatorios` (Sidebar item "Relatórios" com ícone `FileBarChart`):
  - Página `RelatoriosPage.jsx` com selectores Ano/Cliente/Categoria, botões Atualizar e Limpar.
  - Preview KPIs (Entradas, Saídas, Resultado, A Receber) + breakdown das saídas (Variáveis/Fixas/Obra/Salários) + bloco IVA do ano.
  - Tabela mensal interactiva com totais por mês e linha TOTAL no rodapé.
  - Top categorias de despesa e top clientes por faturação (com mini-barras).
  - Card "O que vai estar no PDF" lista contagens (faturas/despesas/salários/obras).
  - Botão "Exportar PDF Anual" com loading.
- **PDF `annualReportPdf.js`** — relatório multi-página A4 retrato, identidade Obelisco:
  - **Capa**: fundo preto, logo, ano grande em amarelo (72pt), faixas decorativas.
  - **Página de Resumo**: 4 KPI cards a preto/amarelo, breakdown das saídas, bloco IVA (liquidado / suportado / a entregar/recuperar), tabela mensal completa com TOTAL e células em vermelho para resultados negativos.
  - **Análise Gráfica**: bar chart agrupado mensal (Entradas/Saídas/Resultado), line chart cashflow acumulado, donut despesas por categoria, donut receitas por cliente — todos desenhados vetorialmente em jsPDF (donuts via canvas → PNG).
  - **Faturas linha-a-linha**: número, datas, cliente+NIF, líquido/IVA/total, pago/saldo/estado com cor para vencidas/pagas.
  - **Despesas linha-a-linha**: data, fornecedor+NIF, nº fatura, categoria, tipo, obra, líquido/IVA/total.
  - **Salários**: tabela mensal com nº funcionários, ilíquido/líquido, SS empresa, custo total.
  - **Obras**: tabela com previsto/real/desvio (verde se poupou, vermelho se gastou mais)/margem.
  - Footer com paginação e marca de confidencialidade em todas as páginas excepto capa.
- **Testado**: 18/18 backend + frontend 100% (todos os data-testids encontrados, PDF gerado sem erros JS, regressão Dashboard/Financeiro/Faturas/Despesas/Obras OK).

### Feb 20, 2026 (v12) — Análise de Custo de Obra (Previsto vs Real)
- **Backend `server.py`** — endpoints novos/expandidos para `/api/works`:
  - `GET /api/works/{id}/full` devolve `{ work, items, expenses, kpis }` com items computados (predicted_total, real_total, sale_total, delta) e KPIs agregados (sale_total, predicted_total, real_total_items, expenses_total, real_total, predicted_profit, real_profit, margin_predicted_pct, margin_real_pct, overrun_pct, is_overrun). Auto-sync inicial a partir do orçamento se a obra tiver `budget_id`.
  - `POST /api/works/{id}/sync-budget` recarrega items do orçamento preservando custos reais já preenchidos e items extra.
  - `PUT /api/works/{id}/items/{item_id}` actualiza `real_unit_cost/real_quantity/real_notes` e regista entrada no array `history` quando o custo real muda (timestamp, utilizador, from, to).
  - `POST /api/works/{id}/items` adiciona item imprevisto com `is_extra=true`.
  - `DELETE /api/works/{id}/items/{item_id}` remove item da obra.
  - Despesas com `obra_id` matching aparecem na resposta de `/full` e somam ao `expenses_total`.
  - `is_overrun = overrun_pct > 10`.
- **Frontend `ObrasPage.jsx`** — clicar no card de uma obra abre um Dialog grande (`work-analysis-dialog`) com:
  - Header sticky com KPI cards (Venda Total, Custo Previsto, Custo Real, Lucro Real) e alerta vermelho "Obra ACIMA DO ORÇAMENTO" quando aplicável.
  - Toolbar com filtro de items, botão "Histórico" e botão "Item Imprevisto".
  - Tabela editável: inputs inline `real_unit_cost` + `real_quantity` com botão Guardar por linha (só activa quando dirty), badge "Extra" em items imprevistos, contador de alterações por item, eliminar item extra.
  - Form de novo item imprevisto (nome, categoria, unidade, qtd, custo previsto, custo real).
  - Panel de Histórico de alterações global (cronológico).
  - Secção "Despesas vinculadas a esta obra" com tabela de despesas linkadas via `obra_id`.
  - Botões "Sincronizar do Orçamento" (apenas se `budget_id`) e "Relatório PDF".
- **Novo gerador PDF `/app/frontend/src/lib/workReportPdf.js`**: Relatório de Obra A4 com header preto/amarelo Obelisco, info da obra, alerta de overrun, 4 KPI cards, faixa de margens (prevista, real, desvio), tabela de items (Previsto vs Real com cor em desvio), tabela de despesas vinculadas e tabela de histórico de alterações.
- **Testado E2E**: 168/168 backend (21 novos work_analysis tests) + frontend 100% (todos os testids verificados, fluxos de criar/editar/eliminar regressão OK, KPIs corretos, histórico, PDF download).

### Feb 19, 2026 (v11) — Filtros Mês + Cliente (Financeiro e Faturas)
- **Backend `invoices.py`**: param `client` (regex case-insensitive) adicionado a `GET /api/invoices` e `GET /api/invoices/summary`; `summary` aceita também `year`/`month`. Novo endpoint `GET /api/invoices/clients` devolve lista ordenada de nomes distintos para dropdown.
- **Backend `/api/dashboard/cashflow`**: novos params `month` e `client`. Quando `month` definido, KPIs/mês actual escopados ao mês; gráfico mantém 12 meses para contexto. Quando `client` definido, despesas e salários zerados (não são client-specific) e só são calculadas métricas de faturação desse cliente; devolve flag `client_filter_active` + `scope_label`.
- **Frontend `DashboardFinanceiroPage.jsx`**: barra de filtros (Ano/Mês/Cliente + "Limpar filtros"), banner avisa quando filtro de cliente está activo, KPIs adaptam-se ao scope; card de categorias oculto quando cliente activo.
- **Frontend `FaturasPage.jsx`**: barra de filtros (Ano/Mês/Cliente + "Limpar filtros"). Summary e lista actualizam em tempo real.
- Validado via curl (cliente case-insensitive, month scoping correcto, summary filtrado OK) e screenshots de ambas as páginas com filtros aplicados.

### Feb 19, 2026 (v10) — Dashboard Financeiro Unificado
- **Novo endpoint** `GET /api/dashboard/cashflow?year=YYYY` (`server.py`): agrega invoices (pagamentos por data = entradas), expenses (saídas variáveis/fixas/obra), payroll_runs (salários custo total empresa). Devolve:
  - `totals`: entradas/saídas/resultado/margem % do ano
  - `current_month`: breakdown do mês em curso
  - `monthly[12]`: entradas, despesas, salários, saídas, net por mês
  - `top_categories`: top 6 categorias de despesa com valores
  - `collection`: pending (a receber) + overdue (vencido)
  - `forecast_30d`: médias dos últimos 3 meses, projecção + lista de faturas a vencer nos próximos 30 dias
- **Nova página** `/financeiro` (`DashboardFinanceiroPage.jsx`): KPIs (entradas/saídas/resultado/a receber), cards mês actual + previsão 30d, gráfico de barras mensal (recharts), donut de categorias, lista de "A receber nos próximos 30 dias". Selector de ano.
- **Sidebar**: novo item "Financeiro" com ícone LineChart.
- Rota adicionada ao `App.js`.
- Testado E2E via curl (cálculos correctos: 600€ entradas, 2877€ saídas, -2277€ resultado, 1860€ vencido) + screenshot renderizado.

### Feb 19, 2026 (v9) — IA OCR nas Faturas
- **Extracção IA em Faturas** (`/app/backend/invoices.py`): novo endpoint `POST /api/invoices/extract` recebe upload (PDF/JPG/PNG/WEBP), envia para Gemini 2.5 Pro via `emergentintegrations` e devolve JSON com `number`, `issue_date`, `due_date`, `client_name`, `client_nif`, `client_email`, `client_phone`, `value_net`, `vat_rate`, `vat_amount`, `value_total`, `notes`.
- **GET `/api/invoices/file/{filename}`**: serve ficheiros de faturas guardados em `/app/backend/uploads/invoices/`.
- **Campo `invoice_file`** adicionado a `InvoiceCreate` / `InvoiceUpdate` para persistir associação ficheiro ↔ fatura.
- **FaturasPage.jsx**: dropzone amarelo estilo "Sparkles" no topo do diálogo "Nova Fatura" (mesmo padrão UX de DespesasPage). Upload → loader "A ler fatura com IA..." → campos preenchidos automaticamente → utilizador confirma e guarda. Botão "olho" na lista para abrir ficheiro original.
- **Validado E2E**: curl end-to-end testou extracção (200 OK, 12 campos), file download (200, tamanho correcto), criação de fatura com `invoice_file` persistido, delete. Screenshot do diálogo confirma UI.

### Feb 18, 2026 (v8) — Stock + Faturas + Lembretes WhatsApp
- **Stock em Materiais**: campos `stock_current`, `stock_min`, `unit`. Endpoint `/api/stock/movement` regista entradas/saídas com validação (rejeita saída se stock insuficiente). Histórico completo em `/api/stock/movements`. Alerta de stock baixo em `/api/stock/low`.
- **Badge de stock em Orçamentos**: ao escolher item com nome igual a material, aparece badge verde (OK) / amarelo (baixo) / vermelho (insuficiente para quantidade do orçamento).
- **Módulo Faturas/Cobrança** (`/app/backend/invoices.py`): CRUD faturas com auto-numeração (FT YYYY/NNNN), status automático (pendente/parcial/vencida/vencida_parcial/paga) baseado em due_date + pagamentos, dias em atraso calculados, pagamentos parciais, summary agregado (emitido, recebido, em aberto, vencido).
- **Lembretes WhatsApp grátis**: botão verde MessageCircle em cada fatura em aberto → abre wa.me com mensagem pré-feita personalizada (número fatura, valor, dias atraso) → regista lembrete no backend.
- **Sidebar**: "Despesas" e "Faturas" entre Agenda e Salários.
- **Testado**: 147/147 (36 novos testes de stock+faturas).

### Feb 18, 2026 (v7) — Módulo Despesas / Mini-ERP com IA
- **Novo módulo Custos** (`/app/backend/expenses.py`): CRUD de despesas, classificação por 13 categorias PT, tipo (fixo/variável/obra), associação a obra (centro de custo), cálculo automático IVA (6/13/23%).
- **Upload de Faturas com IA** (Gemini 2.5 Pro): aceita PDF/JPG/PNG/WEBP. Extrai automaticamente: fornecedor, NIF, nº fatura, data, valor líquido/IVA/total, categoria. Zero digitação manual quando a IA acerta.
- **Dashboard Custos**: KPIs (total ano, mês atual, IVA pago, total despesas), gráfico de barras 12 meses, top 5 categorias, filtros (mês/ano/categoria/tipo).
- **Sidebar**: novo item "Despesas" 💰.
- **BUG FIX**: Sidebar tinha paths com acentos (`/orçamentos`, `/negociação`) causando navegação → fallback Dashboard. Corrigido (paths sem acentos, labels com acentos).
- **BUG FIX**: Cookies bloqueados em iframes (Safari/Chrome ITP). Implementado Bearer token + localStorage + refresh automático.
- **Testado**: 111/111 (32 novos testes de despesas).

### Feb 18, 2026 (v6) — Assinatura Digital do Cliente
- **Feature**: Cliente assina a proposta digitalmente via link público (sem login).
  - Botão "Enviar para assinatura" em cada cartão → gera token único → mostra URL + botões "Copiar" e "Enviar WhatsApp" com mensagem pré-feita.
  - Página pública `/p/:token` (sem auth) com design light/mobile-friendly: cabeçalho Obelisco, título da proposta, cliente, valor final, descrição, items expansíveis, formulário com nome+email+canvas de assinatura touch/mouse, confirmação.
  - Backend: `POST /api/proposals/{id}/sign-link` (auth), `GET /api/public/proposal/{token}` (sem auth), `POST /api/public/proposal/{token}/sign` (sem auth, regista signature_data base64, signed_by_name, signed_by_email, signed_at, signed_by_ip, status=aceite).
  - Proposta assinada rejeita re-assinatura (400).
  - Card interno mostra badge verde "Assinada" + nome/data.
  - **PDF atualizado**: se assinada, adiciona bloco amarelo "PROPOSTA ACEITE E ASSINADA PELO CLIENTE" com nome, data, email, IP e imagem da assinatura.
- **Testado**: 79/79 (15 novos testes de assinatura).

### Feb 18, 2026 (v5) — PDF polido para cliente
- **Tiers ocultos ao cliente**: PDF da proposta NÃO mostra mais "Básico/Profissional/Premium" em lado nenhum. Título do PDF é agora o nome do orçamento original. Descrição é neutra e uniforme para os 3 tiers. Badge de tier mantém-se na UI interna da empresa.
- **Ortografia PT completa**: todos os textos visíveis (PDF + sidebar + H1 + mensagens de erro backend) corrigidos com acentos corretos (Orçamentos, Negociação, Funcionários, Salários, Mão de Obra, Descrição, Condições, Métodos, Transferência, Cartão, Débito, Crédito, Manutenção, Execução, Instalação, Férias, Salário, Ilíquido, Líquido, IVA não incluído, Garantia, válida, início, etc.).
- **Logo suavizado no PDF**: adicionada vignette dark radial em 6 camadas com opacidade progressiva em torno do logo para disfarçar bordas visíveis contra o fundo preto. Sidebar recebe `mixBlendMode: screen` + drop-shadow amarelo para branding.
- **Migration DB**: 18 propostas antigas atualizadas para novo título (sem tier) e descrição uniforme.

### Feb 18, 2026 (v4) — Módulo Salarial Fase 1
- **Novo módulo Salarios** (backend: `/app/backend/payroll.py`, 11 endpoints sob `/api/payroll`):
  - **Funcionarios**: ficha completa (nome, NIF, NISS, IBAN, cargo, categoria, contrato, salário base, €/hora, sub.alimentação, horas semanais, extras: duodécimos/comissões/adiantamentos/descontos fixos, estado ativo)
  - **Assiduidade**: registo diário por data + funcionário (tipos: normal, sábado, domingo, feriado, meio_dia, férias, falta justif., falta injust., baixa, formação, folga), com horas normais/extra/noturnas, obra associada. Calendário mensal visual.
  - **Processamento Salarial**: cria run mensal → puxa assiduidade → calcula automaticamente salário base, horas extra (125%/137.5%/150%/200%), sub.alimentação, desc. SS 11%, desc. IRS progressivo, SS patronal 23.75%, custo total empresa. "Fechar mês" congela, "Reabrir" liberta edição.
  - **Configurações Salariais**: todas as tabelas legais editáveis (SS%, IRS por escalões, SA/dia, multiplicadores OT, horários padrão).
- **Sidebar**: nova secção "Salarios" com 4 links (Funcionarios, Assiduidade, Processamento, Config. Salariais).
- **Defaults PT 2026**: SS 11%/23.75%, SA 6€/dia (cartão), OT 125/137.5/150/200, IRS em 7 escalões.
- **Testado**: 64/64 (19 novos payroll tests). Caso real: 1200€ base + 22 dias → 1140€ líquido / 1617€ custo empresa.

### Feb 18, 2026 (v3)
- **Feature**: Todas as propostas (Básico/Profissional/Premium) agora têm **garantia de 2 anos** uniforme (antes eram 1/2/5 anos).
- **Feature**: "IVA NÃO incluído (a acrescer a taxa legal em vigor)" aparece obrigatoriamente no PDF em duas localizações: (a) descrição do tier da proposta, (b) condições gerais forçadas (mesmo que o utilizador remova das settings, o PDF injeta-as).
- **Migration**: 18 propostas antigas atualizadas em DB para refletir nova descrição.

### Feb 18, 2026 (v2)
- **Feature**: Budget-level discount system (both per-item AND global). Each item has its own `discount_type` (percentage/value) and `discount_value`. Global discount applies on top of subtotal. Discount does NOT appear as separate line in PDF - silently reduces final total (user choice).
- **Feature**: Per-budget payment methods, conditions and observation notes (replaces global-only settings). Payment methods = multi-select chips; conditions = preset options + custom text; notes = free-form textarea. Validation enforces required payment fields before save. Proposals inherit budget's payment config, PDF uses per-proposal data (fallback to global settings).
- **Testing**: 45/45 backend + frontend tests passed.

### Feb 18, 2026
- **P0 FIX**: Excel import (`/api/budgets/import-excel`) now works with header-less Excel files (user's "Mapa Quantidades IEE+ITED+CCTV"). Rewrote auto-detection to use per-column statistics: detects unit column by matching values against known unit tokens (un/mt/ml/vg/m/m²/h/kg/etc), picks name as non-numeric column with longest avg text length (excluding unit col), picks quantity as first numeric column after anchor. Items now include `unit` field. 164 items correctly parsed with full descriptions, units, and quantities.
- **P1 FIX**: `searchAllPrices` crash (`insertBefore` DOM error) resolved with batched state update (collect all prices first, then single setItems call).
- **Regression**: Full end-to-end test passed (34/34 backend + frontend flows).

### Apr 17, 2026
- Full backend API (21+ endpoints)
- 13+ frontend pages
- Phase 1, 2, 3 Professional Engine complete
- Auth system with admin seeding
- PDF generation with jsPDF (PVP only, QR code, custom logo)

## Prioritized Backlog

### P0 (Critical) - Done

### P1 (Important)
- **Módulo Salarial Fase 2**: descontos manuais avançados, adiantamentos com saldo, **recibos PDF** por funcionário, envio email/WhatsApp, relatórios por funcionário
- **Módulo Salarial Fase 3**: custo por obra (centro de custo), integração com Agenda, aprovação hierárquica, exportação Excel para contabilista, alertas (funcionário sem IBAN, excesso OT, etc)
- Email integration (SendGrid/Resend) for sending proposals
- WhatsApp via Twilio for sending proposals
- Dashboard charts (Recharts)

### P2 (Nice to have)
- Client database/CRM linked to budgets/works
- Photo upload for works (before/after)
- Financial reports export
- Notifications for appointments

### Refactoring
- `/app/backend/server.py` >2000 lines — split into `routes/`, `models/`, `services/`
- Add `/app/backend/tests` with pytest for regression

## Next Tasks
1. Email integration for proposal sending (user said "I'll send manually" for now)
2. Google Maps travel cost integration
3. Dashboard charts with Recharts
4. Refactor server.py into modules
