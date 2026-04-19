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
