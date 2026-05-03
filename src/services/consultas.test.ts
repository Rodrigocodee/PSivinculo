import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type MutableRecord = Record<string, unknown>;
  const getSession = vi.fn(async () => ({
    data: {
      session: {
        access_token: "psychologist-session-token",
      },
    },
  }));
  let scope = {
    userId: "psi-auth-1",
    psychologistId: "psi-1",
    psychologistIds: ["psi-1", "psi-auth-1"],
    clinicId: "clinic-1",
    hasProfessionalAccess: true,
  };
  const getPsychologistServiceScope = vi.fn(async () => scope);
  const getCurrentPsychologistConsultationSettings = vi.fn(async () => ({
    consultationPrice: 100,
    consultationDurationMinutes: 50,
    consultationModality: "hibrido",
    attendsPresential: true,
    attendsOnline: true,
    presentialLocation: "",
    onlineSessionLink: "",
    sessionReminderMessage: "",
    psychologistId: "psi-1",
    sourceTable: "usuarios",
  }));
  const getPsychologistConsultationSettingsById = vi.fn(async () => ({
    consultationPrice: 100,
    consultationDurationMinutes: 50,
    consultationModality: "hibrido",
    attendsPresential: true,
    attendsOnline: true,
    presentialLocation: "",
    onlineSessionLink: "",
    sessionReminderMessage: "",
    psychologistId: "psi-1",
    sourceTable: "usuarios",
  }));
  const getPsychologistAvailabilityById = vi.fn(async () => ({
    psychologistId: "psi-1",
    consultationDurationMinutes: 50,
    sourceTable: "usuarios",
    schedule: [
      { key: "segunda", label: "Segunda", dayOfWeek: 1, enabled: true, start: "08:00", end: "18:00" },
      { key: "terca", label: "Terca", dayOfWeek: 2, enabled: true, start: "08:00", end: "18:00" },
      { key: "quarta", label: "Quarta", dayOfWeek: 3, enabled: true, start: "08:00", end: "18:00" },
      { key: "quinta", label: "Quinta", dayOfWeek: 4, enabled: true, start: "08:00", end: "18:00" },
      { key: "sexta", label: "Sexta", dayOfWeek: 5, enabled: true, start: "08:00", end: "18:00" },
      { key: "sabado", label: "Sabado", dayOfWeek: 6, enabled: false, start: "08:00", end: "12:00" },
      { key: "domingo", label: "Domingo", dayOfWeek: 0, enabled: false, start: "08:00", end: "12:00" },
    ],
  }));
  let insertedRows: MutableRecord[] | null = null;
  let consultationRows: MutableRecord[] = [];
  const from = vi.fn((table: string) => {
    if (table !== "consultas") {
      throw new Error(`Unexpected table: ${table}`);
    }

    const state: {
      inColumn?: string;
      inValues?: string[];
      gteColumn?: string;
      gteValue?: string;
      lteColumn?: string;
      lteValue?: string;
    } = {};

    const selectQuery = {
      in(column: string, values: string[]) {
        state.inColumn = column;
        state.inValues = values;
        return selectQuery;
      },
      eq() {
        return selectQuery;
      },
      gte(column: string, value: string) {
        state.gteColumn = column;
        state.gteValue = value;
        return selectQuery;
      },
      lte(column: string, value: string) {
        state.lteColumn = column;
        state.lteValue = value;
        return selectQuery;
      },
      then(
        resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        let data = consultationRows.slice();

        if (state.inColumn && state.inValues) {
          data = data.filter((row) =>
            state.inValues?.includes(String(row[state.inColumn!] || "")),
          );
        }

        if (state.gteColumn && state.gteValue) {
          data = data.filter((row) => String(row[state.gteColumn!] || "") >= state.gteValue!);
        }

        if (state.lteColumn && state.lteValue) {
          data = data.filter((row) => String(row[state.lteColumn!] || "") <= state.lteValue!);
        }

        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };

    return {
      select: vi.fn(() => selectQuery),
      insert: vi.fn((rows: MutableRecord[]) => {
        insertedRows = rows;

        return {
          select: vi.fn(async () => ({
            data: rows,
            error: null,
          })),
        };
      }),
    };
  });
  const rpc = vi.fn();

  return {
    getSession,
    getPsychologistServiceScope,
    getCurrentPsychologistConsultationSettings,
    getPsychologistConsultationSettingsById,
    getPsychologistAvailabilityById,
    from,
    rpc,
    reset() {
      getSession.mockClear();
      getPsychologistServiceScope.mockClear();
      getCurrentPsychologistConsultationSettings.mockClear();
      getPsychologistConsultationSettingsById.mockClear();
      getPsychologistAvailabilityById.mockClear();
      from.mockClear();
      rpc.mockClear();
      scope = {
        userId: "psi-auth-1",
        psychologistId: "psi-1",
        psychologistIds: ["psi-1", "psi-auth-1"],
        clinicId: "clinic-1",
        hasProfessionalAccess: true,
      };
      insertedRows = null;
      consultationRows = [];
    },
    getInsertedRows() {
      return insertedRows;
    },
    setConsultationRows(rows: MutableRecord[]) {
      consultationRows = rows;
    },
    setScope(overrides: Partial<typeof scope>) {
      scope = {
        ...scope,
        ...overrides,
      };
    },
  };
});

