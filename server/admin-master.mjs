import {
  extractBearerToken,
  getServerSupabaseClient,
  resolveSupabaseAuthUser,
} from "./supabase.mjs";
import { asaasRequest, getAsaasConfig } from "./asaas.mjs";
import { HttpError } from "./errors.mjs";

const MAX_SOURCE_ROWS = 1000;
const MAX_PAGE_LIMIT = 50;
const MAX_WEBHOOK_LOG_ROWS = 100;
const ADMIN_MASTER_CONFIRMATION_TOKEN = "CONFIRMAR";
const PSYCHOLOGIST_ROLE_TOKENS = new Set([
  "psicologo",
  "psicologa",
  "psychologist",
  "therapist",
]);
const SUBSCRIPTION_TERMINAL_STATUSES = new Set([
  "CANCELLED",
  "INACTIVE",
  "DELETED",
  "EXPIRED",
]);
const ACTIVE_PAYMENT_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
const DUPLICATE_OPEN_STATUSES = new Set(["ACTIVE", "PENDING", "OVERDUE"]);
const USUARIOS_OVERVIEW_COLUMNS = [
  "id",
  "auth_id",
  "clinica_id",
  "nome",
  "email",
  "telefone",
  "tipo_usuario",
  "ativo",
  "plano_slug",
  "status_assinatura",
  "assinatura_ativa",
  "created_at",
];
const PACIENTES_OVERVIEW_COLUMNS = ["id"];
const CLINICAS_OVERVIEW_COLUMNS = [
  "id",
  "nome",
  "email",
  "plano_slug",
  "status_assinatura",
  "assinatura_ativa",
  "created_at",
];
const CONSULTAS_OVERVIEW_COLUMNS = ["id"];
const CONSULTAS_OVERVIEW_OPTIONAL_COLUMNS = ["created_at", "status_pagamento", "valor_consulta"];
const ASSINATURAS_OVERVIEW_COLUMNS = [
  "id",
  "owner_type",
  "auth_user_id",
  "clinica_id",
  "plano_slug",
  "status_assinatura",
  "payment_status",
  "assinatura_ativa",
  "valor_plano",
  "proximo_vencimento",
  "asaas_subscription_id",
  "created_at",
  "updated_at",
];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToken(value) {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function pickString(source, keys) {
  if (!source || typeof source !== "object") return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function pickBoolean(source, keys) {
  if (!source || typeof source !== "object") return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
  }

  return null;
}

function pickNumber(source, keys) {
  if (!source || typeof source !== "object") return 0;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim().replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return 0;
}

function clampPageLimit(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(parsed, MAX_PAGE_LIMIT);
}

function clampOffset(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function maskIdentifier(value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return "";
  if (normalizedValue.length <= 8) return `${normalizedValue.slice(0, 2)}***`;
  return `${normalizedValue.slice(0, 6)}...${normalizedValue.slice(-4)}`;
}

function sortByRecent(left, right) {
  const leftTime = Date.parse(
    normalizeString(left.updated_at) ||
      normalizeString(left.created_at) ||
      normalizeString(left.proximo_vencimento) ||
      "",
  );
  const rightTime = Date.parse(
    normalizeString(right.updated_at) ||
      normalizeString(right.created_at) ||
      normalizeString(right.proximo_vencimento) ||
      "",
  );

  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
}

function buildSelect(columns) {
  return columns.join(", ");
}

function readErrorField(error, field) {
  const value = error?.[field];
  return typeof value === "string" ? value.trim() : "";
}

function buildQueryErrorDetails(table, select, error, queryName) {
  return {
    table,
    query: queryName || null,
    select,
    message: readErrorField(error, "message") || null,
    code: readErrorField(error, "code") || null,
    details: readErrorField(error, "details") || null,
    hint: readErrorField(error, "hint") || null,
  };
}

function isMissingColumnError(error) {
  const code = readErrorField(error, "code");
  const message = `${readErrorField(error, "message")} ${readErrorField(error, "details")} ${readErrorField(error, "hint")}`;

  return (
    code === "42703" ||
    code === "PGRST204" ||
    /\bcolumn\b.+\bdoes not exist\b/i.test(message) ||
    /could not find.+\bcolumn\b/i.test(message)
  );
}

function resolveMissingOptionalColumn(error, optionalColumns) {
  const haystack = `${readErrorField(error, "message")} ${readErrorField(error, "details")} ${readErrorField(error, "hint")}`.toLowerCase();

  return optionalColumns.find((column) => haystack.includes(column.toLowerCase())) || "";
}

async function fetchRows(client, table, select, queryName = "") {
  const { data, error } = await client
    .from(table)
    .select(select)
    .limit(MAX_SOURCE_ROWS);

  if (error) {
    throw new HttpError(500, `Nao foi possivel carregar ${table}.`, {
      code: "ADMIN_MASTER_QUERY_FAILED",
      details: buildQueryErrorDetails(table, select, error, queryName),
    });
  }

  return Array.isArray(data) ? data : [];
}

async function fetchRowsWithOptionalColumns(client, table, requiredColumns, optionalColumns, queryName) {
  let remainingOptionalColumns = [...optionalColumns];

  while (true) {
    const select = buildSelect([...requiredColumns, ...remainingOptionalColumns]);
    const { data, error } = await client
      .from(table)
      .select(select)
      .limit(MAX_SOURCE_ROWS);

    if (!error) {
      return Array.isArray(data) ? data : [];
    }

    if (!remainingOptionalColumns.length || !isMissingColumnError(error)) {
      throw new HttpError(500, `Nao foi possivel carregar ${table}.`, {
        code: "ADMIN_MASTER_QUERY_FAILED",
        details: buildQueryErrorDetails(table, select, error, queryName),
      });
    }

    const missingColumn = resolveMissingOptionalColumn(error, remainingOptionalColumns);
    remainingOptionalColumns = missingColumn
      ? remainingOptionalColumns.filter((column) => column !== missingColumn)
      : [];
  }
}

async function fetchSingleRow(client, table, column, value) {
  const select = "*";
  const { data, error } = await client
    .from(table)
    .select(select)
    .eq(column, value)
    .maybeSingle();

  if (error) {
    const details = buildQueryErrorDetails(table, select, error, "admin_master.single_row");
    throw new HttpError(500, `Nao foi possivel carregar ${table}.`, {
      code: "ADMIN_MASTER_QUERY_FAILED",
      details: {
        ...details,
        column,
      },
    });
  }

  if (!data) {
    throw new HttpError(404, "Registro alvo nao encontrado.", {
      code: "ADMIN_MASTER_TARGET_NOT_FOUND",
      details: { table, column },
    });
  }

  return data;
}

async function updateSingleRow(client, table, id, patch) {
  const select = "*";
  const { data, error } = await client
    .from(table)
    .update(patch)
    .eq("id", id)
    .select(select)
    .maybeSingle();

  if (error) {
    const details = buildQueryErrorDetails(table, select, error, "admin_master.update_row");
    throw new HttpError(500, `Nao foi possivel atualizar ${table}.`, {
      code: "ADMIN_MASTER_UPDATE_FAILED",
      details: {
        ...details,
        id,
      },
    });
  }

  return data || null;
}

async function insertAdminAuditLog(client, input) {
  const auditRow = {
    admin_auth_user_id: input.adminAuthUserId,
    action: input.action,
    target_table: input.targetTable,
    target_id: input.targetId,
    before_snapshot: input.beforeSnapshot || {},
    after_snapshot: input.afterSnapshot || {},
    reason: input.reason,
  };
  const { error } = await client
    .from("admin_master_audit_logs")
    .insert([auditRow]);

  if (error) {
    throw new HttpError(500, "Nao foi possivel registrar a auditoria da acao Admin Master.", {
      code: "ADMIN_MASTER_AUDIT_LOG_FAILED",
      details: {
        message: normalizeString(error.message) || null,
        code: normalizeString(error.code) || null,
      },
    });
  }

  return auditRow;
}

function resolveRole(row) {
  return normalizeToken(pickString(row, ["tipo_usuario"]));
}

function isPsychologist(row) {
  const role = resolveRole(row);
  return PSYCHOLOGIST_ROLE_TOKENS.has(role);
}

function normalizeStatus(value) {
  return normalizeString(value).toUpperCase() || "NAO_INFORMADO";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildPatchFromExisting(row, draft) {
  const patch = {};

  if (!isRecord(row)) return patch;

  for (const [key, value] of Object.entries(draft)) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      patch[key] = value;
    }
  }

  return patch;
}

function requireNonEmptyPatch(patch, message, code) {
  if (!Object.keys(patch).length) {
    throw new HttpError(400, message, { code });
  }
}

function resolveSubscriptionBucket(subscription) {
  const status = normalizeStatus(subscription.status_assinatura);
  const paymentStatus = normalizeStatus(subscription.payment_status);
  const active = subscription.assinatura_ativa === true;

  if (active || status === "ACTIVE") return "active";
  if (SUBSCRIPTION_TERMINAL_STATUSES.has(status)) return "cancelled";
  if (["CONFIRMED", "RECEIVED"].includes(paymentStatus) && !SUBSCRIPTION_TERMINAL_STATUSES.has(status)) {
    return "active";
  }
  return "pending";
}

function resolveConsultationPaymentStatus(row) {
  const status = normalizeToken(pickString(row, ["status_pagamento", "payment_status"]));
  if (status === "pago" || status === "paid") return "pago";
  if (status === "vencido" || status === "overdue") return "vencido";
  if (status === "aguardandopagamento" || status === "aguardando_pagamento" || status === "pending") {
    return "aguardando_pagamento";
  }
  if (!status || status === "naogerado" || status === "nao_gerado") return "nao_gerado";
  return status;
}

function matchesSearch(row, keys, search) {
  if (!search) return true;
  return keys.some((key) => normalizeString(row[key]).toLowerCase().includes(search));
}

function filterByValue(row, key, value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return true;
  return normalizeString(row[key]).toLowerCase() === normalizedValue.toLowerCase();
}

function paginate(items, offset, limit) {
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    offset,
    limit,
    hasMore: offset + limit < items.length,
  };
}

