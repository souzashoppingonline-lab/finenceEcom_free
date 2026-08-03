-- =====================================================================
-- FinanceEcom Free - Listas auxiliares (fornecedores, categorias)
-- Rode no SQL Editor do Supabase.
-- =====================================================================
create table if not exists public.lists (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type    text not null,   -- 'supplier' | 'category'
  name    text not null
);
create index if not exists idx_lists_user on public.lists (user_id, type);
alter table public.lists enable row level security;
