# 03 — API Interna

Base URL: `http://localhost:3000` (ou domínio de produção).
Implementação em [`server/index.js`](../server/index.js).

## `POST /api/leads` — cadastro público
Cria um lead. **Público** (sem autenticação).

**Body (JSON):**
```json
{
  "name": "Maria Souza",
  "email": "maria@email.com",
  "whatsapp": "(11) 90000-0000",
  "marketplace": "Shopee",
  "consent": true
}
```

**Regras:** `name`, `email`, `whatsapp` obrigatórios; `email` válido e único;
`consent` deve ser `true` (LGPD).

**Respostas:**
- `201` `{ "ok": true, "message": "Cadastro realizado com sucesso!" }`
- `400` dados inválidos / consentimento ausente
- `409` e-mail já cadastrado
- `500` erro interno

---

## `GET /api/stats` — métricas (protegido)
Header: `x-admin-token: <ADMIN_TOKEN>`

**200:**
```json
{ "total": 128, "last7days": 12 }
```

---

## `GET /api/leads` — lista de clientes (protegido)
Header: `x-admin-token: <ADMIN_TOKEN>`. Retorna até 1000, mais recentes primeiro.

**200:**
```json
{
  "leads": [
    { "name": "...", "email": "...", "whatsapp": "...", "marketplace": "...", "created_at": "..." }
  ]
}
```

- `401` token ausente/ inválido

---

## `GET /health`
Healthcheck: `{ "ok": true }`.

## APIs futuras (roadmap)
`/api/sales`, `/api/cashflow`, `/api/goals`, `/api/reports`, `/api/projection`,
`/api/dashboard` — especificadas em [07-roadmap](07-roadmap.md).
