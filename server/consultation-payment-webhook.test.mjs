// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const billingStoreMocks = vi.hoisted(() => ({
  registerAsaasWebhookEvent: vi.fn(),
  finalizeAsaasWebhookEvent: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendPatientConsultationPaymentPendingEmail: vi.fn(),
  sendPatientConsultationPaymentConfirmedEmail: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => {
  let consultationRows = [];
  let userRows = [];
  let patientRows = [];
  let notificationRows = [];
  let eventRows = [];
  let notificationInsertError = null;

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
      then(resolve, reject) {
        let rows = getRows().filter((row) => filters.every((filter) => filter(row)));
        if (typeof limitCount === "number") rows = rows.slice(0, limitCount);
        const selectedRows = rows.map((row) => ({ ...row }));

        return Promise.resolve({
          data: shouldReturnSingle ? selectedRows[0] ?? null : selectedRows,
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
      then(resolve, reject) {
        const rows = getRows().filter((row) => filters.every((filter) => filter(row)));

        for (const row of rows) {
          Object.assign(row, payload);
        }
        const selectedRows = rows.map((row) => ({ ...row }));

        return Promise.resolve({
          data: shouldReturnSingle ? selectedRows[0] ?? null : selectedRows,
          error: null,
        }).then(resolve, reject);
      },
    };

    return query;
  }

  function createInsertQuery(getRows, payload) {
    const insertedRow = {
      id: payload.id || `notif-${getRows().length + 1}`,
      ...payload,
    };
    getRows().push(insertedRow);
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
          data: shouldReturnSingle ? insertedRow : [insertedRow],
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
              return createSelectQuery(() => consultationRows);
            },
            update(payload) {
              return createUpdateQuery(() => consultationRows, payload);
            },
          };
        }

        if (table === "usuarios") {
          return {
            select() {
              return createSelectQuery(() => userRows);
            },
          };
        }

        if (table === "pacientes") {
          return {
            select() {
              return createSelectQuery(() => patientRows);
            },
          };
        }

        if (table === "notificacoes") {
          return {
            select() {
              return createSelectQuery(() => notificationRows);
            },
            insert(payload) {
              if (notificationInsertError) {
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
                      data: shouldReturnSingle ? null : [],
                      error: notificationInsertError,
                    }).then(resolve, reject);
                  },
                };

                return query;
              }

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

  return {
    getServerSupabaseClient: vi.fn(() => buildClient()),
    reset() {
      consultationRows = [
        {
          id: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
          status_pagamento: "aguardando_pagamento",
          asaas_payment_id: null,
          asaas_invoice_url: "https://sandbox.asaas.com/i/pay_1",
          asaas_bank_slip_url: null,
          valor_consulta: 100,
          data_consulta: "2099-05-10T14:00:00",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-1",
        },
      ];
      userRows = [
        {
          id: "psicologo-1",
          auth_id: "auth-psicologo-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          notification_preferences: {
            appointment_reminder: true,
            patient_confirmation: true,
            payments: true,
            weekly_reports: false,
          },
        },
      ];
      patientRows = [
        {
          id: "paciente-1",
          nome: "Ana",
          email: "ana@example.com",
        },
      ];
      notificationRows = [];
      eventRows = [];
      notificationInsertError = null;
      this.getServerSupabaseClient.mockClear();
    },
    setConsultationRows(rows) {
      consultationRows = rows.map((row) => ({ ...row }));
    },
    setUserRows(rows) {
      userRows = rows.map((row) => ({ ...row }));
    },
    setNotificationRows(rows) {
      notificationRows = rows.map((row) => ({ ...row }));
    },
    setEventRows(rows) {
      eventRows = rows.map((row) => ({ ...row }));
    },
    setNotificationInsertError(error) {
      notificationInsertError = error;
    },
    getConsultationRows() {
      return consultationRows;
    },
    getNotificationRows() {
      return notificationRows;
    },
    getEventRows() {
      return eventRows;
    },
  };
});

vi.mock("./billing-store.mjs", () => ({
  registerAsaasWebhookEvent: billingStoreMocks.registerAsaasWebhookEvent,
  finalizeAsaasWebhookEvent: billingStoreMocks.finalizeAsaasWebhookEvent,
}));

