import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let usuariosRow: Record<string, unknown> | null = null;
  const updates: Record<string, unknown>[] = [];
  const authGetSession = vi.fn();
  const authGetUser = vi.fn();
  const fetchPsychologistSubscription = vi.fn();

  function createSelectChain(table: string) {
    let selectedColumn = "";
    let selectedValue: unknown = "";

    const chain = {
      eq(column: string, value: unknown) {
        selectedColumn = column;
        selectedValue = value;
        return chain;
      },
      limit() {
        return chain;
      },
      async maybeSingle() {
        if (table !== "usuarios" || !usuariosRow) return { data: null, error: null };
        if (usuariosRow[selectedColumn] === selectedValue) {
          return { data: { ...usuariosRow }, error: null };
        }
        return { data: null, error: null };
      },
    };

    return chain;
  }

  function createUpdateChain(table: string, payload: Record<string, unknown>) {
    let selectedColumn = "";
    let selectedValue: unknown = "";

    const chain = {
      eq(column: string, value: unknown) {
        selectedColumn = column;
        selectedValue = value;
        return chain;
      },
      select() {
        return chain;
      },
      async maybeSingle() {
        if (table !== "usuarios" || !usuariosRow || usuariosRow[selectedColumn] !== selectedValue) {
          return { data: null, error: null };
        }

        updates.push({ ...payload });
        usuariosRow = {
          ...usuariosRow,
          ...payload,
        };

        return { data: { ...usuariosRow }, error: null };
      },
    };

    return chain;
  }

  const from = vi.fn((table: string) => ({
    select() {
      return createSelectChain(table);
    },
    update(payload: Record<string, unknown>) {
      return createUpdateChain(table, payload);
    },
  }));

  return {
    authGetSession,
    authGetUser,
    fetchPsychologistSubscription,
    from,
    reset(rowOverrides: Record<string, unknown> = {}) {
      usuariosRow = {
        id: "auth-psi-1",
        auth_id: "auth-psi-1",
        email: "psi@example.com",
        nome: "Dra. Camila",
        tipo_usuario: "psicologo",
        profile_setup_completed: true,
        asaas_customer_id: null,
        asaas_subscription_id: null,
        plano_slug: null,
        status_assinatura: null,
        valor_mensal: null,
        proximo_vencimento: null,
        forma_pagamento: null,
        assinatura_ativa: false,
        professional_access_granted: false,
        professional_access_status: "preview",
        ...rowOverrides,
      };
      updates.splice(0, updates.length);
      authGetSession.mockReset();
      authGetUser.mockReset();
      fetchPsychologistSubscription.mockReset();
      from.mockClear();
    },
    getUpdates() {
      return updates;
    },
    getUsuariosRow() {
      return usuariosRow;
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
  },
  getSupabaseRememberPreference: vi.fn(() => true),
  setSupabaseRememberPreference: vi.fn(),
}));

vi.mock("@/services/psychologistSubscription", () => ({
  fetchPsychologistSubscription: mocks.fetchPsychologistSubscription,
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
  findPsychologistByInviteCode: vi.fn(),
}));

vi.mock("@/services/subscriptionPersistence", () => ({
  linkPendingSubscriptionAfterRegistration: vi.fn(),
}));

import { resolveAuthenticatedAppUser } from "@/services/auth";

function buildUser() {
  return {
    id: "auth-psi-1",
    email: "psi@example.com",
    user_metadata: {
      role: "psychologist",
      full_name: "Dra. Camila",
      profile_setup_completed: true,
    },
  };
}

function buildSubscriptionPlan(overrides: Record<string, unknown> = {}) {
  return {
    slug: "professional",
    name: "Professional",
    status: "ACTIVE",
    monthlyPrice: 59.99,
    nextDueDate: "2026-05-20",
    startedAt: null,
    paymentMethod: "BOLETO",
    subscriptionActive: true,
    subscriptionId: "sub_active_1",
    customerId: "cus_1",
    source: "assinaturas_asaas",
    ...overrides,
  };
}

describe("resolveAuthenticatedAppUser subscription access", () => {
  beforeEach(() => {
    mocks.reset();
    const user = buildUser();
    mocks.authGetSession.mockResolvedValue({ data: { session: { user } } });
    mocks.authGetUser.mockResolvedValue({ data: { user } });
  });

  it("unlocks professional preview from the server-side current Asaas plan", async () => {
    mocks.fetchPsychologistSubscription.mockResolvedValue({
      success: true,
      ownerType: "user",
      hasSubscription: true,
      currentPlan: buildSubscriptionPlan(),
      canCancel: true,
      conflict: null,
    });

    const appUser = await resolveAuthenticatedAppUser(buildUser() as never);

    expect(appUser.hasProfessionalAccess).toBe(true);
    expect(appUser.record).toMatchObject({
      plano_slug: "professional",
      status_assinatura: "ACTIVE",
      assinatura_ativa: true,
      professional_access_status: "active",
    });
    expect(mocks.getUpdates()).toContainEqual(
      expect.objectContaining({
        asaas_subscription_id: "sub_active_1",
        plano_slug: "professional",
        assinatura_ativa: true,
        professional_access_granted: true,
        professional_access_status: "active",
      }),
    );
  });

  it("keeps preview when the current Asaas plan is pending even if usuarios has a stale active snapshot", async () => {
    mocks.reset({
      plano_slug: "professional",
      status_assinatura: "ACTIVE",
      assinatura_ativa: true,
      professional_access_granted: true,
      professional_access_status: "active",
    });
    const user = buildUser();
    mocks.authGetSession.mockResolvedValue({ data: { session: { user } } });
    mocks.authGetUser.mockResolvedValue({ data: { user } });
    mocks.fetchPsychologistSubscription.mockResolvedValue({
      success: true,
      ownerType: "user",
      hasSubscription: true,
      currentPlan: buildSubscriptionPlan({
        status: "PENDING",
        subscriptionActive: false,
        subscriptionId: "sub_pending_1",
      }),
      canCancel: false,
      conflict: null,
    });

    const appUser = await resolveAuthenticatedAppUser(user as never);

    expect(appUser.hasProfessionalAccess).toBe(false);
    expect(appUser.record).toMatchObject({
      status_assinatura: "PENDING",
      assinatura_ativa: false,
      professional_access_status: "preview",
    });
  });

  it("keeps preview when current-plan reports multiple active subscriptions instead of trusting a stale snapshot", async () => {
    mocks.reset({
      plano_slug: "professional",
      status_assinatura: "ACTIVE",
      assinatura_ativa: true,
      professional_access_granted: true,
      professional_access_status: "active",
    });
    const user = buildUser();
    mocks.authGetSession.mockResolvedValue({ data: { session: { user } } });
    mocks.authGetUser.mockResolvedValue({ data: { user } });
    mocks.fetchPsychologistSubscription.mockResolvedValue({
      success: true,
      ownerType: "user",
      hasSubscription: true,
      currentPlan: null,
      canCancel: false,
      conflict: {
        code: "MULTIPLE_ACTIVE_USER_SUBSCRIPTIONS",
        message: "Mais de uma assinatura ativa foi encontrada para este psicologo.",
        activeCount: 2,
        subscriptions: [],
      },
    });

    const appUser = await resolveAuthenticatedAppUser(user as never);

    expect(appUser.hasProfessionalAccess).toBe(false);
    expect(mocks.getUpdates()).toEqual([]);
  });
});
