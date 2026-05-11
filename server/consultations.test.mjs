// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const emailMocks = vi.hoisted(() => ({
  sendPatientConsultationConfirmationEmail: vi.fn(),
  sendPatientConsultationRescheduleEmail: vi.fn(),
  sendPatientConsultationScheduledEmail: vi.fn(),
}));

const paymentMocks = vi.hoisted(() => ({
  createConsultationPayment: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  userClient: null,
  serverClient: null,
  resolveSupabaseAuthUser: vi.fn(),
}));

vi.mock("./email.mjs", () => ({
  sendPatientConsultationConfirmationEmail: emailMocks.sendPatientConsultationConfirmationEmail,
  sendPatientConsultationRescheduleEmail: emailMocks.sendPatientConsultationRescheduleEmail,
  sendPatientConsultationScheduledEmail: emailMocks.sendPatientConsultationScheduledEmail,
}));

vi.mock("./consultation-payments.mjs", () => ({
  createConsultationPayment: paymentMocks.createConsultationPayment,
}));

vi.mock("./supabase.mjs", () => ({
  extractBearerToken: vi.fn((headers = {}) => {
    const authorization = headers.authorization || headers.Authorization || "";
    const match = String(authorization).match(/^Bearer\s+(.+)$/i);
    return match?.[1] || "";
  }),
  getRequestSupabaseClient: vi.fn(() => supabaseMocks.userClient),
  getServerSupabaseClient: vi.fn(() => supabaseMocks.serverClient),
  resolveSupabaseAuthUser: supabaseMocks.resolveSupabaseAuthUser,
}));

import { createConsultaAndNotify, updateConsultaAndNotify } from "./consultations.mjs";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "./professional-access.mjs";

function createSelectQuery(rows) {
  const filters = [];
  let shouldReturnSingle = false;

  const query = {
    select() {
      return query;
    },
    eq(column, value) {
      filters.push((row) => row?.[column] === value);
      return query;
    },
    limit() {
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
      const filteredRows = rows.filter((row) => filters.every((filter) => filter(row)));
      const selectedRows = filteredRows.map((row) => ({ ...row }));
      const payload = {
        data: shouldReturnSingle ? selectedRows[0] ?? null : selectedRows,
        error: null,
      };

      return Promise.resolve(payload).then(resolve, reject);
    },
  };

  return query;
}

function createUpdateQuery(rows, updatePayload) {
  const filters = [];
  let shouldReturnSingle = false;

  const query = {
    eq(column, value) {
      filters.push((row) => row?.[column] === value);
      return query;
    },
    select() {
      return query;
    },
    single() {
      shouldReturnSingle = true;
      return query;
    },
    maybeSingle() {
      shouldReturnSingle = true;
      return query;
    },
    then(resolve, reject) {
      const matchedRows = rows.filter((row) => filters.every((filter) => filter(row)));

      for (const row of matchedRows) {
        Object.assign(row, updatePayload);
      }

      const selectedRows = matchedRows.map((row) => ({ ...row }));
      const payload = {
        data: shouldReturnSingle ? selectedRows[0] ?? null : selectedRows,
        error: null,
      };

      return Promise.resolve(payload).then(resolve, reject);
    },
  };

  return query;
}

function createInsertQuery(rows, insertPayload) {
  let shouldReturnSingle = false;
  const insertedRows = (Array.isArray(insertPayload) ? insertPayload : [insertPayload]).map(
    (row, index) => ({
      id: row?.id || `inserted-${rows.length + index + 1}`,
      ...row,
    }),
  );

  const query = {
    select() {
      return query;
    },
    single() {
      shouldReturnSingle = true;
      return query;
    },
    maybeSingle() {
      shouldReturnSingle = true;
      return query;
    },
    then(resolve, reject) {
      rows.push(...insertedRows.map((row) => ({ ...row })));
      const selectedRows = insertedRows.map((row) => ({ ...row }));
      const payload = {
        data: shouldReturnSingle ? selectedRows[0] ?? null : selectedRows,
        error: null,
      };

      return Promise.resolve(payload).then(resolve, reject);
    },
  };

  return query;
}

