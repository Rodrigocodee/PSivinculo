# Deploy seguro do Psivinculo

Este projeto usa frontend Vite, backend Node, Supabase, Asaas e Resend. O arquivo `.env` real deve existir apenas no ambiente local ou no painel do provedor de deploy. Ele ja esta ignorado pelo Git.

## Rodando local

1. Copie `.env.example` para `.env`.
2. Preencha as chaves locais ou sandbox no `.env`.
3. Rode o frontend com `npm run dev`.
4. Rode o backend local com `npm run dev:server`.

O Vite usa chamadas em `/api`. Se o frontend e o backend estiverem em origens diferentes, configure `VITE_API_BASE_URL`.

## Variaveis publicas do frontend

Somente variaveis `VITE_` entram no bundle do Vite:

- `VITE_SUPABASE_URL`: URL publica do projeto Supabase.
- `VITE_SUPABASE_ANON_KEY`: chave anon/public do Supabase.
- `VITE_API_BASE_URL`: URL publica do backend Node, por exemplo `https://api.psivinculo.com.br`.

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `RESEND_API_KEY`, `ASAAS_WEBHOOK_TOKEN` ou `CRON_SECRET` em variaveis `VITE_`.

## Variaveis secretas do backend

- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: service role do Supabase, apenas backend.
- `SUPABASE_ANON_KEY`: anon key usada pelo backend em fluxos autenticados por bearer token.
- `ASAAS_API_KEY`: chave da conta Asaas.
- `ASAAS_BASE_URL`: URL da API Asaas. Sandbox: `https://sandbox.asaas.com/api/v3`. Producao: `https://api.asaas.com/v3`.
- `ASAAS_API_URL`: alias opcional para `ASAAS_BASE_URL`.
- `ASAAS_WEBHOOK_TOKEN`: segredo configurado no webhook Asaas.
- `RESEND_API_KEY`: chave da Resend.
- `EMAIL_FROM`: remetente verificado na Resend.
- `CRON_SECRET`: segredo para rotas internas de cron.
- `APP_BASE_URL` ou `FRONTEND_PUBLIC_URL`: URL publica do frontend, sem barra final.
- `BACKEND_PUBLIC_URL`: URL publica do backend, util para documentacao e configuracao externa.
- `HOST` e `PORT`: bind do servidor Node.

Em producao, `APP_BASE_URL`/`FRONTEND_PUBLIC_URL` nao pode apontar para `localhost`. O backend usa essa URL para montar o callback publico de retorno do Asaas.

## Ambientes Asaas

Use URLs e chaves separadas por ambiente:

- Sandbox: `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3`
- Producao: `ASAAS_BASE_URL=https://api.asaas.com/v3`

Nao reutilize chave de sandbox em producao nem token de webhook entre ambientes.

## URLs de webhook

Configure no Asaas as URLs publicas do backend:

- Assinaturas: `https://api.psivinculo.com.br/api/asaas/webhook`
- Pagamentos de consultas: `https://api.psivinculo.com.br/api/webhooks/asaas/consultas`

O header/token configurado no Asaas deve bater com `ASAAS_WEBHOOK_TOKEN`.

## Checklist antes de subir

- `.env` nao esta versionado.
- `.env.example` contem apenas placeholders.
- Frontend usa apenas variaveis `VITE_`.
- Backend tem `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `RESEND_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e `CRON_SECRET` configurados no provedor.
- `APP_BASE_URL` ou `FRONTEND_PUBLIC_URL` aponta para o dominio real do frontend.
- `ASAAS_BASE_URL` aponta para sandbox ou producao conforme o ambiente.
- Webhooks do Asaas apontam para `BACKEND_PUBLIC_URL`.
- `npm run build` e `npm test` passam.
