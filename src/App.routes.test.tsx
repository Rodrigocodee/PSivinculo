import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { DEFAULT_ACCESS_PERMISSIONS } from "@/services/accessControl";

function resolveRoleFromPath(pathname: string) {
  if (pathname.startsWith("/psi") || pathname === "/dashboard" || pathname === "/cadastro/perfil-profissional") {
    return "psychologist" as const;
  }

  if (pathname.startsWith("/admin")) {
    return "admin" as const;
  }

  if (pathname.startsWith("/paciente")) {
    return "patient" as const;
  }

  return null;
}

function getMockUser() {
  const pathname = window.location.pathname;
  const role = resolveRoleFromPath(pathname);

  if (!role) return null;

  return {
    id: `${role}-auth-id`,
    email: `${role}@psivinculo.com`,
    user_metadata: {
      full_name:
        role === "admin"
          ? "Clinica Central"
          : role === "patient"
            ? "Paciente Teste"
            : "Psicologo Teste",
      role: role === "admin" ? "admin_clinica" : role,
      tipo_usuario: role === "psychologist" ? "psicologo" : role === "patient" ? "paciente" : "admin_clinica",
      clinica_id: "clinic-1",
    },
  };
}

function createQueryBuilder(initialData: unknown) {
  let responseData = initialData;

  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    neq() {
      return builder;
    },
    gte() {
      return builder;
    },
    lte() {
      return builder;
    },
    gt() {
      return builder;
    },
    lt() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    in() {
      return builder;
    },
    filter() {
      return builder;
    },
    ilike() {
      return builder;
    },
    maybeSingle() {
      responseData = null;
      return builder;
    },
    single() {
      responseData = {};
      return builder;
    },
    insert(payload?: unknown) {
      responseData = Array.isArray(payload) ? payload : payload ? [payload] : [];
      return builder;
    },
    update(payload?: unknown) {
      responseData = payload ?? {};
      return builder;
    },
    upsert(payload?: unknown) {
      responseData = payload ?? {};
      return builder;
    },
    delete() {
      responseData = null;
      return builder;
    },
    then(onFulfilled?: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: responseData, error: null }).then(onFulfilled, onRejected);
    },
    catch(onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: responseData, error: null }).catch(onRejected);
    },
    finally(onFinally?: (() => void) | undefined) {
      return Promise.resolve({ data: responseData, error: null }).finally(onFinally);
    },
  };

  return builder;
}

vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => {
    const user = getMockUser();
    const role = resolveRoleFromPath(window.location.pathname);

    return {
      session: user ? { user } : null,
      appUser: user && role ? {
        user,
        role,
        fullName: user.user_metadata.full_name,
        email: user.email,
        clinicId: "clinic-1",
        userType: user.user_metadata.tipo_usuario,
        isClinicAdmin: role === "admin",
        isClinicInvitedPsychologist: false,
        recordTable: "usuarios",
        record: {
          id: user.id,
          auth_id: user.id,
          clinica_id: "clinic-1",
          nome: user.user_metadata.full_name,
          tipo_usuario: user.user_metadata.tipo_usuario,
        },
        needsProfileSetup: false,
        hasProfessionalAccess: true,
      } : null,
      isAuthenticated: Boolean(user),
      isLoading: false,
      refreshAuth: vi.fn(async () => {}),
    };
  },
}));

