# 02 — Banco de Dados

Banco: **PostgreSQL (Supabase)**. Script completo em [`supabase/schema.sql`](../supabase/schema.sql).

## Tabela `leads`

| Coluna       | Tipo        | Regras                                  |
|--------------|-------------|-----------------------------------------|
| id           | uuid        | PK, default `gen_random_uuid()`         |
| name         | text        | NOT NULL                                |
| email        | text        | NOT NULL, **UNIQUE**                     |
| whatsapp     | text        | NOT NULL (somente dígitos)              |
| marketplace  | text        | opcional                                |
| consent      | boolean     | NOT NULL, default false                 |
| created_at   | timestamptz | NOT NULL, default `now()`               |

## Índices
- `idx_leads_created_at` — ordena por data (usado no painel).
- `idx_leads_marketplace` — agregação por marketplace.

## RLS (Row Level Security)
Ativado, **sem policies públicas**. Apenas a `service_role` (backend) acessa a tabela.
Isso impede leitura/escrita direta pela `anon key`.

## View auxiliar
`leads_por_marketplace` — total de leads agrupado por marketplace (para relatórios futuros).

## Evolução (Fase 2+)
Tabelas previstas no roadmap: `users`, `sales`, `expenses`, `bills` (boletos),
`cashflow`, `goals`, `projections`. Ver [07-roadmap](07-roadmap.md).
