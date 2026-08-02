# 10 — HANDOFF (estado completo do projeto)

> Documento de continuidade. Leia isto primeiro para retomar o desenvolvimento.
> Última atualização: 02/08/2026.

---

## 1. Visão rápida

**FinanceEcom Free** — SaaS gratuito de inteligência financeira para vendedores de
marketplaces (Mercado Livre, Shopee, Amazon). Duas frentes:

1. **Marketing/Captação** — landing (`/`) que capta leads (nome, e-mail, WhatsApp) +
   painel do dono (`/admin.html`) para monitorar leads, visitas, conversão.
2. **Produto SaaS** — contas de vendedor (Supabase Auth) + módulo **Vendas & Custos**
   (`/vendas.html`).

**Repositório:** `souzashoppingonline-lab/finenceEcom_free`
**Branch de trabalho/deploy:** `claude/financeecom-free-design-nf1bd2`
**Branch principal:** `main`

---

## 2. Stack e infraestrutura

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JS puro (sem framework). Auth usa `@supabase/supabase-js` via CDN |
| Backend | Node.js + Express (ESM) — `server/index.js` |
| Banco | Supabase (PostgreSQL) — projeto ref `mremizvqbqzfcukfbbqo` |
| Auth | Supabase Auth (e-mail+senha, OTP por código, MFA/TOTP) |
| E-mail (auth) | Resend via SMTP customizado no Supabase |
| E-mail (notificação de lead) | Nodemailer + SMTP (Gmail) no backend |
| Hospedagem | Render (Web Service, plano free) |
| DNS/SSL | Cloudflare (nameservers na Hostinger apontando p/ Cloudflare) |
| Domínio | `financeecom.com.br` (Hostinger) → app em `app.financeecom.com.br` |

**URLs:**
- Produção: `https://app.financeecom.com.br`
- Render direto: `https://finenceecom-free.onrender.com`
- Supabase: `https://mremizvqbqzfcukfbbqo.supabase.co`

> ⚠️ Plano free do Render hiberna após ~15 min de inatividade (primeira requisição
> demora ~50s). Não perde dados (banco é o Supabase).

---

## 3. Variáveis de ambiente (Render → Environment)

| Variável | Uso | Obrigatória |
|---|---|---|
| `SUPABASE_URL` | `https://mremizvqbqzfcukfbbqo.supabase.co` | sim (persistência) |
| `SUPABASE_SERVICE_KEY` | Secret key do Supabase (`sb_secret_...`) — backend ignora RLS | sim |
| `ADMIN_TOKEN` | Senha do painel `/admin.html` e API do `/vendas` (single-tenant atual) | sim |
| `SMTP_USER` | Gmail p/ notificação de novo lead | opcional |
| `SMTP_PASS` | Senha de app do Gmail (16 díg.) | opcional |
| `NOTIFY_EMAIL` | Destino do aviso de novo lead | opcional |
| `PORT` | Injetada pelo Render | — |

Sem `SUPABASE_*` o backend roda em **modo memória** (dados não persistem) — útil só p/ dev.
Sem `SMTP_*` as notificações de lead são desativadas silenciosamente.

`.env.example` na raiz lista todas.

---

## 4. Banco de dados — tabelas e scripts

Scripts em `supabase/`. Rodar no **SQL Editor** do Supabase (idempotentes).

| Script | Tabelas | Status |
|---|---|---|
| `schema.sql` | `leads`, `page_visits`, `settings`, `leads_por_marketplace` (view) | ✅ rodado |
| `schema_vendas.sql` | `stores`, `sales`, `goals` | ⚠️ **CONFERIR se foi rodado** |

