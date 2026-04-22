import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let persistedPatientRow: Record<string, unknown> | null = null;

  const authGetSession = vi.fn();
  const authGetUser = vi.fn();
  const findPsychologistByInviteCode = vi.fn();
  const rpc = vi.fn();

  const from = vi.fn((table: string) => {
    let selectedColumn = "";
    let selectedValue = "";

    const selectChain = {
      eq(column: string, value: unknown) {
        selectedColumn = column;
        selectedValue = String(value);
        return selectChain;
      },
      limit() {
        return selectChain;
      },
      async maybeSingle() {
        if (table === "usuarios") {
          return { data: null, error: null };
        }

        if (table === "pacientes" && persistedPatientRow) {
          const rowValue = persistedPatientRow[selectedColumn];
          if (typeof rowValue === "string" && rowValue === selectedValue) {
            return { data: persistedPatientRow, error: null };
          }
        }

        return { data: null, error: null };
      },
    };

    return {
      select() {
        return selectChain;
      },
    };
  });

  return {
    authGetSession,
    authGetUser,
    findPsychologistByInviteCode,
    rpc,
    from,
    reset() {
      persistedPatientRow = null;
      authGetSession.mockReset();
      authGetUser.mockReset();
      findPsychologistByInviteCode.mockReset();
      rpc.mockReset();
      from.mockClear();
    },
    getPersistedPatientRow() {
      return persistedPatientRow;
    },
    persistPatientRow(row: Record<string, unknown>) {
      persistedPatientRow = row;
    },
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.authGetSession,
      getUser: mocks.authGetUser,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
  getSupabaseRememberPreference: vi.fn(() => true),
  setSupabaseRememberPreference: vi.fn(),
}));

vi.mock("@/lib/subscriptionAccess", () => ({
  resolveSubscriptionAccessFromSource: vi.fn(() => null),
}));

vi.mock("@/services/adminAccess", () => ({
  CLINIC_ADMIN_USER_TYPE: "admin_clinica",
  getClinicAdminClinicId: (record: Record<string, unknown> | null | undefined) =>
    typeof record?.clinica_id === "string" ? record.clinica_id : "",
  getClinicAdminUserType: (record: Record<string, unknown> | null | undefined) =>
    typeof record?.tipo_usuario === "string" ? record.tipo_usuario : "",
  hasClinicAdminMetadataHint: vi.fn(() => false),
  isClinicAdmin: vi.fn(() => false),
}));

vi.mock("@/services/currentAdmin", () => ({
  validateClinicInviteCode: vi.fn(),
}));

vi.mock("@/services/psychologistAccess", () => ({
  CLINIC_INVITED_PSYCHOLOGIST_ORIGIN: "clinica_convite",
  CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW: "cadastro_psicologo_clinica",
  resolvePsychologistClinicAccess: vi.fn(() => ({
    isClinicInvitedPsychologist: false,
    clinicId: null,
    clinicInviteCode: null,
    origin: null,
  })),
}));

vi.mock("@/services/psychologistInvite", () => ({
  findPsychologistByInviteCode: mocks.findPsychologistByInviteCode,
}));

vi.mock("@/services/subscriptionPersistence", () => ({
  linkPendingSubscriptionAfterRegistration: vi.fn(),
}));

import { resolveAuthenticatedAppUser } from "@/services/auth";

describe("resolveAuthenticatedAppUser", () => {
  it("creates the patient record on the first authenticated resolution when the invite is valid", async () => {
    mocks.reset();

    const user = {
      id: "patient-auth-1",
      email: "patient@example.com",
      user_metadata: {
        role: "patient",
        full_name: "Paciente Teste",
        phone: "(11) 98765-4321",
        cpf: "123.456.789-01",
        codigo_convite_psicologo: "PSI-ABC123",
      },
    };

    mocks.authGetSession.mockResolvedValue({
      data: {
        session: {
          user,
        },
      },
    });
    mocks.authGetUser.mockResolvedValue({
      data: {
        user,
      },
    });
    mocks.findPsychologistByInviteCode.mockResolvedValue({
      table: "usuarios",
      row: {},
      inviteCode: "PSI-ABC123",
      psychologistId: "psi-1",
      clinicId: "clinic-1",
      clinicName: "Clinica Aurora",
      psychologistName: "Dra. Camila",
      email: "camila@psivinculo.com",
      hasProfessionalAccess: true,
    });
    mocks.rpc.mockImplementation(async (_fn: string, payload: Record<string, unknown>) => {
      const row = {
        id: "patient-auth-1",
        clinica_id: "clinic-1",
        psicologo_id: "psi-1",
        nome: payload.nome_input,
        email: "patient@example.com",
        telefone: payload.telefone_input,
        cpf: payload.cpf_input,
        ativo: true,
      };
      mocks.persistPatientRow(row);
      return { data: row, error: null };
    });

    const appUser = await resolveAuthenticatedAppUser(user as never);

    expect(mocks.findPsychologistByInviteCode).toHaveBeenCalledWith("PSI-ABC123");
    expect(mocks.rpc).toHaveBeenCalledWith("register_self_patient_with_invite", {
      invite_code_input: "PSI-ABC123",
      nome_input: "Paciente Teste",
      telefone_input: "11987654321",
      cpf_input: "12345678901",
    });
    expect(mocks.getPersistedPatientRow()).toMatchObject({
      id: "patient-auth-1",
      clinica_id: "clinic-1",
      psicologo_id: "psi-1",
      nome: "Paciente Teste",
      email: "patient@example.com",
      telefone: "11987654321",
      cpf: "12345678901",
      ativo: true,
    });
    expect(appUser.role).toBe("patient");
    expect(appUser.recordTable).toBe("pacientes");
    expect(appUser.clinicId).toBe("clinic-1");
  });

  it("persists clinica_id as null when the invite has no validated clinic", async () => {
    mocks.reset();

    const user = {
      id: "patient-auth-2",
      email: "patient-null-clinic@example.com",
      user_metadata: {
        role: "patient",
        full_name: "Paciente Sem Clinica",
        phone: "(11) 99999-0000",
        cpf: "987.654.321-00",
        codigo_convite_psicologo: "PSI-NULL01",
      },
    };

    mocks.authGetSession.mockResolvedValue({
      data: {
        session: {
          user,
        },
      },
    });
    mocks.authGetUser.mockResolvedValue({
      data: {
        user,
      },
    });
    mocks.findPsychologistByInviteCode.mockResolvedValue({
      table: "usuarios",
      row: {},
      inviteCode: "PSI-NULL01",
      psychologistId: "psi-2",
      clinicId: null,
      clinicName: "",
      psychologistName: "Dr. Rafael",
      email: "rafael@psivinculo.com",
      hasProfessionalAccess: true,
    });
    mocks.rpc.mockImplementation(async (_fn: string, payload: Record<string, unknown>) => {
      const row = {
        id: "patient-auth-2",
        clinica_id: null,
        psicologo_id: "psi-2",
        nome: payload.nome_input,
        email: "patient-null-clinic@example.com",
        telefone: payload.telefone_input,
        cpf: payload.cpf_input,
        ativo: true,
      };
      mocks.persistPatientRow(row);
      return { data: row, error: null };
    });

    await resolveAuthenticatedAppUser(user as never);

    expect(mocks.getPersistedPatientRow()).toMatchObject({
      id: "patient-auth-2",
      clinica_id: null,
      psicologo_id: "psi-2",
      nome: "Paciente Sem Clinica",
      email: "patient-null-clinic@example.com",
      telefone: "11999990000",
      cpf: "98765432100",
      ativo: true,
    });
  });
});
