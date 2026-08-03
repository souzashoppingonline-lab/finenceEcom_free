# 10 — HANDOFF (estado completo do projeto)

> Documento de continuidade. Leia isto primeiro para retomar o desenvolvimento.
> Última atualização: 03/08/2026.

---

## 1. Visão rápida

**FinanceEcom Free** — SaaS gratuito de inteligência financeira para vendedores de
marketplaces. Duas frentes:

1. **Marketing/Captação** — landing (`/`) capta leads + painel do dono (`/admin.html`).
2. **Produto SaaS** — contas de vendedor (Supabase Auth), multi-tenant (dados por `user_id`).

**Repositório:** `souzashoppingonline-lab/finenceEcom_free`
**Branch de deploy:** `claude/financeecom-free-design-nf1bd2` (Auto-Deploy no Render)
**URLs:** produção `https://app.financeecom.com.br` · Render `https://finenceecom-free.onrender.com`
· Supabase ref `mremizvqbqzfcukfbbqo`

## 2. Stack
Frontend HTML/CSS/JS puro (auth via `@supabase/supabase-js` por CDN) · Backend Node/Express
(`server/index.js`, ESM) · Banco Supabase/PostgreSQL · Auth Supabase (OTP e-mail + MFA) ·
E-mail auth via Resend (SMTP no Supabase) · E-mail de lead via Gmail SMTP (nodemailer) ·
Deploy Render (free) · DNS/SSL Cloudflare.

## 3. Variáveis de ambiente (Render)
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (secret), `ADMIN_TOKEN` (painel dono),
`SMTP_USER`/`SMTP_PASS`/`NOTIFY_EMAIL` (aviso de lead, opcional). Sem `SUPABASE_*` = modo memória.

## 4. Autenticação (dois mundos)
- **Dono do negócio:** `/admin.html` protegido por `ADMIN_TOKEN` (header `x-admin-token`).
- **Vendedores (SaaS):** Supabase Auth. Frontend usa a **publishable key** em
  `js/auth-common.js`. As chamadas às APIs do produto enviam `Authorization: Bearer <JWT>`;
  o backend valida via `supabase.auth.getUser(token)` no middleware `requireUser` e escopa
  tudo por `user_id`. Config do painel Supabase (SMTP Resend + templates com `{{ .Token }}`)
  em `docs/09-auth-resend.md`.

## 5. Banco de dados — TODAS as tabelas e scripts (rodar no SQL Editor)

| Script | Tabelas / mudanças |
|---|---|
| `schema.sql` | `leads`, `page_visits`, `settings`, view `leads_por_marketplace` |
| `schema_vendas.sql` | `stores`, `sales`, `goals` |
| `schema_vendas_multitenant.sql` | add `user_id` em stores/sales/goals + índices |
| `schema_imports.sql` | `imports` (histórico Mercado Turbo) |
| `schema_financeiro.sql` | `boletos`, `cash_flow_entries` (Fluxo de Caixa) |
| `schema_lists.sql` | `lists` (fornecedores/categorias) |
| `schema_empresas.sql` | add `cnpj`,`address`,`marketplace` em stores; add `marketplace` em boletos |
| `schema_cartao.sql` | `cartoes`, `parcelas_cartao`, `fatura_pagamentos` |
| **`00_run_all.sql`** | **script único consolidado (roda tudo)** — não inclui cartão ainda; rode `schema_cartao.sql` também |

Colunas extras já adicionadas via ALTER embutidos: `boletos.kind`, `boletos.bank`.
**RLS habilitado em tudo, sem policies públicas** — acesso só pelo backend (service role),
que filtra por `user_id`. Auth em `auth.users` (Supabase).

### Modelo de dados chave
- **stores (empresas):** id, user_id, name, color, **cnpj**, address, **marketplace**
  (lista separada por vírgula — 1 empresa vende em vários marketplaces).
- **sales:** lançamento diário por (date, store_id) único. Campos: qty, revenue, fee_mp,
  freight, cmv, ads_ml, ads_ext(0, descontinuado), tax. Margem = revenue − fee_mp − freight
  − cmv − ads_ml − tax.
- **goals:** meta por (user_id, month, store_id|null=geral).
- **boletos:** dívidas E recebíveis. direction 'pagar'|'receber', status 'pendente'|'pago',
  kind (boleto/cartao/imposto/pessoal/fatura_ml/flex/custo_fixo/custo_variavel/recebivel),
  name, supplier, value, due_date, category, empresa (texto), numero_nf, bank, **marketplace**
  (usado só em recebíveis).
- **cash_flow_entries:** type 'income'|'expense', date, value, category, reason, empresa,
  nota_fiscal, **boleto_id** (vínculo). Lançamentos manuais têm boleto_id null.
- **lists:** type 'supplier'|'category', name (por usuário).
- **imports:** histórico de importações Mercado Turbo (store_id, date, orders, revenue).

## 6. Integração Boletos ↔ Fluxo de Caixa (automática)
Função `syncBoletoToFC` no backend: ao marcar um boleto **pago** cria um
`cash_flow_entries` (expense se pagar, income se receber) com boleto_id + metadados
(empresa, NF, fornecedor→reason, categoria). Voltar a pendente remove. Excluir boleto
remove o lançamento vinculado. Lançamentos vindos de boleto não podem ser excluídos direto
no Fluxo de Caixa.

