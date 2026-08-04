-- =====================================================================
-- FinanceEcom Free - CNPJ atrelado ao boleto (empresa)
-- Rode no SQL Editor do Supabase.
-- =====================================================================
alter table public.boletos add column if not exists cnpj text;
