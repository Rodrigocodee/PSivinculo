# Psivinculo

## Asaas no backend

O projeto agora possui um backend Node enxuto em `server/` para criar assinaturas recorrentes no Asaas sem expor a chave no frontend.

### Variaveis de ambiente usadas no servidor

- `ASAAS_API_KEY`
- `ASAAS_BASE_URL`
- `ASAAS_WEBHOOK_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` ou `VITE_SUPABASE_URL`
- `PORT` opcional, padrao `3001`

Use `.env.example` como referencia segura.

### Rota criada

`POST /api/asaas/create-subscription`

`POST /api/asaas/webhook`

Exemplo de payload:

```json
{
  "plan": {
    "id": "profissional",
    "name": "Plano Profissional",
    "value": 149.9,
    "billingType": "UNDEFINED"
  },
  "customer": {
    "name": "Clinica Exemplo",
    "cpfCnpj": "12345678000199",
    "email": "financeiro@clinica.com",
    "phone": "11999999999",
    "mobilePhone": "11999999999",
    "externalReference": "clinica-123"
  }
}
```

A rota:

- valida o payload no backend
- calcula `nextDueDate` dinamicamente no momento da compra
- localiza ou cria o customer no Asaas
- cria a assinatura mensal recorrente
- salva a assinatura no banco local logo apos a criacao
- busca o primeiro pagamento da assinatura
- retorna `subscription`, `firstPayment`, `paymentUrl` e `pixQrCode` quando aplicavel

O webhook:

- valida o header `asaas-access-token`
- registra o evento para idempotencia em banco
- atualiza a assinatura local
- ativa ou desativa o plano automaticamente conforme o status do pagamento

### Como rodar

- Frontend: `npm run dev`
- Backend local: `npm run dev:server`
- Build do app: `npm run build`
- Servidor Node local com `.env`: `npm run start:local`

Durante o desenvolvimento, o Vite faz proxy de `/api` para `http://127.0.0.1:3001`.

### Fluxo atual do frontend

- O card de plano leva para `/checkout/:planKey`
- A tela coleta `nome`, `e-mail` e `CPF/CNPJ`
- O frontend chama `POST /api/asaas/create-subscription`
- O segredo do Asaas nunca vai para o cliente
- O retorno redireciona para `paymentUrl` ou exibe `pixQrCode` quando necessario
