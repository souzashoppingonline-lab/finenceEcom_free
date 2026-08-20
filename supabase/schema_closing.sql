-- ===========================================================================
-- Fechamento Mensal (monthly_closing) — consolida o resultado de cada mês
-- ===========================================================================
create table if not exists public.monthly_closing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year smallint not null,
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  notes text,
  checklist jsonb default '{}'::jsonb,
  report_data jsonb,
  revenue_gross numeric(14,2) default 0,
  contribution_margin numeric(14,2) default 0,
  net_profit numeric(14,2) default 0,
  total_sales numeric(14,2) default 0,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, year)
);
create index if not exists idx_closing_user_year on public.monthly_closing (user_id, year);
alter table public.monthly_closing enable row level security;
