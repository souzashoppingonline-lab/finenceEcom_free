# FinanceEcom Free — Guia para o assistente de IA (Gemini / Claude / outro)

Este arquivo é o **contexto de handoff**. Leia-o inteiro antes de mexer no código.
Serve para qualquer IA continuar o projeto sem se perder (o Gemini CLI lê este
`GEMINI.md` automaticamente; o Claude Code lê o `CLAUDE.md`, que aponta para cá).

---

## 1. O que é o produto
**FinanceEcom Free** — SaaS gratuito de inteligência financeira e de concorrência
para vendedores de marketplace (Mercado Livre, Shopee, Amazon…), em português-BR.
App em produção: **https://app.financeecom.com.br** (deploy automático no Render a
cada push). Dono: souzashopping.online@gmail.com.

Escada de produto: **Free** (atual) → **Pro** (tudo automático via API do ML) →
**Ultra** (mentoria/multi-conta). Só o Free está sendo construído agora.

## 2. Stack (SEM build step)
- **Backend:** Node.js + Express, **ESM**, tudo num único arquivo `server/index.js`
  (~2800 linhas). Rodar: `npm start` (ou `npm run dev` com `--watch`).
- **Frontend:** HTML/CSS/JS **puro** (sem framework, sem bundler). Cada página é
  `public/<nome>.html` + `public/js/<nome>.js`. CSS único em `public/css/style.css`.
- **Banco:** Supabase (Postgres + Auth). O backend usa a **service_role key** e
  **filtra por `user_id` na mão** (RLS ligada em todas as tabelas). Há um
  **fallback em memória** (arrays `mem*`) quando não há Supabase — útil em dev.
- **Extensão Chrome** (MV3) em `extension/` — publicada na Chrome Web Store (v1.3.2).
- E-mail: nodemailer (SMTP) com fallback para Resend API.

## 3. Como rodar local
```bash
npm install
cp .env.example .env   # preencha as variáveis (veja seção 7)
npm run dev            # http://localhost:3000 (ou PORT)
```
Sem `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, roda em memória (dados somem ao reiniciar).

## 4. Autenticação (3 sistemas)
- **`requireUser`** — JWT do Supabase (Bearer). É o usuário logado (a maioria das rotas).
  No front, use `authHeader()` (de `app-shell.js`) que devolve o header fresco.
- **`requireAdmin`** — header `x-admin-token` = `ADMIN_TOKEN`. Painel `/admin.html`.
- **`requireExtToken`** — header `x-ext-token`. A extensão usa isso; resolve o `user_id`
  pelo `ext_token` salvo em `user_ai_settings`.

## 5. Frontend — convenções
- `app-shell.js` monta a **sidebar** (ícones SVG, sem emoji), tema (5 temas via
  `data-theme`), sessão, logout e o **sino de alertas** (aparece em todas as páginas).
  Toda página logada chama `await initShell('<chave>')` no boot.
- `dre-core.js` tem o cálculo compartilhado de DRE/despesas (`expensesForMonth`,
  `dreForMonth`, `money`, `dreApi`). Páginas financeiras dependem dele.
- Modais usam a classe `.ia-modal` + `.ia-modal-box` + botão `.ia-modal-x`.
- **Deep-link:** `/analise.html?produto=ID` abre direto o detalhe do produto.
- Ao adicionar coluna nova no banco, **NÃO** faça o SELECT nomear a coluna de forma
  que quebre se ela não existir — prefira `select('*')` e trate o campo ausente
  (aprendemos isso quebrando o histórico de preço). O mesmo no INSERT: tenha fallback.

## 6. Módulos principais (páginas)
Dashboard (`app.html`), Empresas, Vendas e Custos, Metas (projeção de meta ao vivo),
Fluxo de Caixa, Projeção de Caixa, Recebimentos, Boletos e Dívidas (+ **Resumo diário
por e-mail**), Cartões, Despesas & DRE (custo fixo/dividido + categorias), DRE,
**Fechamento Mensal** (`fechamento.html`, consolida o mês → `monthly_closing`),
**Análise de Produtos** (`analise.html`, concorrentes via extensão + IA + SEO +
alertas + tamanho de mercado), **ML Tendências** (`ml-tendencias.html`, 8 abas via API
oficial do ML).

## 7. Variáveis de ambiente (Render)
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_TOKEN`, `TOKEN_ENC_KEY` (chave AES p/
criptografar tokens de IA dos clientes; cai para `ADMIN_TOKEN` se ausente),
`ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`, `SMTP_USER`/`SMTP_PASS`/
`SMTP_HOST`/`SMTP_PORT` **ou** `RESEND_API_KEY`, `NOTIFY_EMAIL`, `PUBLIC_URL`, `PORT`.
> **Segurança:** NUNCA coloque segredos (ML secret, chaves de IA, SMTP) no código ou
> no chat. Sempre via variáveis de ambiente no Render. Tokens de IA dos clientes são
> guardados criptografados (AES-256-GCM: `encryptSecret`/`decryptSecret`).

## 8. Migrações SQL pendentes (rodar no Supabase SQL Editor)
Os arquivos ficam em `supabase/*.sql`. As colunas/tabelas mais recentes:
```sql
alter table public.analise_product_ads add column if not exists parcelamento text;
alter table public.analise_product_ads add column if not exists estoque integer;
alter table public.analise_product_ads add column if not exists desconto_pct numeric(5,2);
alter table public.analise_monitor_snapshots add column if not exists vendas integer;
alter table public.user_ai_settings add column if not exists monitor_hour smallint;
-- + tabela public.monthly_closing (ver supabase/schema_closing.sql)
```

## 9. Extensão (`extension/`, MV3, v1.3.2)
- `content.js` lê a página do anúncio (cascata: DOM → meta tags → JSON-LD → estado
  da página, para sobreviver a mudanças de layout do ML). Coleta preço, ficha,
  avaliações (só qtd+distribuição), fotos, parcelamento, estoque, desconto, etc.
- `service-worker.js` — recoleta automática 1×/dia (alarme 15 min, respeita o
  horário `monitor_hour`), e ação `recollect_one` (recoleta imediata).
- `bridge.js` — roda em `app.financeecom.com.br`, faz a ponte painel↔extensão
  (botões "Recoletar agora/todos").
- Ao mudar a extensão, **suba a `version`** no `manifest.json` e publique na
  Chrome Web Store. O `.zip` NÃO é versionado (está no `.gitignore`).

## 10. Regras de trabalho (git)
- Branch de desenvolvimento: **`claude/financeecom-free-design-nf1bd2`**.
- Commit pequeno e descritivo. Rode `node --check server/index.js` e valide os JS do
  front antes de commitar. Faça push com retry.
- **NUNCA** commite identificadores de modelo de IA (nomes internos) em código, commit
  ou PR. Mantenha isso só no chat.

## 11. Estado atual / próximos passos possíveis
No ar e funcionando: todos os módulos acima, extensão v1.3.2 pública, sino de alertas,
resumo diário por e-mail, Health Score, projeção de meta.
Ideias abertas: IA considerar parcelamento/estoque/desconto no veredito; trava do
último dia / e-mail seguro no Fechamento; renomear categorias; curva ABC de produtos;
"O que fazer hoje" no Dashboard; alertas de boleto abrindo o item específico.
