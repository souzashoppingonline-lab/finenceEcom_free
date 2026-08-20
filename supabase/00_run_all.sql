-- =====================================================================
-- FinanceEcom Free - SCRIPT ÚNICO (rode tudo de uma vez no SQL Editor)
-- Idempotente: pode rodar novamente sem quebrar. Ordem correta garantida.
-- =====================================================================

-- ---------- Fase 1: captação ----------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null unique, whatsapp text not null,
  marketplace text, consent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_leads_created_at on public.leads (created_at desc);
alter table public.leads enable row level security;

create table if not exists public.page_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.page_visits enable row level security;

create table if not exists public.settings (key text primary key, value text);
alter table public.settings enable row level security;

-- ---------- Empresas / Vendas / Metas ----------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null, color text not null default '#1d7a5f',
  cnpj text, address text, marketplace text,
  created_at timestamptz not null default now()
);
create index if not exists idx_stores_user on public.stores (user_id);
alter table public.stores enable row level security;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date not null, store_id uuid not null references public.stores(id) on delete cascade,
  qty integer not null default 0,
  revenue numeric(14,2) default 0, fee_mp numeric(14,2) default 0, freight numeric(14,2) default 0,
  cmv numeric(14,2) default 0, ads_ml numeric(14,2) default 0, ads_ext numeric(14,2) default 0, tax numeric(14,2) default 0,
  created_at timestamptz not null default now(),
  unique (date, store_id)
);
create index if not exists idx_sales_date on public.sales (date);
create index if not exists idx_sales_user on public.sales (user_id);
alter table public.sales enable row level security;

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  month text not null, store_id uuid references public.stores(id) on delete cascade,
  amount numeric(14,2) not null default 0
);
create unique index if not exists idx_goals_user_month_store on public.goals (user_id, month, coalesce(store_id::text,'GERAL'));
alter table public.goals enable row level security;

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  date date not null, orders integer default 0, revenue numeric(14,2) default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_imports_user on public.imports (user_id, created_at desc);
alter table public.imports enable row level security;

-- ---------- Boletos + Fluxo de Caixa ----------
create table if not exists public.boletos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null, supplier text, value numeric(14,2) default 0, due_date date not null,
  category text, kind text not null default 'boleto', bank text, marketplace text,
  direction text not null default 'pagar', status text not null default 'pendente',
  empresa text, numero_nf text, created_at timestamptz not null default now()
);
create index if not exists idx_boletos_user on public.boletos (user_id, due_date);
alter table public.boletos enable row level security;

create table if not exists public.cash_flow_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null default 'expense', date date not null, value numeric(14,2) default 0,
  category text, reason text, empresa text, nota_fiscal text,
  boleto_id uuid references public.boletos(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_cf_user on public.cash_flow_entries (user_id, date);
alter table public.cash_flow_entries enable row level security;

-- ---------- Listas (fornecedores/categorias) ----------
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null, name text not null
);
create index if not exists idx_lists_user on public.lists (user_id, type);
alter table public.lists enable row level security;

-- ALTERs de segurança (caso as tabelas já existissem sem as colunas)
alter table public.stores  add column if not exists cnpj text;
alter table public.stores  add column if not exists address text;
alter table public.stores  add column if not exists marketplace text;
alter table public.boletos add column if not exists kind text not null default 'boleto';
alter table public.boletos add column if not exists bank text;
alter table public.boletos add column if not exists marketplace text;

-- ---------- Cartoes de credito ----------
create table if not exists public.cartoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  closing_day integer not null default 1,
  due_day integer not null default 10,
  card_limit numeric(14,2) default 0,
  color text default '#6b46c1'
);
create index if not exists idx_cartoes_user on public.cartoes (user_id);
alter table public.cartoes enable row level security;

create table if not exists public.parcelas_cartao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  cartao_id uuid references public.cartoes(id) on delete cascade,
  description text not null, empresa text,
  value numeric(14,2) not null default 0,
  installment_no integer not null default 1,
  installments_total integer not null default 1,
  purchase_date date not null, fatura_mes text not null,
  status text not null default 'pendente',
  created_at timestamptz not null default now()
);
create index if not exists idx_parcelas_user on public.parcelas_cartao (user_id, cartao_id, fatura_mes);
alter table public.parcelas_cartao enable row level security;

create table if not exists public.fatura_pagamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  cartao_id uuid references public.cartoes(id) on delete cascade,
  fatura_mes text not null, data_pagamento date not null,
  valor_pago numeric(14,2) not null default 0,
  parcelas_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_fatpag_user on public.fatura_pagamentos (user_id, data_pagamento desc);
alter table public.fatura_pagamentos enable row level security;

-- ---------- Despesas (custos fixos/operacionais) ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date not null, description text not null, category text,
  type text not null default 'fixed',
  value numeric(14,2) not null default 0,
  recurring boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_user on public.expenses (user_id, date);
alter table public.expenses enable row level security;

-- ---------- Alerta diario de boletos por e-mail ----------
create table if not exists public.boleto_alerts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text, hour integer not null default 8,
  enabled boolean not null default false
);
alter table public.boleto_alerts enable row level security;

