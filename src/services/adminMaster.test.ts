import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

import {
  AdminMasterAccessError,
  executeAdminMasterAction,
  fetchAdminMasterOverview,
} from "@/services/adminMaster";

describe("fetchAdminMasterOverview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "admin-token",
        },
      },
    });
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        admin: {
          id: "admin-auth-1",
          email: "master@example.com",
        },
        summary: {
          psychologistsTotal: 1,
          patientsTotal: 1,
          clinicsTotal: 1,
          consultationsTotal: 1,
          subscriptionsActive: 1,
          subscriptionsPending: 0,
          subscriptionsCancelled: 0,
          monthlyEstimatedRevenue: 99.9,
        },
        psychologists: { items: [], total: 0, offset: 0, limit: 25, hasMore: false },
        clinics: { items: [], total: 0, offset: 0, limit: 25, hasMore: false },
        subscriptions: { items: [], total: 0, offset: 0, limit: 25, hasMore: false },
        consultationFinance: [],
      }),
    })) as typeof fetch;
  });

  it("calls the server-side Admin Master endpoint with the authenticated bearer token", async () => {
    await fetchAdminMasterOverview({
      search: "camila",
      ownerType: "user",
      limit: 25,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin-master/overview",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer admin-token",
        }),
        body: JSON.stringify({
          search: "camila",
          ownerType: "user",
          limit: 25,
        }),
      }),
    );
  });

  it("does not call the Admin Master endpoint without a session", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: null,
      },
    });

    await expect(fetchAdminMasterOverview()).rejects.toBeInstanceOf(
      AdminMasterAccessError,
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("maps 403 responses to an access error without exposing data", async () => {
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

    await expect(fetchAdminMasterOverview()).rejects.toMatchObject({
      status: 403,
      code: "ADMIN_MASTER_FORBIDDEN",
    });
  });

  it("calls the server-side Admin Master action endpoint with reason and confirmation", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        action: "block_professional_access",
        target: {
          table: "usuarios",
          id: "psi-row-1",
        },
        result: {
          updated: true,
        },
      }),
    })) as typeof fetch;

    await executeAdminMasterAction({
      action: "block_professional_access",
      targetTable: "usuarios",
      targetId: "psi-row-1",
      reason: "Bloqueio manual confirmado pelo suporte.",
      confirmation: "CONFIRMAR",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin-master/action",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer admin-token",
        }),
        body: JSON.stringify({
          action: "block_professional_access",
          targetTable: "usuarios",
          targetId: "psi-row-1",
          reason: "Bloqueio manual confirmado pelo suporte.",
          confirmation: "CONFIRMAR",
        }),
      }),
    );
  });

  it("does not call the Admin Master action endpoint without a session", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: null,
      },
    });

    await expect(
      executeAdminMasterAction({
        action: "block_professional_access",
        targetTable: "usuarios",
        targetId: "psi-row-1",
        reason: "Bloqueio manual confirmado pelo suporte.",
        confirmation: "CONFIRMAR",
      }),
    ).rejects.toBeInstanceOf(AdminMasterAccessError);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
