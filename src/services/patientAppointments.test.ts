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
    consultationModality: "presencial_e_online",
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

describe("patientAppointments", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mocks.reset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
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

    const data = await fetchPatientAppointmentsData();

    expect(mocks.getPsychologistConsultationSettingsById).toHaveBeenCalledWith("psi-2");
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
        status: "solicitada",
      }),
    ]);
  });

  it("keeps clinica_id when the patient is linked to a clinic workflow", async () => {
    mocks.setCurrentPatient(buildPatientContext());
    mocks.getPsychologistConsultationSettingsById.mockResolvedValue(buildConsultationSettings());
    mocks.setInsertResult({
      data: [
        {
          id: "consulta-2",
          paciente_id: "patient-auth-1",
          psicologo_id: "psi-1",
          clinica_id: "clinic-1",
          data_consulta: "2099-05-02T09:30:00",
          status: "solicitada",
        },
      ],
      error: null,
    });

    await requestPatientAppointment({
      requestedDate: "2099-05-02",
      requestedTime: "09:30",
      modality: "presencial",
      notes: "",
    });

    expect(mocks.getLastInsertedRows()).toEqual([
      expect.objectContaining({
        paciente_id: "patient-auth-1",
        psicologo_id: "psi-1",
        clinica_id: "clinic-1",
        data_consulta: "2099-05-02T09:30:00",
        data_consulta_solicitada_original: "2099-05-02T09:30:00",
        modalidade_consulta: "presencial",
        status: "solicitada",
      }),
    ]);
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
      "/api/consultas/respond-counterproposal",
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
