-- =====================================================================
-- FinanceEcom Free - Alerta diario de boletos por e-mail (Resend)
-- Rode no SQL Editor do Supabase.
-- =====================================================================
create table if not exists public.boleto_alerts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text,
  hour    integer not null default 8,   -- hora do envio (0-23, horario de Brasilia)
  enabled boolean not null default false
);
alter table public.boleto_alerts enable row level security;