## 7. API (server/index.js)
Públicas: `POST /api/leads`, `POST /api/visit`, `GET /api/public-settings`, `GET /health`.
Dono (x-admin-token): `GET /api/stats`, `GET/POST/DELETE /api/leads`, `GET/PUT /api/settings`,
`GET /api/health-status` (app/banco/SMTP/memória/CPU/disco).
Vendedor (Bearer JWT, `requireUser`, scoped por user_id):
`/api/stores` (GET/POST/PUT/DELETE), `/api/sales` (GET?month&store/POST/PUT/DELETE),
`/api/goals` (GET/PUT), `/api/imports` (GET/POST),
`/api/cashflow` (GET?month/POST/DELETE), `/api/boletos` (GET?month&direction&status/POST/PUT/DELETE),
`/api/lists` (GET?type/POST/DELETE).

## 8. Páginas (public/)
| Rota | Descrição | Auth |
|---|---|---|
| `/` `index.html` | Landing marketing + captação | — |
| `/privacidade.html` `/termos.html` | LGPD / Termos | — |
| `/admin.html` | Painel dono: leads, visitas, gráfico, saúde do servidor, WhatsApp suporte | ADMIN_TOKEN |
| `/criar-conta.html` `/entrar.html` `/recuperar.html` | Auth (OTP/senha) | Supabase |
| `/app.html` | Dashboard: KPIs do dia, cards (a receber/a pagar/empresas), MFA | Supabase |
| `/empresas.html` | Cadastro de empresas (CNPJ obrig., endereço, marketplaces múltiplos) | Supabase |
| `/vendas.html` | 3 abas: Lançamento Manual · Mercado Turbo (CSV) · Relatórios | Supabase |
| `/fluxo.html` | Fluxo de Caixa: lançamentos, badges Boleto/Cartão, resumo empresa, previsão | Supabase |
| `/recebimentos.html` | Recebíveis por marketplace→empresa, agrupados por dia | Supabase |
| `/boletos.html` | Cadastrar Dívida (form esq. + tabela dir. com filtros) | Supabase |
| `/importar.html` | redireciona para `/vendas.html` | — |

Shell logado: `js/app-shell.js` (sidebar recolhível, tema claro/escuro, sessão, logout,
helper `authHeader()`). Lista global de marketplaces: `js/marketplaces.js`.

## 9. Regras de negócio
- Classificação de margem (%): <0 Prejuízo, <5 Muito Baixo, <10 Preocupante, <15 Aceitável,
  <20 Bom, <30 Ótimo, ≥30 Excelente.
- Meta: run rate = acumulado(D-1)/dias com dado; projeção = runRate × dias do mês;
  meta do dia = meta restante / dias restantes; status por projeção vs meta.
- Mercado Turbo: colunas mapeadas por nome (Faturamento ML→receita, Custo(-)→cmv,
  Imposto(-)→tax, Tarifa de Venda(-)→fee, Frete Vendedor(-)→frete). Ads sempre manual.
  Import agrega tudo em 1 lançamento (date+store).
- Recebíveis: escolhe marketplace → empresas atreladas → lança (guarda empresa+marketplace).
  Boletos ignoram marketplace (só CNPJ+empresa).

## 10. FEITO vs PENDENTE
### ✅ Feito
Landing+captação; painel dono (leads/visitas/gráfico/saúde servidor/WhatsApp);
Auth SaaS (OTP+senha+MFA) + Resend; multi-tenant; Dashboard; Empresas (multi-marketplace);
Vendas & Custos (manual + Mercado Turbo + relatórios); Fluxo de Caixa; Boletos & Dívidas
(sync automático com FC); Recebimentos por marketplace; listas (fornecedor/categoria);
menu recolhível + tema; deploy Render + domínio Cloudflare.

### ⚠️ Pendente
1. **Config manual Supabase** por conta do usuário: rodar todos os SQL de `supabase/`;
   SMTP Resend + templates `{{ .Token }}` (feito) — conferir.
2. **Atrelar CNPJ nos boletos** (usar a empresa/CNPJ como referência estruturada).
3. ~~Módulo de Cartão de Crédito~~ ✅ FEITO — página `/cartoes.html` (abas Compras/Faturas/
   Gerenciar). Endpoints `/api/cards`, `/api/parcelas` (+/purchase), `/api/faturas` (+/pay),
   `/api/fatura-pagamentos`. Pagar Fatura agrupa parcelas por empresa → 1 lançamento/empresa
   no FC (category 'Cartão de Crédito'). Compra parcelada distribui em faturas por dia de
   fechamento do cartão. Falta (opcional): faturas virtuais dentro da tabela de Boletos.
4. Exportações XLSX/PDF (hoje só CSV); gráficos ricos (donut, AG Grid); DRE; metas por loja
   (StoreGoalCard); comparativos semana/mês nos MonthlyTotals; WeekdayComparison.
5. Testar entrega do e-mail de notificação de lead.

## 11. Rodar local / deploy
`npm install` → `cp .env.example .env` → `npm start` (porta 3000; sem SUPABASE_* = memória).
Deploy automático ao dar **push na branch `claude/financeecom-free-design-nf1bd2`**.
Segredos nunca vão ao repo (só env do Render / painel Supabase). Commits em PT com co-autoria.
