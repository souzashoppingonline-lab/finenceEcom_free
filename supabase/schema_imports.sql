-- =====================================================================
-- FinanceEcom Free - Historico de importacoes (Mercado Turbo)
-- Rode no SQL Editor do Supabase.
-- =====================================================================
create table if not exists public.imports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  store_id   uuid references public.stores(id) on delete set null,
  date       date not null,
  orders     integer not null default 0,
  revenue    numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_imports_user on public.imports (user_id, created_at desc);
alter table public.imports enable row level security;
