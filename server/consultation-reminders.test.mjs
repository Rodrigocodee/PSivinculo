// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const emailMocks = vi.hoisted(() => ({
  sendPatientConsultation12HourReminderEmail: vi.fn(),
  sendPatientConsultation1HourReminderEmail: vi.fn(),
  sendPsychologistConsultation1HourReminderEmail: vi.fn(),
}));

vi.mock("./email.mjs", () => ({
  sendPatientConsultation12HourReminderEmail:
    emailMocks.sendPatientConsultation12HourReminderEmail,
  sendPatientConsultation1HourReminderEmail: emailMocks.sendPatientConsultation1HourReminderEmail,
  sendPsychologistConsultation1HourReminderEmail:
    emailMocks.sendPsychologistConsultation1HourReminderEmail,
}));

import {
  CONSULTATION_REMINDER_EVENT_TYPES,
  processConsultationReminders,
} from "./consultation-reminders.mjs";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

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
    gte(column, value) {
      filters.push((row) => String(row?.[column] ?? "") >= value);
      return query;
    },
    lt(column, value) {
      filters.push((row) => String(row?.[column] ?? "") < value);
      return query;
    },
    in(column, values) {
      filters.push((row) => values.includes(row?.[column]));
      return query;
    },
    limit() {
      return query;
    },
    order() {
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
      const payload = {
        data: shouldReturnSingle ? filteredRows[0] ?? null : filteredRows,
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
      const matchedRows = rows.filter((row) => filters.every((filter) => filter(row)));

      for (const row of matchedRows) {
        Object.assign(row, updatePayload);
      }

      const payload = {
        data: shouldReturnSingle ? matchedRows[0] ?? null : matchedRows,
        error: null,
      };

      return Promise.resolve(payload).then(resolve, reject);
    },
  };

  return query;
}

function createMockClient(input) {
  const state = {
    consultations: input.consultations.map((row) => ({ ...row })),
    patients: input.patients.map((row) => ({ ...row })),
    users: input.users.map((row) => ({ ...row })),
    clinics: input.clinics.map((row) => ({ ...row })),
    events: input.events.map((row) => ({ ...row })),
    authUsers: { ...(input.authUsers || {}) },
  };

  function nextEventId() {
    return `event-${state.events.length + 1}`;
  }

  return {
    state,
    auth: {
      admin: {
        getUserById: vi.fn(async (userId) => {
          const user = state.authUsers[userId] || null;

          return {
            data: { user },
            error: user ? null : { message: "not found" },
          };
        }),
      },
    },
    from(tableName) {
      if (tableName === "consultas") {
        return createSelectQuery(state.consultations);
      }

      if (tableName === "pacientes") {
        return createSelectQuery(state.patients);
      }

      if (tableName === "usuarios") {
        return createSelectQuery(state.users);
      }

      if (tableName === "clinicas") {
        return createSelectQuery(state.clinics);
      }

      if (tableName === "consultation_email_events") {
        return {
          select() {
            return createSelectQuery(state.events);
          },
          upsert(payload) {
            const existingRow = state.events.find(
              (row) =>
                row.consulta_id === payload.consulta_id &&
                row.tipo_evento === payload.tipo_evento &&
                row.destinatario_email === payload.destinatario_email,
            );

            if (!existingRow) {
              state.events.push({
                id: payload.id || nextEventId(),
                ...payload,
              });
            }

            return Promise.resolve({
              data: null,
              error: null,
            });
          },
          update(updatePayload) {
            return createUpdateQuery(state.events, updatePayload);
          },
        };
      }

      throw new Error(`Unhandled table in mock client: ${tableName}`);
    },
  };
}