function mapPsychologist(row) {
  return {
    id: pickString(row, ["id", "auth_id", "email"]),
    authUserId: pickString(row, ["auth_id"]),
    name: pickString(row, ["nome", "name", "full_name"]) || "Sem nome",
    email: pickString(row, ["email"]) || "Sem e-mail",
    phone: pickString(row, ["telefone"]),
    planSlug: pickString(row, ["plano_slug"]),
    subscriptionStatus: pickString(row, ["status_assinatura"]),
    subscriptionActive: pickBoolean(row, ["assinatura_ativa"]) === true,
    createdAt: pickString(row, ["created_at"]),
  };
}

function mapClinic(row, psychologistCounts) {
  const id = pickString(row, ["id"]);
  const status = pickString(row, ["status_assinatura"]) || (row.assinatura_ativa === true ? "ACTIVE" : "NAO_INFORMADO");

  return {
    id,
    name: pickString(row, ["nome", "name", "nome_clinica", "clinic_name"]) || "Clinica sem nome",
    email: pickString(row, ["email"]),
    status,
    psychologistCount: psychologistCounts.get(id) || 0,
    planSlug: pickString(row, ["plano_slug"]),
    subscriptionStatus: pickString(row, ["status_assinatura"]),
    subscriptionActive: pickBoolean(row, ["assinatura_ativa"]) === true,
    createdAt: pickString(row, ["created_at"]),
  };
}

