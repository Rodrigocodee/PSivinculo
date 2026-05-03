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
      responseData = Array.isArray(responseData) ? responseData[0] ?? null : responseData;
      return builder;
    },
    single() {
      responseData = Array.isArray(responseData) ? responseData[0] ?? {} : responseData ?? {};
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

function getMockTableData(table: string) {
  const user = getMockUser();
  const role = resolveRoleFromPath(window.location.pathname);

  if (table === "usuarios" && user && role) {
    return [
      {
        id: user.id,
        auth_id: user.id,
        email: user.email,
        nome: user.user_metadata.full_name,
        tipo_usuario: user.user_metadata.tipo_usuario,
        tipo: user.user_metadata.tipo_usuario,
        clinica_id: "clinic-1",
      },
    ];
  }

  if (table === "clinicas") {
    return [
      {
        id: "clinic-1",
        nome: "Clinica Central",
        codigo_convite: "CLI-123456",
      },
    ];
  }

  if (table === "pacientes" && user) {
    return [
      {
        id: user.id,
        clinica_id: "clinic-1",
        psicologo_id: "psi-1",
        nome: user.user_metadata.full_name,
        email: user.email,
      },
    ];
  }

  return [];
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

vi.mock("@/services/psychologistSubscription", () => ({
  psychologistSubscriptionQueryKey: ["psychologist-subscription"],
  fetchPsychologistSubscription: vi.fn(async () => ({
    success: true,
    ownerType: "user",
    hasSubscription: false,
    currentPlan: null,
    canCancel: false,
    conflict: null,
  })),
  cancelPsychologistSubscription: vi.fn(),
}));

vi.mock("@/services/psychologistPlanSelection", () => ({
  psychologistPlansRoute: "/psi/planos",
  psychologistPlanSelectionQueryKey: ["psychologist-plan-selection"],
  listPsychologistIndividualPlans: () => [
    {
      routeKey: "essencial",
      slug: "essencial",
      name: "Essencial",
      value: 39.99,
      priceLabel: "R$ 39,99",
      description: "Assinatura mensal essencial.",
      recommended: false,
      features: ["Agenda profissional"],
    },
    {
      routeKey: "profissional",
      slug: "profissional",
      name: "Profissional",
      value: 59.99,
      priceLabel: "R$ 59,99",
      description: "Assinatura mensal profissional.",
      recommended: true,
      features: ["Pacientes ilimitados"],
    },
  ],
  createPsychologistPlanSubscription: vi.fn(),
  createPsychologistSubscriptionPaymentLink: vi.fn(),
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
    pendingPayments: [],
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
      from: vi.fn((table: string) => createQueryBuilder(getMockTableData(table))),
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

  await waitFor(
    () => {
      expect(screen.queryByText(/^Carregando\.\.\.$/)).not.toBeInTheDocument();
    },
    { timeout: 5_000 },
  );
}

describe("App lazy routes", () => {
  it("renders the landing page route", async () => {
    await renderRoute("/");
    expect(screen.getByRole("link", { name: /Entrar/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Funcionalidades/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Criado com propósito, pensado para cuidar" })).toBeInTheDocument();
    expect(screen.getByText(/nasceu de uma experi/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/rotina dos psic/i);
    expect(document.body.textContent).not.toMatch(/rotina de psic/i);
    expect(screen.queryByText(/Meu nome/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Conhecer a hist/i })).toHaveAttribute("href", "/sobre");
    expect(screen.getByRole("heading", { name: "Essencial" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profissional" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clínica Duo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clínica Expansão" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Escolher plano/i })).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Ver teaser/i })).toHaveAttribute("href", "/psicologos-da-plataforma");
  });

  it("renders the full about page story", async () => {
    await renderRoute("/sobre");
    expect(screen.getByRole("navigation", { name: /Navegacao institucional/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar ao inicio/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("heading", { name: /Criado com prop/i })).toBeInTheDocument();
    expect(screen.getByText(/Meu nome/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Rodrigo Ferreira/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Rodrigo Ferreira/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Fundador do Psiv/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Formado em An/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: /Prop/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Tecnologia com sensibilidade" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Um projeto em evol/i })).toBeInTheDocument();
    expect(screen.queryByText(/placeholder/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Uma base institucional simples hoje/i)).not.toBeInTheDocument();
  });

  it("renders the public demo route without authentication", async () => {
    await renderRoute("/demo");
    expect(screen.getByText(/Você está vendo uma demonstração/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Agenda$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Financeiro/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Criar conta/i })[0]).toHaveAttribute("href", "/cadastro");
  });

  it("renders the platform psychologists teaser route without authentication", async () => {
    await renderRoute("/psicologos-da-plataforma");
    expect(screen.getByRole("heading", { name: "Psicólogos da plataforma" })).toBeInTheDocument();
    expect(screen.getAllByText("Em breve").length).toBeGreaterThan(0);
    expect(screen.getByText(/perfis abaixo são fictícios/i)).toBeInTheDocument();
    expect(screen.getByText("Ana Luiza Martins")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Ver perfil/i }).length).toBeGreaterThan(0);
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

  it("renders the dedicated psychologist plans route", async () => {
    await renderRoute("/psi/planos");
    expect(await screen.findByRole("heading", { name: /Escolha seu plano/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Essencial" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profissional" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Clínica Duo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Clínica Expansão" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Escolher plano/i })).toHaveLength(2);
  });

  it("renders the psychologist payment return route", async () => {
    await renderRoute("/psi/pagamento/retorno");
    expect(await screen.findByText(/Ainda nao identificamos a confirmacao do pagamento/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Verificar novamente/i })).toBeInTheDocument();
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
    expect(screen.getAllByText(/Clinica Central/i).length).toBeGreaterThan(0);
  });
});
