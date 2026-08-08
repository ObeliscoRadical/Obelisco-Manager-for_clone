# Auth / Session Testing Notes

## Scope desta ronda
- tokens frontend migrados de `localStorage` para `sessionStorage` + memória
- cookies httpOnly continuam prioritários para admin
- tech portal continua a usar token fallback no frontend, agora apenas por sessão

## Verificações essenciais
1. Login admin em `/login` deve continuar funcional
2. Reload da app no mesmo separador deve manter sessão admin por cookies
3. Login técnico deve continuar funcional
4. Reload do portal técnico no mesmo separador deve manter sessão via `sessionStorage`
5. Fechar separador/nova sessão deve limpar fallback frontend
6. Logout deve limpar fallback frontend (`sessionStorage`) e cookies admin

## Endpoints relevantes
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `POST /api/tech/auth/login`
- `GET /api/tech/auth/me`