# 05 — LGPD e Privacidade

O FinanceEcom Free coleta **dados pessoais** (nome, e-mail, WhatsApp), portanto está
sujeito à Lei 13.709/2018 (LGPD).

## Medidas implementadas
1. **Consentimento explícito**: checkbox obrigatório no cadastro; o backend rejeita o
   cadastro se `consent !== true`.
2. **Política de Privacidade** publicada em `/privacidade.html` (finalidade, base legal,
   direitos do titular, canal de contato).
3. **Minimização**: coletamos apenas o necessário (contato + marketplace).
4. **Segurança de acesso**: dados só acessíveis pelo backend (service role) e pelo painel
   protegido por token; RLS ativo no banco.

## Direitos do titular
Acesso, correção, exclusão e revogação de consentimento pelo e-mail de contato
(`souzashopping.online@gmail.com`).

## Recomendações para produção
- Publicar a política em domínio próprio e datar as atualizações.
- Registrar data/hora e versão do texto de consentimento aceito (auditoria).
- Implementar rotina de **exclusão a pedido** (delete do lead).
- Se usar WhatsApp para marketing, respeitar opt-out.
- Nomear um responsável (encarregado/DPO) para os contatos de privacidade.