vi.mock("./supabase.mjs", () => ({
  getServerSupabaseClient: supabaseMocks.getServerSupabaseClient,
}));

vi.mock("./email.mjs", () => ({
  sendPatientConsultationPaymentPendingEmail: emailMocks.sendPatientConsultationPaymentPendingEmail,
  sendPatientConsultationPaymentConfirmedEmail: emailMocks.sendPatientConsultationPaymentConfirmedEmail,
}));

import { handleConsultationAsaasWebhook } from "./consultation-payment-webhook.mjs";

describe("handleConsultationAsaasWebhook", () => {
  let consoleInfoSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    supabaseMocks.reset();
    billingStoreMocks.registerAsaasWebhookEvent.mockReset();
    billingStoreMocks.finalizeAsaasWebhookEvent.mockReset();
    billingStoreMocks.registerAsaasWebhookEvent.mockResolvedValue({
      duplicate: false,
      event: null,
    });
    billingStoreMocks.finalizeAsaasWebhookEvent.mockResolvedValue(undefined);
    emailMocks.sendPatientConsultationPaymentPendingEmail.mockReset();
    emailMocks.sendPatientConsultationPaymentConfirmedEmail.mockReset();
    emailMocks.sendPatientConsultationPaymentConfirmedEmail.mockResolvedValue({
      emailId: "email-payment-confirmed",
    });
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("changes status_pagamento to pago when PAYMENT_RECEIVED arrives", async () => {
    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-payment-received",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_123",
          externalReference: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
          invoiceUrl: "https://sandbox.asaas.com/i/pay_123",
          bankSlipUrl: "https://sandbox.asaas.com/b/pdf/pay_123",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: false,
        eventType: "PAYMENT_RECEIVED",
        consultationId: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        paymentStatus: "pago",
      }),
    );
    expect(supabaseMocks.getConsultationRows()[0]).toEqual(
      expect.objectContaining({
        id: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        status_pagamento: "pago",
        asaas_payment_id: "pay_123",
        asaas_invoice_url: "https://sandbox.asaas.com/i/pay_123",
        asaas_bank_slip_url: "https://sandbox.asaas.com/b/pdf/pay_123",
      }),
    );
    expect(billingStoreMocks.finalizeAsaasWebhookEvent).toHaveBeenCalledWith(
      {
        eventId: "evt-payment-received",
        status: "processed",
      },
      expect.any(Object),
    );
    expect(supabaseMocks.getNotificationRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          usuario_id_destino: "auth-psicologo-1",
          tipo: "pagamento_recebido",
          titulo: "Pagamento recebido",
          mensagem: "Ana pagou uma consulta.",
          rota_destino: "/psi/recebimentos?consultaId=86dbde7b-38a5-4670-b6a3-48554b2c5666",
          entidade_tipo: "consulta",
          entidade_id: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        }),
        expect.objectContaining({
          usuario_id_destino: "paciente-1",
          tipo: "pagamento_recebido",
          titulo: "Pagamento recebido",
          mensagem: "Pagamento confirmado para sua consulta.",
          rota_destino: "/paciente/agendamentos?consultaId=86dbde7b-38a5-4670-b6a3-48554b2c5666",
          entidade_tipo: "consulta",
          entidade_id: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        }),
      ]),
    );
    expect(emailMocks.sendPatientConsultationPaymentConfirmedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@example.com",
        consultationId: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        patientName: "Ana",
        psychologistName: "Dra. Camila",
        amount: 100,
      }),
      expect.any(Object),
    );
    expect(supabaseMocks.getEventRows()).toEqual([
      expect.objectContaining({
        consulta_id: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        tipo_evento: "payment_confirmed_patient",
        destinatario_email: "ana@example.com",
        status: "sent",
      }),
    ]);
    expect(result.notification).toEqual(
      expect.objectContaining({
        psychologistNotification: expect.objectContaining({
          attempted: true,
          created: true,
        }),
        patientNotification: expect.objectContaining({
          attempted: true,
          created: true,
        }),
        patientEmail: expect.objectContaining({
          attempted: true,
          sent: true,
        }),
      }),
    );
  });

  it("changes status_pagamento to pago by asaas_payment_id before externalReference", async () => {
    supabaseMocks.setConsultationRows([
      {
        id: "1f5bcf34-ad49-4e5d-9d56-b7d42da0c83d",
        status_pagamento: "aguardando_pagamento",
        asaas_payment_id: "pay_existing_id",
        asaas_invoice_url: "https://sandbox.asaas.com/i/pay_existing_id",
        asaas_bank_slip_url: null,
        valor_consulta: 100,
        data_consulta: "2099-05-10T14:00:00",
        psicologo_id: "psicologo-1",
        paciente_id: "paciente-1",
      },
      {
        id: "4e364f6d-dc62-4d04-9bfd-b786da052e3e",
        status_pagamento: "aguardando_pagamento",
        asaas_payment_id: null,
        psicologo_id: "psicologo-1",
        paciente_id: "paciente-1",
      },
    ]);

    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-payment-received-by-payment-id",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_existing_id",
          externalReference: "4e364f6d-dc62-4d04-9bfd-b786da052e3e",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: false,
        eventType: "PAYMENT_RECEIVED",
        consultationId: "1f5bcf34-ad49-4e5d-9d56-b7d42da0c83d",
        paymentStatus: "pago",
      }),
    );
    expect(supabaseMocks.getConsultationRows()[0]).toEqual(
      expect.objectContaining({
        id: "1f5bcf34-ad49-4e5d-9d56-b7d42da0c83d",
        status_pagamento: "pago",
        asaas_payment_id: "pay_existing_id",
      }),
    );
    expect(supabaseMocks.getConsultationRows()[1]).toEqual(
      expect.objectContaining({
        id: "4e364f6d-dc62-4d04-9bfd-b786da052e3e",
        status_pagamento: "aguardando_pagamento",
      }),
    );
  });

  it("keeps status_pagamento as pago but skips in-app notification when payments are disabled", async () => {
    supabaseMocks.setUserRows([
      {
        id: "psicologo-1",
        auth_id: "auth-psicologo-1",
        notification_preferences: {
          payments: false,
        },
      },
    ]);

    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-payment-received-disabled",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_disabled",
          externalReference: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(supabaseMocks.getConsultationRows()[0]).toEqual(
      expect.objectContaining({
        status_pagamento: "pago",
        asaas_payment_id: "pay_disabled",
      }),
    );
    expect(supabaseMocks.getNotificationRows()).toEqual([]);
    expect(emailMocks.sendPatientConsultationPaymentConfirmedEmail).not.toHaveBeenCalled();
    expect(supabaseMocks.getEventRows()).toEqual([]);
    expect(result.notification).toEqual(
      expect.objectContaining({
        skippedReason: "notification_preferences_disabled",
        psychologistNotification: expect.objectContaining({
          created: false,
          skippedReason: "notification_preferences_disabled",
        }),
        patientEmail: expect.objectContaining({
          sent: false,
          skippedReason: "notification_preferences_disabled",
        }),
      }),
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[Psivinculo][notifications][payment_notification_skipped_due_to_preferences]",
      expect.objectContaining({
        consultationId: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        preference: "payments",
      }),
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[Psivinculo][notifications][payment_email_skipped_due_to_preferences]",
      expect.objectContaining({
        consultationId: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        preference: "payments",
      }),
    );
  });

  it("updates consultation payment status even when the payment confirmation email fails", async () => {
    emailMocks.sendPatientConsultationPaymentConfirmedEmail.mockRejectedValueOnce(
      new Error("resend unavailable"),
    );

    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-payment-received-email-fails",
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: "pay_email_fails",
          externalReference: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: false,
        eventType: "PAYMENT_CONFIRMED",
        consultationId: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        paymentStatus: "pago",
      }),
    );
    expect(supabaseMocks.getConsultationRows()[0]).toEqual(
      expect.objectContaining({
        status_pagamento: "pago",
        asaas_payment_id: "pay_email_fails",
      }),
    );
    expect(result.notification).toEqual(
      expect.objectContaining({
        psychologistNotification: expect.objectContaining({
          attempted: true,
          created: true,
        }),
        patientNotification: expect.objectContaining({
          attempted: true,
          created: true,
        }),
        patientEmail: expect.objectContaining({
          attempted: true,
          sent: false,
          skippedReason: "email_failed",
        }),
      }),
    );
    expect(supabaseMocks.getEventRows()).toEqual([
      expect.objectContaining({
        consulta_id: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        tipo_evento: "payment_confirmed_patient",
        destinatario_email: "ana@example.com",
        status: "failed",
        erro: "resend unavailable",
      }),
    ]);
    expect(billingStoreMocks.finalizeAsaasWebhookEvent).toHaveBeenCalledWith(
      {
        eventId: "evt-payment-received-email-fails",
        status: "processed",
      },
      expect.any(Object),
    );
  });

  it("updates consultation payment status even when notification creation fails", async () => {
    supabaseMocks.setNotificationInsertError({
      code: "42501",
      message: "permission denied for table notificacoes",
    });

    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-payment-received-notification-fails",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_notification_fails",
          externalReference: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: false,
        eventType: "PAYMENT_RECEIVED",
        consultationId: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        paymentStatus: "pago",
      }),
    );
    expect(supabaseMocks.getConsultationRows()[0]).toEqual(
      expect.objectContaining({
        status_pagamento: "pago",
        asaas_payment_id: "pay_notification_fails",
      }),
    );
    expect(result.notification).toEqual(
      expect.objectContaining({
        psychologistNotification: expect.objectContaining({
          attempted: true,
          created: false,
          skippedReason: "insert_failed",
        }),
        patientNotification: expect.objectContaining({
          attempted: true,
          created: false,
          skippedReason: "insert_failed",
        }),
      }),
    );
    expect(billingStoreMocks.finalizeAsaasWebhookEvent).toHaveBeenCalledWith(
      {
        eventId: "evt-payment-received-notification-fails",
        status: "processed",
      },
      expect.any(Object),
    );
  });

  it("does not create duplicated payment notifications or email for the same consultation", async () => {
    supabaseMocks.setNotificationRows([
      {
        id: "notif-existing",
        usuario_id_destino: "auth-psicologo-1",
        tipo: "pagamento_recebido",
        entidade_tipo: "consulta",
        entidade_id: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
      },
      {
        id: "notif-existing-patient",
        usuario_id_destino: "paciente-1",
        tipo: "pagamento_recebido",
        entidade_tipo: "consulta",
        entidade_id: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
      },
    ]);
    supabaseMocks.setEventRows([
      {
        id: "event-existing",
        consulta_id: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        tipo_evento: "payment_confirmed_patient",
        destinatario_email: "ana@example.com",
        status: "sent",
      },
    ]);

    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-payment-received-existing-notification",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_existing_notification",
          externalReference: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(supabaseMocks.getConsultationRows()[0]).toEqual(
      expect.objectContaining({
        status_pagamento: "pago",
        asaas_payment_id: "pay_existing_notification",
      }),
    );
    expect(supabaseMocks.getNotificationRows()).toHaveLength(2);
    expect(emailMocks.sendPatientConsultationPaymentConfirmedEmail).not.toHaveBeenCalled();
    expect(result.notification).toEqual(
      expect.objectContaining({
        psychologistNotification: expect.objectContaining({
          created: false,
          skippedReason: "already_exists",
        }),
        patientNotification: expect.objectContaining({
          created: false,
          skippedReason: "already_exists",
        }),
        patientEmail: expect.objectContaining({
          sent: false,
          skippedReason: "already_sent_or_processing",
        }),
      }),
    );
  });

  it("does not duplicate confirmed payment communications when the webhook event repeats", async () => {
    billingStoreMocks.registerAsaasWebhookEvent.mockResolvedValue({
      duplicate: true,
      event: { id: "evt-payment-received-duplicate" },
    });

    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-payment-received-duplicate",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_duplicate",
          externalReference: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: true,
        eventType: "PAYMENT_RECEIVED",
      }),
    );
    expect(supabaseMocks.getNotificationRows()).toEqual([]);
    expect(supabaseMocks.getEventRows()).toEqual([]);
    expect(emailMocks.sendPatientConsultationPaymentConfirmedEmail).not.toHaveBeenCalled();
  });

  it("changes status_pagamento to vencido when PAYMENT_OVERDUE arrives and falls back to asaas_payment_id", async () => {
    supabaseMocks.setConsultationRows([
      {
        id: "8b70b897-2d60-4981-9127-62f03755d506",
        status_pagamento: "aguardando_pagamento",
        asaas_payment_id: "pay_overdue_1",
        asaas_invoice_url: "https://sandbox.asaas.com/i/pay_overdue_1",
        psicologo_id: "psicologo-1",
        paciente_id: "paciente-1",
      },
    ]);

    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-payment-overdue",
        event: "PAYMENT_OVERDUE",
        payment: {
          id: "pay_overdue_1",
          externalReference: "",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: false,
        eventType: "PAYMENT_OVERDUE",
        consultationId: "8b70b897-2d60-4981-9127-62f03755d506",
        paymentStatus: "vencido",
      }),
    );
    expect(supabaseMocks.getConsultationRows()[0]).toEqual(
      expect.objectContaining({
        id: "8b70b897-2d60-4981-9127-62f03755d506",
        status_pagamento: "vencido",
        asaas_payment_id: "pay_overdue_1",
      }),
    );
    expect(supabaseMocks.getNotificationRows()).toEqual([
      expect.objectContaining({
        usuario_id_destino: "auth-psicologo-1",
        tipo: "pagamento_vencido",
        titulo: "Pagamento vencido",
        mensagem: "O pagamento de Ana venceu.",
        rota_destino: "/psi/recebimentos?consultaId=8b70b897-2d60-4981-9127-62f03755d506",
        entidade_tipo: "consulta",
        entidade_id: "8b70b897-2d60-4981-9127-62f03755d506",
      }),
    ]);
    expect(result.notification).toEqual(
      expect.objectContaining({
        attempted: true,
        created: true,
      }),
    );
  });

  it("keeps status_pagamento as vencido but skips overdue notification when payments are disabled", async () => {
    supabaseMocks.setConsultationRows([
      {
        id: "8b70b897-2d60-4981-9127-62f03755d506",
        status_pagamento: "aguardando_pagamento",
        asaas_payment_id: "pay_overdue_1",
        psicologo_id: "psicologo-1",
        paciente_id: "paciente-1",
      },
    ]);
    supabaseMocks.setUserRows([
      {
        id: "psicologo-1",
        auth_id: "auth-psicologo-1",
        notification_preferences: {
          payments: false,
        },
      },
    ]);

    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-payment-overdue-disabled",
        event: "PAYMENT_OVERDUE",
        payment: {
          id: "pay_overdue_1",
          externalReference: "",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(supabaseMocks.getConsultationRows()[0]).toEqual(
      expect.objectContaining({
        status_pagamento: "vencido",
        asaas_payment_id: "pay_overdue_1",
      }),
    );
    expect(supabaseMocks.getNotificationRows()).toEqual([]);
    expect(result.notification).toEqual(
      expect.objectContaining({
        attempted: true,
        created: false,
        skippedReason: "notification_preferences_disabled",
      }),
    );
  });

  it("ignores unknown events without throwing", async () => {
    const initialRow = { ...supabaseMocks.getConsultationRows()[0] };

    const result = await handleConsultationAsaasWebhook(
      {
        id: "evt-unknown",
        event: "PAYMENT_BANK_SLIP_VIEWED",
        payment: {
          id: "pay_unknown",
          externalReference: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
        },
      },
      {
        env: {
          ASAAS_WEBHOOK_TOKEN: "whsec_test_token",
        },
        requestHeaders: {
          "asaas-access-token": "whsec_test_token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: false,
        ignored: true,
        eventType: "PAYMENT_BANK_SLIP_VIEWED",
        consultationId: "86dbde7b-38a5-4670-b6a3-48554b2c5666",
      }),
    );
    expect(supabaseMocks.getConsultationRows()[0]).toEqual(initialRow);
  });
});