vi.mock("@/contexts/PermissionsContext", () => ({
  PermissionsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  usePermissions: () => ({
    permissions: DEFAULT_ACCESS_PERMISSIONS,
    savePermissions: vi.fn(),
    updateRolePermissions: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-current-psychologist-profile", () => ({
  currentPsychologistProfileQueryKey: ["current-psychologist-profile"],
  useCurrentPsychologistProfile: () => ({
    data: {
      fullName: "Psicologo Teste",
      inviteCode: "PSI-123456",
      avatarUrl: null,
      crp: "123456",
    },
  }),
}));

vi.mock("@/hooks/use-current-admin-clinic", () => ({
  currentAdminClinicQueryKey: ["current-admin-clinic"],
  useCurrentAdminClinic: () => ({
    data: {
      clinicName: "Clinica Central",
      logoUrl: null,
    },
  }),
}));

vi.mock("@/hooks/use-current-patient-profile", () => ({
  useCurrentPatientProfile: () => ({
    data: {
      fullName: "Paciente Teste",
      avatarUrl: null,
    },
  }),
}));

vi.mock("@/hooks/use-psychologist-notifications", () => ({
  psychologistNotificationsQueryKey: ["psychologist-notifications"],
  usePsychologistNotifications: () => ({
    data: [],
    isLoading: false,
    markAsRead: vi.fn(async () => {}),
  }),
}));

vi.mock("@/hooks/use-patient-notifications", () => ({
  usePatientNotifications: () => ({
    data: [],
    isLoading: false,
    markAsRead: vi.fn(),
  }),
}));

vi.mock("@/services/patientDashboard", () => ({
  fetchPatientDashboardData: vi.fn(async () => ({
    patient: {
      user: getMockUser(),
      record: {
        id: "patient-auth-id",
        clinica_id: "clinic-1",
        psicologo_id: "psi-1",
        nome: "Paciente Teste",
        email: "patient@psivinculo.com",
      },
      patientId: "patient-auth-id",
      clinicId: "clinic-1",
      psychologistId: "psi-1",
      fullName: "Paciente Teste",
      email: "patient@psivinculo.com",
      isLinked: true,
    },
    nextAppointment: null,
    pendingPayment: null,
    recentHistory: [],
    hasLinkedPatientRecord: true,
  })),
}));

vi.mock("@/lib/supabase", () => {
  return {
    getSupabaseRememberPreference: () => true,
    setSupabaseRememberPreference: vi.fn(),
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: {
            session: getMockUser() ? { user: getMockUser() } : null,
          },
        })),
        getUser: vi.fn(async () => ({
          data: {
            user: getMockUser(),
          },
          error: null,
        })),
        onAuthStateChange: vi.fn(() => ({
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        })),
        signOut: vi.fn(async () => ({ error: null })),
        signInWithPassword: vi.fn(async () => ({
          data: {
            user: getMockUser(),
            session: getMockUser() ? { user: getMockUser() } : null,
          },
          error: null,
        })),
        signUp: vi.fn(async () => ({
          data: {
            user: getMockUser(),
            session: getMockUser() ? { user: getMockUser() } : null,
          },
          error: null,
        })),
        updateUser: vi.fn(async () => ({
          data: {
            user: getMockUser(),
          },
          error: null,
        })),
        resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      },
      from: vi.fn(() => createQueryBuilder([])),
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: vi.fn(() => ({
            data: {
              publicUrl: "https://example.com/mock-file",
            },
          })),
          upload: vi.fn(async () => ({ data: null, error: null })),
        })),
      },
    },
  };
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

async function renderRoute(path: string) {
  window.history.pushState({}, "", path);
  render(<App />);

  await waitFor(() => {
    expect(screen.queryByText(/^Carregando\.\.\.$/)).not.toBeInTheDocument();
  });
}

describe("App lazy routes", () => {
  it("renders the landing page route", async () => {
    await renderRoute("/");
    expect(screen.getByRole("link", { name: /Entrar/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Funcionalidades/i }).length).toBeGreaterThan(0);
  });

  it("renders the login route", async () => {
    await renderRoute("/login");
    expect(screen.getByText(/Entre para continuar sua rotina clinica/i)).toBeInTheDocument();
  });

  it("renders the psychologist register route", async () => {
    await renderRoute("/cadastro");
    expect(screen.getByText(/Criar conta de psicologo/i)).toBeInTheDocument();
  });

  it("renders the psychologist dashboard route", async () => {
    await renderRoute("/psi/dashboard");
    expect(screen.getByRole("link", { current: "page", name: /Dashboard/i })).toBeInTheDocument();
    expect(await screen.findByText(/Consultas Hoje/i)).toBeInTheDocument();
    expect(screen.getByText(/Psicologo Teste/i)).toBeInTheDocument();
  });

  it("renders the patient dashboard route", async () => {
    await renderRoute("/paciente/dashboard");
    expect(screen.getByRole("link", { current: "page", name: /Dashboard/i })).toBeInTheDocument();
    expect(await screen.findByText(/Ola, Paciente/i)).toBeInTheDocument();
    expect(screen.getByText(/Paciente Teste/i)).toBeInTheDocument();
  });

  it("renders the admin dashboard route", async () => {
    await renderRoute("/admin/dashboard");
    expect(screen.getByRole("link", { current: "page", name: /Dashboard/i })).toBeInTheDocument();
    expect(await screen.findByText(/Dashboard Administrativo/i)).toBeInTheDocument();
    expect(screen.getByText(/Clinica Central/i)).toBeInTheDocument();
  });
});
