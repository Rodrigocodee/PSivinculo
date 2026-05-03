import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    session: null,
    appUser: null,
    isAuthenticated: false,
    isLoading: false,
    refreshAuth: vi.fn(),
  }),
}));

vi.mock("@/contexts/PermissionsContext", () => ({
  PermissionsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  usePermissions: () => ({
    permissions: {},
    savePermissions: vi.fn(),
    updateRolePermissions: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

const successPayload = {
  success: true,
  admin: {
    id: "admin-auth-1",
    email: "master@example.com",
  },
  summary: {
    psychologistsTotal: 1,
    patientsTotal: 1,
    clinicsTotal: 1,
    consultationsTotal: 2,
    subscriptionsActive: 1,
    subscriptionsPending: 0,
    subscriptionsCancelled: 0,
    monthlyEstimatedRevenue: 99.9,
  },
  psychologists: {
    items: [
      {
        id: "psi-row-1",
        authUserId: "psi-auth-1",
        name: "Dra. Camila",
        email: "camila@example.com",
        phone: "11999990000",
        planSlug: "profissional",
        subscriptionStatus: "ACTIVE",
        subscriptionActive: true,
        createdAt: "2026-05-01T10:00:00Z",
      },
    ],
    total: 1,
    offset: 0,
    limit: 25,
    hasMore: false,
  },
  clinics: { items: [], total: 0, offset: 0, limit: 25, hasMore: false },
  subscriptions: { items: [], total: 0, offset: 0, limit: 25, hasMore: false },
  consultationFinance: [],
};

function mockSession(accessToken: string | null) {
  mocks.getSession.mockResolvedValue({
    data: {
      session: accessToken ? { access_token: accessToken } : null,
    },
  });
}

async function renderAdminMasterRoute() {
  window.history.pushState({}, "", "/admin/master");
  render(<App />);
}

describe("Admin Master route discretion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSession(null);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("does not redirect unauthenticated visitors to the conventional login", async () => {
    await renderAdminMasterRoute();

    expect(await screen.findByText("Pagina nao encontrada.")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin/master");
    expect(screen.queryByText(/Entrar para continuar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Admin Master/i)).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows a neutral page for logged users without admin master permission", async () => {
    mockSession("common-user-token");
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        success: false,
        error: {
          code: "ADMIN_MASTER_FORBIDDEN",
          message: "Usuario sem permissao para acessar o Admin Master.",
        },
      }),
    })) as typeof fetch;

    await renderAdminMasterRoute();

    await waitFor(() => {
      expect(screen.getByText("Pagina nao encontrada.")).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe("/admin/master");
    expect(screen.queryByText(/Visao global do Psivinculo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dra. Camila/i)).not.toBeInTheDocument();
  });

  it("renders the console for authorized admin master users", async () => {
    mockSession("master-token");
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => successPayload,
    })) as typeof fetch;

    await renderAdminMasterRoute();

    expect(await screen.findByText(/Visao global do Psivinculo/i)).toBeInTheDocument();
    expect(screen.getByText("Dra. Camila")).toBeInTheDocument();
    expect(screen.getByText("profissional")).toBeInTheDocument();
  });
});
