import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
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

import { signUpPatientWithInvite } from "@/services/patientRegistration";

describe("signUpPatientWithInvite", () => {
  it("does not resolve the app user before email confirmation when sign-up returns without a session", async () => {
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

    const result = await signUpPatientWithInvite({
      fullName: "Paciente Teste",
      email: "patient@example.com",
      password: "secret123",
      phone: "(11) 98765-4321",
      cpf: "123.456.789-01",
      inviteCode: "psi-abc123",
    });

    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAuthenticatedAppUser).not.toHaveBeenCalled();
    expect(result.requiresEmailConfirmation).toBe(true);
    expect(result.appUser).toBeNull();
  });
});
