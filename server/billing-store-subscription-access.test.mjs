// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => {
  let subscriptionRows = [];
  let userRows = [];
  const subscriptionUpserts = [];
  const userUpdates = [];

  function clone(row) {
    return row ? { ...row } : row;
  }

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
          data: shouldReturnSingle ? clone(rows[0] ?? null) : rows.map(clone),
          error: null,
        }).then(resolve, reject);
      },
    };

    return query;
  }

  function createUpdateQuery(table, payload) {
    let eqColumn = "";
    let eqValue = "";

    return {
      eq(column, value) {
        eqColumn = column;
        eqValue = value;

        if (table === "usuarios") {
          userRows = userRows.map((row) => {
            if (row?.[eqColumn] !== eqValue) return row;
            const updatedRow = { ...row, ...payload };
            userUpdates.push({ table, eqColumn, eqValue, payload: clone(payload) });
            return updatedRow;
          });
        }

        return Promise.resolve({ error: null });
      },
    };
  }

  function createUpsertQuery(table, payload) {
    const persistedPayload = { id: "sub-row-1", created_at: "2026-05-01T10:00:00Z", ...payload };

    return {
      select() {
        return this;
      },
      maybeSingle() {
        if (table === "assinaturas_asaas") {
          subscriptionUpserts.push(clone(persistedPayload));
          const existingIndex = subscriptionRows.findIndex(
            (row) => row.asaas_subscription_id === persistedPayload.asaas_subscription_id,
          );
          if (existingIndex >= 0) {
            subscriptionRows[existingIndex] = { ...subscriptionRows[existingIndex], ...persistedPayload };
          } else {
            subscriptionRows.push(clone(persistedPayload));
          }
        }

        return Promise.resolve({ data: clone(persistedPayload), error: null });
      },
    };
  }

  const client = {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: {
            user: {
              user_metadata: {},
            },
          },
        })),
        updateUserById: vi.fn(async () => ({ error: null })),
      },
    },
    from(table) {
      return {
        select() {
          if (table === "assinaturas_asaas") return createSelectQuery(() => subscriptionRows);
          if (table === "usuarios") return createSelectQuery(() => userRows);
          if (table === "clinicas") return createSelectQuery(() => []);
          throw new Error(`Unexpected select table: ${table}`);
        },
        update(payload) {
          return createUpdateQuery(table, payload);
        },
        upsert(payload) {
          return createUpsertQuery(table, payload);
        },
      };
    },
  };

  return {
    getServerSupabaseClient: vi.fn(() => client),
    extractBearerToken: vi.fn(() => ""),
    resolveSupabaseAuthUser: vi.fn(async () => null),
    reset() {
      subscriptionRows = [];
      userRows = [
        {
          id: "auth-psi-1",
          auth_id: "auth-psi-1",
          email: "psi@example.com",
          asaas_subscription_id: null,
          plano_slug: null,
          status_assinatura: null,
          valor_mensal: null,
          proximo_vencimento: null,
          forma_pagamento: null,
          assinatura_ativa: false,
          professional_access_granted: false,
          professional_access_status: "preview",
        },
      ];
      subscriptionUpserts.splice(0, subscriptionUpserts.length);
      userUpdates.splice(0, userUpdates.length);
      client.auth.admin.getUserById.mockClear();
      client.auth.admin.updateUserById.mockClear();
      this.getServerSupabaseClient.mockClear();
    },
    getSubscriptionUpserts() {
      return subscriptionUpserts;
    },
    getUserUpdates() {
      return userUpdates;
    },
  };
});

vi.mock("./supabase.mjs", () => ({
  getServerSupabaseClient: supabaseMocks.getServerSupabaseClient,
  extractBearerToken: supabaseMocks.extractBearerToken,
  resolveSupabaseAuthUser: supabaseMocks.resolveSupabaseAuthUser,
}));

import { persistAsaasSubscriptionState } from "./billing-store.mjs";

function buildBaseInput(overrides = {}) {
  return {
    ownerContext: {
      ownerType: "user",
      ownerResolutionSource: "test",
      authUserId: "auth-psi-1",
      clinicaId: null,
    },
    plan: {
      slug: "profissional",
      name: "Profissional",
      value: 59.99,
      billingType: "BOLETO",
    },
    asaasCustomerId: "cus_1",
    asaasSubscriptionId: "sub_1",
    asaasPaymentId: "pay_1",
    subscriptionStatus: "ACTIVE",
    paymentMethod: "BOLETO",
    nextDueDate: "2026-05-20",
    ...overrides,
  };
}

describe("persistAsaasSubscriptionState access gating", () => {
  beforeEach(() => {
    supabaseMocks.reset();
  });

  it("keeps access disabled when Asaas creates an ACTIVE subscription without payment confirmation", async () => {
    await persistAsaasSubscriptionState(
      buildBaseInput({
        eventType: "SUBSCRIPTION_CREATED",
        paymentStatus: "PENDING",
      }),
      {},
    );

    expect(supabaseMocks.getSubscriptionUpserts()[0]).toMatchObject({
      status_assinatura: "PENDING",
      payment_status: "PENDING",
      assinatura_ativa: false,
    });
    expect(supabaseMocks.getUserUpdates()).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          status_assinatura: "PENDING",
          assinatura_ativa: false,
          professional_access_granted: false,
          professional_access_status: "pending",
        }),
      }),
    );
  });

  it("grants access only after a confirmed subscription payment event", async () => {
    await persistAsaasSubscriptionState(
      buildBaseInput({
        eventType: "PAYMENT_CONFIRMED",
        paymentStatus: "CONFIRMED",
      }),
      {},
    );

    expect(supabaseMocks.getSubscriptionUpserts()[0]).toMatchObject({
      status_assinatura: "ACTIVE",
      payment_status: "CONFIRMED",
      assinatura_ativa: true,
    });
    expect(supabaseMocks.getUserUpdates()).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          status_assinatura: "ACTIVE",
          assinatura_ativa: true,
          professional_access_granted: true,
          professional_access_status: "active",
        }),
      }),
    );
  });
});
