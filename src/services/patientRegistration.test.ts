import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  from: vi.fn(),
  setSupabaseRememberPreference: vi.fn(),
  assertEmailAvailable: vi.fn(),
  assertPhoneAvailable: vi.fn(),
  resolveAuthenticatedAppUser: vi.fn(),
  findPsychologistByInviteCode: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: mocks.signUp,
    },
    from: mocks.from,
  },
  setSupabaseRememberPreference: mocks.setSupabaseRememberPreference,
}));

vi.mock("@/services/auth", () => ({
  assertEmailAvailable: mocks.assertEmailAvailable,
  assertPhoneAvailable: mocks.assertPhoneAvailable,
  isValidEmail: (value: string) => value.includes("@"),
  normalizeEmail: (value: string) => value.trim().toLowerCase(),
  normalizePhoneDigits: (value: string) => value.replace(/\D/g, "").slice(0, 11),
  resolveAuthenticatedAppUser: mocks.resolveAuthenticatedAppUser,
}));

vi.mock("@/services/pacientes", () => ({
  normalizeCpfDigits: (value: string) => value.replace(/\D/g, "").slice(0, 11),
}));

vi.mock("@/services/psychologistInvite", () => ({
  findPsychologistByInviteCode: mocks.findPsychologistByInviteCode,
  normalizeInviteCode: (value: string) => value.trim().toUpperCase(),
}));

import { AUTH_EMAIL_SEND_RATE_LIMIT_MESSAGE } from "@/services/authErrorMessages";
import { signUpPatientWithInvite } from "@/services/patientRegistration";

const validPatientInput = {
  fullName: "Paciente Teste",
  email: "patient@example.com",
  password: "secret123",
  phone: "(11) 98765-4321",
  cpf: "123.456.789-01",
  inviteCode: "psi-abc123",
};

const validInviteLookup = {
  table: "usuarios",
  row: {},
  inviteCode: "PSI-ABC123",
  psychologistId: "psi-1",
  clinicId: "clinic-1",
  clinicName: "Clinica Aurora",
  psychologistName: "Dra. Camila",
  email: "camila@psivinculo.com",
  hasProfessionalAccess: true,
};

describe("signUpPatientWithInvite", () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.findPsychologistByInviteCode.mockResolvedValue(validInviteLookup);
    mocks.signUp.mockResolvedValue({
      data: {
        user: {
          id: "patient-auth-1",
          email: "patient@example.com",
        },
        session: null,
      },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      throw new Error(`Cadastro publico nao deve consultar ${table} antes do login.`);
    });
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  it("does not resolve the app user before email confirmation when sign-up returns without a session", async () => {
    const result = await signUpPatientWithInvite(validPatientInput);

    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.assertEmailAvailable).not.toHaveBeenCalled();
    expect(mocks.assertPhoneAvailable).not.toHaveBeenCalled();
    expect(mocks.resolveAuthenticatedAppUser).not.toHaveBeenCalled();
    expect(result.requiresEmailConfirmation).toBe(true);
    expect(result.appUser).toBeNull();
  });

  it("does not select public usuarios or pacientes, including legacy phone/celular columns, before login", async () => {
    await signUpPatientWithInvite(validPatientInput);

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.assertEmailAvailable).not.toHaveBeenCalled();
    expect(mocks.assertPhoneAvailable).not.toHaveBeenCalled();
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({
            telefone: "11987654321",
            cpf: "12345678901",
          }),
        }),
      }),
    );
  });

  it("shows a friendly message when Supabase blocks confirmation email sends", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: {
        user: null,
        session: null,
      },
      error: Object.assign(new Error("email rate limit exceeded"), {
        code: "over_email_send_rate_limit",
      }),
    });

    await expect(signUpPatientWithInvite(validPatientInput)).rejects.toThrow(
      AUTH_EMAIL_SEND_RATE_LIMIT_MESSAGE,
    );
  });

  it("maps common Supabase Auth sign-up errors without querying protected tables", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: {
        user: null,
        session: null,
      },
      error: Object.assign(new Error("User already registered"), {
        code: "user_already_exists",
      }),
    });

    await expect(signUpPatientWithInvite(validPatientInput)).rejects.toThrow(
      "Este e-mail ja esta em uso.",
    );

    expect(mocks.assertEmailAvailable).not.toHaveBeenCalled();
    expect(mocks.assertPhoneAvailable).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("shows friendly messages for disabled signup and weak password", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: {
        user: null,
        session: null,
      },
      error: Object.assign(new Error("signup disabled"), {
        code: "signup_disabled",
      }),
    });

    await expect(signUpPatientWithInvite(validPatientInput)).rejects.toThrow(
      "O cadastro esta temporariamente indisponivel.",
    );

    mocks.signUp.mockResolvedValueOnce({
      data: {
        user: null,
        session: null,
      },
      error: Object.assign(new Error("weak password"), {
        code: "weak_password",
      }),
    });

    await expect(signUpPatientWithInvite(validPatientInput)).rejects.toThrow(
      "A senha informada e fraca. Use uma senha mais segura.",
    );
  });
});
