# FinanceEcom Free

Plataforma SaaS gratuita de **inteligência financeira para vendedores de marketplaces**
(Mercado Livre, Shopee, Amazon, Magalu, Shein, TikTok Shop, loja virtual, WhatsApp, Instagram).

> **Fase atual (MVP):** captação de leads + painel de clientes.
> O produto financeiro completo (DRE, Fluxo de Caixa, Projeção, Metas, IA) está no
> [roadmap](docs/07-roadmap.md), documentado para evolução.

---

## O que este MVP faz

1. **Landing de cadastro** (`/`) — coleta **nome, e-mail e WhatsApp** com consentimento LGPD.
2. **Painel administrativo** (`/admin.html`) — mostra **quantos clientes você tem**,
   novos nos últimos 7 dias, a lista completa e exportação em CSV.
3. **Política de Privacidade** (`/privacidade.html`) — conformidade com a LGPD.

## Stack

| Camada    | Tecnologia                                  |
|-----------|---------------------------------------------|
| Frontend  | HTML5, CSS3, JavaScript (sem framework)     |
| Backend   | Node.js + Express                           |
| Banco     | Supabase (PostgreSQL)                        |
| Deploy    | Vercel / Render / Railway (qualquer Node)   |

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar ambiente
cp .env.example .env
# edite o .env com SUPABASE_URL, SUPABASE_SERVICE_KEY e ADMIN_TOKEN

# 3. Criar a tabela no Supabase
# cole o conteúdo de supabase/schema.sql no SQL Editor do Supabase

# 4. Iniciar
npm start
# abra http://localhost:3000        (cadastro)
# abra http://localhost:3000/admin.html   (painel — use o ADMIN_TOKEN)
```

> **Sem Supabase configurado?** O servidor roda em *modo memória* (dados não persistem),
> útil para testar a interface rapidamente.

## Estrutura

```
financeecom-free/
├── server/index.js          # API Express
├── public/                  # Frontend estático
│   ├── index.html           # Landing / cadastro
│   ├── admin.html           # Painel de clientes
│   ├── privacidade.html     # Política LGPD
│   ├── css/style.css
│   └── js/{signup,admin}.js
├── supabase/schema.sql      # Estrutura do banco
├── docs/                    # Documentação de produto e engenharia
└── .env.example
```

## Documentação (para compartilhar com o Codex)

Toda a especificação está em [`docs/`](docs/):

- [00 — Visão Geral](docs/00-visao-geral.md)
- [01 — Arquitetura](docs/01-arquitetura.md)
- [02 — Banco de Dados](docs/02-banco-de-dados.md)
- [03 — API Interna](docs/03-api.md)
- [04 — Telas / UX](docs/04-telas-ux.md)
- [05 — LGPD e Privacidade](docs/05-lgpd.md)
- [06 — Setup e Deploy](docs/06-setup-deploy.md)
- [07 — Roadmap](docs/07-roadmap.md)
- [08 — Deploy (Render + Cloudflare)](docs/08-deploy-render-cloudflare.md)

## Licença

MIT
