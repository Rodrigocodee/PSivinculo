// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => {
  let userRows = [];
  let subscriptionRows = [];

  function createSelectQuery(getRows) {
    const filters = [];
    let limitCount = null;
    let shouldReturnSingle = false;

    const query = {
      select() {
        return query;
      },
      eq(column, value) {
        filters.push((row) => row?.[column] === value);
        return query;
      },
      limit(value) {
        limitCount = value;
        return query;
      },
      maybeSingle() {
        shouldReturnSingle = true;
        return query;
      },
      then(resolve, reject) {
        let rows = getRows().filter((row) => filters.every((filter) => filter(row)));
        if (typeof limitCount === "number") rows = rows.slice(0, limitCount);

        return Promise.resolve({
          data: shouldReturnSingle ? rows[0] ?? null : rows.map((row) => ({ ...row })),
          error: null,
        }).then(resolve, reject);
      },
    };

    return query;
  }

  function buildClient() {
    return {
      from(table) {
        if (table === "usuarios") {
          return {
            select() {
              return createSelectQuery(() => userRows);
            },
          };
        }

        if (table === "assinaturas_asaas") {
          return {
            select() {
              return createSelectQuery(() => subscriptionRows);
            },
          };
        }

        if (table === "clinicas") {
          return {
            select() {
              return createSelectQuery(() => []);
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };
  }

  return {
    getServerSupabaseClient: vi.fn(() => buildClient()),
    getSupabaseServerConfig: vi.fn(() => ({
      url: "https://supabase.test",
      serviceRoleKey: "service-role",
      anonKey: "anon",
    })),
    extractBearerToken: vi.fn(() => "session-token"),
    resolveSupabaseAuthUser: vi.fn(async () => ({
      id: "auth-psi-1",
      email: "psi@example.com",
      user_metadata: {},
    })),
    reset() {
      userRows = [
        {
          id: "usuario-1",
          auth_id: "auth-psi-1",
          email: "psi@example.com",
          nome: "Dra. Camila",
          clinica_id: null,
        },
      ];
      subscriptionRows = [];
      this.getServerSupabaseClient.mockClear();
      this.getSupabaseServerConfig.mockClear();
      this.extractBearerToken.mockClear();
      this.resolveSupabaseAuthUser.mockClear();
    },
    setSubscriptionRows(rows) {
      subscriptionRows = rows.map((row) => ({ ...row }));
    },
  };
});

vi.mock("./supabase.mjs", () => ({
  getServerSupabaseClient: supabaseMocks.getServerSupabaseClient,
  getSupabaseServerConfig: supabaseMocks.getSupabaseServerConfig,
  extractBearerToken: supabaseMocks.extractBearerToken,
  resolveSupabaseAuthUser: supabaseMocks.resolveSupabaseAuthUser,
}));

import {
  cancelSubscriptionPlanOnAsaas,
  getCurrentSubscriptionPlanOnAsaas,
} from "./asaas.mjs";

function buildSubscription(overrides = {}) {
  return {
    id: "local-sub-1",
    owner_type: "user",
    auth_user_id: "auth-psi-1",
    asaas_customer_id: "cus_1",
    asaas_subscription_id: "sub_1",
    plano_slug: "essencial",
    status_assinatura: "ACTIVE",
    payment_status: "RECEIVED",
    valor_plano: 39.99,
    proximo_vencimento: "2026-05-20",
    forma_pagamento: "BOLETO",
    assinatura_ativa: true,
    created_at: "2026-04-20T10:00:00Z",
    updated_at: "2026-04-20T10:00:00Z",
    ...overrides,
  };
}

describe("current psychologist subscription on Asaas", () => {
  beforeEach(() => {
    supabaseMocks.reset();
  });

  it("returns the current user subscription when there is only one active record", async () => {
    supabaseMocks.setSubscriptionRows([buildSubscription()]);

    const result = await getCurrentSubscriptionPlanOnAsaas(
      { ownerType: "user" },
      {
        env: {},
        requestHeaders: {
          authorization: "Bearer session-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ownerType: "user",
        hasSubscription: true,
        canCancel: true,
        conflict: null,
        currentPlan: expect.objectContaining({
          slug: "essencial",
          status: "ACTIVE",
          subscriptionActive: true,
          subscriptionId: "sub_1",
          monthlyPrice: 39.99,
          nextDueDate: "2026-05-20",
          paymentMethod: "BOLETO",
          paymentUrl: null,
        }),
      }),
    );
  });

  it("returns the persisted payment URL for pending verification screens", async () => {
    supabaseMocks.setSubscriptionRows([
      buildSubscription({
        payment_status: "PENDING",
        assinatura_ativa: false,
        metadata: {
          paymentUrl: "https://asaas.example/invoice/pay_123",
        },
      }),
    ]);

    const result = await getCurrentSubscriptionPlanOnAsaas(
      { ownerType: "user" },
      {
        env: {},
        requestHeaders: {
          authorization: "Bearer session-token",
        },
      },
    );

    expect(result.currentPlan).toEqual(
      expect.objectContaining({
        subscriptionActive: false,
        paymentUrl: "https://asaas.example/invoice/pay_123",
      }),
    );
  });

  it("does not grant access for an Asaas ACTIVE subscription without confirmed payment", async () => {
    supabaseMocks.setSubscriptionRows([
      buildSubscription({
        payment_status: "PENDING",
        assinatura_ativa: false,
      }),
    ]);

    const result = await getCurrentSubscriptionPlanOnAsaas(
      { ownerType: "user" },
      {
        env: {},
        requestHeaders: {
          authorization: "Bearer session-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ownerType: "user",
        hasSubscription: true,
        currentPlan: expect.objectContaining({
          slug: "essencial",
          status: "ACTIVE",
          subscriptionActive: false,
        }),
        conflict: null,
      }),
    );
  });

  it("returns a conflict instead of picking an arbitrary active subscription", async () => {
    supabaseMocks.setSubscriptionRows([
      buildSubscription({ id: "local-sub-1", asaas_subscription_id: "sub_1" }),
      buildSubscription({
        id: "local-sub-2",
        asaas_subscription_id: "sub_2",
        created_at: "2026-04-21T10:00:00Z",
        updated_at: "2026-04-21T10:00:00Z",
      }),
    ]);

    const result = await getCurrentSubscriptionPlanOnAsaas(
      { ownerType: "user" },
      {
        env: {},
        requestHeaders: {
          authorization: "Bearer session-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ownerType: "user",
        hasSubscription: true,
        currentPlan: null,
        canCancel: false,
        conflict: expect.objectContaining({
          code: "MULTIPLE_ACTIVE_USER_SUBSCRIPTIONS",
          activeCount: 2,
          subscriptions: expect.arrayContaining([
            expect.objectContaining({ subscriptionId: "sub_1" }),
            expect.objectContaining({ subscriptionId: "sub_2" }),
          ]),
        }),
      }),
    );
  });

  it("blocks cancellation without an explicit reviewed subscription when active records conflict", async () => {
    supabaseMocks.setSubscriptionRows([
      buildSubscription({ id: "local-sub-1", asaas_subscription_id: "sub_1" }),
      buildSubscription({ id: "local-sub-2", asaas_subscription_id: "sub_2" }),
    ]);

    await expect(
      cancelSubscriptionPlanOnAsaas(
        { ownerType: "user" },
        {
          env: {
            ASAAS_API_KEY: "asaas-key",
            ASAAS_BASE_URL: "https://sandbox.asaas.com/api/v3",
          },
          requestHeaders: {
            authorization: "Bearer session-token",
          },
        },
      ),
    ).rejects.toMatchObject({
      code: "MULTIPLE_ACTIVE_USER_SUBSCRIPTIONS",
      status: 409,
    });
  });
});
