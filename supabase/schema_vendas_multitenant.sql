-- =====================================================================
-- FinanceEcom Free - Fase 2.1: multi-tenant (dados por usuario)
-- Adiciona user_id em stores/sales/goals. Rode no SQL Editor do Supabase.
-- =====================================================================

alter table public.stores add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.sales  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.goals  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_stores_user on public.stores (user_id);
create index if not exists idx_sales_user  on public.sales (user_id);

-- Meta unica por usuario + mes + loja (troca o indice antigo global)
drop index if exists idx_goals_month_store;
create unique index if not exists idx_goals_user_month_store
  on public.goals (user_id, month, coalesce(store_id::text, 'GERAL'));

-- Observacao: o backend acessa via service role e ja filtra por user_id.
-- RLS continua habilitado sem policies publicas (acesso so pelo backend).