function mapSubscription(row) {
  return {
    id: pickString(row, ["id", "asaas_subscription_id"]),
    ownerType: pickString(row, ["owner_type"]),
    authUserId: pickString(row, ["auth_user_id"]),
    clinicId: pickString(row, ["clinica_id"]),
    planSlug: pickString(row, ["plano_slug"]),
    subscriptionStatus: pickString(row, ["status_assinatura"]),
    paymentStatus: pickString(row, ["payment_status"]),
    subscriptionActive: pickBoolean(row, ["assinatura_ativa"]) === true,
    planValue: pickNumber(row, ["valor_plano"]),
    nextDueDate: pickString(row, ["proximo_vencimento"]),
    asaasSubscriptionIdMasked: maskIdentifier(pickString(row, ["asaas_subscription_id"])),
    createdAt: pickString(row, ["created_at"]),
    updatedAt: pickString(row, ["updated_at"]),
  };
}

function buildConsultationFinance(rows) {
  const buckets = {
    pago: { status: "pago", count: 0, amount: 0 },
    aguardando_pagamento: { status: "aguardando_pagamento", count: 0, amount: 0 },
    vencido: { status: "vencido", count: 0, amount: 0 },
    nao_gerado: { status: "nao_gerado", count: 0, amount: 0 },
  };

  for (const row of rows) {
    const status = resolveConsultationPaymentStatus(row);
    const bucket = buckets[status] || { status, count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount += pickNumber(row, ["valor_consulta", "valor"]);
    buckets[status] = bucket;
  }

  return Object.values(buckets);
}

function requireActionReason(value) {
  const reason = normalizeString(value);

  if (!reason) {
    throw new HttpError(400, "Informe o motivo da acao administrativa.", {
      code: "ADMIN_MASTER_REASON_REQUIRED",
    });
  }

  return reason;
}

function requireActionConfirmation(input) {
  const confirmation = normalizeString(input?.confirmation || input?.confirm);

  if (confirmation !== ADMIN_MASTER_CONFIRMATION_TOKEN) {
    throw new HttpError(400, "Confirme a acao digitando CONFIRMAR.", {
      code: "ADMIN_MASTER_CONFIRMATION_REQUIRED",
    });
  }
}

function requireTargetId(input) {
  const targetId = normalizeString(input?.targetId || input?.id);

  if (!targetId) {
    throw new HttpError(400, "Informe o registro alvo da acao administrativa.", {
      code: "ADMIN_MASTER_TARGET_REQUIRED",
    });
  }

  return targetId;
}

function resolveTargetTable(input, fallback) {
  return normalizeString(input?.targetTable) || fallback;
}

function buildBlockAccessPatch(row) {
  return buildPatchFromExisting(row, {
    assinatura_ativa: false,
    professional_access_granted: false,
    professional_access_status: "blocked",
    subscription_active: false,
    plan_active: false,
    updated_at: new Date().toISOString(),
  });
}

function buildReleaseAccessPatch(row) {
  return buildPatchFromExisting(row, {
    assinatura_ativa: true,
    professional_access_granted: true,
    professional_access_status: "active",
    subscription_active: true,
    plan_active: true,
    updated_at: new Date().toISOString(),
  });
}

function buildDeactivatePsychologistPatch(row) {
  return buildPatchFromExisting(row, {
    ativo: false,
    active: false,
    is_active: false,
    enabled: false,
    assinatura_ativa: false,
    professional_access_granted: false,
    professional_access_status: "blocked",
    subscription_active: false,
    plan_active: false,
    updated_at: new Date().toISOString(),
  });
}

function pickLatestPaymentStatus(payments) {
  const rows = Array.isArray(payments) ? payments : [];
  const confirmed = rows.find((payment) => ACTIVE_PAYMENT_STATUSES.has(normalizeStatus(payment?.status)));
  const first = confirmed || rows[0] || null;
  return normalizeString(first?.status);
}

function isOpenDuplicateCandidate(row) {
  const status = normalizeStatus(row?.status_assinatura);
  return row?.assinatura_ativa === true || DUPLICATE_OPEN_STATUSES.has(status);
}

function buildDuplicateReport(rows) {
  const openRows = rows.filter(isOpenDuplicateCandidate);
  const byAsaasId = new Map();

  for (const row of rows) {
    const asaasId = normalizeString(row?.asaas_subscription_id);
    if (!asaasId) continue;
    byAsaasId.set(asaasId, (byAsaasId.get(asaasId) || 0) + 1);
  }

  const repeatedAsaasIds = [...byAsaasId.entries()]
    .filter(([, count]) => count > 1)
    .map(([asaasSubscriptionId, count]) => ({ asaasSubscriptionId: maskIdentifier(asaasSubscriptionId), count }));

  return {
    hasDuplicate: openRows.length > 1 || repeatedAsaasIds.length > 0,
    openSubscriptions: openRows.map(mapSubscription),
    repeatedAsaasIds,
    totalSubscriptions: rows.length,
  };
}

async function auditAndReturn(client, adminUser, input) {
  await insertAdminAuditLog(client, {
    adminAuthUserId: adminUser.id,
    action: input.action,
    targetTable: input.targetTable,
    targetId: input.targetId,
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    reason: input.reason,
  });

  return {
    action: input.action,
    target: {
      table: input.targetTable,
      id: input.targetId,
    },
    result: input.result,
  };
}

async function blockProfessionalAccess(client, adminUser, input, reason) {
  const targetId = requireTargetId(input);
  const before = await fetchSingleRow(client, "usuarios", "id", targetId);
  const patch = buildBlockAccessPatch(before);
  requireNonEmptyPatch(patch, "O schema atual de usuarios nao possui campos compativeis para bloquear acesso.", "ADMIN_MASTER_NO_COMPATIBLE_FIELDS");
  const after = await updateSingleRow(client, "usuarios", targetId, patch);

  return auditAndReturn(client, adminUser, {
    action: "block_professional_access",
    targetTable: "usuarios",
    targetId,
    beforeSnapshot: before,
    afterSnapshot: after || patch,
    reason,
    result: { updated: true, row: after },
  });
}

async function releaseProfessionalAccess(client, adminUser, input, reason) {
  const targetId = requireTargetId(input);
  const before = await fetchSingleRow(client, "usuarios", "id", targetId);
  const patch = buildReleaseAccessPatch(before);
  requireNonEmptyPatch(patch, "O schema atual de usuarios nao possui campos compativeis para liberar acesso.", "ADMIN_MASTER_NO_COMPATIBLE_FIELDS");
  const after = await updateSingleRow(client, "usuarios", targetId, patch);

  return auditAndReturn(client, adminUser, {
    action: "release_professional_access",
    targetTable: "usuarios",
    targetId,
    beforeSnapshot: before,
    afterSnapshot: after || patch,
    reason,
    result: { updated: true, row: after },
  });
}

async function deactivatePsychologist(client, adminUser, input, reason) {
  const targetId = requireTargetId(input);
  const before = await fetchSingleRow(client, "usuarios", "id", targetId);
  const patch = buildDeactivatePsychologistPatch(before);
  requireNonEmptyPatch(patch, "O schema atual de usuarios nao possui campos compativeis para desativacao.", "ADMIN_MASTER_NO_COMPATIBLE_FIELDS");
  const after = await updateSingleRow(client, "usuarios", targetId, patch);

  return auditAndReturn(client, adminUser, {
    action: "deactivate_psychologist",
    targetTable: "usuarios",
    targetId,
    beforeSnapshot: before,
    afterSnapshot: after || patch,
    reason,
    result: { updated: true, row: after },
  });
}

async function markSubscriptionLocally(client, adminUser, input, reason, targetStatus) {
  const targetId = requireTargetId(input);
  const before = await fetchSingleRow(client, "assinaturas_asaas", "id", targetId);
  const paymentStatus = targetStatus === "PENDING" ? "PENDING" : normalizeString(before.payment_status) || "CANCELLED";
  const patch = {
    status_assinatura: targetStatus,
    payment_status: paymentStatus,
    assinatura_ativa: false,
    updated_at: new Date().toISOString(),
  };
  const after = await updateSingleRow(client, "assinaturas_asaas", targetId, patch);

  return auditAndReturn(client, adminUser, {
    action: targetStatus === "PENDING" ? "mark_subscription_pending" : "mark_subscription_cancelled",
    targetTable: "assinaturas_asaas",
    targetId,
    beforeSnapshot: before,
    afterSnapshot: after || patch,
    reason,
    result: { updated: true, row: after },
  });
}

async function syncSubscriptionWithAsaas(client, adminUser, input, reason, env) {
  const targetId = requireTargetId(input);
  const before = await fetchSingleRow(client, "assinaturas_asaas", "id", targetId);
  const asaasSubscriptionId = normalizeString(before.asaas_subscription_id);

  if (!asaasSubscriptionId) {
    throw new HttpError(400, "A assinatura local nao possui identificador do Asaas.", {
      code: "ADMIN_MASTER_ASAAS_SUBSCRIPTION_ID_REQUIRED",
    });
  }

  const config = getAsaasConfig(env);
  const remoteSubscription = await asaasRequest(config, `/subscriptions/${encodeURIComponent(asaasSubscriptionId)}`);
  const paymentsResponse = await asaasRequest(config, `/subscriptions/${encodeURIComponent(asaasSubscriptionId)}/payments`, {
    query: { limit: 20 },
  });
  const payments = Array.isArray(paymentsResponse?.data) ? paymentsResponse.data : [];
  const paymentStatus = pickLatestPaymentStatus(payments);
  const subscriptionStatus = normalizeString(remoteSubscription?.status) || normalizeString(before.status_assinatura) || "PENDING";
  const hasConfirmedPayment = ACTIVE_PAYMENT_STATUSES.has(normalizeStatus(paymentStatus));
  const patch = {
    status_assinatura: subscriptionStatus,
    payment_status: paymentStatus || normalizeString(before.payment_status) || null,
    assinatura_ativa: hasConfirmedPayment && !SUBSCRIPTION_TERMINAL_STATUSES.has(normalizeStatus(subscriptionStatus)),
    valor_plano: pickNumber(remoteSubscription, ["value"]) || before.valor_plano || 0,
    proximo_vencimento: normalizeString(remoteSubscription?.nextDueDate) || before.proximo_vencimento || null,
    forma_pagamento: normalizeString(remoteSubscription?.billingType) || before.forma_pagamento || null,
    asaas_payload: remoteSubscription || {},
    updated_at: new Date().toISOString(),
  };
  const after = await updateSingleRow(client, "assinaturas_asaas", targetId, patch);

  return auditAndReturn(client, adminUser, {
    action: "sync_subscription_asaas",
    targetTable: "assinaturas_asaas",
    targetId,
    beforeSnapshot: before,
    afterSnapshot: after || patch,
    reason,
    result: {
      updated: true,
      subscriptionStatus,
      paymentStatus: patch.payment_status,
      subscriptionActive: patch.assinatura_ativa,
      row: after,
    },
  });
}

async function viewWebhookLogs(client, adminUser, input, reason) {
  const targetId = requireTargetId(input);
  const targetTable = resolveTargetTable(input, "assinaturas_asaas");
  const subscriptions = [];

  if (targetTable === "usuarios") {
    const user = await fetchSingleRow(client, "usuarios", "id", targetId);
    const authId = pickString(user, ["auth_id", "id"]);
    const allSubscriptions = await fetchRows(
      client,
      "assinaturas_asaas",
      "id, owner_type, auth_user_id, clinica_id, asaas_subscription_id, status_assinatura, payment_status, assinatura_ativa, created_at, updated_at",
    );
    subscriptions.push(...allSubscriptions.filter((row) => normalizeString(row.auth_user_id) === authId));
  } else {
    subscriptions.push(await fetchSingleRow(client, "assinaturas_asaas", "id", targetId));
  }

  const subscriptionIds = new Set(subscriptions.map((row) => normalizeString(row.asaas_subscription_id)).filter(Boolean));
  const webhookRows = await fetchRows(
    client,
    "asaas_webhook_events",
    "id, event_id, event_type, processing_status, asaas_subscription_id, asaas_payment_id, error_message, attempts, created_at, updated_at, processed_at",
  );
  const logs = webhookRows
    .filter((row) => subscriptionIds.has(normalizeString(row.asaas_subscription_id)))
    .sort(sortByRecent)
    .slice(0, MAX_WEBHOOK_LOG_ROWS);

  return auditAndReturn(client, adminUser, {
    action: "view_webhook_logs",
    targetTable,
    targetId,
    beforeSnapshot: { subscriptionIds: [...subscriptionIds].map(maskIdentifier) },
    afterSnapshot: { logsReturned: logs.length },
    reason,
    result: { logs },
  });
}

async function detectDuplicateSubscriptions(client, adminUser, input, reason) {
  const targetId = requireTargetId(input);
  const targetTable = resolveTargetTable(input, "usuarios");
  const allSubscriptions = await fetchRows(
    client,
    "assinaturas_asaas",
    "id, owner_type, auth_user_id, clinica_id, plano_slug, status_assinatura, payment_status, assinatura_ativa, valor_plano, proximo_vencimento, asaas_subscription_id, created_at, updated_at",
  );
  let targetRows = [];

  if (targetTable === "assinaturas_asaas") {
    const subscription = await fetchSingleRow(client, "assinaturas_asaas", "id", targetId);
    if (normalizeString(subscription.auth_user_id)) {
      targetRows = allSubscriptions.filter((row) => normalizeString(row.auth_user_id) === normalizeString(subscription.auth_user_id));
    } else if (normalizeString(subscription.clinica_id)) {
      targetRows = allSubscriptions.filter((row) => normalizeString(row.clinica_id) === normalizeString(subscription.clinica_id));
    } else {
      targetRows = [subscription];
    }
  } else if (targetTable === "clinicas") {
    targetRows = allSubscriptions.filter((row) => normalizeString(row.clinica_id) === targetId);
  } else {
    const user = await fetchSingleRow(client, "usuarios", "id", targetId);
    const authId = pickString(user, ["auth_id", "id"]);
    targetRows = allSubscriptions.filter((row) => normalizeString(row.auth_user_id) === authId);
  }

  const report = buildDuplicateReport(targetRows);

  return auditAndReturn(client, adminUser, {
    action: "detect_duplicate_subscriptions",
    targetTable,
    targetId,
    beforeSnapshot: { subscriptionsChecked: targetRows.length },
    afterSnapshot: {
      hasDuplicate: report.hasDuplicate,
      openSubscriptions: report.openSubscriptions.length,
      repeatedAsaasIds: report.repeatedAsaasIds,
    },
    reason,
    result: report,
  });
}

async function assertAdminMaster(client, accessToken, env) {
  const user = await resolveSupabaseAuthUser(accessToken, env);

  if (!user?.id) {
    throw new HttpError(401, "Sessao autenticada obrigatoria para acessar o Admin Master.", {
      code: "ADMIN_MASTER_AUTH_REQUIRED",
    });
  }

  const { data, error } = await client
    .from("admin_master_users")
    .select("auth_user_id")
    .eq("auth_user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Nao foi possivel validar o acesso Admin Master.", {
      code: "ADMIN_MASTER_AUTH_LOOKUP_FAILED",
      details: {
        message: normalizeString(error.message) || null,
        code: normalizeString(error.code) || null,
      },
    });
  }

  if (!data) {
    throw new HttpError(403, "Usuario sem permissao para acessar o Admin Master.", {
      code: "ADMIN_MASTER_FORBIDDEN",
    });
  }

  return user;
}