**leads** — id, name, email(unique), whatsapp, marketplace, consent, created_at
**page_visits** — id, created_at (1 linha por visita na landing)
**settings** — key(pk), value (ex.: `support_whatsapp`)
**stores** — id, name, color, created_at
**sales** — id, date, store_id(fk), qty, revenue, fee_mp, freight, cmv, ads_ml, ads_ext, tax, created_at · UNIQUE(date, store_id)
**goals** — id, month('YYYY-MM'), store_id(null=geral), amount · unique(month, coalesce(store_id))

RLS está **habilitado** em todas, **sem policies públicas**. O backend acessa via
**service role** (bypassa RLS). Auth (tabela `auth.users`) é gerenciada pelo Supabase.

> Para multi-tenant (Fase 2.1) será preciso adicionar `user_id` em stores/sales/goals
> e criar policies RLS por usuário. Ver seção 8.

---

## 5. API do backend (`server/index.js`)

Todas as rotas `/api/*` de gestão exigem header `x-admin-token: <ADMIN_TOKEN>`,
exceto as públicas marcadas.

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/api/leads` | pública | cadastro de lead (landing) |
| POST | `/api/visit` | pública | registra visita na landing |
| GET | `/api/public-settings` | pública | retorna `support_whatsapp` p/ botão |
| GET | `/api/stats` | sim | total, last7days, visits, conversion |
| GET | `/api/leads` | sim | lista de leads |
| POST | `/api/admin/leads` | sim | cria lead manualmente |
| DELETE | `/api/leads/:id` | sim | exclui lead (LGPD) |
| GET/PUT | `/api/settings` | sim | lê/salva support_whatsapp |
| GET/POST | `/api/stores` | sim | lojas |
| PUT/DELETE | `/api/stores/:id` | sim | atualiza cor/nome / exclui loja |
| GET/POST | `/api/sales` | sim | vendas (GET filtra `?month=YYYY-MM&store=`) |
| PUT/DELETE | `/api/sales/:id` | sim | edita / exclui venda |
| GET/PUT | `/api/goals` | sim | metas (`?month=`) |
| GET | `/health` | pública | healthcheck |

Fórmula da margem (usada no front e implícita no back):
`margem = revenue - fee_mp - freight - cmv - ads_ml - ads_ext - tax`
`margem% = margem / revenue * 100`

---

## 6. Páginas (frontend em `public/`)

| Arquivo | Rota | Descrição | Auth |
|---|---|---|---|
| `index.html` | `/` | Landing de marketing + captação de lead | — |
| `privacidade.html` | `/privacidade.html` | Política de Privacidade (LGPD) | — |
| `termos.html` | `/termos.html` | Termos de Uso | — |
| `admin.html` | `/admin.html` | Painel do dono (leads, visitas, gráfico, suporte WhatsApp) | ADMIN_TOKEN |
| `vendas.html` | `/vendas.html` | Módulo Vendas & Custos | ADMIN_TOKEN (por ora) |
| `criar-conta.html` | `/criar-conta.html` | Cadastro SaaS (dados→código→senha) | Supabase Auth |
| `entrar.html` | `/entrar.html` | Login | Supabase Auth |
| `recuperar.html` | `/recuperar.html` | Recuperação de senha por código | Supabase Auth |
| `app.html` | `/app.html` | Área logada + MFA | Supabase Auth (protegida) |

JS: `js/signup.js` (landing+visita+botão WhatsApp), `js/admin.js` (painel),
`js/vendas.js` (módulo vendas), `js/auth-common.js` (config Supabase + senha),
`js/criar-conta.js`. CSS único: `css/style.css`.

> ⚠️ **Dois sistemas de "login" coexistem hoje:** o painel do dono (`ADMIN_TOKEN`) e as
> contas de vendedor (Supabase Auth). O módulo `/vendas` ainda usa `ADMIN_TOKEN` —
> unificar isso é a Fase 2.1.

---

## 7. Configuração de Auth + Resend (manual, no painel)

Detalhes em `docs/09-auth-resend.md`. Resumo do que precisa estar feito no Supabase:

1. **SMTP custom** com Resend (host `smtp.resend.com`, port 465, user `resend`,
   pass = API key Resend, sender de domínio verificado).
2. **Email Template** (Magic Link) contendo `Seu código: {{ .Token }}` — **crítico**.
3. **Site URL** = `https://app.financeecom.com.br`.
4. **Confirm email** habilitado; política de senha min 10.
5. Domínio `financeecom.com.br` **verificado no Resend** (DKIM/SPF no Cloudflare).

