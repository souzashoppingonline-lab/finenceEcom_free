-- =====================================================================
-- FinanceEcom Free - Mercado Livre (tokens OAuth do app do dono)
-- Rode no SQL Editor do Supabase.
-- =====================================================================
create table if not exists public.ml_tokens (
  id            int primary key default 1,
  access_token  text,
  refresh_token text,
  expires_at    bigint,
  updated_at    timestamptz default now()
);
alter table public.ml_tokens enable row level security;
