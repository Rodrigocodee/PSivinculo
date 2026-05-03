# 🧠 Psivínculo






## 🚀 Tecnologias utilizadas

- **Frontend:** React + TypeScript + Vite  
- **Backend:** Node.js  
- **Banco de dados:** Supabase  
- **Pagamentos:** Asaas  

---

## 💡 Sobre o projeto

O Psivínculo foi desenvolvido com o objetivo de:

- Centralizar a rotina de psicólogos  
- Automatizar agendamentos e confirmações  
- Gerenciar pacientes e prontuários  
- Integrar pagamentos recorrentes de forma segura  

---

## 💳 Integração com Asaas (Backend)

O projeto possui um backend em `server/` responsável por:

- Criar assinaturas recorrentes  
- Processar pagamentos  
- Receber webhooks do Asaas  
- Atualizar o status de assinaturas automaticamente  

🔒 **Importante:** a chave da API nunca é exposta no frontend.

---

## 🔐 Variáveis de ambiente

Configure um arquivo `.env` baseado no `.env.example`:

```env
ASAAS_API_KEY=
ASAAS_BASE_URL=
ASAAS_WEBHOOK_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_URL=
PORT=3001
```

---

## 📡 Rotas da API

### Criar assinatura
```http
POST /api/asaas/create-subscription
```

### Webhook do Asaas
```http
POST /api/asaas/webhook
```

---

## 📦 Exemplo de payload

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

---

## ⚙️ Funcionalidades da API

- Validação de payload no backend  
- Criação automática de clientes no Asaas  
- Geração de assinaturas recorrentes  
- Cálculo dinâmico de vencimento  
- Registro no banco de dados  
- Retorno de link de pagamento ou QR Code PIX  

---

## 🔁 Webhook

O sistema:

- Valida o token de segurança  
- Evita duplicidade de eventos (idempotência)  
- Atualiza status da assinatura  
- Ativa/desativa plano automaticamente  

---

## 🖥️ Como rodar o projeto

```bash
# Frontend
npm run dev

# Backend
npm run dev:server

# Build
npm run build

# Rodar servidor com .env
npm run start:local
```

Durante o desenvolvimento, o Vite faz proxy de `/api` para:

```
http://127.0.0.1:3001
```

---

## 🔄 Fluxo do sistema

1. Usuário escolhe um plano  
2. Vai para `/checkout/:planKey`  
3. Preenche dados  
4. Frontend chama a API  
5. Backend cria assinatura no Asaas  
6. Usuário é redirecionado para pagamento  

---

## 📌 Status do projeto

🚧 Em desenvolvimento  

---

## 🧑‍💻 Autor

**Rodrigo Ferreira**  
🔗 https://github.com/Rodrigocodee
