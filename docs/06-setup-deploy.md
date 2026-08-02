# 06 — Setup e Deploy

## Pré-requisitos
- Node.js 18+
- Conta gratuita no [Supabase](https://supabase.com)

## 1. Supabase
1. Crie um projeto.
2. Em **SQL Editor**, cole e execute [`supabase/schema.sql`](../supabase/schema.sql).
3. Em **Project Settings → API**, copie:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (⚠️ secreta, só no servidor)

## 2. Ambiente
```bash
cp .env.example .env
```
Preencha `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` e um `ADMIN_TOKEN` forte
(ex.: `openssl rand -hex 24`).

## 3. Rodar
```bash
npm install
npm start      # http://localhost:3000
```

## 4. Deploy (opções gratuitas)
Qualquer host que rode Node serve. Exemplos:

- **Render / Railway**: conecte o repositório, defina as variáveis de ambiente,
  build `npm install`, start `npm start`.
- **Vercel**: funciona melhor adaptando `server/index.js` para função serverless;
  para simplicidade inicial, Render/Railway são mais diretos.

**Variáveis de ambiente no host:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_TOKEN`,
`PORT` (o host normalmente injeta `PORT`).

## 5. Checklist de produção
- [ ] `.env` fora do git (já está no `.gitignore`)
- [ ] `ADMIN_TOKEN` forte e único
- [ ] HTTPS ativo (o host cuida disso)
- [ ] Política de Privacidade revisada
- [ ] Teste de cadastro + painel end-to-end
