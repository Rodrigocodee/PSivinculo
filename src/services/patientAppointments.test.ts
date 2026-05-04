import { beforeEach, describe, expect, it, vi } from "vitest";

type MutableRecord = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  let currentPatient: MutableRecord | null = null;
  let consultationRows: MutableRecord[] = [];
  let insertResult: { data: MutableRecord[] | null; error: unknown } = {
    data: null,
    error: null,
  };
  let lastInsertedRows: MutableRecord[] | null = null;
  let rpcResult: { data: MutableRecord[] | MutableRecord | null; error: unknown } = {
    data: null,
    error: null,
  };
  const getSession = vi.fn(async () => ({
    data: {
      session: {
        access_token: "patient-session-token",
      },
    },
  }));

  const getCurrentPaciente = vi.fn(async () => currentPatient);
  const getPsychologistConsultationSettingsById = vi.fn();
  const getPsychologistAvailabilityById = vi.fn();
  const resolvePsychologistNameById = vi.fn(async () => "Dra. Camila");
  const rpc = vi.fn(async () => rpcResult);

  const from = vi.fn((table: string) => {
    if (table !== "consultas") {
      throw new Error(`Unexpected table: ${table}`);
    }

    const selectChain = {
      eq: vi.fn(() => selectChain),
      order: vi.fn(async () => ({
        data: consultationRows,
        error: null,
      })),
    };

    return {
      select: vi.fn(() => selectChain),
      insert: vi.fn((rows: MutableRecord[]) => {
        lastInsertedRows = rows;

        return {
          select: vi.fn(async () => insertResult),
        };
      }),
    };
  });

  return {
    getCurrentPaciente,
    getPsychologistConsultationSettingsById,
    getPsychologistAvailabilityById,
    resolvePsychologistNameById,
    from,
    reset() {
      currentPatient = null;
      consultationRows = [];
      insertResult = { data: null, error: null };
      lastInsertedRows = null;
      rpcResult = { data: null, error: null };
      getCurrentPaciente.mockClear();
      getPsychologistConsultationSettingsById.mockReset();
      getPsychologistAvailabilityById.mockReset();
      resolvePsychologistNameById.mockClear();
      from.mockClear();
      rpc.mockClear();
      getSession.mockClear();
    },
    setCurrentPatient(patient: MutableRecord) {
      currentPatient = patient;
    },
    setConsultationRows(rows: MutableRecord[]) {
      consultationRows = rows;
    },
    setInsertResult(result: { data: MutableRecord[] | null; error: unknown }) {
      insertResult = result;
    },
    getLastInsertedRows() {
      return lastInsertedRows;
    },
    rpc,
    getSession,
    setRpcResult(result: { data: MutableRecord[] | MutableRecord | null; error: unknown }) {
      rpcResult = result;
    },
  };
});

vi.mock("@/services/currentPatient", () => ({
  getCurrentPaciente: mocks.getCurrentPaciente,
}));

vi.mock("@/services/psychologistLookup", () => ({
  resolvePsychologistNameById: mocks.resolvePsychologistNameById,
}));

vi.mock("@/services/psychologistConsultationSettings", () => ({
  getPsychologistConsultationSettingsById: mocks.getPsychologistConsultationSettingsById,
  normalizeAppointmentModality: (value: string | null | undefined) => {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "presencial") return "presencial";
    if (normalized === "online") return "online";

    return null;
  },
}));