function createMockClient(input) {
  const state = {
    consultas: input.consultas.map((row) => ({ ...row })),
    pacientes: input.pacientes.map((row) => ({ ...row })),
    usuarios: input.usuarios.map((row) => ({ ...row })),
    consultation_email_events: (input.consultation_email_events ?? []).map((row) => ({ ...row })),
  };

  return {
    state,
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({ data: { user: null }, error: { message: "not found" } })),
      },
    },
    from(tableName) {
      if (tableName === "consultas") {
        return {
          select() {
            return createSelectQuery(state.consultas);
          },
          update(payload) {
            return createUpdateQuery(state.consultas, payload);
          },
          insert(payload) {
            return createInsertQuery(state.consultas, payload);
          },
        };
      }

      if (tableName === "pacientes") {
        return createSelectQuery(state.pacientes);
      }

      if (tableName === "usuarios") {
        return createSelectQuery(state.usuarios);
      }

      if (tableName === "consultation_email_events") {
        return {
          select() {
            return createSelectQuery(state.consultation_email_events);
          },
          insert(payload) {
            return createInsertQuery(state.consultation_email_events, payload);
          },
        };
      }

      throw new Error(`Unhandled table in mock client: ${tableName}`);
    },
  };
}

describe("consultation notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailMocks.sendPatientConsultationConfirmationEmail.mockResolvedValue({
      emailId: "email-1",
    });
    emailMocks.sendPatientConsultationRescheduleEmail.mockResolvedValue({
      emailId: "email-2",
    });
    emailMocks.sendPatientConsultationScheduledEmail.mockResolvedValue({
      emailId: "email-3",
    });
    paymentMocks.createConsultationPayment.mockResolvedValue({
      consultationId: "consulta-1",
      paymentStatus: "aguardando_pagamento",
      success: true,
    });
    supabaseMocks.resolveSupabaseAuthUser.mockResolvedValue({ id: "auth-user-1" });
  });

  it("keeps confirmation and payment flow but skips patient email when patient_confirmation is disabled", async () => {
    const client = createMockClient({
      consultas: [
        {
          id: "consulta-1",
          paciente_id: "paciente-1",
          psicologo_id: "psicologo-1",
          data_consulta: "2026-04-27T10:00:00",
          data_consulta_solicitada_original: null,
          status: "solicitada",
          modalidade_consulta: "online",
          local_presencial: null,
        },
      ],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana",
          email: "ana@example.com",
        },
      ],
      usuarios: [
        {
          id: "psicologo-1",
          auth_id: "auth-psicologo-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          notification_preferences: {
            appointment_reminder: true,
            patient_confirmation: false,
            payments: true,
            weekly_reports: false,
          },
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      const result = await updateConsultaAndNotify(
        {
          consultaId: "consulta-1",
          updates: {
            status: "confirmada",
          },
        },
        {
          requestHeaders: {
            authorization: "Bearer token-1",
          },
          env: {
            APP_BASE_URL: "https://app.psivinculo.test",
          },
        },
      );

      expect(result.consultation.status).toBe("confirmada");
      expect(result.email).toEqual(
        expect.objectContaining({
          attempted: true,
          sent: false,
          event: "confirmation",
          skippedReason: "notification_preferences_disabled",
        }),
      );
      expect(emailMocks.sendPatientConsultationConfirmationEmail).not.toHaveBeenCalled();
      expect(paymentMocks.createConsultationPayment).toHaveBeenCalledWith(
        { consultaId: "consulta-1" },
        expect.objectContaining({
          requestHeaders: expect.objectContaining({
            authorization: "Bearer token-1",
          }),
        }),
      );
      expect(infoSpy).toHaveBeenCalledWith(
        "[Psivinculo][notifications][notification_skipped_due_to_preferences]",
        expect.objectContaining({
          consultationId: "consulta-1",
          event: "confirmation",
          preference: "patient_confirmation",
        }),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("blocks preview psychologists before updating consultation status", async () => {
    const client = createMockClient({
      consultas: [
        {
          id: "consulta-1",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-04-27T10:00:00",
          data_consulta_solicitada_original: null,
          status: "solicitada",
          modalidade_consulta: "online",
          local_presencial: null,
        },
      ],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana",
          email: "ana@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Preview",
          email: "preview@example.com",
          tipo_usuario: "psicologo",
          plano_slug: "profissional",
          status_assinatura: "PENDING",
          assinatura_ativa: false,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    supabaseMocks.resolveSupabaseAuthUser.mockResolvedValue({
      id: "auth-user-1",
      email: "preview@example.com",
      user_metadata: {
        tipo_usuario: "psicologo",
      },
    });

    await expect(
      updateConsultaAndNotify(
        {
          consultaId: "consulta-1",
          updates: {
            status: "confirmada",
          },
        },
        {
          requestHeaders: {
            authorization: "Bearer token-1",
          },
          env: {},
        },
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: "PROFESSIONAL_PREVIEW_LOCKED",
      message: PREVIEW_FEATURE_LOCK_MESSAGE,
    });

    expect(client.state.consultas[0].status).toBe("solicitada");
    expect(paymentMocks.createConsultationPayment).not.toHaveBeenCalled();
  });

  it("sends a confirmation email when a manual consultation is confirmed and the patient has email", async () => {
    const client = createMockClient({
      consultas: [
        {
          id: "consulta-1",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-10T15:30:00",
          data_consulta_solicitada_original: null,
          status: "pendente",
          modalidade_consulta: "online",
          local_presencial: null,
          valor_consulta: 180,
        },
      ],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana Manual",
          email: "ana.manual@example.com",
          link_sessao_online_paciente: "https://meet.example.com/ana",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
          notification_preferences: {
            patient_confirmation: true,
          },
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    supabaseMocks.resolveSupabaseAuthUser.mockResolvedValue({
      id: "auth-user-1",
      email: "camila@example.com",
      user_metadata: {
        tipo_usuario: "psicologo",
      },
    });

    const result = await updateConsultaAndNotify(
      {
        consultaId: "consulta-1",
        updates: {
          status: "confirmada",
        },
      },
      {
        requestHeaders: {
          authorization: "Bearer token-1",
        },
        env: {
          APP_BASE_URL: "https://app.psivinculo.test",
        },
      },
    );

    expect(result.consultation.status).toBe("confirmada");
    expect(result.email).toEqual(
      expect.objectContaining({
        attempted: true,
        sent: true,
        event: "confirmation",
      }),
    );
    expect(emailMocks.sendPatientConsultationConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana.manual@example.com",
        patientName: "Ana Manual",
        psychologistName: "Dra. Camila",
        appointmentDateTime: "2026-05-10T15:30:00",
        appointmentModality: "online",
        roomLink: "https://meet.example.com/ana",
        amount: "180",
      }),
      expect.objectContaining({
        baseUrl: "https://app.psivinculo.test",
      }),
    );
  });

  it("skips the confirmation email when the confirmed consultation has no patient email", async () => {
    const client = createMockClient({
      consultas: [
        {
          id: "consulta-1",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-10T15:30:00",
          data_consulta_solicitada_original: null,
          status: "pendente",
          modalidade_consulta: null,
          local_presencial: null,
        },
      ],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana Sem Email",
          email: null,
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    supabaseMocks.resolveSupabaseAuthUser.mockResolvedValue({
      id: "auth-user-1",
      email: "camila@example.com",
      user_metadata: {
        tipo_usuario: "psicologo",
      },
    });

    const result = await updateConsultaAndNotify(
      {
        consultaId: "consulta-1",
        updates: {
          status: "confirmada",
        },
      },
      {
        requestHeaders: {
          authorization: "Bearer token-1",
        },
        env: {},
      },
    );

    expect(result.consultation.status).toBe("confirmada");
    expect(result.email).toEqual(
      expect.objectContaining({
        attempted: true,
        sent: false,
        event: "confirmation",
        skippedReason: "missing_patient_email",
      }),
    );
    expect(emailMocks.sendPatientConsultationConfirmationEmail).not.toHaveBeenCalled();
  });

  it("uses the consultation email fallback when the patient row has no email", async () => {
    const client = createMockClient({
      consultas: [
        {
          id: "consulta-1",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-10T15:30:00",
          data_consulta_solicitada_original: null,
          status: "pendente",
          modalidade_consulta: "online",
          local_presencial: null,
          paciente_email: "solicitacao@example.com",
        },
      ],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana Solicitacao",
          email: null,
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    supabaseMocks.resolveSupabaseAuthUser.mockResolvedValue({
      id: "auth-user-1",
      email: "camila@example.com",
      user_metadata: {
        tipo_usuario: "psicologo",
      },
    });

    await updateConsultaAndNotify(
      {
        consultaId: "consulta-1",
        updates: {
          status: "confirmada",
        },
      },
      {
        requestHeaders: {
          authorization: "Bearer token-1",
        },
        env: {},
      },
    );

    expect(emailMocks.sendPatientConsultationConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "solicitacao@example.com",
        patientName: "Ana Solicitacao",
      }),
      expect.any(Object),
    );
  });

  it("keeps the consultation confirmed when the confirmation email fails", async () => {
    const client = createMockClient({
      consultas: [
        {
          id: "consulta-1",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-10T15:30:00",
          data_consulta_solicitada_original: null,
          status: "pendente",
          modalidade_consulta: "presencial",
          local_presencial: "Sala 2",
        },
      ],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana Falha Email",
          email: "ana.falha@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    supabaseMocks.resolveSupabaseAuthUser.mockResolvedValue({
      id: "auth-user-1",
      email: "camila@example.com",
      user_metadata: {
        tipo_usuario: "psicologo",
      },
    });
    emailMocks.sendPatientConsultationConfirmationEmail.mockRejectedValueOnce(
      new Error("Resend unavailable"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await updateConsultaAndNotify(
        {
          consultaId: "consulta-1",
          updates: {
            status: "confirmada",
          },
        },
        {
          requestHeaders: {
            authorization: "Bearer token-1",
          },
          env: {},
        },
      );

      expect(result.consultation.status).toBe("confirmada");
      expect(client.state.consultas[0].status).toBe("confirmada");
      expect(result.email).toEqual(
        expect.objectContaining({
          attempted: true,
          sent: false,
          event: "confirmation",
          skippedReason: "email_send_failed",
        }),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "[Psivinculo][consultation-email][send_failed]",
        expect.objectContaining({
          consultationId: "consulta-1",
          patientId: "paciente-1",
          patientEmail: "an***a@example.com",
          event: "confirmation",
        }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("sends confirmation email to a patient without an Auth account when pacientes has email", async () => {
    const client = createMockClient({
      consultas: [
        {
          id: "consulta-1",
          paciente_id: "paciente-manual-sem-auth",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-10T15:30:00",
          data_consulta_solicitada_original: null,
          status: "pendente",
          modalidade_consulta: "presencial",
          local_presencial: "Rua Clinica, 123",
        },
      ],
      pacientes: [
        {
          id: "paciente-manual-sem-auth",
          nome: "Ana Sem Auth",
          email: "ana.sem.auth@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    supabaseMocks.resolveSupabaseAuthUser.mockResolvedValue({
      id: "auth-user-1",
      email: "camila@example.com",
      user_metadata: {
        tipo_usuario: "psicologo",
      },
    });

    await updateConsultaAndNotify(
      {
        consultaId: "consulta-1",
        updates: {
          status: "confirmada",
        },
      },
      {
        requestHeaders: {
          authorization: "Bearer token-1",
        },
        env: {},
      },
    );

    expect(client.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(emailMocks.sendPatientConsultationConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana.sem.auth@example.com",
        patientName: "Ana Sem Auth",
        presentialLocation: "Rua Clinica, 123",
      }),
      expect.any(Object),
    );
  });

  it("sends a scheduled email when creating a consultation for a registered patient with email", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana Criacao",
          email: "ana.criacao@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    supabaseMocks.resolveSupabaseAuthUser.mockResolvedValue({
      id: "auth-user-1",
      email: "camila@example.com",
      user_metadata: {
        tipo_usuario: "psicologo",
      },
    });

    const result = await createConsultaAndNotify(
      {
        consulta: {
          id: "consulta-criada-1",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T09:00:00",
          status: "pendente",
          modalidade_consulta: "online",
          valor_consulta: 200,
        },
      },
      {
        requestHeaders: {
          authorization: "Bearer token-1",
        },
        env: {
          APP_BASE_URL: "https://app.psivinculo.test",
        },
      },
    );

    expect(result.consultation.id).toBe("inserted-1");
    expect(result.email).toEqual(
      expect.objectContaining({
        attempted: true,
        sent: true,
        event: "scheduled",
      }),
    );
    expect(emailMocks.sendPatientConsultationScheduledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana.criacao@example.com",
        patientName: "Ana Criacao",
        psychologistName: "Dra. Camila",
        appointmentDateTime: "2026-05-12T09:00:00",
        status: "confirmada",
      }),
      expect.objectContaining({
        baseUrl: "https://app.psivinculo.test",
      }),
    );
    expect(client.state.consultation_email_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consulta_id: "inserted-1",
          tipo_evento: "scheduled_patient",
          destinatario_email: "ana.criacao@example.com",
          status: "sent",
        }),
      ]),
    );
    expect(result.consultation.status).toBe("confirmada");
    expect(client.state.consultas[0].status).toBe("confirmada");
    expect(paymentMocks.createConsultationPayment).not.toHaveBeenCalled();
  });

  it("creates a confirmed consultation without site billing when charge mode is none", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-sem-cobranca",
          nome: "Ana Sem Cobranca",
          email: "ana.sem.cobranca@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
          tipo_recebimento: "asaas_split",
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;

    const result = await createConsultaAndNotify(
      {
        chargeMode: "none",
        consulta: {
          paciente_id: "paciente-sem-cobranca",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T09:30:00",
          status: "solicitada",
          valor_consulta: 200,
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(result.consultation.status).toBe("confirmada");
    expect(result.payment).toBeNull();
    expect(client.state.consultas[0]).toEqual(
      expect.objectContaining({
        paciente_id: "paciente-sem-cobranca",
        status: "confirmada",
      }),
    );
    expect(paymentMocks.createConsultationPayment).not.toHaveBeenCalled();
  });

  it("creates or associates a site payment when charge mode is site", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-cobranca",
          nome: "Ana Cobranca",
          email: "ana.cobranca@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
          tipo_recebimento: "asaas_split",
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    paymentMocks.createConsultationPayment.mockResolvedValueOnce({
      consultationId: "inserted-1",
      paymentMode: "asaas_split",
      paymentStatus: "aguardando_pagamento",
      created: true,
      reusedExisting: false,
      success: true,
      asaasPaymentId: "pay-1",
      invoiceUrl: "https://pay.example.com/invoice",
      bankSlipUrl: null,
      billingType: "UNDEFINED",
      externalReference: "inserted-1",
      splitSent: true,
      walletIdMasked: "wal***123",
      payoutPercentage: 95,
      message: null,
      errorCode: null,
    });

    const result = await createConsultaAndNotify(
      {
        chargeMode: "site",
        consulta: {
          paciente_id: "paciente-cobranca",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T10:30:00",
          status: "pendente",
          valor_consulta: 200,
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(result.consultation.status).toBe("confirmada");
    expect(result.payment).toEqual(
      expect.objectContaining({
        consultationId: "inserted-1",
        paymentStatus: "aguardando_pagamento",
        created: true,
      }),
    );
    expect(paymentMocks.createConsultationPayment).toHaveBeenCalledTimes(1);
    expect(paymentMocks.createConsultationPayment).toHaveBeenCalledWith(
      { consultaId: "inserted-1" },
      expect.objectContaining({
        requestHeaders: expect.objectContaining({
          authorization: "Bearer token-1",
        }),
      }),
    );
  });

  it("keeps the consultation created when site payment creation fails", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-cobranca-falha",
          nome: "Ana Cobranca Falha",
          email: "ana.cobranca.falha@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
          tipo_recebimento: "asaas_split",
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    paymentMocks.createConsultationPayment.mockRejectedValueOnce(new Error("Asaas unavailable"));

    const result = await createConsultaAndNotify(
      {
        chargeMode: "site",
        consulta: {
          paciente_id: "paciente-cobranca-falha",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T10:45:00",
          status: "pendente",
          valor_consulta: 200,
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(result.consultation.status).toBe("confirmada");
    expect(result.payment).toEqual(
      expect.objectContaining({
        consultationId: "inserted-1",
        paymentStatus: "erro",
        success: false,
        errorCode: "CONSULTATION_PAYMENT_CREATE_FAILED",
      }),
    );
    expect(client.state.consultas[0].status).toBe("confirmada");
  });

  it("does not create site billing for psychologists without platform receivables enabled", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-externo",
          nome: "Ana Pagamento Externo",
          email: "ana.externo@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
          tipo_recebimento: "externo",
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;

    const result = await createConsultaAndNotify(
      {
        chargeMode: "site",
        consulta: {
          paciente_id: "paciente-externo",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T11:00:00",
          status: "pendente",
          valor_consulta: 200,
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(result.consultation.status).toBe("confirmada");
    expect(result.payment).toBeNull();
    expect(paymentMocks.createConsultationPayment).not.toHaveBeenCalled();
  });

  it("includes site payment details in the scheduled email after creating a charged consultation", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-email-cobranca",
          nome: "Ana Email Cobranca",
          email: "ana.email.cobranca@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
          tipo_recebimento: "asaas_split",
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    paymentMocks.createConsultationPayment.mockImplementationOnce(async () => {
      Object.assign(client.state.consultas[0], {
        status_pagamento: "aguardando_pagamento",
        asaas_invoice_url: "https://pay.example.com/charged",
      });

      return {
        consultationId: "inserted-1",
        paymentMode: "asaas_split",
        paymentStatus: "aguardando_pagamento",
        created: true,
        reusedExisting: false,
        success: true,
        asaasPaymentId: "pay-2",
        invoiceUrl: "https://pay.example.com/charged",
        bankSlipUrl: null,
        billingType: "UNDEFINED",
        externalReference: "inserted-1",
        splitSent: true,
        walletIdMasked: "wal***123",
        payoutPercentage: 95,
        message: null,
        errorCode: null,
      };
    });

    await createConsultaAndNotify(
      {
        chargeMode: "site",
        consulta: {
          paciente_id: "paciente-email-cobranca",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T11:30:00",
          status: "confirmada",
          valor_consulta: 200,
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(emailMocks.sendPatientConsultationScheduledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana.email.cobranca@example.com",
        status: "confirmada",
        paymentStatus: "aguardando_pagamento",
        paymentLink: "https://pay.example.com/charged",
      }),
      expect.any(Object),
    );
  });

  it("sends a scheduled email to a patient without an Auth account when pacientes has email", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-sem-auth",
          nome: "Paciente Sem Auth",
          email: "sem.auth@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;

    await createConsultaAndNotify(
      {
        consulta: {
          id: "consulta-sem-auth",
          paciente_id: "paciente-sem-auth",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T10:00:00",
          status: "solicitada",
        },
      },
      {
        requestHeaders: {
          authorization: "Bearer token-1",
        },
        env: {},
      },
    );

    expect(client.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(emailMocks.sendPatientConsultationScheduledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sem.auth@example.com",
        status: "confirmada",
      }),
      expect.any(Object),
    );
  });

  it("forces scheduled emails for psychologist-created consultations to confirmed status", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana Status",
          email: "ana.status@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;

    await createConsultaAndNotify(
      {
        consulta: {
          id: "consulta-solicitada",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T11:00:00",
          status: "solicitada",
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );
    await createConsultaAndNotify(
      {
        consulta: {
          id: "consulta-confirmada",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T12:00:00",
          status: "confirmada",
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(emailMocks.sendPatientConsultationScheduledEmail).toHaveBeenCalledTimes(2);
    expect(emailMocks.sendPatientConsultationScheduledEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "confirmada" }),
      expect.any(Object),
    );
    expect(emailMocks.sendPatientConsultationScheduledEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "confirmada" }),
      expect.any(Object),
    );
  });

  it("skips scheduled email when creating a consultation without patient email", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-sem-email",
          nome: "Paciente Sem Email",
          email: null,
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;

    const result = await createConsultaAndNotify(
      {
        consulta: {
          id: "consulta-sem-email",
          paciente_id: "paciente-sem-email",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T13:00:00",
          status: "pendente",
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(result.consultation.id).toBe("inserted-1");
    expect(result.email).toEqual(
      expect.objectContaining({
        attempted: false,
        sent: false,
        event: "scheduled",
        skippedReason: "missing_patient_email",
      }),
    );
    expect(emailMocks.sendPatientConsultationScheduledEmail).not.toHaveBeenCalled();
  });

  it("keeps consultation created when scheduled email fails", async () => {
    const client = createMockClient({
      consultas: [],
      pacientes: [
        {
          id: "paciente-email-falha",
          nome: "Paciente Email Falha",
          email: "falha@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;
    emailMocks.sendPatientConsultationScheduledEmail.mockRejectedValueOnce(
      new Error("Resend unavailable"),
    );

    const result = await createConsultaAndNotify(
      {
        consulta: {
          id: "consulta-email-falha",
          paciente_id: "paciente-email-falha",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T14:00:00",
          status: "pendente",
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(result.consultation.id).toBe("inserted-1");
    expect(client.state.consultas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "inserted-1",
        }),
      ]),
    );
    expect(result.email).toEqual(
      expect.objectContaining({
        attempted: true,
        sent: false,
        event: "scheduled",
        skippedReason: "email_send_failed",
      }),
    );
  });

  it("does not duplicate scheduled email on simple consultation updates", async () => {
    const client = createMockClient({
      consultas: [
        {
          id: "consulta-notificada",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T15:00:00",
          status: "pendente",
          observacoes: null,
        },
      ],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana Update",
          email: "ana.update@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
      consultation_email_events: [
        {
          id: "evt-1",
          consulta_id: "consulta-notificada",
          tipo_evento: "scheduled_patient",
          destinatario_email: "ana.update@example.com",
          status: "sent",
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;

    const result = await updateConsultaAndNotify(
      {
        consultaId: "consulta-notificada",
        updates: {
          observacoes: "Observacao atualizada",
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(result.email).toEqual(
      expect.objectContaining({
        attempted: false,
        sent: false,
        skippedReason: "not_applicable",
      }),
    );
    expect(emailMocks.sendPatientConsultationScheduledEmail).not.toHaveBeenCalled();
    expect(emailMocks.sendPatientConsultationConfirmationEmail).not.toHaveBeenCalled();
  });

  it("does not send immediate confirmation email when the scheduled email was already sent", async () => {
    const client = createMockClient({
      consultas: [
        {
          id: "consulta-ja-notificada",
          paciente_id: "paciente-1",
          psicologo_id: "psi-user-1",
          data_consulta: "2026-05-12T16:00:00",
          status: "solicitada",
        },
      ],
      pacientes: [
        {
          id: "paciente-1",
          nome: "Ana Notificada",
          email: "ana.notificada@example.com",
        },
      ],
      usuarios: [
        {
          id: "psi-user-1",
          auth_id: "auth-user-1",
          nome: "Dra. Camila",
          tipo_usuario: "psicologo",
          assinatura_ativa: true,
        },
      ],
      consultation_email_events: [
        {
          id: "evt-1",
          consulta_id: "consulta-ja-notificada",
          tipo_evento: "scheduled_patient",
          destinatario_email: "ana.notificada@example.com",
          status: "sent",
        },
      ],
    });
    supabaseMocks.userClient = client;
    supabaseMocks.serverClient = client;

    const result = await updateConsultaAndNotify(
      {
        consultaId: "consulta-ja-notificada",
        updates: {
          status: "confirmada",
        },
      },
      {
        requestHeaders: { authorization: "Bearer token-1" },
        env: {},
      },
    );

    expect(result.consultation.status).toBe("confirmada");
    expect(result.email).toEqual(
      expect.objectContaining({
        attempted: false,
        sent: false,
        event: "confirmation",
        skippedReason: "scheduled_email_already_sent",
      }),
    );
    expect(emailMocks.sendPatientConsultationConfirmationEmail).not.toHaveBeenCalled();
  });
});
