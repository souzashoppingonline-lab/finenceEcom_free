# 09 — Autenticação (Supabase Auth) + E-mail (Resend)

O login dos vendedores usa o **Supabase Auth**. Os e-mails de código/recuperação
são enviados via **Resend** (SMTP customizado no Supabase).

## A. Configurar o Resend

1. Crie conta em [resend.com](https://resend.com) (grátis: 3.000 e-mails/mês).
2. **Verifique o domínio** `financeecom.com.br`: Resend → **Domains → Add Domain**.
   Ele vai gerar registros **DKIM/SPF (CNAME/TXT)** — adicione-os no **Cloudflare → DNS**.
   Aguarde o status ficar **Verified**.
3. Em **API Keys**, gere uma chave (`re_...`). Guarde — é secreta.
   > Se a chave foi exposta em algum lugar, revogue e gere outra.

## B. Configurar SMTP no Supabase (usando o Resend)

Supabase → **Authentication → Emails / SMTP Settings → Enable Custom SMTP**:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | *(a API key do Resend `re_...`)* |
| Sender email | `nao-responda@financeecom.com.br` *(precisa do domínio verificado)* |
| Sender name | `FinanceEcom Free` |

> Para testar antes de verificar o domínio, o Resend permite enviar de
> `onboarding@resend.dev` **apenas para o e-mail dono da conta**.

## C. Ativar login por e-mail + código

1. **Authentication → Providers → Email**: habilitado; marque **Confirm email**.
2. **Authentication → Email Templates**: edite o template **Magic Link** (e
   **Confirm signup**) para incluir o **código** de 6 dígitos. Adicione ao corpo:
   ```
   Seu código de verificação é: {{ .Token }}
   ```
   (Sem isso, o e-mail vem só com link e o campo de código não funciona.)
3. **Authentication → URL Configuration → Site URL**: `https://app.financeecom.com.br`.

## D. Política de senha

Supabase → **Authentication → Policies** (ou Settings): defina
**tamanho mínimo = 10** e exija letras + números, se disponível.
O frontend já valida (10+, maiúscula, minúscula, número) e mostra a barra de força.

## E. Segurança já coberta pelo Supabase Auth

| Requisito | Status |
|---|---|
| Verificação de e-mail por código | ✅ (template com `{{ .Token }}`) |
| Hash de senha | ✅ bcrypt |
| JWT + Refresh Token + rotação | ✅ |
| Recuperação por código | ✅ (`/recuperar.html`) |
| MFA / Google Authenticator (TOTP) | ✅ (`/app.html` → Ativar 2 etapas) |
| Rate limit de login | ✅ nativo |
| HTTPS obrigatório | ✅ (Render + Cloudflare) |

## F. Observação sobre a chave do frontend

`public/js/auth-common.js` usa a **publishable key** (pública, segura no browser).
Se o Supabase recusar o formato `sb_publishable_...` em alguma versão do SDK, use a
**anon key** legada (Settings → API → Project API keys → `anon public`).

## Próxima etapa (Fase 2.1)

Ligar o módulo `/vendas` às contas: adicionar `user_id` em `stores/sales/goals`,
ativar **RLS** por usuário e autenticar as chamadas com o JWT do Supabase (em vez do
token de admin). Assim cada vendedor vê apenas os próprios dados.