vi.mock("@/services/psychologistScope", () => ({
  getPsychologistServiceScope: mocks.getPsychologistServiceScope,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

vi.mock("@/services/psychologistConsultationSettings", () => ({
  getCurrentPsychologistConsultationSettings:
    mocks.getCurrentPsychologistConsultationSettings,
  getPsychologistConsultationSettingsById:
    mocks.getPsychologistConsultationSettingsById,
}));

vi.mock("@/services/psychologistAvailability", () => ({
  getPsychologistAvailabilityById: mocks.getPsychologistAvailabilityById,
  validateAppointmentAvailability: ({
    dateKey,
    time,
    schedule,
    consultationDurationMinutes,
    existingAppointments,
  }: {
    dateKey: string;
    time: string;
    schedule: Array<{ key: string; enabled: boolean; start: string; end: string }>;
    consultationDurationMinutes: number;
    existingAppointments?: Array<{
      id?: string | null;
      data_consulta?: string | null;
      status?: string | null;
      duracao_consulta_min?: number | null;
    }>;
  }) => {
    const dayDate = new Date(`${dateKey}T12:00:00`);
    const dayKey = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"][dayDate.getDay()];
    const day = schedule.find((item) => item.key === dayKey);

    if (!day?.enabled) {
      return { ok: false, code: "inactive_day", message: "Dia sem atendimento configurado." };
    }

    const [hours, minutes] = time.split(":").map(Number);
    const [startHours, startMinutes] = day.start.split(":").map(Number);
    const [endHours, endMinutes] = day.end.split(":").map(Number);
    const start = hours * 60 + minutes;
    const end = start + consultationDurationMinutes;
    const availabilityStart = startHours * 60 + startMinutes;
    const availabilityEnd = endHours * 60 + endMinutes;

    if (start < availabilityStart || end > availabilityEnd) {
      return { ok: false, code: "outside_hours", message: "Este horario esta fora da sua disponibilidade configurada." };
    }

    const requestedStartAt = new Date(`${dateKey}T${time}:00`).getTime();
    const requestedEndAt = requestedStartAt + consultationDurationMinutes * 60_000;

    for (const appointment of existingAppointments || []) {
      if (["cancelada", "recusada"].includes(String(appointment.status || "").toLowerCase())) {
        continue;
      }

      const appointmentStart = new Date(String(appointment.data_consulta || ""));
      if (Number.isNaN(appointmentStart.getTime())) {
        continue;
      }

      const appointmentDuration = appointment.duracao_consulta_min ?? consultationDurationMinutes;
      const appointmentStartAt = appointmentStart.getTime();
      const appointmentEndAt = appointmentStartAt + appointmentDuration * 60_000;

      if (appointmentStartAt < requestedEndAt && appointmentEndAt > requestedStartAt) {
        return { ok: false, code: "conflict", message: "Ja existe outra consulta neste horario." };
      }
    }

    return { ok: true };
  },
}));

import {
  atualizarConsulta,
  cadastrarConsulta,
  responderSolicitacaoConsulta,
} from "@/services/consultas";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";

describe("consultas service", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mocks.reset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("updates consultations through the backend route with the authenticated session", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        consultation: {
          id: "consulta-1",
          status: "reagendada",
          data_consulta: "2099-05-10T14:00:00",
        },
        payment: null,
      }),
    });

    const result = await atualizarConsulta("consulta-1", {
      data_consulta: "2099-05-10T14:00:00",
      status: "reagendada",
      observacoes: "Horario alinhado com o paciente.",
      local_presencial: "Sala 2",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/consultas/update",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer psychologist-session-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          consultaId: "consulta-1",
          updates: {
            data_consulta: "2099-05-10T14:00:00",
            status: "reagendada",
            observacoes: "Horario alinhado com o paciente.",
            local_presencial: "Sala 2",
          },
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        consultation: expect.objectContaining({
          id: "consulta-1",
          status: "reagendada",
        }),
        payment: null,
      }),
    );
  });

  it("fills valor_consulta from psychologist consultation settings when creating a manual appointment", async () => {
    await cadastrarConsulta({
      paciente_id: "paciente-1",
      data_consulta: "2099-05-11T14:00:00",
      status: "confirmada",
      observacoes: "Consulta manual",
    });

    expect(mocks.getPsychologistConsultationSettingsById).toHaveBeenCalledWith("psi-1");
    expect(mocks.getPsychologistAvailabilityById).toHaveBeenCalledWith("psi-1");
    expect(mocks.getInsertedRows()).toEqual([
      expect.objectContaining({
        paciente_id: "paciente-1",
        psicologo_id: "psi-1",
        clinica_id: "clinic-1",
        valor_consulta: 100,
        duracao_consulta_min: 50,
      }),
    ]);
  });

  it("blocks preview users from creating a manual appointment before persisting it", async () => {
    mocks.setScope({ hasProfessionalAccess: false });

    await expect(
      cadastrarConsulta({
        paciente_id: "paciente-preview",
        data_consulta: "2099-05-11T14:00:00",
        status: "confirmada",
      }),
    ).rejects.toThrow(PREVIEW_FEATURE_LOCK_MESSAGE);

    expect(mocks.getPsychologistConsultationSettingsById).not.toHaveBeenCalled();
    expect(mocks.getInsertedRows()).toBeNull();
  });

  it("falls back to the current psychologist settings when the responsible psychologist lookup has no configured value", async () => {
    mocks.getPsychologistConsultationSettingsById.mockResolvedValueOnce({
      consultationPrice: null,
      consultationDurationMinutes: 50,
      consultationModality: "hibrido",
      attendsPresential: true,
      attendsOnline: true,
      presentialLocation: "",
      onlineSessionLink: "",
      sessionReminderMessage: "",
      psychologistId: "psi-1",
      sourceTable: "usuarios",
    });

    await cadastrarConsulta({
      paciente_id: "paciente-2",
      data_consulta: "2099-05-11T09:00:00",
      status: "confirmada",
      observacoes: "Consulta com fallback",
    });

    expect(mocks.getCurrentPsychologistConsultationSettings).toHaveBeenCalledTimes(1);
    expect(mocks.getInsertedRows()).toEqual([
      expect.objectContaining({
        paciente_id: "paciente-2",
        valor_consulta: 100,
      }),
    ]);
  });

  it("normalizes an explicit valor_consulta in pt-BR format before inserting", async () => {
    await cadastrarConsulta({
      paciente_id: "paciente-3",
      data_consulta: "2099-05-12T10:30:00",
      status: "confirmada",
      valor_consulta: "150,50",
    });

    expect(mocks.getPsychologistConsultationSettingsById).not.toHaveBeenCalled();
    expect(mocks.getCurrentPsychologistConsultationSettings).not.toHaveBeenCalled();
    expect(mocks.getInsertedRows()).toEqual([
      expect.objectContaining({
        paciente_id: "paciente-3",
        valor_consulta: 150.5,
      }),
    ]);
  });

  it("blocks appointments outside the configured range", async () => {
    await expect(
      cadastrarConsulta({
        paciente_id: "paciente-4",
        data_consulta: "2099-05-11T18:00:00",
        status: "confirmada",
      }),
    ).rejects.toThrow("Este horario esta fora da sua disponibilidade configurada.");
  });

  it("blocks appointments that exceed the working day end considering duration", async () => {
    await expect(
      cadastrarConsulta({
        paciente_id: "paciente-5",
        data_consulta: "2099-05-11T17:20:00",
        status: "confirmada",
      }),
    ).rejects.toThrow("Este horario esta fora da sua disponibilidade configurada.");
  });

  it("blocks conflicting appointments for the same psychologist slot", async () => {
    mocks.setConsultationRows([
      {
        id: "consulta-existente",
        psicologo_id: "psi-1",
        data_consulta: "2099-05-11T14:00:00",
        status: "confirmada",
        duracao_consulta_min: 50,
      },
    ]);

    await expect(
      cadastrarConsulta({
        paciente_id: "paciente-6",
        data_consulta: "2099-05-11T14:00:00",
        status: "confirmada",
      }),
    ).rejects.toThrow("Ja existe outra consulta neste horario.");
  });

  it("translates missing consultation rpc routes into the migration guidance", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: "PGRST202",
          message: "Could not find the function public.respond_consulta_request",
        },
      }),
    });

    await expect(
      responderSolicitacaoConsulta({
        consultaId: "consulta-2",
        acao: "confirmar",
      }),
    ).rejects.toThrow(
      "O banco ainda nao foi atualizado com o novo fluxo de resposta de consultas. Aplique a migration mais recente e tente novamente.",
    );
  });
});
