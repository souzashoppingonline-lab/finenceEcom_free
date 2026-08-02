# 08 — Deploy no Render + DNS no Cloudflare

Guia end-to-end para publicar o FinanceEcom Free em produção com domínio próprio.

## Parte A — Supabase (banco)
1. **SQL Editor → New query**: cole e rode o conteúdo de [`supabase/schema.sql`](../supabase/schema.sql).
2. **Project Settings → API**, anote:
   - `Project URL` → será a variável `SUPABASE_URL`.
   - `service_role` key (Reveal) → será a variável `SUPABASE_SERVICE_KEY` (**secreta**).

## Parte B — Render (hospedagem)
1. Crie conta em [render.com](https://render.com) e conecte o GitHub.
2. **New → Blueprint** e selecione o repositório `finenceEcom_free`.
   O Render lê o [`render.yaml`](../render.yaml) automaticamente.
3. Preencha as variáveis de ambiente:
   | Variável | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://mremizvqbqzfcukfbbqo.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | *(a service_role secreta)* |
   | `ADMIN_TOKEN` | gerado pelo Render (ou defina um) — guarde-o, é a senha do painel |
4. **Create** e aguarde o build. O Render entrega uma URL tipo
   `https://financeecom-free.onrender.com`. Teste o cadastro e o `/admin.html`.

## Parte C — Domínio no Cloudflare (DNS)
1. No Render, abra o serviço → **Settings → Custom Domains → Add Custom Domain**
   e informe seu domínio (ex.: `financeecom.com.br` e/ou `app.financeecom.com.br`).
   O Render mostra o alvo do CNAME (ex.: `financeecom-free.onrender.com`).
2. No **Cloudflare → DNS → Records**, crie:

   | Tipo  | Nome (subdomínio) | Destino                          | Proxy |
   |-------|-------------------|----------------------------------|-------|
   | CNAME | `app`             | `financeecom-free.onrender.com`  | DNS only (nuvem cinza) no início |
   | CNAME | `www`             | `financeecom-free.onrender.com`  | DNS only |

   > **Dica:** comece com **"DNS only"** (nuvem cinza) para o Render conseguir emitir o
   > certificado SSL. Depois de validado, você pode ligar o proxy (nuvem laranja) para
   > usar o CDN do Cloudflare.
   >
   > Para o **domínio raiz** (`financeecom.com.br` sem subdomínio), use o recurso
   > **CNAME flattening** do Cloudflare (ele permite CNAME na raiz) apontando para o alvo do Render.
3. No Cloudflare, em **SSL/TLS**, use o modo **Full** (não "Flexible") para evitar loop de redirecionamento.
4. Aguarde a propagação (minutos). O Render valida e emite o HTTPS.

## Checklist final
- [ ] Tabela `leads` criada no Supabase
- [ ] Serviço no Render buildado e verde (healthcheck `/health`)
- [ ] Variáveis de ambiente preenchidas
- [ ] CNAME no Cloudflare apontando para o Render
- [ ] SSL/TLS em **Full**
- [ ] Cadastro e painel testados no domínio final
