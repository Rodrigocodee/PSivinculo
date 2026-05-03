import { beforeEach, describe, expect, it, vi } from "vitest";

type MutableRecord = Record<string, unknown>;

const REAL_PATIENT_PROFILE_SELECT =
  "id, clinica_id, psicologo_id, nome, email, data_nascimento, cpf, telefone, endereco";

const mocks = vi.hoisted(() => {
  let currentPatient: MutableRecord | null = null;
  let patientRow: MutableRecord | null = null;
  let clinicRow: MutableRecord | null = null;
  let lastPatientSelect = "";
  let lastPatientUpdateSelect = "";
  let lastPatientUpdatePayload: MutableRecord | null = null;
  let lastPatientUpdateFilters: Array<{ column: string; value: string }> = [];

  const getCurrentPaciente = vi.fn(async () => currentPatient);
  const resolvePsychologistNameById = vi.fn(async () => "Dra. Camila");
  const authUpdateUser = vi.fn(async () => ({ error: null }));

  const from = vi.fn((table: string) => {
    if (table === "pacientes") {
      const selectChain = {
        eq: vi.fn(() => selectChain),
        maybeSingle: vi.fn(async () => ({
          data: patientRow,
          error: null,
        })),
      };

      const updateChain = {
        eq: vi.fn((column: string, value: string) => {
          lastPatientUpdateFilters.push({ column, value });
          return updateChain;
        }),
        select: vi.fn((selectValue: string) => {
          lastPatientUpdateSelect = selectValue;
          return {
            maybeSingle: vi.fn(async () => ({
              data: patientRow ? { ...patientRow, ...(lastPatientUpdatePayload || {}) } : null,
              error: null,
            })),
          };
        }),
      };

      return {
        select: vi.fn((selectValue: string) => {
          lastPatientSelect = selectValue;
          return selectChain;
        }),
        update: vi.fn((payload: MutableRecord) => {
          lastPatientUpdatePayload = payload;
          lastPatientUpdateFilters = [];
          return updateChain;
        }),
      };
    }

    if (table === "clinicas") {
      const selectChain = {
        eq: vi.fn(() => selectChain),
        maybeSingle: vi.fn(async () => ({
          data: clinicRow,
          error: null,
        })),
      };

      return {
        select: vi.fn(() => selectChain),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    authUpdateUser,
    from,
    getCurrentPaciente,
    resolvePsychologistNameById,
    reset() {
      currentPatient = null;
      patientRow = null;
      clinicRow = null;
      lastPatientSelect = "";
      lastPatientUpdateSelect = "";
      lastPatientUpdatePayload = null;
      lastPatientUpdateFilters = [];
      authUpdateUser.mockClear();
      from.mockClear();
      getCurrentPaciente.mockClear();
      resolvePsychologistNameById.mockClear();
    },
    setClinicRow(row: MutableRecord | null) {
      clinicRow = row;
    },
    setCurrentPatient(patient: MutableRecord) {
      currentPatient = patient;
    },
    setPatientRow(row: MutableRecord | null) {
      patientRow = row;
    },
    getLastPatientSelect() {
      return lastPatientSelect;
    },
    getLastPatientUpdateFilters() {
      return lastPatientUpdateFilters;
    },
    getLastPatientUpdatePayload() {
      return lastPatientUpdatePayload;
    },
    getLastPatientUpdateSelect() {
      return lastPatientUpdateSelect;
    },
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    auth: {
      updateUser: mocks.authUpdateUser,
    },
    storage: {
      from: vi.fn(),
    },
  },
}));

vi.mock("@/services/auth", () => ({
  normalizePhoneDigits: (value: string) => value.replace(/\D/g, "").slice(0, 11),
}));

vi.mock("@/services/currentPatient", () => ({
  getCurrentPaciente: mocks.getCurrentPaciente,
}));

vi.mock("@/services/currentPsychologist", () => ({
  AVATARS_BUCKET: "avatars",
  resolveAvatarUrl: (value: string | null | undefined) => value?.trim() || null,
}));

vi.mock("@/services/pacientes", () => ({
  normalizeCpfDigits: (value: string) => value.replace(/\D/g, "").slice(0, 11),
}));

vi.mock("@/services/psychologistLookup", () => ({
  resolvePsychologistNameById: mocks.resolvePsychologistNameById,
}));

import {
  fetchCurrentPatientProfile,
  saveCurrentPatientProfile,
} from "@/services/patientProfile";

function buildPatientContext(overrides: MutableRecord = {}) {
  return {
    user: {
      id: "patient-auth-1",
      email: "patient@example.com",
      user_metadata: {},
    },
    record: {
      id: "patient-auth-1",
      clinica_id: "clinic-1",
      psicologo_id: "psi-1",
      nome: "Paciente Teste",
      email: "patient@example.com",
      telefone: "11987654321",
      cpf: "12345678901",
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

describe("patientProfile", () => {
  beforeEach(() => {
    mocks.reset();
    mocks.setClinicRow({
      id: "clinic-1",
      nome: "Clinica Aurora",
    });
    mocks.setCurrentPatient(buildPatientContext());
  });

  it("loads the patient profile using only real public.pacientes columns", async () => {
    mocks.setPatientRow({
      id: "patient-auth-1",
      clinica_id: "clinic-1",
      psicologo_id: "psi-1",
      nome: "Paciente Teste",
      email: "patient@example.com",
      data_nascimento: "1990-05-20",
      cpf: "12345678901",
      telefone: "11987654321",
      endereco: "Rua das Flores, 10",
    });

    const result = await fetchCurrentPatientProfile();

    expect(mocks.getLastPatientSelect()).toBe(REAL_PATIENT_PROFILE_SELECT);
    expect(mocks.getLastPatientSelect()).not.toContain("auth_id");
    expect(mocks.getLastPatientSelect()).not.toContain("phone");
    expect(mocks.getLastPatientSelect()).not.toContain("celular");
    expect(mocks.getLastPatientSelect()).not.toContain("avatar_url");
    expect(result.fullName).toBe("Paciente Teste");
    expect(result.birthDate).toBe("1990-05-20");
    expect(result.phone).toBe("11987654321");
    expect(result.address).toBe("Rua das Flores, 10");
    expect(result.clinicName).toBe("Clinica Aurora");
    expect(result.psychologistName).toBe("Dra. Camila");
  });

  it("falls back to the already resolved patient record when the detailed profile query returns no row", async () => {
    mocks.setPatientRow(null);

    const result = await fetchCurrentPatientProfile();

    expect(result.row).toEqual(buildPatientContext().record);
    expect(result.fullName).toBe("Paciente Teste");
    expect(result.phone).toBe("11987654321");
    expect(result.availableFields.birthDate).toBe(false);
    expect(result.availableFields.address).toBe(false);
  });

  it("updates only columns that exist in the real pacientes schema", async () => {
    mocks.setPatientRow({
      id: "patient-auth-1",
      clinica_id: "clinic-1",
      psicologo_id: "psi-1",
      nome: "Paciente Teste",
      email: "patient@example.com",
      data_nascimento: "1990-05-20",
      cpf: "12345678901",
      telefone: "11987654321",
      endereco: "Rua das Flores, 10",
    });

    const result = await saveCurrentPatientProfile({
      fullName: "Ana Maria",
      birthDate: "1991-06-15",
      cpf: "123.456.789-01",
      phone: "(11) 91234-5678",
      address: "Rua Nova, 99",
    });

    expect(mocks.getLastPatientUpdatePayload()).toEqual({
      nome: "Ana Maria",
      data_nascimento: "1991-06-15",
      cpf: "12345678901",
      telefone: "11912345678",
      endereco: "Rua Nova, 99",
    });
    expect(mocks.getLastPatientUpdateFilters()).toEqual([
      { column: "id", value: "patient-auth-1" },
    ]);
    expect(mocks.getLastPatientUpdateSelect()).toBe(REAL_PATIENT_PROFILE_SELECT);
    expect(mocks.authUpdateUser).toHaveBeenCalledWith({
      data: {
        full_name: "Ana Maria",
        name: "Ana Maria",
        cpf: "12345678901",
        telefone: "11912345678",
        phone: "11912345678",
      },
    });
    expect(result.fullName).toBe("Ana Maria");
    expect(result.address).toBe("Rua Nova, 99");
  });
});
