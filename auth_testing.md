# Auth / Session Testing Playbook

## Scope desta ronda
- auth admin com cookies httpOnly (`access_token`, `refresh_token`, `active_company_id`) + fallback por sessão
- auth técnico com JWT `type=tech`
- respostas de auth incluem contexto multiempresa (`company_id`, `company_name`, `company_slug`, `available_companies`)
- seletor de empresa deve manter o isolamento por tenant após login e refresh
- Fase 2 visual: gestão de tenants, edição de empresa e atribuição de acessos multiempresa por utilizador

## Step 1: MongoDB Verification
Verificar no MongoDB:

```javascript
db.users.find({ role: "admin" }).pretty()
db.users.findOne({ role: "admin" }, { password_hash: 1, company_id: 1, company_access_ids: 1 })
db.companies.find({}, { _id: 0, id: 1, name: 1, slug: 1, is_default: 1 }).pretty()
db.system_settings.find({}, { _id: 0, company_id: 1, "company_info.name": 1 }).pretty()
```

Validar:
- `password_hash` começa por `$2b$`
- existe pelo menos uma empresa default
- `users.company_access_ids` está preenchido
- `system_settings` está isolado por `company_id`

## Step 2: API Testing

```bash
curl -c cookies.txt -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin>","password":"<password>"}'

curl -b cookies.txt "$BASE_URL/api/auth/me"
curl -b cookies.txt "$BASE_URL/api/companies/current"
curl -b cookies.txt "$BASE_URL/api/companies"

curl -b cookies.txt -X POST "$BASE_URL/api/companies" \
  -H "Content-Type: application/json" \
  -d '{"name":"Tenant Teste","email":"tenant@example.com"}'

curl -b cookies.txt -X POST "$BASE_URL/api/companies/select" \
  -H "Content-Type: application/json" \
  -d '{"company_id":"<tenant_id>"}'

curl -b cookies.txt -H "X-Company-Id: <tenant_id>" "$BASE_URL/api/auth/me"
curl -b cookies.txt -H "X-Company-Id: <tenant_id>" "$BASE_URL/api/users"
```

Validar:
1. Login admin devolve utilizador + `company_id` + `available_companies`
2. `/api/auth/me` mantém a mesma empresa activa
3. `/api/companies/current` devolve a empresa atual e contagens coerentes
4. `/api/companies` lista empresas acessíveis ao utilizador
5. `POST /api/companies/select` troca a empresa activa e define `active_company_id`
6. Utilizadores novos criados por admin ficam automaticamente no `company_id` activo
7. Registos de outra empresa não aparecem nas listagens do tenant atual
8. `PUT /api/companies/{id}` edita nome/contactos do tenant
9. `PUT /api/users/{id}` aceita `company_access_ids` + `company_id` e preserva isolamento
10. `GET /api/companies/{id}/users` devolve estado de acesso (`has_access_to_company`, `is_primary_for_company`)

## Step 3: Frontend Smoke
1. Login admin em `/login`
2. Verificar seletor na sidebar (`company-switcher-trigger`)
3. Trocar de empresa e confirmar atualização do resumo activo
4. Entrar em `/empresas`, validar cards, criar/editar tenant e abrir modal de acessos
5. Entrar em `/utilizadores`, validar checkboxes multiempresa e seletor de empresa principal
6. Entrar no portal técnico e validar que o cabeçalho mostra a empresa certa
7. Fazer logout e confirmar limpeza de sessão/cookies

## Endpoints relevantes
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `POST /api/tech/auth/login`
- `GET /api/tech/auth/me`
- `GET /api/companies`
- `GET /api/companies/current`
- `POST /api/companies`
- `PUT /api/companies/{company_id}`
- `POST /api/companies/select`
- `GET /api/companies/{company_id}/users`