// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => {
  let authUser = null;
  let rowsByTable = {};
  let columnsByTable = {};
  let tableCalls = [];
  let selectCalls = [];
  let auditRows = [];

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every((filter) => {
        if (filter.type === "eq") return row?.[filter.column] === filter.value;
        if (filter.type === "is") return row?.[filter.column] === filter.value;
        return true;
      }),
    );
  }

  function parseSelectedColumns(selectValue) {
    if (!selectValue || selectValue === "*") return [];

    return String(selectValue)
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean)
      .map((column) => column.split(":").pop().trim())
      .map((column) => column.split("(")[0].trim())
      .filter(Boolean);
  }

  function findMissingSelectedColumn(table, selectValue) {
    const selectedColumns = parseSelectedColumns(selectValue);
    if (!selectedColumns.length) return "";

    const tableColumns = columnsByTable[table];
    if (!tableColumns) return "";

    return selectedColumns.find((column) => !tableColumns.has(column)) || "";
  }

  function buildMissingColumnError(table, selectValue) {
    const missingColumn = findMissingSelectedColumn(table, selectValue);
    if (!missingColumn) return null;

    return {
      code: "42703",
      message: `column ${table}.${missingColumn} does not exist`,
      details: `Missing column ${missingColumn} in ${table}`,
    };
  }

  function buildQuery(table) {
    const filters = [];
    let limitValue = null;
    let selectValue = "*";

    const query = {
      pendingUpdate: null,
      pendingInsert: null,
      select(value = "*") {
        selectValue = value;
        selectCalls.push({ table, select: value });
        return query;
      },
      eq(column, value) {
        filters.push({ type: "eq", column, value });
        return query;
      },
      is(column, value) {
        filters.push({ type: "is", column, value });
        return query;
      },
      limit(value) {
        limitValue = value;
        return query;
      },
      async maybeSingle() {
        const selectedColumnError = buildMissingColumnError(table, selectValue);
        if (selectedColumnError) {
          return { data: null, error: selectedColumnError };
        }

        const rows = applyFilters(rowsByTable[table] || [], filters);
        if (query.pendingUpdate) {
          const row = rows[0] || null;
          if (!row) return { data: null, error: null };
          Object.assign(row, query.pendingUpdate);
          return {
            data: { ...row },
            error: null,
          };
        }
        return {
          data: rows[0] ? { ...rows[0] } : null,
          error: null,
        };
      },
      then(resolve, reject) {
        const selectedColumnError = buildMissingColumnError(table, selectValue);
        if (selectedColumnError) {
          return Promise.resolve({
            data: null,
            error: selectedColumnError,
          }).then(resolve, reject);
        }

        if (query.pendingInsert) {
          const payload = Array.isArray(query.pendingInsert) ? query.pendingInsert : [query.pendingInsert];
          rowsByTable[table] = rowsByTable[table] || [];
          for (const row of payload) {
            const stored = { id: `${table}-${rowsByTable[table].length + 1}`, ...row };
            rowsByTable[table].push(stored);
            if (table === "admin_master_audit_logs") auditRows.push(stored);
          }
          return Promise.resolve({
            data: payload,
            error: null,
          }).then(resolve, reject);
        }

        let rows = applyFilters(rowsByTable[table] || [], filters);
        if (typeof limitValue === "number") rows = rows.slice(0, limitValue);

        return Promise.resolve({
          data: rows.map((row) => ({ ...row })),
          error: null,
        }).then(resolve, reject);
      },
      insert(payload) {
        query.pendingInsert = payload;
        return query;
      },
      update(payload) {
        query.pendingUpdate = payload;
        return query;
      },
      delete() {
        throw new Error("Admin Master actions must not delete rows.");
      },
    };

    return query;
  }

  const client = {
    from(table) {
      tableCalls.push(table);
      return buildQuery(table);
    },
  };

  return {
    getServerSupabaseClient: vi.fn(() => client),
    resolveSupabaseAuthUser: vi.fn(async () => authUser),
    extractBearerToken: vi.fn((headers) => {
      const authorization = headers?.authorization || headers?.Authorization || "";
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      return match?.[1] || "";
    }),
    reset() {
      authUser = {
        id: "admin-auth-1",
        email: "master@example.com",
      };
      rowsByTable = {
        admin_master_users: [
          {
            auth_user_id: "admin-auth-1",
            revoked_at: null,
          },
        ],
        usuarios: [
          {
            id: "psi-row-1",
            auth_id: "psi-auth-1",
            nome: "Dra. Camila",
            email: "camila@example.com",
            telefone: "11999990000",
            tipo_usuario: "psicologo",
            ativo: true,
            clinica_id: "clinic-1",
            plano_slug: "profissional",
            status_assinatura: "ACTIVE",
            assinatura_ativa: true,
            professional_access_granted: true,
            professional_access_status: "active",
            created_at: "2026-05-01T10:00:00Z",
          },
          {
            id: "patient-like-user",
            auth_id: "patient-auth-1",
            nome: "Ana",
            email: "ana@example.com",
            tipo_usuario: "paciente",
            created_at: "2026-05-01T11:00:00Z",
          },
        ],
        pacientes: [
          {
            id: "patient-auth-1",
            nome: "Ana",
            email: "ana@example.com",
            created_at: "2026-05-01T12:00:00Z",
          },
        ],
        clinicas: [
          {
            id: "clinic-1",
            nome: "Clinica Aurora",
            email: "contato@aurora.test",
            plano_slug: "clinica",
            status_assinatura: "PENDING",
            assinatura_ativa: false,
            created_at: "2026-04-30T10:00:00Z",
          },
        ],
        consultas: [
          {
            id: "consulta-1",
            status_pagamento: "pago",
            valor_consulta: 200,
            created_at: "2026-05-01T12:00:00Z",
          },
          {
            id: "consulta-2",
            status_pagamento: "aguardando_pagamento",
            valor_consulta: 150,
            created_at: "2026-05-01T13:00:00Z",
          },
          {
            id: "consulta-3",
            status_pagamento: null,
            valor_consulta: 100,
            created_at: "2026-05-01T14:00:00Z",
          },
        ],
        assinaturas_asaas: [
          {
            id: "sub-row-1",
            owner_type: "user",
            auth_user_id: "psi-auth-1",
            clinica_id: null,
            plano_slug: "profissional",
            status_assinatura: "ACTIVE",
            payment_status: "CONFIRMED",
            assinatura_ativa: true,
            valor_plano: 99.9,
            proximo_vencimento: "2026-06-01",
            asaas_subscription_id: "sub_123456789abcdef",
            created_at: "2026-05-01T10:00:00Z",
            updated_at: "2026-05-02T10:00:00Z",
          },
          {
            id: "sub-row-2",
            owner_type: "clinic",
            auth_user_id: null,
            clinica_id: "clinic-1",
            plano_slug: "clinica",
            status_assinatura: "PENDING",
            payment_status: "PENDING",
            assinatura_ativa: false,
            valor_plano: 299,
            proximo_vencimento: "2026-06-01",
            asaas_subscription_id: "sub_pending",
            created_at: "2026-05-01T10:00:00Z",
            updated_at: "2026-05-02T10:00:00Z",
          },
        ],
        admin_master_audit_logs: [],
        asaas_webhook_events: [
          {
            id: "webhook-1",
            event_id: "evt-1",
            event_type: "PAYMENT_CONFIRMED",
            processing_status: "processed",
            asaas_subscription_id: "sub_123456789abcdef",
            asaas_payment_id: "pay_1",
            error_message: null,
            attempts: 1,
            created_at: "2026-05-02T10:00:00Z",
            updated_at: "2026-05-02T10:01:00Z",
            processed_at: "2026-05-02T10:01:00Z",
          },
        ],
      };
      columnsByTable = Object.fromEntries(
        Object.entries(rowsByTable).map(([table, rows]) => [
          table,
          new Set(rows.flatMap((row) => Object.keys(row))),
        ]),
      );
      tableCalls = [];
      selectCalls = [];
      auditRows = [];
      this.getServerSupabaseClient.mockClear();
      this.resolveSupabaseAuthUser.mockClear();
      this.extractBearerToken.mockClear();
    },
    setAuthUser(user) {
      authUser = user;
    },
    setRows(table, rows) {
      rowsByTable[table] = rows;
      if (rows.length) {
        columnsByTable[table] = new Set(rows.flatMap((row) => Object.keys(row)));
      }
    },
    setColumns(table, columns) {
      columnsByTable[table] = new Set(columns);
    },
    getTableCalls() {
      return tableCalls;
    },
    getSelectCalls() {
      return selectCalls;
    },
    getRows(table) {
      return rowsByTable[table] || [];
    },
    getAuditRows() {
      return auditRows;
    },
  };
});