Frontend usa a **publishable key** em `js/auth-common.js` (pública). Fallback: anon key legada.

---

## 8. Status: FEITO vs PENDENTE

### ✅ Feito
- Landing de marketing + captação de leads (LGPD)
- Painel do dono: total clientes, novos 7d, visitas, conversão, gráfico por dia,
  criar/excluir/buscar lead, exportar CSV, WhatsApp de suporte configurável
- Botão flutuante de WhatsApp na landing
- Notificação por e-mail de novo lead (SMTP Gmail, se configurado)
- Módulo Vendas & Custos: lojas (CRUD+cor), lançamentos com todos os custos,
  preview de margem ao vivo, meta mensal + dashboard KPIs, meta diária, totais,
  relatórios por loja, comparativo mesmo-dia, export CSV, validação de duplicata
- Autenticação SaaS (Supabase Auth): criar conta (código), login, recuperação, MFA
- Deploy Render + domínio Cloudflare + SSL

### ⚠️ Pendente / próximos passos
1. **Config manual do Supabase/Resend** (seção 7) — sem isso o código do e-mail não chega.
2. **Rodar `schema_vendas.sql`** no Supabase se ainda não foi.
3. **Fase 2.1 — Multi-tenant** (isolar dados por usuário):
   - Adicionar `user_id uuid references auth.users` em `stores`, `sales`, `goals`.
   - Criar policies RLS: `user_id = auth.uid()`.
   - Migrar o `/vendas` para autenticar com o **JWT do Supabase** (não mais ADMIN_TOKEN):
     ou (a) chamadas diretas client→Supabase com anon key + RLS, ou
     (b) backend valida o JWT (`Authorization: Bearer`) e injeta `user_id`.
   - Proteger `/vendas.html` com `requireSession()` (como `app.html`).
4. **Exportações avançadas** do módulo vendas: XLSX (2 abas) e PDF (hoje só CSV).
5. **Gráficos ricos** do módulo vendas: comparativo por empresa (barras), donut de
   composição de custos, AG Grid (spec original) — hoje há cards + barras simples.
6. **Metas por loja** (StoreGoalCard) e **WeekdayComparison** completos — spec em
   `docs/07-roadmap.md`/mensagem original; parcialmente cobertos.
7. Comparativos "vs semana anterior / vs mês anterior" com toggle nos MonthlyTotals.
8. Verificar entrega do e-mail de notificação de lead (ficou pendente de teste).

---

## 9. Como rodar localmente

```bash
npm install
cp .env.example .env   # preencher (ou deixar sem SUPABASE_* p/ modo memoria)
npm start              # http://localhost:3000
```

Deploy é automático: **push na branch `claude/financeecom-free-design-nf1bd2`** dispara
build no Render (Auto-Deploy On Commit).

---

## 10. Convenções e observações

- Segredos (service key, ADMIN_TOKEN, SMTP_PASS, Resend key) **nunca** vão ao repo —
  só em variáveis de ambiente (Render) ou no painel (Supabase). `.env` está no `.gitignore`.
- Commits em português, com co-autoria. PRs só quando solicitado.
- O backend tem **fallback em memória** para todas as entidades — facilita testar sem banco.
- Datas no módulo vendas usam data local (`YYYY-MM-DD`); D-1 = ontem.
- Classificação de margem (%): <0 Prejuízo, <5 Muito Baixo, <10 Preocupante,
  <15 Aceitável, <20 Bom, <30 Ótimo, ≥30 Excelente.
