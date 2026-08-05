-- =====================================================================
-- FinanceEcom Free - Fluxo de Caixa Anual (manual / extrato bancario)
-- Rode no SQL Editor do Supabase.
-- =====================================================================
create table if not exists public.manual_cashflow (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users(id) on delete cascade,
  year     integer not null,
  month    integer not null,          -- 1..12
  day1     numeric(14,2) not null default 0,   -- saldo do dia 1
  bank_in  numeric(14,2) not null default 0,   -- entradas do banco
  bank_out numeric(14,2) not null default 0,   -- saidas do banco
  unique (user_id, year, month)
);
create index if not exists idx_manual_user on public.manual_cashflow (user_id, year);
alter table public.manual_cashflow enable row level security;