const asaasMocks = vi.hoisted(() => ({
  getAsaasConfig: vi.fn(() => ({
    apiKey: "asaas-key",
    baseUrl: "https://sandbox.asaas.com/api/v3",
  })),
  asaasRequest: vi.fn(),
}));

vi.mock("./supabase.mjs", () => ({
  extractBearerToken: supabaseMocks.extractBearerToken,
  getServerSupabaseClient: supabaseMocks.getServerSupabaseClient,
  resolveSupabaseAuthUser: supabaseMocks.resolveSupabaseAuthUser,
}));

vi.mock("./asaas.mjs", () => ({
  asaasRequest: asaasMocks.asaasRequest,
  getAsaasConfig: asaasMocks.getAsaasConfig,
}));

import { executeAdminMasterAction, getAdminMasterOverview } from "./admin-master.mjs";

describe("getAdminMasterOverview", () => {
  beforeEach(() => {
    supabaseMocks.reset();
    asaasMocks.getAsaasConfig.mockClear();
    asaasMocks.asaasRequest.mockReset();
  });

  it("rejects requests without an authenticated user before reading global tables", async () => {
    supabaseMocks.setAuthUser(null);

    await expect(
      getAdminMasterOverview({}, { requestHeaders: {}, env: {} }),
    ).rejects.toMatchObject({
      status: 401,
      code: "ADMIN_MASTER_AUTH_REQUIRED",
    });

    expect(supabaseMocks.getTableCalls()).toEqual([]);
  });

  it("blocks non-master users without reading global data", async () => {
    supabaseMocks.setRows("admin_master_users", []);

    await expect(
      getAdminMasterOverview(
        {},
        {
          requestHeaders: {
            authorization: "Bearer user-token",
          },
          env: {},
        },
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: "ADMIN_MASTER_FORBIDDEN",
    });

    expect(supabaseMocks.getTableCalls()).toEqual(["admin_master_users"]);
  });

  it("returns read-only global support data for authorized master admins", async () => {
    const result = await getAdminMasterOverview(
      {
        search: "profissional",
        limit: 10,
      },
      {
        requestHeaders: {
          authorization: "Bearer admin-token",
        },
        env: {},
      },
    );

    expect(result.summary).toEqual({
      psychologistsTotal: 1,
      patientsTotal: 1,
      clinicsTotal: 1,
      consultationsTotal: 3,
      subscriptionsActive: 1,
      subscriptionsPending: 1,
      subscriptionsCancelled: 0,
      monthlyEstimatedRevenue: 99.9,
    });
    expect(result.psychologists.items).toEqual([
      expect.objectContaining({
        id: "psi-row-1",
        name: "Dra. Camila",
        email: "camila@example.com",
        phone: "11999990000",
        planSlug: "profissional",
      }),
    ]);
    expect(result.subscriptions.items).toEqual([
      expect.objectContaining({
        asaasSubscriptionIdMasked: "sub_12...cdef",
      }),
    ]);
    expect(result.consultationFinance).toEqual(
      expect.arrayContaining([
        { status: "pago", count: 1, amount: 200 },
        { status: "aguardando_pagamento", count: 1, amount: 150 },
        { status: "nao_gerado", count: 1, amount: 100 },
      ]),
    );

    const usuariosOverviewSelect = supabaseMocks
      .getSelectCalls()
      .find((call) => call.table === "usuarios")?.select;
    expect(usuariosOverviewSelect).toBe(
      "id, auth_id, clinica_id, nome, email, telefone, tipo_usuario, ativo, plano_slug, status_assinatura, assinatura_ativa, created_at",
    );
    expect(usuariosOverviewSelect).not.toMatch(/\b(role|perfil|tipo|crp|especialidade)\b/);
  });

  it("keeps the overview available when optional consultation finance columns are absent", async () => {
    supabaseMocks.setRows("consultas", [
      {
        id: "consulta-legacy",
      },
    ]);

    const result = await getAdminMasterOverview(
      {},
      {
        requestHeaders: {
          authorization: "Bearer admin-token",
        },
        env: {},
      },
    );

    expect(result.summary.consultationsTotal).toBe(1);
    expect(result.consultationFinance).toEqual(
      expect.arrayContaining([
        { status: "nao_gerado", count: 1, amount: 0 },
      ]),
    );

    const consultasSelects = supabaseMocks
      .getSelectCalls()
      .filter((call) => call.table === "consultas")
      .map((call) => call.select);
    expect(consultasSelects.at(-1)).toBe("id");
  });
});