vi.mock("@/services/psychologistAvailability", () => ({
  getPsychologistAvailabilityById: mocks.getPsychologistAvailabilityById,
  validateAppointmentAvailability: ({
    dateKey,
    time,
    schedule,
    consultationDurationMinutes,
  }: {
    dateKey: string;
    time: string;
    schedule: Array<{ key: string; enabled: boolean; start: string; end: string }>;
    consultationDurationMinutes: number;
  }) => {
    const dayDate = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(dayDate.getTime())) {
      return { ok: false, code: "invalid_datetime", message: "Este horario esta fora da sua disponibilidade configurada." };
    }

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

    return { ok: true };
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

import {
  fetchPatientAppointmentsData,
  respondPatientCounterproposal,
  requestPatientAppointment,
} from "@/services/patientAppointments";

function expectedServerApiUrl(pathname: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/g, "") ?? "";

  return apiBaseUrl ? `${apiBaseUrl}${pathname}` : pathname;
}

function buildPatientContext(overrides: MutableRecord = {}) {
  return {
    user: {
      id: "patient-auth-1",
      email: "patient@example.com",
      user_metadata: {
        psychologist_name: "Dra. Camila",
      },
    },
    record: {
      id: "patient-auth-1",
      clinica_id: "clinic-1",
      psicologo_id: "psi-1",
    },
    patientId: "patient-auth-1",
    clinicId: "clinic-1",
    psychologistId: "psi-1",
    fullName: "Paciente Teste",
    email: "patient@example.com",
    isLinked: true,
    ...overrides,
  };
}

function buildConsultationSettings(overrides: MutableRecord = {}) {
  return {
    consultationPrice: 180,
    consultationDurationMinutes: 50,
    consultationModality: "hibrido",
    attendsPresential: true,
    attendsOnline: true,
    presentialLocation: "Sala 1",
    onlineSessionLink: "",
    sessionReminderMessage: "",
    psychologistId: "psi-1",
    sourceTable: "usuarios",
    ...overrides,
  };
}

function buildAvailabilitySettings(overrides: MutableRecord = {}) {
  return {
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
    ...overrides,
  };
}

describe("patientAppointments", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mocks.reset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    mocks.getPsychologistAvailabilityById.mockResolvedValue(buildAvailabilitySettings());
  });

  it("keeps appointment requests enabled for linked patients without clinica_id", async () => {
    mocks.setCurrentPatient(
      buildPatientContext({
        record: {
          id: "patient-auth-2",
          clinica_id: null,
          psicologo_id: "psi-2",
        },
        patientId: "patient-auth-2",
        clinicId: "",
        psychologistId: "psi-2",
      }),
    );
    mocks.setConsultationRows([]);
    mocks.getPsychologistConsultationSettingsById.mockResolvedValue(
      buildConsultationSettings({
        psychologistId: "psi-2",
      }),
    );
    mocks.getPsychologistAvailabilityById.mockResolvedValue(
      buildAvailabilitySettings({
        psychologistId: "psi-2",
      }),
    );

    const data = await fetchPatientAppointmentsData();

    expect(mocks.getPsychologistConsultationSettingsById).toHaveBeenCalledWith("psi-2");
    expect(mocks.getPsychologistAvailabilityById).toHaveBeenCalledWith("psi-2");
    expect(data.canRequestAppointment).toBe(true);
    expect(data.patient.psychologistId).toBe("psi-2");
    expect(data.patient.clinicId).toBe("");
  });

  it("creates a patient appointment with clinica_id null for independent psychologists", async () => {
    mocks.setCurrentPatient(
      buildPatientContext({
        record: {
          id: "patient-auth-2",
          clinica_id: null,
          psicologo_id: "psi-2",
        },
        patientId: "patient-auth-2",
        clinicId: "",
        psychologistId: "psi-2",
      }),
    );
    mocks.getPsychologistConsultationSettingsById.mockResolvedValue(
      buildConsultationSettings({
        psychologistId: "psi-2",
        attendsPresential: false,
        attendsOnline: true,
        consultationModality: "online",
      }),
    );
    mocks.getPsychologistAvailabilityById.mockResolvedValue(
      buildAvailabilitySettings({
        psychologistId: "psi-2",
      }),
    );
    mocks.setInsertResult({
      data: [
        {
          id: "consulta-1",
          paciente_id: "patient-auth-2",
          psicologo_id: "psi-2",
          clinica_id: null,
          data_consulta: "2099-04-29T11:00:00",
          status: "solicitada",
        },
      ],
      error: null,
    });

    await requestPatientAppointment({
      requestedDate: "2099-04-29",
      requestedTime: "11:00",
      modality: "online",
      notes: "Preciso de um horario no fim da manha.",
    });

    expect(mocks.getLastInsertedRows()).toEqual([
      expect.objectContaining({
        paciente_id: "patient-auth-2",
        psicologo_id: "psi-2",
        clinica_id: null,
        data_consulta: "2099-04-29T11:00:00",
        data_consulta_solicitada_original: "2099-04-29T11:00:00",
        modalidade_consulta: "online",
        valor_consulta: 180,
        status: "solicitada",
      }),
    ]);
  });

  it("keeps clinica_id when the patient is linked to a clinic workflow", async () => {
    mocks.setCurrentPatient(buildPatientContext());
    mocks.getPsychologistConsultationSettingsById.mockResolvedValue(buildConsultationSettings());
    mocks.getPsychologistAvailabilityById.mockResolvedValue(buildAvailabilitySettings());
    mocks.setInsertResult({
      data: [
        {
          id: "consulta-2",
          paciente_id: "patient-auth-1",
          psicologo_id: "psi-1",
          clinica_id: "clinic-1",
          data_consulta: "2099-05-04T09:30:00",
          status: "solicitada",
        },
      ],
      error: null,
    });

    await requestPatientAppointment({
      requestedDate: "2099-05-04",
      requestedTime: "09:30",
      modality: "presencial",
      notes: "",
    });

    expect(mocks.getLastInsertedRows()).toEqual([
      expect.objectContaining({
        paciente_id: "patient-auth-1",
        psicologo_id: "psi-1",
        clinica_id: "clinic-1",
        data_consulta: "2099-05-04T09:30:00",
        data_consulta_solicitada_original: "2099-05-04T09:30:00",
        modalidade_consulta: "presencial",
        valor_consulta: 180,
        status: "solicitada",
      }),
    ]);
  });

  it("blocks requests on inactive days like sunday", async () => {
    mocks.setCurrentPatient(buildPatientContext());
    mocks.getPsychologistConsultationSettingsById.mockResolvedValue(buildConsultationSettings());
    mocks.getPsychologistAvailabilityById.mockResolvedValue(buildAvailabilitySettings());

    await expect(
      requestPatientAppointment({
        requestedDate: "2099-05-03",
        requestedTime: "09:00",
        modality: "presencial",
      }),
    ).rejects.toThrow("Dia sem atendimento configurado.");
  });

  it("blocks requests outside the configured availability range", async () => {
    mocks.setCurrentPatient(buildPatientContext());
    mocks.getPsychologistConsultationSettingsById.mockResolvedValue(buildConsultationSettings());
    mocks.getPsychologistAvailabilityById.mockResolvedValue(buildAvailabilitySettings());

    await expect(
      requestPatientAppointment({
        requestedDate: "2099-05-05",
        requestedTime: "18:00",
        modality: "presencial",
      }),
    ).rejects.toThrow("Este horario esta fora da sua disponibilidade configurada.");
  });

  it("responds to a persisted counterproposal through the backend rpc", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        consultation: {
          id: "consulta-3",
          status: "confirmada",
        },
      }),
    });

    const result = await respondPatientCounterproposal({
      consultaId: "consulta-3",
      acao: "aceitar",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expectedServerApiUrl("/api/consultas/respond-counterproposal"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer patient-session-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          consultaId: "consulta-3",
          acao: "aceitar",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "consulta-3",
        status: "confirmada",
      }),
    );
  });
});
