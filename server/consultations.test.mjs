// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const emailMocks = vi.hoisted(() => ({
  sendPatientConsultationConfirmationEmail: vi.fn(),
  sendPatientConsultationRescheduleEmail: vi.fn(),
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

import { updateConsultaAndNotify } from "./consultations.mjs";
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

function createMockClient(input) {
  const state = {
    consultas: input.consultas.map((row) => ({ ...row })),
    pacientes: input.pacientes.map((row) => ({ ...row })),
    usuarios: input.usuarios.map((row) => ({ ...row })),
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
        };
      }

      if (tableName === "pacientes") {
        return createSelectQuery(state.pacientes);
      }

      if (tableName === "usuarios") {
        return createSelectQuery(state.usuarios);
      }

      throw new Error(`Unhandled table in mock client: ${tableName}`);
    },
  };
}

describe("consultation notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
