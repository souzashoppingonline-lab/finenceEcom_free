# 01 — Arquitetura

## Visão geral

```
[ Navegador ]
   │  HTML/CSS/JS estático (public/)
   ▼
[ Express server (server/index.js) ]
   │  API REST /api/*
   ▼
[ Supabase / PostgreSQL ]   (tabela leads)
```

## Frontend
- HTML5 + CSS3 (design system próprio em `public/css/style.css`).
- JavaScript ES2024 puro (sem framework), `fetch` para consumir a API.
- Três páginas: `index.html` (cadastro), `admin.html` (painel), `privacidade.html`.

## Backend
- **Node.js + Express** (ESM).
- Serve os arquivos estáticos e expõe a API interna.
- Usa a **Service Role Key** do Supabase **apenas no servidor** — nunca exposta ao browser.
- **Fallback em memória**: se as variáveis do Supabase não estiverem setadas, os dados
  ficam em um array em memória (somente para desenvolvimento/demo).

## Banco
- **Supabase (PostgreSQL)**. Tabela `leads` com RLS ativado e sem policies públicas —
  o acesso é feito somente pelo backend via service role.

## Segurança
- Painel protegido por `ADMIN_TOKEN` enviado no header `x-admin-token`.
- E-mail único (constraint no banco) evita duplicidade.
- Validação de entrada no backend (nome/e-mail/WhatsApp/consentimento obrigatórios).

## Decisões
- **Sem framework no front** para manter o MVP leve e fácil de evoluir.
- **Sem sistema de pagamento** — produto é gratuito.
- **Sem integração com marketplaces** — dados manuais, conforme visão do produto.
