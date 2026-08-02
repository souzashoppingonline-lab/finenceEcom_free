-- =====================================================================
-- FinanceEcom Free - Schema do banco (Supabase / PostgreSQL)
-- Fase 1 (MVP): captacao de leads + painel de clientes
-- =====================================================================

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null unique,
  whatsapp    text not null,
  marketplace text,
  consent     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Indices para o painel
create index if not exists idx_leads_created_at on public.leads (created_at desc);
create index if not exists idx_leads_marketplace on public.leads (marketplace);

-- =====================================================================
-- Row Level Security
-- O acesso e feito EXCLUSIVAMENTE pelo backend usando a Service Role Key,
-- que ignora RLS. Mantemos RLS ativado e sem policies publicas para
-- impedir leitura/escrita direta via anon key.
-- =====================================================================
alter table public.leads enable row level security;

-- (Nenhuma policy publica: apenas a service_role acessa.)

-- =====================================================================
-- View de metricas (opcional) - resumo por marketplace
-- =====================================================================
create or replace view public.leads_por_marketplace as
select
  coalesce(marketplace, 'Nao informado') as marketplace,
  count(*) as total
from public.leads
group by 1
order by 2 desc;
