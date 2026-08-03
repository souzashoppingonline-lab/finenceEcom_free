-- =====================================================================
-- FinanceEcom Free - Empresas (stores) com CNPJ, endereco e marketplace
-- Rode no SQL Editor do Supabase.
-- =====================================================================
alter table public.stores add column if not exists cnpj text;
alter table public.stores add column if not exists address text;
alter table public.stores add column if not exists marketplace text;  -- lista separada por virgula

-- Recebiveis por marketplace (boletos direction='receber')
alter table public.boletos add column if not exists marketplace text;