export async function getAdminMasterOverview(input = {}, options = {}) {
  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
  const accessToken = extractBearerToken(requestHeaders);
  const client = getServerSupabaseClient(env);
  const adminUser = await assertAdminMaster(client, accessToken, env);
  const search = normalizeString(input.search).toLowerCase();
  const statusFilter = normalizeString(input.subscriptionStatus);
  const planFilter = normalizeString(input.planSlug);
  const ownerTypeFilter = normalizeString(input.ownerType);
  const limit = clampPageLimit(input.limit);
  const offset = clampOffset(input.offset);

  const [
    usuariosRows,
    pacientesRows,
    clinicasRows,
    consultasRows,
    assinaturasRows,
  ] = await Promise.all([
    fetchRows(
      client,
      "usuarios",
      buildSelect(USUARIOS_OVERVIEW_COLUMNS),
      "admin_master_overview.usuarios",
    ),
    fetchRows(
      client,
      "pacientes",
      buildSelect(PACIENTES_OVERVIEW_COLUMNS),
      "admin_master_overview.pacientes",
    ),
    fetchRows(
      client,
      "clinicas",
      buildSelect(CLINICAS_OVERVIEW_COLUMNS),
      "admin_master_overview.clinicas",
    ),
    fetchRowsWithOptionalColumns(
      client,
      "consultas",
      CONSULTAS_OVERVIEW_COLUMNS,
      CONSULTAS_OVERVIEW_OPTIONAL_COLUMNS,
      "admin_master_overview.consultas",
    ),
    fetchRows(
      client,
      "assinaturas_asaas",
      buildSelect(ASSINATURAS_OVERVIEW_COLUMNS),
      "admin_master_overview.assinaturas_asaas",
    ),
  ]);

  const psychologistRows = usuariosRows.filter(isPsychologist);
  const psychologistCountsByClinic = new Map();
  for (const row of psychologistRows) {
    const clinicId = pickString(row, ["clinica_id"]);
    if (!clinicId) continue;
    psychologistCountsByClinic.set(clinicId, (psychologistCountsByClinic.get(clinicId) || 0) + 1);
  }

  const subscriptionsByBucket = assinaturasRows.reduce(
    (accumulator, row) => {
      accumulator[resolveSubscriptionBucket(row)] += 1;
      return accumulator;
    },
    { active: 0, pending: 0, cancelled: 0 },
  );
  const monthlyEstimatedRevenue = assinaturasRows
    .filter((row) => resolveSubscriptionBucket(row) === "active")
    .reduce((sum, row) => sum + pickNumber(row, ["valor_plano"]), 0);

  const filteredPsychologists = psychologistRows
    .filter((row) => matchesSearch(row, ["nome", "email", "telefone", "plano_slug", "status_assinatura"], search))
    .filter((row) => filterByValue(row, "status_assinatura", statusFilter))
    .filter((row) => filterByValue(row, "plano_slug", planFilter))
    .sort(sortByRecent)
    .map(mapPsychologist);

  const filteredClinics = clinicasRows
    .filter((row) => matchesSearch(row, ["nome", "email", "plano_slug", "status_assinatura"], search))
    .filter((row) => filterByValue(row, "status_assinatura", statusFilter))
    .filter((row) => filterByValue(row, "plano_slug", planFilter))
    .sort(sortByRecent)
    .map((row) => mapClinic(row, psychologistCountsByClinic));

  const filteredSubscriptions = assinaturasRows
    .filter((row) =>
      matchesSearch(
        row,
        ["owner_type", "auth_user_id", "clinica_id", "plano_slug", "status_assinatura", "payment_status", "asaas_subscription_id"],
        search,
      ),
    )
    .filter((row) => filterByValue(row, "status_assinatura", statusFilter))
    .filter((row) => filterByValue(row, "plano_slug", planFilter))
    .filter((row) => filterByValue(row, "owner_type", ownerTypeFilter))
    .sort(sortByRecent)
    .map(mapSubscription);

  return {
    admin: {
      id: adminUser.id,
      email: adminUser.email || null,
    },
    filters: {
      search,
      subscriptionStatus: statusFilter,
      planSlug: planFilter,
      ownerType: ownerTypeFilter,
      offset,
      limit,
    },
    summary: {
      psychologistsTotal: psychologistRows.length,
      patientsTotal: pacientesRows.length,
      clinicsTotal: clinicasRows.length,
      consultationsTotal: consultasRows.length,
      subscriptionsActive: subscriptionsByBucket.active,
      subscriptionsPending: subscriptionsByBucket.pending,
      subscriptionsCancelled: subscriptionsByBucket.cancelled,
      monthlyEstimatedRevenue,
    },
    psychologists: paginate(filteredPsychologists, offset, limit),
    clinics: paginate(filteredClinics, offset, limit),
    subscriptions: paginate(filteredSubscriptions, offset, limit),
    consultationFinance: buildConsultationFinance(consultasRows),
  };
}