describe("executeAdminMasterAction", () => {
  beforeEach(() => {
    supabaseMocks.reset();
    asaasMocks.getAsaasConfig.mockClear();
    asaasMocks.asaasRequest.mockReset();
  });

  function runAction(input) {
    return executeAdminMasterAction(input, {
      requestHeaders: {
        authorization: "Bearer admin-token",
      },
      env: {
        ASAAS_API_KEY: "asaas-key",
        ASAAS_BASE_URL: "https://sandbox.asaas.com/api/v3",
      },
    });
  }

  it("blocks common users before executing or auditing an action", async () => {
    supabaseMocks.setRows("admin_master_users", []);

    await expect(
      executeAdminMasterAction(
        {
          action: "block_professional_access",
          targetTable: "usuarios",
          targetId: "psi-row-1",
          reason: "Suporte solicitado pelo financeiro.",
          confirmation: "CONFIRMAR",
        },
        {
          requestHeaders: {
            authorization: "Bearer user-token",
          },
          env: {},
        },
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: "ADMIN_MASTER_FORBIDDEN",
    });

    expect(supabaseMocks.getRows("usuarios")[0].assinatura_ativa).toBe(true);
    expect(supabaseMocks.getAuditRows()).toEqual([]);
  });

  it("requires a reason and explicit confirmation for manual actions", async () => {
    await expect(
      runAction({
        action: "release_professional_access",
        targetTable: "usuarios",
        targetId: "psi-row-1",
        reason: "",
        confirmation: "CONFIRMAR",
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "ADMIN_MASTER_REASON_REQUIRED",
    });

    await expect(
      runAction({
        action: "release_professional_access",
        targetTable: "usuarios",
        targetId: "psi-row-1",
        reason: "Liberacao manual autorizada pelo suporte.",
        confirmation: "sim",
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "ADMIN_MASTER_CONFIRMATION_REQUIRED",
    });
  });

  it("blocks professional access and records the audit log", async () => {
    const result = await runAction({
      action: "block_professional_access",
      targetTable: "usuarios",
      targetId: "psi-row-1",
      reason: "Bloqueio manual por chargeback confirmado.",
      confirmation: "CONFIRMAR",
    });

    const user = supabaseMocks.getRows("usuarios")[0];
    expect(result.result).toMatchObject({ updated: true });
    expect(user.assinatura_ativa).toBe(false);
    expect(user.professional_access_granted).toBe(false);
    expect(user.professional_access_status).toBe("blocked");
    expect(supabaseMocks.getAuditRows()).toEqual([
      expect.objectContaining({
        admin_auth_user_id: "admin-auth-1",
        action: "block_professional_access",
        target_table: "usuarios",
        target_id: "psi-row-1",
        reason: "Bloqueio manual por chargeback confirmado.",
      }),
    ]);
  });

  it("marks a local subscription as cancelled without calling Asaas cancellation", async () => {
    await runAction({
      action: "mark_subscription_cancelled",
      targetTable: "assinaturas_asaas",
      targetId: "sub-row-1",
      reason: "Ajuste local apos cancelamento ja confirmado.",
      confirmation: "CONFIRMAR",
    });

    const subscription = supabaseMocks.getRows("assinaturas_asaas")[0];
    expect(subscription.status_assinatura).toBe("CANCELLED");
    expect(subscription.assinatura_ativa).toBe(false);
    expect(asaasMocks.asaasRequest).not.toHaveBeenCalled();
    expect(supabaseMocks.getAuditRows()[0]).toMatchObject({
      action: "mark_subscription_cancelled",
      target_table: "assinaturas_asaas",
    });
  });

  it("syncs local subscription from Asaas but only activates with confirmed payment", async () => {
    asaasMocks.asaasRequest
      .mockResolvedValueOnce({
        id: "sub_123456789abcdef",
        status: "ACTIVE",
        value: 149.9,
        nextDueDate: "2026-07-01",
        billingType: "PIX",
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "pay-pending",
            status: "PENDING",
          },
        ],
      });

    await runAction({
      action: "sync_subscription_asaas",
      targetTable: "assinaturas_asaas",
      targetId: "sub-row-1",
      reason: "Sincronizacao manual solicitada pelo suporte.",
      confirmation: "CONFIRMAR",
    });

    const subscription = supabaseMocks.getRows("assinaturas_asaas")[0];
    expect(subscription.status_assinatura).toBe("ACTIVE");
    expect(subscription.payment_status).toBe("PENDING");
    expect(subscription.assinatura_ativa).toBe(false);
    expect(asaasMocks.asaasRequest).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "asaas-key" }),
      "/subscriptions/sub_123456789abcdef",
    );
    expect(supabaseMocks.getAuditRows()[0]).toMatchObject({
      action: "sync_subscription_asaas",
    });
  });

  it("returns webhook logs and duplicate detection through audited actions", async () => {
    const logsResult = await runAction({
      action: "view_webhook_logs",
      targetTable: "assinaturas_asaas",
      targetId: "sub-row-1",
      reason: "Investigacao de webhook reportado pelo suporte.",
      confirmation: "CONFIRMAR",
    });

    expect(logsResult.result).toMatchObject({
      logs: [
        expect.objectContaining({
          event_id: "evt-1",
          event_type: "PAYMENT_CONFIRMED",
        }),
      ],
    });

    supabaseMocks.setRows("assinaturas_asaas", [
      ...supabaseMocks.getRows("assinaturas_asaas"),
      {
        id: "sub-row-duplicate",
        owner_type: "user",
        auth_user_id: "psi-auth-1",
        clinica_id: null,
        plano_slug: "profissional",
        status_assinatura: "PENDING",
        payment_status: "PENDING",
        assinatura_ativa: false,
        valor_plano: 99.9,
        asaas_subscription_id: "sub_duplicate",
        created_at: "2026-05-03T10:00:00Z",
        updated_at: "2026-05-03T10:00:00Z",
      },
    ]);

    const duplicateResult = await runAction({
      action: "detect_duplicate_subscriptions",
      targetTable: "usuarios",
      targetId: "psi-row-1",
      reason: "Checagem preventiva de duplicidade.",
      confirmation: "CONFIRMAR",
    });

    expect(duplicateResult.result).toMatchObject({
      hasDuplicate: true,
      totalSubscriptions: 2,
    });
    expect(supabaseMocks.getAuditRows().map((row) => row.action)).toEqual([
      "view_webhook_logs",
      "detect_duplicate_subscriptions",
    ]);
  });
});
