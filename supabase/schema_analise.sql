-- =====================================================================
-- FinanceEcom Free - Analise de Produtos (multi-tenant)
-- Fase 1: paginas + tokens (IA + extensao)
-- Rode no SQL Editor do Supabase.
-- =====================================================================

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

-- Analise por IA salva no produto (Fase 2)
alter table public.analise_products add column if not exists analise_ia text;
alter table public.analise_products add column if not exists analise_ia_at timestamptz;

-- Distribuicao de estrelas das avaliacoes (auto) — Fase 3
alter table public.analise_product_ads add column if not exists aval_dist text;

-- Data de criacao do anuncio (Fase 4)
alter table public.analise_product_ads add column if not exists data_criacao text;

-- Criativos gerados por IA (JSON) — opcional
alter table public.analise_products add column if not exists creativos_json text;
alter table public.analise_products add column if not exists creativos_at timestamptz;

-- Vendas reais dos concorrentes (Shopping de Preco) — peso maximo na IA
alter table public.analise_product_ads add column if not exists vendas_7d integer;
alter table public.analise_product_ads add column if not exists vendas_15d integer;
alter table public.analise_product_ads add column if not exists vendas_21d integer;
alter table public.analise_product_ads add column if not exists vendas_30d integer;

-- Valor medio por venda por periodo (Shopping de Preco)
alter table public.analise_product_ads add column if not exists preco_medio_7d numeric(14,2);
alter table public.analise_product_ads add column if not exists preco_medio_15d numeric(14,2);
alter table public.analise_product_ads add column if not exists preco_medio_21d numeric(14,2);
alter table public.analise_product_ads add column if not exists preco_medio_30d numeric(14,2);

-- Registro de uso/custo de IA (contador de gastos)
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

-- Nivel de profundidade da analise por IA (1=economico ... 5=profundo)
alter table public.user_ai_settings add column if not exists ai_level integer not null default 3;

-- Horario da atualizacao automatica (0-23, hora local do vendedor; null = qualquer hora apos 24h)
alter table public.user_ai_settings add column if not exists monitor_hour smallint;

-- Novos campos do anuncio: parcelamento, estoque, desconto
alter table public.analise_product_ads add column if not exists parcelamento text;
alter table public.analise_product_ads add column if not exists estoque integer;
alter table public.analise_product_ads add column if not exists desconto_pct numeric(5,2);

-- Vendas no historico de snapshots (mini-historico de vendas no card)
alter table public.analise_monitor_snapshots add column if not exists vendas integer;

-- Log de mudanças do concorrente (título, foto, descrição, status)
create table if not exists public.analise_change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  product_id uuid,
  ml_id text,
  campo text,
  valor_antigo text,
  valor_novo text,
  created_at timestamptz not null default now()
);
create index if not exists idx_change_user_prod on public.analise_change_log (user_id, product_id, created_at desc);
alter table public.analise_change_log enable row level security;
