# 07 — Roadmap

## Fase 1 — MVP (ENTREGUE)
- [x] Landing de cadastro (nome, e-mail, WhatsApp, marketplace)
- [x] Consentimento LGPD + Política de Privacidade
- [x] Painel: total de clientes, novos em 7 dias, lista, export CSV
- [x] Banco Supabase + API Express
- [x] Documentação de engenharia

## Fase 2 — Núcleo financeiro (FinanceEcom Free completo)
Cada módulo abaixo já está previsto na visão do produto:

| Módulo        | Descrição                                              | API |
|---------------|--------------------------------------------------------|-----|
| Autenticação  | Cadastro/login de usuário (Supabase Auth)              | —   |
| Dashboard     | Visão geral de saúde financeira                        | `/api/dashboard` |
| Vendas        | Lançamento manual / import Excel                       | `/api/sales` |
| Despesas      | Custos fixos e variáveis                               | — |
| Boletos       | Contas a pagar/receber                                 | — |
| Fluxo de Caixa| Entradas x saídas, saldo projetado                     | `/api/cashflow` |
| DRE           | Demonstrativo de resultado                             | `/api/reports` |
| Projeção      | Previsão de caixa e "quanto vender amanhã"             | `/api/projection` |
| Metas         | Definição e acompanhamento                             | `/api/goals` |
| IA            | Recomendações ("posso comprar estoque?")               | — |

## Fase 3 — Ecossistema
- **FinanceEcom Pro** — recursos avançados (pago).
- **FinanceEcom Mentoria** — trilha educacional/consultoria.
- Segmentação da base (e-mail/WhatsApp) capturada no Free para conversão.

## Notas de arquitetura para as próximas fases
- Introduzir **Supabase Auth** e vincular `leads` a `users`.
- Import de Excel (parser XLSX no backend).
- Cálculos financeiros documentados como "regras de negócio" (cada fórmula explicada).
- Gráficos no dashboard (biblioteca leve, ex.: Chart.js).
