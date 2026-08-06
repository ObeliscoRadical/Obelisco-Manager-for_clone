# Obelisco Manager - CHANGELOG

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

---

(Ver PRD.md para changelog anterior completo)
