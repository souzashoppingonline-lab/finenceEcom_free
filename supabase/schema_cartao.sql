-- =====================================================================
-- FinanceEcom Free - Modulo Cartao de Credito
-- Rode no SQL Editor do Supabase.
-- =====================================================================
create table if not exists public.cartoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  closing_day integer not null default 1,   -- dia de fechamento
  due_day integer not null default 10,       -- dia de vencimento
  card_limit numeric(14,2) default 0,
  color text default '#6b46c1'
);
create index if not exists idx_cartoes_user on public.cartoes (user_id);
alter table public.cartoes enable row level security;

create table if not exists public.parcelas_cartao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  cartao_id uuid references public.cartoes(id) on delete cascade,
  description text not null,
  empresa text,
  value numeric(14,2) not null default 0,
  installment_no integer not null default 1,      -- 1..N
  installments_total integer not null default 1,   -- N
  purchase_date date not null,
  fatura_mes text not null,                        -- 'YYYY-MM' da fatura
  status text not null default 'pendente',         -- pendente | pago
  created_at timestamptz not null default now()
);
create index if not exists idx_parcelas_user on public.parcelas_cartao (user_id, cartao_id, fatura_mes);
alter table public.parcelas_cartao enable row level security;

create table if not exists public.fatura_pagamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  cartao_id uuid references public.cartoes(id) on delete cascade,
  fatura_mes text not null,
  data_pagamento date not null,
  valor_pago numeric(14,2) not null default 0,
  parcelas_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_fatpag_user on public.fatura_pagamentos (user_id, data_pagamento desc);
alter table public.fatura_pagamentos enable row level security;
