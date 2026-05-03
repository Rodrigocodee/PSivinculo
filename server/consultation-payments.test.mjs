// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const asaasMocks = vi.hoisted(() => ({
  asaasRequest: vi.fn(),
  calculateNextDueDate: vi.fn(() => "2026-04-28"),
  findOrCreateCustomer: vi.fn(),
  getAsaasConfig: vi.fn(() => ({ apiKey: "sandbox-key", apiBaseUrl: "https://sandbox.asaas.com/api/v3" })),
  logAsaasEvent: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendPatientConsultationPaymentPendingEmail: vi.fn(),
  sendPatientConsultationPaymentConfirmedEmail: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => {
  let consultationRow = null;
  let psychologistRow = null;
  let patientRow = null;
  let notificationRows = [];
  let eventRows = [];

  function createSelectQuery(getRows) {
    const filters = [];
    let limitCount = null;
    let shouldReturnSingle = false;

    const query = {
      select() {
        return query;
      },
      eq(column, value) {
        filters.push((row) => row?.[column] === value);
        return query;
      },
      in(column, values) {
        filters.push((row) => values.includes(row?.[column]));
        return query;
      },
      limit(value) {
        limitCount = value;
        return query;
      },
      maybeSingle() {
        shouldReturnSingle = true;
        return query;
      },
      single() {
        shouldReturnSingle = true;
        return query;
      },
      then(resolve, reject) {
        let rows = getRows().filter((row) => filters.every((filter) => filter(row)));

        if (typeof limitCount === "number") {
          rows = rows.slice(0, limitCount);
        }

        return Promise.resolve({
          data: shouldReturnSingle ? rows[0] ?? null : rows,
          error: null,
        }).then(resolve, reject);
      },
    };

    return query;
  }

  function createUpdateQuery(getRows, payload) {
    const filters = [];
    let shouldReturnSingle = false;

    const query = {
      eq(column, value) {
        filters.push((row) => row?.[column] === value);
        return query;
      },
      in(column, values) {
        filters.push((row) => values.includes(row?.[column]));
        return query;
      },
      select() {
        return query;
      },
      maybeSingle() {
        shouldReturnSingle = true;
        return query;
      },
      single() {
        shouldReturnSingle = true;
        return query;
      },
      then(resolve, reject) {
        const rows = getRows().filter((row) => filters.every((filter) => filter(row)));

        for (const row of rows) {
          Object.assign(row, payload);
        }

        return Promise.resolve({
          data: shouldReturnSingle ? rows[0] ?? null : rows,
          error: null,
        }).then(resolve, reject);
      },
    };

    return query;
  }

  function createInsertQuery(getRows, payload) {
    const row = {
      id: payload.id || `row-${getRows().length + 1}`,
      ...payload,
    };
    getRows().push(row);
    let shouldReturnSingle = false;

    const query = {
      select() {
        return query;
      },
      maybeSingle() {
        shouldReturnSingle = true;
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve({
          data: shouldReturnSingle ? row : [row],
          error: null,
        }).then(resolve, reject);
      },
    };

    return query;
  }

  function buildClient() {
    return {
      from(table) {
        if (table === "consultas") {
          return {
            select() {
              return createSelectQuery(() => (consultationRow ? [consultationRow] : []));
            },
            update(payload) {
              return createUpdateQuery(() => (consultationRow ? [consultationRow] : []), payload);
            },
          };
        }

        if (table === "usuarios") {
          return {
            select() {
              return createSelectQuery(() => (psychologistRow ? [psychologistRow] : []));
            },
          };
        }

        if (table === "pacientes") {
          return {
            select() {
              return createSelectQuery(() => (patientRow ? [patientRow] : []));
            },
          };
        }

        if (table === "notificacoes") {
          return {
            select() {
              return createSelectQuery(() => notificationRows);
            },
            insert(payload) {
              return createInsertQuery(() => notificationRows, payload);
            },
          };
        }

        if (table === "consultation_email_events") {
          return {
            select() {
              return createSelectQuery(() => eventRows);
            },
            upsert(payload) {
              const existing = eventRows.find(
                (row) =>
                  row.consulta_id === payload.consulta_id &&
                  row.tipo_evento === payload.tipo_evento &&
                  row.destinatario_email === payload.destinatario_email,
              );
              if (!existing) {
                eventRows.push({
                  id: payload.id || `event-${eventRows.length + 1}`,
                  ...payload,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
            update(payload) {
              return createUpdateQuery(() => eventRows, payload);
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
      auth: {
        admin: {
          getUserById: vi.fn(async (userId) => ({
            data: {
              user: userId ? { id: userId, email: `${userId}@example.com` } : null,
            },
            error: userId ? null : { message: "not found" },
          })),
        },
      },
    };
  }

  const extractBearerToken = vi.fn(() => "psychologist-session-token");
  const resolveSupabaseAuthUser = vi.fn(async () => ({
    id: "psi-auth-1",
    email: "psi@example.com",
  }));
  const getRequestSupabaseClient = vi.fn(() => buildClient());
  const getServerSupabaseClient = vi.fn(() => buildClient());

  return {
    extractBearerToken,
    resolveSupabaseAuthUser,
    getRequestSupabaseClient,
    getServerSupabaseClient,
    reset() {
      consultationRow = {
        id: "consulta-1",
        psicologo_id: "psi-auth-1",
        paciente_id: "paciente-1",
        status: "confirmada",
        valor_consulta: null,
        data_consulta: "2099-05-10T14:00:00",
        status_pagamento: "nao_gerado",
        asaas_payment_id: null,
        asaas_invoice_url: null,
        asaas_bank_slip_url: null,
      };
      psychologistRow = {
        id: "psi-user-1",
        auth_id: "psi-auth-1",
        clinica_id: "clinic-1",
        nome: "Dra. Camila",
        email: "psi@example.com",
        tipo_recebimento: "asaas_split",
        asaas_wallet_id: "wallet_1234567890",
        percentual_repasse: 95,
        valor_consulta: "100,00",
        notification_preferences: {
          payments: true,
        },
      };
      patientRow = {
        id: "paciente-1",
        nome: "Paciente Teste",
        email: "paciente@example.com",
        telefone: "11999999999",
        cpf: "12345678901",
      };
      notificationRows = [];
      eventRows = [];
      extractBearerToken.mockClear();
      resolveSupabaseAuthUser.mockClear();
      getRequestSupabaseClient.mockClear();
      getServerSupabaseClient.mockClear();
    },
    setConsultationRow(value) {
      consultationRow = value;
    },
    setPsychologistRow(value) {
      psychologistRow = value;
    },
    getConsultationRow() {
      return consultationRow;
    },
    getNotificationRows() {
      return notificationRows;
    },
    getEventRows() {
      return eventRows;
    },
  };
});

vi.mock("./asaas.mjs", () => ({
  asaasRequest: asaasMocks.asaasRequest,
  calculateNextDueDate: asaasMocks.calculateNextDueDate,
  findOrCreateCustomer: asaasMocks.findOrCreateCustomer,
  getAsaasConfig: asaasMocks.getAsaasConfig,
  logAsaasEvent: asaasMocks.logAsaasEvent,
}));

vi.mock("./supabase.mjs", () => ({
  extractBearerToken: supabaseMocks.extractBearerToken,
  resolveSupabaseAuthUser: supabaseMocks.resolveSupabaseAuthUser,
  getRequestSupabaseClient: supabaseMocks.getRequestSupabaseClient,
  getServerSupabaseClient: supabaseMocks.getServerSupabaseClient,
}));

vi.mock("./email.mjs", () => ({
  sendPatientConsultationPaymentPendingEmail: emailMocks.sendPatientConsultationPaymentPendingEmail,
  sendPatientConsultationPaymentConfirmedEmail: emailMocks.sendPatientConsultationPaymentConfirmedEmail,
}));

import { createConsultationPayment } from "./consultation-payments.mjs";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "./professional-access.mjs";

describe("createConsultationPayment", () => {
  beforeEach(() => {
    supabaseMocks.reset();
    asaasMocks.asaasRequest.mockReset();
    asaasMocks.findOrCreateCustomer.mockReset();
    asaasMocks.getAsaasConfig.mockClear();
    asaasMocks.logAsaasEvent.mockClear();
    emailMocks.sendPatientConsultationPaymentPendingEmail.mockReset();
    emailMocks.sendPatientConsultationPaymentConfirmedEmail.mockReset();
    emailMocks.sendPatientConsultationPaymentPendingEmail.mockResolvedValue({
      emailId: "email-payment-pending",
    });

    asaasMocks.findOrCreateCustomer.mockResolvedValue({
      customer: {
        id: "cus_123",
      },
    });
    asaasMocks.asaasRequest.mockResolvedValue({
      id: "pay_123",
      invoiceUrl: "https://sandbox.asaas.com/i/pay_123",
      bankSlipUrl: null,
    });
  });

  it("fills valor_consulta from psychologist settings before creating the Asaas split payment", async () => {
    supabaseMocks.setConsultationRow({
      ...supabaseMocks.getConsultationRow(),
      psicologo_id: "legacy-psychologist-id",
    });

    const result = await createConsultationPayment(
      {
        consultaId: "consulta-1",
      },
      {
        env: {},
        requestHeaders: {
          authorization: "Bearer psychologist-session-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        created: true,
        paymentMode: "asaas_split",
        asaasPaymentId: "pay_123",
        invoiceUrl: "https://sandbox.asaas.com/i/pay_123",
      }),
    );
    expect(asaasMocks.asaasRequest).toHaveBeenCalledWith(
      expect.any(Object),
      "/payments",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          value: 100,
          externalReference: "consulta-1",
          split: [
            expect.objectContaining({
              walletId: "wallet_1234567890",
              percentualValue: 95,
            }),
          ],
        }),
      }),
    );
    expect(supabaseMocks.getConsultationRow()).toEqual(
      expect.objectContaining({
        valor_consulta: 100,
        asaas_payment_id: "pay_123",
        asaas_invoice_url: "https://sandbox.asaas.com/i/pay_123",
        status_pagamento: "aguardando_pagamento",
      }),
    );
    expect(asaasMocks.logAsaasEvent).toHaveBeenCalledWith(
      "consultation_payment_value_resolution",
      expect.objectContaining({
        origem: "pagamento",
        consultaId: "consulta-1",
        consultationId: "consulta-1",
        psicologoId: "legacy-psychologist-id",
        valorConsultaNaConsulta: null,
        valorConsultaNoUsuario: "100,00",
        "consulta.valor_consulta": null,
        "usuario.valor_consulta": "100,00",
        valorFinalUsado: 100,
        updatedFromSettings: true,
      }),
    );
    expect(supabaseMocks.getNotificationRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          usuario_id_destino: "legacy-psychologist-id",
          tipo: "pagamento_pendente",
          titulo: "Pagamento pendente",
          rota_destino: "/psi/recebimentos?consultaId=consulta-1",
          entidade_tipo: "consulta",
          entidade_id: "consulta-1",
        }),
        expect.objectContaining({
          usuario_id_destino: "paciente-1",
          tipo: "pagamento_pendente",
          titulo: "Pagamento pendente",
          rota_destino: "/paciente/agendamentos?consultaId=consulta-1",
          entidade_tipo: "consulta",
          entidade_id: "consulta-1",
        }),
      ]),
    );
    expect(emailMocks.sendPatientConsultationPaymentPendingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "paciente@example.com",
        consultationId: "consulta-1",
        patientName: "Paciente Teste",
        psychologistName: "Seu psicologo",
        amount: 100,
        paymentLink: "https://sandbox.asaas.com/i/pay_123",
      }),
      expect.any(Object),
    );
    expect(supabaseMocks.getEventRows()).toEqual([
      expect.objectContaining({
        consulta_id: "consulta-1",
        tipo_evento: "payment_pending_patient",
        destinatario_email: "paciente@example.com",
        status: "sent",
      }),
    ]);
  });

  it("keeps generated charge but skips payment notifications and email when payments are disabled", async () => {
    supabaseMocks.setPsychologistRow({
      id: "psi-user-1",
      auth_id: "psi-auth-1",
      clinica_id: "clinic-1",
      nome: "Dra. Camila",
      email: "psi@example.com",
      tipo_recebimento: "asaas_split",
      asaas_wallet_id: "wallet_1234567890",
      percentual_repasse: 95,
      valor_consulta: "100,00",
      notification_preferences: {
        payments: false,
      },
    });

    const result = await createConsultationPayment(
      {
        consultaId: "consulta-1",
      },
      {
        env: {},
        requestHeaders: {
          authorization: "Bearer psychologist-session-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        created: true,
        paymentStatus: "aguardando_pagamento",
      }),
    );
    expect(supabaseMocks.getNotificationRows()).toEqual([]);
    expect(emailMocks.sendPatientConsultationPaymentPendingEmail).not.toHaveBeenCalled();
    expect(supabaseMocks.getEventRows()).toEqual([]);
  });

  it("returns a clear error when split is active and no consultation value is configured", async () => {
    supabaseMocks.setPsychologistRow({
      id: "psi-user-1",
      auth_id: "psi-auth-1",
      clinica_id: "clinic-1",
      nome: "Dra. Camila",
      email: "psi@example.com",
      tipo_recebimento: "asaas_split",
      asaas_wallet_id: "wallet_1234567890",
      percentual_repasse: 95,
      valor_consulta: null,
    });

    await expect(
      createConsultationPayment(
        {
          consultaId: "consulta-1",
        },
        {
          env: {},
          requestHeaders: {
            authorization: "Bearer psychologist-session-token",
          },
        },
      ),
    ).rejects.toThrow(
      "Configure o valor da consulta em Consulta antes de usar pagamentos online.",
    );
  });

  it("blocks preview psychologists before creating a consultation charge", async () => {
    supabaseMocks.setPsychologistRow({
      id: "psi-user-1",
      auth_id: "psi-auth-1",
      clinica_id: "clinic-1",
      nome: "Dra. Preview",
      email: "psi@example.com",
      tipo_usuario: "psicologo",
      tipo_recebimento: "asaas_split",
      asaas_wallet_id: "wallet_1234567890",
      percentual_repasse: 95,
      valor_consulta: "100,00",
      plano_slug: "profissional",
      status_assinatura: "PENDING",
      assinatura_ativa: false,
    });

    await expect(
      createConsultationPayment(
        {
          consultaId: "consulta-1",
        },
        {
          env: {},
          requestHeaders: {
            authorization: "Bearer psychologist-session-token",
          },
        },
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: "PROFESSIONAL_PREVIEW_LOCKED",
      message: PREVIEW_FEATURE_LOCK_MESSAGE,
    });

    expect(asaasMocks.asaasRequest).not.toHaveBeenCalled();
    expect(supabaseMocks.getConsultationRow()).toEqual(
      expect.objectContaining({
        asaas_payment_id: null,
        status_pagamento: "nao_gerado",
      }),
    );
  });

  it("keeps external payments working even when the consultation has no configured value", async () => {
    supabaseMocks.setPsychologistRow({
      id: "psi-user-1",
      auth_id: "psi-auth-1",
      clinica_id: "clinic-1",
      nome: "Dra. Camila",
      email: "psi@example.com",
      tipo_recebimento: "externo",
      asaas_wallet_id: null,
      percentual_repasse: 95,
      valor_consulta: null,
    });

    const result = await createConsultationPayment(
      {
        consultaId: "consulta-1",
      },
      {
        env: {},
        requestHeaders: {
          authorization: "Bearer psychologist-session-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        paymentMode: "external",
        paymentStatus: "nao_gerado",
        created: false,
      }),
    );
    expect(asaasMocks.asaasRequest).not.toHaveBeenCalled();
    expect(supabaseMocks.getConsultationRow()).toEqual(
      expect.objectContaining({
        valor_consulta: null,
        status_pagamento: "nao_gerado",
      }),
    );
  });
});