export async function executeAdminMasterAction(input = {}, options = {}) {
  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
  const accessToken = extractBearerToken(requestHeaders);
  const client = getServerSupabaseClient(env);
  const adminUser = await assertAdminMaster(client, accessToken, env);
  const action = normalizeString(input.action);
  const reason = requireActionReason(input.reason);
  requireActionConfirmation(input);

  switch (action) {
    case "sync_subscription_asaas":
      return syncSubscriptionWithAsaas(client, adminUser, input, reason, env);
    case "block_professional_access":
      return blockProfessionalAccess(client, adminUser, input, reason);
    case "release_professional_access":
      return releaseProfessionalAccess(client, adminUser, input, reason);
    case "mark_subscription_pending":
      return markSubscriptionLocally(client, adminUser, input, reason, "PENDING");
    case "mark_subscription_cancelled":
      return markSubscriptionLocally(client, adminUser, input, reason, "CANCELLED");
    case "deactivate_psychologist":
      return deactivatePsychologist(client, adminUser, input, reason);
    case "view_webhook_logs":
      return viewWebhookLogs(client, adminUser, input, reason);
    case "detect_duplicate_subscriptions":
      return detectDuplicateSubscriptions(client, adminUser, input, reason);
    default:
      throw new HttpError(400, "Acao Admin Master desconhecida.", {
        code: "ADMIN_MASTER_ACTION_UNKNOWN",
        details: { action },
      });
  }
}