-- ---------- Fluxo de caixa anual (extrato bancario manual) ----------
create table if not exists public.manual_cashflow (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  year integer not null, month integer not null,
  day1 numeric(14,2) not null default 0,
  bank_in numeric(14,2) not null default 0,
  bank_out numeric(14,2) not null default 0,
  unique (user_id, year, month)
);
create index if not exists idx_manual_user on public.manual_cashflow (user_id, year);
alter table public.manual_cashflow enable row level security;

-- CNPJ atrelado ao boleto
alter table public.boletos add column if not exists cnpj text;

-- ---------- Analise de Produtos (multi-tenant) ----------

-- ---------- Config de IA + token da extensao (1 linha por usuario) ----------
create table if not exists public.user_ai_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  ai_provider   text not null default 'anthropic',   -- 'anthropic' | 'openai'
  anthropic_key text,                                 -- criptografada (AES-256-GCM)
  openai_key    text,                                 -- criptografada
  ext_token     text,                                 -- token da extensao (aleatorio, nao secreto)
  updated_at    timestamptz not null default now()
);
create unique index if not exists idx_ai_ext_token on public.user_ai_settings (ext_token);
alter table public.user_ai_settings enable row level security;

-- ---------- Produtos em analise ----------
create table if not exists public.analise_products (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  produto      text not null,
  fornecedor   text,
  preco_compra numeric(14,2) default 0,
  taxa_mp      numeric(14,2) default 0,
  imposto      numeric(14,2) default 0,
  frete_entrada numeric(14,2) default 0,
  embalagem    numeric(14,2) default 0,
  observacoes  text,
  status       text not null default 'ativo',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_analise_prod_user on public.analise_products (user_id);
alter table public.analise_products enable row level security;

-- ---------- Produto "em coleta" agora (1 linha por usuario) ----------
create table if not exists public.analise_active_collection (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  product_id bigint references public.analise_products(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.analise_active_collection enable row level security;

-- ---------- Concorrentes coletados (watchlist) ----------
create table if not exists public.analise_product_ads (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  product_id     bigint not null references public.analise_products(id) on delete cascade,
  ml_id          text,
  link           text,
  titulo         text, preco numeric(14,2), preco_original numeric(14,2), nota numeric(5,2),
  vendas         text, perguntas int, comentarios int,
  vendedor       text, cidade text, estado text, reputacao text,
  is_full        boolean, is_flex boolean,
  fotos jsonb, videos jsonb, raw jsonb,
  observacoes text, comentarios_texto text, descricao text, highlights jsonb,
  monitorar       boolean not null default true,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (product_id, ml_id)
);
create index if not exists idx_analise_ads_user on public.analise_product_ads (user_id, product_id);
create index if not exists idx_analise_ads_queue on public.analise_product_ads (monitorar, last_checked_at nulls first) where ml_id is not null;
alter table public.analise_product_ads enable row level security;

-- ---------- Historico de preco (serie temporal) ----------
create table if not exists public.analise_monitor_snapshots (
  id        bigserial primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  ml_id     text not null,
  snap_date date not null default current_date,
  preco     numeric(14,2), preco_original numeric(14,2),
  created_at timestamptz not null default now(),
  unique (ml_id, snap_date)
);
create index if not exists idx_analise_snap on public.analise_monitor_snapshots (user_id, ml_id, snap_date);
alter table public.analise_monitor_snapshots enable row level security;

-- Analise por IA salva (Fase 2)
alter table public.analise_products add column if not exists analise_ia text;
alter table public.analise_products add column if not exists analise_ia_at timestamptz;
alter table public.analise_product_ads add column if not exists aval_dist text;
alter table public.analise_product_ads add column if not exists data_criacao text;
alter table public.analise_products add column if not exists creativos_json text;
alter table public.analise_products add column if not exists creativos_at timestamptz;
alter table public.analise_product_ads add column if not exists vendas_7d integer;
alter table public.analise_product_ads add column if not exists vendas_15d integer;
alter table public.analise_product_ads add column if not exists vendas_21d integer;
alter table public.analise_product_ads add column if not exists vendas_30d integer;
alter table public.analise_product_ads add column if not exists preco_medio_7d numeric(14,2);
alter table public.analise_product_ads add column if not exists preco_medio_15d numeric(14,2);
alter table public.analise_product_ads add column if not exists preco_medio_21d numeric(14,2);
alter table public.analise_product_ads add column if not exists preco_medio_30d numeric(14,2);
create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  kind text, provider text, model text,
  input_tokens integer default 0, output_tokens integer default 0,
  cost_usd numeric(12,6) default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_usage_user on public.ai_usage_log (user_id, created_at desc);
alter table public.ai_usage_log enable row level security;
alter table public.user_ai_settings add column if not exists ai_level integer not null default 3;

-- ---------- Mercado Livre (tokens OAuth) ----------
create table if not exists public.ml_tokens (
  id int primary key default 1,
  access_token text, refresh_token text, expires_at bigint,
  updated_at timestamptz default now()
);
alter table public.ml_tokens enable row level security;

-- ---------- Fechamento Mensal ----------
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
