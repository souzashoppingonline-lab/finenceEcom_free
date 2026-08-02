-- =====================================================================
-- FinanceEcom Free - Fase 2: Vendas & Custos
-- Rode este script no SQL Editor do Supabase (uma vez).
-- =====================================================================

-- Lojas cadastradas
create table if not exists public.stores (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#1d7a5f',
  created_at timestamptz not null default now()
);
alter table public.stores enable row level security;

-- Lancamentos diarios de venda
create table if not exists public.sales (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  store_id   uuid not null references public.stores(id) on delete cascade,
  qty        integer not null default 0,
  revenue    numeric(14,2) not null default 0,  -- Receita Bruta
  fee_mp     numeric(14,2) not null default 0,  -- Taxas Marketplace
  freight    numeric(14,2) not null default 0,  -- Frete Subsidiado
  cmv        numeric(14,2) not null default 0,  -- Custo Mercadoria Vendida
  ads_ml     numeric(14,2) not null default 0,  -- Ads Mercado Livre
  ads_ext    numeric(14,2) not null default 0,  -- Ads Externos
  tax        numeric(14,2) not null default 0,  -- Imposto
  created_at timestamptz not null default now(),
  unique (date, store_id)
);
create index if not exists idx_sales_date on public.sales (date);
create index if not exists idx_sales_store on public.sales (store_id);
alter table public.sales enable row level security;

-- Metas mensais: store_id NULL = meta geral do mes
create table if not exists public.goals (
  id        uuid primary key default gen_random_uuid(),
  month     text not null,               -- formato 'YYYY-MM'
  store_id  uuid references public.stores(id) on delete cascade,
  amount    numeric(14,2) not null default 0
);
create unique index if not exists idx_goals_month_store
  on public.goals (month, coalesce(store_id::text, 'GERAL'));
alter table public.goals enable row level security;