describe("processConsultationReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailMocks.sendPatientConsultation12HourReminderEmail.mockResolvedValue({
      emailId: "email-12h",
    });
    emailMocks.sendPatientConsultation1HourReminderEmail.mockResolvedValue({
      emailId: "email-1h-patient",
    });
    emailMocks.sendPsychologistConsultation1HourReminderEmail.mockResolvedValue({
      emailId: "email-1h-psychologist",
    });
  });

  it("supports dry-run across the 12h and 1h windows with private room links per recipient", async () => {
    const client = createMockClient({
      consultations: [
        {
          id: "consulta-12h",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-1",
          data_consulta: "2026-04-27T21:00:00",
          status: "confirmada",
          modalidade_consulta: "presencial",
          modalidade: null,
          local_presencial: "Clinica Central",
        },
        {
          id: "consulta-1h",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-1",
          data_consulta: "2026-04-27T10:00:00",
          status: "confirmada",
          modalidade_consulta: "online",
          modalidade: null,
          local_presencial: null,
        },
      ],
      patients: [
        {
          id: "paciente-1",
          clinica_id: "clinica-1",
          nome: "Ana",
          email: "ana@example.com",
          link_sessao_online: "https://meet.example.com/legacy-room-ana",
          link_sessao_online_paciente: "https://meet.example.com/guest-room-ana",
          link_sessao_online_psicologo: "https://meet.example.com/host-room-ana",
        },
      ],
      users: [
        {
          id: "psicologo-1",
          auth_id: "auth-psicologo-1",
          clinica_id: "clinica-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          link_sessao_online: "https://meet.example.com/global-room",
          info_online: null,
          mensagem_lembrete_sessao: null,
          local_presencial: "Clinica Central",
        },
      ],
      clinics: [
        {
          id: "clinica-1",
          notificacao_lembrete_consulta: true,
          template_mensagem_lembrete: null,
        },
      ],
      events: [],
    });
    const logger = createLogger();

    const result = await processConsultationReminders(
      {
        dryRun: true,
        referenceTime: "2026-04-27T12:00:00.000Z",
      },
      {
        client,
        env: {
          APP_BASE_URL: "https://app.psivinculo.test",
        },
        logger,
      },
    );

    expect(emailMocks.sendPatientConsultation12HourReminderEmail).not.toHaveBeenCalled();
    expect(emailMocks.sendPatientConsultation1HourReminderEmail).not.toHaveBeenCalled();
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).not.toHaveBeenCalled();
    expect(result.counts.consultationsMatched).toBe(2);
    expect(result.counts.eventsConsidered).toBe(3);
    expect(result.counts.eventsSent).toBe(0);
    expect(result.counts.eventsSkipped).toBe(3);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consultationId: "consulta-12h",
          eventType: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_12H_PATIENT,
          reason: "dry_run",
          roomLinkStatus: "missing",
          roomLinkSource: null,
        }),
        expect.objectContaining({
          consultationId: "consulta-1h",
          eventType: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PATIENT,
          reason: "dry_run",
          roomLinkStatus: "available",
          roomLinkSource: "pacientes.link_sessao_online_paciente",
        }),
        expect.objectContaining({
          consultationId: "consulta-1h",
          eventType: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PSYCHOLOGIST,
          reason: "dry_run",
          roomLinkStatus: "available",
          roomLinkSource: "pacientes.link_sessao_online_psicologo",
        }),
      ]),
    );
  });

  it("prevents duplicate sends for already-sent events and still sends the pending psychologist reminder", async () => {
    const client = createMockClient({
      consultations: [
        {
          id: "consulta-1h",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-1",
          data_consulta: "2026-04-27T10:00:00",
          status: "confirmada",
          modalidade_consulta: "online",
          modalidade: null,
          local_presencial: null,
        },
      ],
      patients: [
        {
          id: "paciente-1",
          clinica_id: "clinica-1",
          nome: "Ana",
          email: "ana@example.com",
          link_sessao_online: "https://meet.example.com/legacy-room-ana",
          link_sessao_online_paciente: "https://meet.example.com/guest-room-ana",
          link_sessao_online_psicologo: "https://meet.example.com/host-room-ana",
        },
      ],
      users: [
        {
          id: "psicologo-1",
          auth_id: "auth-psicologo-1",
          clinica_id: "clinica-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          link_sessao_online: "https://meet.example.com/global-room",
          info_online: null,
          mensagem_lembrete_sessao: null,
          local_presencial: null,
        },
      ],
      clinics: [
        {
          id: "clinica-1",
          notificacao_lembrete_consulta: true,
          template_mensagem_lembrete: null,
        },
      ],
      events: [
        {
          id: "event-existing",
          consulta_id: "consulta-1h",
          tipo_evento: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PATIENT,
          destinatario_email: "ana@example.com",
          status: "sent",
          enviado_em: "2026-04-27T12:59:00.000Z",
          erro: null,
          criado_em: "2026-04-27T12:58:00.000Z",
          atualizado_em: "2026-04-27T12:59:00.000Z",
        },
      ],
    });
    const logger = createLogger();

    const result = await processConsultationReminders(
      {
        referenceTime: "2026-04-27T12:00:00.000Z",
      },
      {
        client,
        env: {
          APP_BASE_URL: "https://app.psivinculo.test",
        },
        logger,
      },
    );

    expect(emailMocks.sendPatientConsultation1HourReminderEmail).not.toHaveBeenCalled();
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        consultationId: "consulta-1h",
        roomLink: "https://meet.example.com/host-room-ana",
      }),
      expect.any(Object),
    );
    expect(result.counts.eventsConsidered).toBe(2);
    expect(result.counts.eventsSent).toBe(1);
    expect(result.counts.eventsSkipped).toBe(1);
    expect(result.counts.duplicatesPrevented).toBe(1);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PATIENT,
          reason: "already_sent",
          status: "skipped",
          roomLinkStatus: "available",
          roomLinkSource: "pacientes.link_sessao_online_paciente",
        }),
        expect.objectContaining({
          eventType: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PSYCHOLOGIST,
          status: "sent",
          roomLinkStatus: "available",
          roomLinkSource: "pacientes.link_sessao_online_psicologo",
          emailId: "email-1h-psychologist",
        }),
      ]),
    );
  });

  it("skips reminders when the psychologist disabled appointment reminders", async () => {
    const client = createMockClient({
      consultations: [
        {
          id: "consulta-12h",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-1",
          data_consulta: "2026-04-27T21:00:00",
          status: "confirmada",
          modalidade_consulta: "presencial",
          modalidade: null,
          local_presencial: "Clinica Central",
        },
      ],
      patients: [
        {
          id: "paciente-1",
          clinica_id: "clinica-1",
          nome: "Ana",
          email: "ana@example.com",
          link_sessao_online: null,
          link_sessao_online_paciente: null,
          link_sessao_online_psicologo: null,
        },
      ],
      users: [
        {
          id: "psicologo-1",
          auth_id: "auth-psicologo-1",
          clinica_id: "clinica-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          link_sessao_online: null,
          info_online: null,
          mensagem_lembrete_sessao: null,
          local_presencial: "Clinica Central",
          notification_preferences: {
            appointment_reminder: false,
            patient_confirmation: true,
            payments: true,
            weekly_reports: false,
          },
        },
      ],
      clinics: [
        {
          id: "clinica-1",
          notificacao_lembrete_consulta: true,
          template_mensagem_lembrete: null,
        },
      ],
      events: [],
    });
    const logger = createLogger();

    const result = await processConsultationReminders(
      {
        referenceTime: "2026-04-27T12:00:00.000Z",
      },
      {
        client,
        env: {
          APP_BASE_URL: "https://app.psivinculo.test",
        },
        logger,
      },
    );

    expect(emailMocks.sendPatientConsultation12HourReminderEmail).not.toHaveBeenCalled();
    expect(emailMocks.sendPatientConsultation1HourReminderEmail).not.toHaveBeenCalled();
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).not.toHaveBeenCalled();
    expect(result.counts.eventsConsidered).toBe(1);
    expect(result.counts.eventsSent).toBe(0);
    expect(result.counts.eventsSkipped).toBe(1);
    expect(result.events).toEqual([
      expect.objectContaining({
        consultationId: "consulta-12h",
        eventType: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_12H_PATIENT,
        reason: "notification_preferences_disabled",
      }),
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      "[Psivinculo][notifications][notification_preferences_loaded]",
      expect.objectContaining({
        consultationId: "consulta-12h",
        psychologistId: "psicologo-1",
        source: "public.usuarios",
        preferences: expect.objectContaining({
          appointment_reminder: false,
        }),
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "[Psivinculo][notifications][notification_skipped_due_to_preferences]",
      expect.objectContaining({
        consultationId: "consulta-12h",
        preference: "appointment_reminder",
      }),
    );
  });

  it("uses patient and psychologist links per consultation without leaking them to another patient", async () => {
    const client = createMockClient({
      consultations: [
        {
          id: "consulta-paciente-a",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-a",
          data_consulta: "2026-04-27T10:00:00",
          status: "confirmada",
          modalidade_consulta: "online",
          modalidade: null,
          local_presencial: null,
        },
        {
          id: "consulta-paciente-b",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-b",
          data_consulta: "2026-04-27T10:04:00",
          status: "confirmada",
          modalidade_consulta: "online",
          modalidade: null,
          local_presencial: null,
        },
      ],
      patients: [
        {
          id: "paciente-a",
          clinica_id: "clinica-1",
          nome: "Ana",
          email: "ana@example.com",
          link_sessao_online: null,
          link_sessao_online_paciente: "https://meet.example.com/patient-a-room",
          link_sessao_online_psicologo: "https://meet.example.com/host-a-room",
        },
        {
          id: "paciente-b",
          clinica_id: "clinica-1",
          nome: "Beatriz",
          email: "bia@example.com",
          link_sessao_online: null,
          link_sessao_online_paciente: "https://meet.example.com/patient-b-room",
          link_sessao_online_psicologo: "https://meet.example.com/host-b-room",
        },
      ],
      users: [
        {
          id: "psicologo-1",
          auth_id: "auth-psicologo-1",
          clinica_id: "clinica-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          link_sessao_online: "https://meet.example.com/global-room",
          info_online: null,
          mensagem_lembrete_sessao: null,
          local_presencial: null,
        },
      ],
      clinics: [
        {
          id: "clinica-1",
          notificacao_lembrete_consulta: true,
          template_mensagem_lembrete: null,
        },
      ],
      events: [],
    });
    const logger = createLogger();

    const result = await processConsultationReminders(
      {
        referenceTime: "2026-04-27T12:00:00.000Z",
      },
      {
        client,
        env: {
          APP_BASE_URL: "https://app.psivinculo.test",
        },
        logger,
      },
    );

    expect(emailMocks.sendPatientConsultation1HourReminderEmail).toHaveBeenCalledTimes(2);
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).toHaveBeenCalledTimes(2);
    expect(emailMocks.sendPatientConsultation1HourReminderEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        consultationId: "consulta-paciente-a",
        patientName: "Ana",
        roomLink: "https://meet.example.com/patient-a-room",
      }),
      expect.any(Object),
    );
    expect(emailMocks.sendPatientConsultation1HourReminderEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        consultationId: "consulta-paciente-b",
        patientName: "Beatriz",
        roomLink: "https://meet.example.com/patient-b-room",
      }),
      expect.any(Object),
    );
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        consultationId: "consulta-paciente-a",
        roomLink: "https://meet.example.com/host-a-room",
      }),
      expect.any(Object),
    );
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        consultationId: "consulta-paciente-b",
        roomLink: "https://meet.example.com/host-b-room",
      }),
      expect.any(Object),
    );
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consultationId: "consulta-paciente-a",
          roomLinkStatus: "available",
          status: "sent",
        }),
        expect.objectContaining({
          consultationId: "consulta-paciente-b",
          roomLinkStatus: "available",
          status: "sent",
        }),
      ]),
    );
  });

  it("falls back to the patient guest link for the psychologist reminder when the host link is empty", async () => {
    const client = createMockClient({
      consultations: [
        {
          id: "consulta-fallback-guest",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-1",
          data_consulta: "2026-04-27T10:00:00",
          status: "confirmada",
          modalidade_consulta: "online",
          modalidade: null,
          local_presencial: null,
        },
      ],
      patients: [
        {
          id: "paciente-1",
          clinica_id: "clinica-1",
          nome: "Ana",
          email: "ana@example.com",
          link_sessao_online: null,
          link_sessao_online_paciente: "https://meet.example.com/guest-room-ana",
          link_sessao_online_psicologo: null,
        },
      ],
      users: [
        {
          id: "psicologo-1",
          auth_id: "auth-psicologo-1",
          clinica_id: "clinica-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          link_sessao_online: "https://meet.example.com/global-room",
          info_online: null,
          mensagem_lembrete_sessao: null,
          local_presencial: null,
        },
      ],
      clinics: [
        {
          id: "clinica-1",
          notificacao_lembrete_consulta: true,
          template_mensagem_lembrete: null,
        },
      ],
      events: [],
    });

    const result = await processConsultationReminders(
      {
        referenceTime: "2026-04-27T12:00:00.000Z",
      },
      {
        client,
        env: {
          APP_BASE_URL: "https://app.psivinculo.test",
        },
        logger: createLogger(),
      },
    );

    expect(emailMocks.sendPatientConsultation1HourReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        consultationId: "consulta-fallback-guest",
        roomLink: "https://meet.example.com/guest-room-ana",
      }),
      expect.any(Object),
    );
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        consultationId: "consulta-fallback-guest",
        roomLink: "https://meet.example.com/guest-room-ana",
      }),
      expect.any(Object),
    );
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PATIENT,
          roomLinkStatus: "available",
          roomLinkSource: "pacientes.link_sessao_online_paciente",
        }),
        expect.objectContaining({
          eventType: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PSYCHOLOGIST,
          roomLinkStatus: "fallback_used",
          roomLinkSource: "pacientes.link_sessao_online_paciente",
        }),
      ]),
    );
  });

  it("falls back to the legacy patient and global room links in the documented order", async () => {
    const client = createMockClient({
      consultations: [
        {
          id: "consulta-legacy",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-legacy",
          data_consulta: "2026-04-27T10:00:00",
          status: "confirmada",
          modalidade_consulta: "online",
          modalidade: null,
          local_presencial: null,
        },
        {
          id: "consulta-global",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-global",
          data_consulta: "2026-04-27T10:03:00",
          status: "confirmada",
          modalidade_consulta: "online",
          modalidade: null,
          local_presencial: null,
        },
      ],
      patients: [
        {
          id: "paciente-legacy",
          clinica_id: "clinica-1",
          nome: "Carlos",
          email: "carlos@example.com",
          link_sessao_online: "https://meet.example.com/legacy-patient-room",
          link_sessao_online_paciente: null,
          link_sessao_online_psicologo: null,
        },
        {
          id: "paciente-global",
          clinica_id: "clinica-1",
          nome: "Daniela",
          email: "daniela@example.com",
          link_sessao_online: null,
          link_sessao_online_paciente: null,
          link_sessao_online_psicologo: null,
        },
      ],
      users: [
        {
          id: "psicologo-1",
          auth_id: "auth-psicologo-1",
          clinica_id: "clinica-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          link_sessao_online: "https://meet.example.com/global-room",
          info_online: null,
          mensagem_lembrete_sessao: null,
          local_presencial: null,
        },
      ],
      clinics: [
        {
          id: "clinica-1",
          notificacao_lembrete_consulta: true,
          template_mensagem_lembrete: null,
        },
      ],
      events: [],
    });

    const result = await processConsultationReminders(
      {
        referenceTime: "2026-04-27T12:00:00.000Z",
      },
      {
        client,
        env: {
          APP_BASE_URL: "https://app.psivinculo.test",
        },
        logger: createLogger(),
      },
    );

    expect(emailMocks.sendPatientConsultation1HourReminderEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        consultationId: "consulta-legacy",
        roomLink: "https://meet.example.com/legacy-patient-room",
      }),
      expect.any(Object),
    );
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        consultationId: "consulta-legacy",
        roomLink: "https://meet.example.com/legacy-patient-room",
      }),
      expect.any(Object),
    );
    expect(emailMocks.sendPatientConsultation1HourReminderEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        consultationId: "consulta-global",
        roomLink: "https://meet.example.com/global-room",
      }),
      expect.any(Object),
    );
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        consultationId: "consulta-global",
        roomLink: "https://meet.example.com/global-room",
      }),
      expect.any(Object),
    );
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consultationId: "consulta-legacy",
          recipientType: "patient",
          roomLinkStatus: "fallback_used",
          roomLinkSource: "pacientes.link_sessao_online",
        }),
        expect.objectContaining({
          consultationId: "consulta-legacy",
          recipientType: "psychologist",
          roomLinkStatus: "fallback_used",
          roomLinkSource: "pacientes.link_sessao_online",
        }),
        expect.objectContaining({
          consultationId: "consulta-global",
          recipientType: "patient",
          roomLinkStatus: "fallback_used",
          roomLinkSource: "usuarios.link_sessao_online",
        }),
        expect.objectContaining({
          consultationId: "consulta-global",
          recipientType: "psychologist",
          roomLinkStatus: "fallback_used",
          roomLinkSource: "usuarios.link_sessao_online",
        }),
      ]),
    );
  });

  it("never sends the host link to the patient when only the psychologist field is configured", async () => {
    const client = createMockClient({
      consultations: [
        {
          id: "consulta-host-only",
          clinica_id: "clinica-1",
          psicologo_id: "psicologo-1",
          paciente_id: "paciente-1",
          data_consulta: "2026-04-27T10:00:00",
          status: "confirmada",
          modalidade_consulta: "online",
          modalidade: null,
          local_presencial: null,
        },
      ],
      patients: [
        {
          id: "paciente-1",
          clinica_id: "clinica-1",
          nome: "Ana",
          email: "ana@example.com",
          link_sessao_online: null,
          link_sessao_online_paciente: null,
          link_sessao_online_psicologo: "https://meet.example.com/host-room-ana",
        },
      ],
      users: [
        {
          id: "psicologo-1",
          auth_id: "auth-psicologo-1",
          clinica_id: "clinica-1",
          nome: "Dra. Camila",
          email: "camila@example.com",
          link_sessao_online: null,
          info_online: null,
          mensagem_lembrete_sessao: null,
          local_presencial: null,
        },
      ],
      clinics: [
        {
          id: "clinica-1",
          notificacao_lembrete_consulta: true,
          template_mensagem_lembrete: null,
        },
      ],
      events: [],
    });
    const logger = createLogger();

    const result = await processConsultationReminders(
      {
        referenceTime: "2026-04-27T12:00:00.000Z",
      },
      {
        client,
        env: {
          APP_BASE_URL: "https://app.psivinculo.test",
        },
        logger,
      },
    );

    expect(emailMocks.sendPatientConsultation1HourReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        consultationId: "consulta-host-only",
        roomLink: "",
      }),
      expect.any(Object),
    );
    expect(emailMocks.sendPsychologistConsultation1HourReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        consultationId: "consulta-host-only",
        roomLink: "https://meet.example.com/host-room-ana",
      }),
      expect.any(Object),
    );
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consultationId: "consulta-host-only",
          recipientType: "patient",
          roomLinkStatus: "missing",
          roomLinkSource: null,
        }),
        expect.objectContaining({
          consultationId: "consulta-host-only",
          recipientType: "psychologist",
          roomLinkStatus: "available",
          roomLinkSource: "pacientes.link_sessao_online_psicologo",
        }),
      ]),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "[Psivinculo][consultation-reminders][missing_room_link]",
      expect.objectContaining({
        consultationId: "consulta-host-only",
        eventType: CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PATIENT,
        recipientType: "patient",
      }),
    );
  });
});
