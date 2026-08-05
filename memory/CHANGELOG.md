# Obelisco Manager - CHANGELOG

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
