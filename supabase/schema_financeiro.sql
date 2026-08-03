-- =====================================================================
-- FinanceEcom Free - Fluxo de Caixa + Boletos & Dividas (integrados)
-- Rode no SQL Editor do Supabase.
-- =====================================================================

-- Boletos / dividas / recebiveis
create table if not exists public.boletos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  name       text not null,
  supplier   text,
  value      numeric(14,2) not null default 0,
  due_date   date not null,               -- vencimento
  category   text,
  kind       text not null default 'boleto',   -- boleto|cartao|imposto|pessoal|fatura_ml|flex|custo_fixo|custo_variavel
  bank       text,
  direction  text not null default 'pagar',    -- 'pagar' | 'receber'
  status     text not null default 'pendente', -- 'pendente' | 'pago'
  empresa    text,                         -- empresa/loja vinculada (livre)
  numero_nf  text,
  created_at timestamptz not null default now()
);
create index if not exists idx_boletos_user on public.boletos (user_id, due_date);
alter table public.boletos enable row level security;

-- Lancamentos do Fluxo de Caixa
create table if not exists public.cash_flow_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  type        text not null default 'expense',  -- 'income' | 'expense'
  date        date not null,
  value       numeric(14,2) not null default 0,
  category    text,
  reason      text,
  empresa     text,
  nota_fiscal text,
  boleto_id   uuid references public.boletos(id) on delete cascade,  -- vinculo (Conexao #1)
  created_at  timestamptz not null default now()
);
create index if not exists idx_cf_user on public.cash_flow_entries (user_id, date);
create index if not exists idx_cf_boleto on public.cash_flow_entries (boleto_id);
alter table public.cash_flow_entries enable row level security;
