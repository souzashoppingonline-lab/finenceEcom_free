-- =====================================================================
-- FinanceEcom Free - SCRIPT ÚNICO (rode tudo de uma vez no SQL Editor)
-- Idempotente: pode rodar novamente sem quebrar. Ordem correta garantida.
-- =====================================================================

-- ---------- Fase 1: captação ----------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null unique, whatsapp text not null,
  marketplace text, consent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_leads_created_at on public.leads (created_at desc);
alter table public.leads enable row level security;

create table if not exists public.page_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.page_visits enable row level security;

create table if not exists public.settings (key text primary key, value text);
alter table public.settings enable row level security;

-- ---------- Empresas / Vendas / Metas ----------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null, color text not null default '#1d7a5f',
  cnpj text, address text, marketplace text,
  created_at timestamptz not null default now()
);
create index if not exists idx_stores_user on public.stores (user_id);
alter table public.stores enable row level security;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date not null, store_id uuid not null references public.stores(id) on delete cascade,
  qty integer not null default 0,
  revenue numeric(14,2) default 0, fee_mp numeric(14,2) default 0, freight numeric(14,2) default 0,
  cmv numeric(14,2) default 0, ads_ml numeric(14,2) default 0, ads_ext numeric(14,2) default 0, tax numeric(14,2) default 0,
  created_at timestamptz not null default now(),
  unique (date, store_id)
);
create index if not exists idx_sales_date on public.sales (date);
create index if not exists idx_sales_user on public.sales (user_id);
alter table public.sales enable row level security;

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  month text not null, store_id uuid references public.stores(id) on delete cascade,
  amount numeric(14,2) not null default 0
);
create unique index if not exists idx_goals_user_month_store on public.goals (user_id, month, coalesce(store_id::text,'GERAL'));
alter table public.goals enable row level security;

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  date date not null, orders integer default 0, revenue numeric(14,2) default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_imports_user on public.imports (user_id, created_at desc);
alter table public.imports enable row level security;

-- ---------- Boletos + Fluxo de Caixa ----------
create table if not exists public.boletos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null, supplier text, value numeric(14,2) default 0, due_date date not null,
  category text, kind text not null default 'boleto', bank text, marketplace text,
  direction text not null default 'pagar', status text not null default 'pendente',
  empresa text, numero_nf text, created_at timestamptz not null default now()
);
create index if not exists idx_boletos_user on public.boletos (user_id, due_date);
alter table public.boletos enable row level security;

create table if not exists public.cash_flow_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null default 'expense', date date not null, value numeric(14,2) default 0,
  category text, reason text, empresa text, nota_fiscal text,
  boleto_id uuid references public.boletos(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_cf_user on public.cash_flow_entries (user_id, date);
alter table public.cash_flow_entries enable row level security;

-- ---------- Listas (fornecedores/categorias) ----------
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null, name text not null
);
create index if not exists idx_lists_user on public.lists (user_id, type);
alter table public.lists enable row level security;

-- ALTERs de segurança (caso as tabelas já existissem sem as colunas)
alter table public.stores  add column if not exists cnpj text;
alter table public.stores  add column if not exists address text;
alter table public.stores  add column if not exists marketplace text;
alter table public.boletos add column if not exists kind text not null default 'boleto';
alter table public.boletos add column if not exists bank text;
alter table public.boletos add column if not exists marketplace text;
