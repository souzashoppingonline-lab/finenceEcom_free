-- =====================================================================
-- FinanceEcom Free - Despesas (custos fixos/operacionais) -> DRE
-- Rode no SQL Editor do Supabase.
-- =====================================================================
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  description text not null,
  category text,
  type text not null default 'fixed',      -- 'fixed' | 'operational'
  value numeric(14,2) not null default 0,
  recurring boolean not null default false,  -- se true, vale para todos os meses a partir da data
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_user on public.expenses (user_id, date);
alter table public.expenses enable row level security;
