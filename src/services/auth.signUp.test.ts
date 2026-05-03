import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  setSupabaseRememberPreference: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

function createQueryBuilder(initialData: unknown) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    limit() {
      return builder;
    },
    then(
      onFulfilled?: (value: { data: unknown; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve({ data: initialData, error: null }).then(onFulfilled, onRejected);
    },
  };

  return builder;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseRememberPreference: () => true,
  setSupabaseRememberPreference: mocks.setSupabaseRememberPreference,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      getUser: mocks.getUser,
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
    },
    from: mocks.from,
  },
}));

import { AUTH_EMAIL_SEND_RATE_LIMIT_MESSAGE } from "@/services/authErrorMessages";
import { signUpPsychologist } from "@/services/auth";

const validPsychologistInput = {
  fullName: "Psicologa Teste",
  email: "psi@example.com",
  password: "secret123",
};

describe("signUpPsychologist", () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.from.mockImplementation(() => createQueryBuilder([]));
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("shows a friendly message when Supabase blocks confirmation email sends", async () => {
    mocks.signUp.mockResolvedValue({
      data: {
        user: null,
        session: null,
      },
      error: Object.assign(new Error("email rate limit exceeded"), {
        code: "over_email_send_rate_limit",
      }),
    });

    await expect(signUpPsychologist(validPsychologistInput)).rejects.toThrow(
      AUTH_EMAIL_SEND_RATE_LIMIT_MESSAGE,
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not query protected profile tables when sign-up requires e-mail confirmation", async () => {
    mocks.signUp.mockResolvedValue({
      data: {
        user: {
          id: "auth-psi-1",
          email: "psi@example.com",
          user_metadata: {
            role: "psychologist",
            full_name: "Psicologa Teste",
          },
        },
        session: null,
      },
      error: null,
    });

    const result = await signUpPsychologist(validPsychologistInput);

    expect(result.requiresEmailConfirmation).toBe(true);
    expect(result.appUser).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("keeps non-rate-limit Supabase sign-up errors visible", async () => {
    mocks.signUp.mockResolvedValue({
      data: {
        user: null,
        session: null,
      },
      error: Object.assign(new Error("unexpected auth outage"), {
        code: "service_unavailable",
      }),
    });

    await expect(signUpPsychologist(validPsychologistInput)).rejects.toThrow(
      "unexpected auth outage | Codigo: service_unavailable",
    );
  });

  it("shows a friendly message when Supabase Auth disables public signup", async () => {
    mocks.signUp.mockResolvedValue({
      data: {
        user: null,
        session: null,
      },
      error: Object.assign(new Error("signup is disabled"), {
        code: "signup_disabled",
      }),
    });

    await expect(signUpPsychologist(validPsychologistInput)).rejects.toThrow(
      "O cadastro esta temporariamente indisponivel.",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("shows a friendly message for weak passwords returned by Supabase Auth", async () => {
    mocks.signUp.mockResolvedValue({
      data: {
        user: null,
        session: null,
      },
      error: Object.assign(new Error("weak password"), {
        code: "weak_password",
      }),
    });

    await expect(signUpPsychologist(validPsychologistInput)).rejects.toThrow(
      "A senha informada e fraca. Use uma senha mais segura.",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
