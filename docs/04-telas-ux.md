# 04 — Telas / UX

## 1. Landing / Cadastro (`/`)
- **Hero** com proposta de valor e benefícios.
- **Formulário**: nome, e-mail, WhatsApp, marketplace (select opcional), checkbox de
  consentimento LGPD (obrigatório, com link para a política).
- Feedback inline de sucesso/erro; botão desabilita durante o envio.
- Responsivo: em telas < 820px o layout vira coluna única.

## 2. Painel Admin (`/admin.html`)
- **Login** por token (armazenado em `sessionStorage`, auto-login enquanto a aba estiver aberta).
- **Cards de métrica**: Total de clientes e Novos (7 dias) — atende diretamente ao
  requisito "quero saber quantos clientes tenho".
- **Tabela** de clientes: nome, e-mail, WhatsApp (formatado), marketplace, data.
- **Exportar CSV** (compatível com Excel, com BOM UTF-8).
- Botão **Sair** limpa o token.

## 3. Política de Privacidade (`/privacidade.html`)
- Documento LGPD: dados coletados, finalidade, base legal, direitos, contato.

## Design System (resumo)
- **Cores**: fundo escuro `#0e1525`, primária `#1d7a5f`, acento `#35c48c`.
- **Cards** com raio 14px e sombra suave.
- **Tipografia**: system-ui.
- Definições em `public/css/style.css` (variáveis CSS em `:root`).

## Responsividade
Desktop, tablet e mobile via grid/flex e `max-width`. Tabela do painel rola
horizontalmente em telas pequenas.
