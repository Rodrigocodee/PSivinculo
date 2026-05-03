import { HttpError } from "./errors.mjs";
import { extractBearerToken, getServerSupabaseClient, resolveSupabaseAuthUser } from "./supabase.mjs";

const ADMIN_ROLE_TOKENS = new Set([
  "adminclinica",
  "administradorclinica",
  "administradordeclinica",
  "clinicadmin",
  "clinicadministrator",
]);
const APPROVED_PAYMENT_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
const ACCESS_GRANTED_PAYMENT_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const CANCELLED_PAYMENT_EVENTS = new Set([
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
]);
const PENDING_PAYMENT_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_AUTHORIZED",
]);
const PENDING_SUBSCRIPTION_EVENTS = new Set(["SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED"]);
const CANCELLED_SUBSCRIPTION_EVENTS = new Set(["SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"]);
const INDIVIDUAL_PLAN_SLUGS = new Set(["essencial", "profissional"]);
const CLINIC_PLAN_SLUGS = new Set(["clinica_duo", "clinica_expansao"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDigits(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).replace(/\D+/g, "");
  }

  return typeof value === "string" ? value.replace(/\D+/g, "") : "";
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeRoleToken(value) {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizePlanSlug(value) {
  return normalizeString(value).toLowerCase().replace(/-/g, "_");
}

function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickString(source, keys) {
  if (!isRecord(source)) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function parseAsaasDate(value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  if (/^\d{4}-\d{2}-\d{2}\s/.test(normalizedValue)) {
    return normalizedValue.slice(0, 10);
  }

  const brazilianFormatMatch = normalizedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brazilianFormatMatch) {
    const [, day, month, year] = brazilianFormatMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function mapProfessionalAccessStatus(localStatus, isActive) {
  if (isActive) return "active";
  if (localStatus === "PENDING") return "pending";
  return "inactive";
}

function toSupabaseMessage(error) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (isRecord(error)) {
    const message = normalizeString(error.message);
    const details = normalizeString(error.details);
    const hint = normalizeString(error.hint);
    const fragments = [message, details ? `Detalhes: ${details}` : "", hint ? `Sugestao: ${hint}` : ""].filter(Boolean);

    if (fragments.length > 0) {
      return fragments.join(" | ");
    }
  }

  return "Falha sem detalhes retornados.";
}

function isMissingColumnError(error) {
  return isRecord(error) && normalizeString(error.code) === "42703";
}

function logBillingStore(step, payload) {
  console.info(`[Psivinculo][billing-store][${step}]`, payload);
}

function logBillingStoreError(step, payload) {
  console.error(`[Psivinculo][billing-store][${step}]`, payload);
}

function isResolvedOwnerSnapshot(owner) {
  const ownerType = normalizeString(owner?.ownerType || owner?.owner_type);
  const authUserId = normalizeString(owner?.authUserId || owner?.auth_user_id);
  const clinicaId = normalizeString(owner?.clinicaId || owner?.clinica_id);

  if (ownerType === "clinic") return Boolean(clinicaId);
  if (ownerType === "user") return Boolean(authUserId);

  return false;
}

function buildPendingLocalOwner() {
  return {
    ownerType: null,
    ownerResolutionSource: "pending_local_link",
    authUserId: null,
    clinicaId: null,
  };
}

function buildUserOwnerContext(ownerResolutionSource, authUserId, clinicaId = null) {
  return {
    ownerType: "user",
    ownerResolutionSource,
    authUserId: normalizeString(authUserId) || null,
    clinicaId: normalizeString(clinicaId) || null,
  };
}

function buildClinicOwnerContext(ownerResolutionSource, clinicaId, authUserId = null) {
  return {
    ownerType: "clinic",
    ownerResolutionSource,
    authUserId: normalizeString(authUserId) || null,
    clinicaId: normalizeString(clinicaId) || null,
  };
}

function resolvePersistedOwnerContext(existingRecord, resolvedOwner) {
  if (isResolvedOwnerSnapshot(resolvedOwner)) {
    return {
      ownerType: normalizeString(resolvedOwner?.ownerType),
      ownerResolutionSource:
        normalizeString(resolvedOwner?.ownerResolutionSource) || "post_checkout_resolution",
      authUserId: normalizeString(resolvedOwner?.authUserId) || null,
      clinicaId: normalizeString(resolvedOwner?.clinicaId) || null,
    };
  }

  if (isResolvedOwnerSnapshot(existingRecord)) {
    return {
      ownerType: normalizeString(existingRecord?.owner_type),
      ownerResolutionSource:
        normalizeString(existingRecord?.owner_resolution_source) || "existing_owner_link",
      authUserId: normalizeString(existingRecord?.auth_user_id) || null,
      clinicaId: normalizeString(existingRecord?.clinica_id) || null,
    };
  }

  return buildPendingLocalOwner();
}

function buildPaymentMethodLabel(value) {
  const normalizedValue = normalizeString(value).toUpperCase();
  if (!normalizedValue) return null;

  if (normalizedValue === "CREDIT_CARD") return "CREDIT_CARD";
  if (normalizedValue === "BOLETO") return "BOLETO";
  if (normalizedValue === "PIX") return "PIX";
  if (normalizedValue === "UNDEFINED") return "UNDEFINED";

  return normalizedValue;
}

function shouldPropagateActiveWebhookState(input) {
  const eventType = normalizeString(input?.eventType).toUpperCase();
  const paymentStatus = normalizeString(input?.paymentStatus).toUpperCase();

  return (
    ACCESS_GRANTED_PAYMENT_EVENTS.has(eventType) ||
    APPROVED_PAYMENT_STATUSES.has(paymentStatus)
  );
}

function resolveExpectedOwnerType(planSlug) {
  const normalizedPlanSlug = normalizePlanSlug(planSlug);
  if (!normalizedPlanSlug) return null;
  if (INDIVIDUAL_PLAN_SLUGS.has(normalizedPlanSlug)) return "user";
  if (CLINIC_PLAN_SLUGS.has(normalizedPlanSlug)) return "clinic";
  return null;
}

function isClinicPlan(planSlug) {
  return resolveExpectedOwnerType(planSlug) === "clinic";
}

function isClinicAdminRow(row) {
  const clinicId = pickString(row, ["clinica_id", "clinic_id"]);
  const roleToken = normalizeRoleToken(
    pickString(row, ["tipo_usuario", "role", "perfil", "tipo", "user_type", "cargo"]),
  );

  return Boolean(clinicId && ADMIN_ROLE_TOKENS.has(roleToken));
}

function extractRowAuthUserId(row) {
  return pickString(row, ["auth_id", "id", "user_id"]);
}

function deriveLocalSubscriptionState(input) {
  const eventType = normalizeString(input.eventType).toUpperCase();
  const paymentStatus = normalizeString(input.paymentStatus).toUpperCase();
  const subscriptionStatus = normalizeString(input.subscriptionStatus).toUpperCase();
  const preserveActiveState = input?.preserveActiveState === true;
  const previousSubscriptionActive = input?.previousSubscriptionActive === true;

  if (
    preserveActiveState &&
    previousSubscriptionActive &&
    !CANCELLED_PAYMENT_EVENTS.has(eventType) &&
    !CANCELLED_SUBSCRIPTION_EVENTS.has(eventType) &&
    eventType !== "PAYMENT_OVERDUE" &&
    paymentStatus !== "OVERDUE"
  ) {
    return {
      localStatus: "ACTIVE",
      subscriptionActive: true,
    };
  }

  if (APPROVED_PAYMENT_STATUSES.has(paymentStatus) || ACCESS_GRANTED_PAYMENT_EVENTS.has(eventType)) {
    return {
      localStatus: "ACTIVE",
      subscriptionActive: true,
    };
  }

  if (eventType === "PAYMENT_OVERDUE" || paymentStatus === "OVERDUE") {
    return {
      localStatus: "OVERDUE",
      subscriptionActive: false,
    };
  }

  if (CANCELLED_PAYMENT_EVENTS.has(eventType) || CANCELLED_SUBSCRIPTION_EVENTS.has(eventType)) {
    return {
      localStatus: "CANCELLED",
      subscriptionActive: false,
    };
  }

  if (["INACTIVE", "EXPIRED", "CANCELLED", "DELETED"].includes(subscriptionStatus)) {
    return {
      localStatus: subscriptionStatus === "EXPIRED" ? "OVERDUE" : "CANCELLED",
      subscriptionActive: false,
    };
  }

  if (PENDING_PAYMENT_EVENTS.has(eventType) || PENDING_SUBSCRIPTION_EVENTS.has(eventType) || subscriptionStatus === "ACTIVE") {
    return {
      localStatus: "PENDING",
      subscriptionActive: false,
    };
  }

  if (paymentStatus) {
    return {
      localStatus: paymentStatus,
      subscriptionActive: false,
    };
  }

  return {
    localStatus: normalizeString(input.fallbackStatus).toUpperCase() || "PENDING",
    subscriptionActive: false,
  };
}

async function queryMany(client, table, column, value, limit = 10) {
  if (!value) return [];

  const { data, error } = await client.from(table).select("*").eq(column, value).limit(limit);

  if (error) {
    if (isMissingColumnError(error)) {
      return [];
    }
    throw error;
  }

  return Array.isArray(data) ? data.filter(isRecord) : [];
}

async function querySingle(client, table, column, value) {
  if (!value) return null;

  const { data, error } = await client.from(table).select("*").eq(column, value).limit(1).maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      return null;
    }
    throw error;
  }

  return isRecord(data) ? data : null;
}

async function findUsuariosByAuthUser(client, authUserId, email) {
  const candidates = [
    { column: "auth_id", value: normalizeString(authUserId) },
    { column: "id", value: normalizeString(authUserId) },
    { column: "email", value: normalizeEmail(email) },
  ];

  for (const candidate of candidates) {
    const rows = await queryMany(client, "usuarios", candidate.column, candidate.value);
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

function pickBestUsuarioRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const clinicAdminRow = rows.find((row) => isClinicAdminRow(row));
  if (clinicAdminRow) return clinicAdminRow;

  const clinicScopedRow = rows.find((row) => pickString(row, ["clinica_id", "clinic_id"]));
  if (clinicScopedRow) return clinicScopedRow;

  return rows[0] || null;
}

async function resolveOwnerFromAuthenticatedUser(client, authUser) {
  if (!authUser) return null;

  const expectedOwnerType = resolveExpectedOwnerType(authUser?.planSlug);
  const usuariosRows = await findUsuariosByAuthUser(client, authUser.id, authUser.email);
  const matchedRow = pickBestUsuarioRow(usuariosRows);
  if (!matchedRow) return null;

  const matchedClinicId = pickString(matchedRow, ["clinica_id", "clinic_id"]);
  const matchedAuthUserId = extractRowAuthUserId(matchedRow) || authUser.id;

  if (expectedOwnerType === "clinic") {
    return matchedClinicId
      ? buildClinicOwnerContext("auth_session_usuarios", matchedClinicId, matchedAuthUserId)
      : null;
  }

  if (expectedOwnerType === "user") {
    return buildUserOwnerContext("auth_session_usuarios", matchedAuthUserId, matchedClinicId || null);
  }

  if (isClinicAdminRow(matchedRow)) {
    return matchedClinicId
      ? buildClinicOwnerContext("auth_session_usuarios", matchedClinicId, matchedAuthUserId)
      : null;
  }

  return buildUserOwnerContext("auth_session_usuarios", matchedAuthUserId, matchedClinicId || null);
}

async function resolveOwnerByCustomerIdentity(client, customer, planSlug) {
  const normalizedEmail = normalizeEmail(customer?.email);
  const normalizedDocument = normalizeDigits(customer?.cpfCnpj);
  const expectedOwnerType = resolveExpectedOwnerType(planSlug);

  if (expectedOwnerType === "clinic") {
    if (normalizedEmail) {
      const clinicByEmail = await querySingle(client, "clinicas", "email", normalizedEmail);
      if (clinicByEmail) {
        return buildClinicOwnerContext("customer_email_clinicas", pickString(clinicByEmail, ["id"]));
      }
    }

    if (normalizedDocument) {
      const clinicByDocument = await querySingle(client, "clinicas", "cnpj", normalizedDocument);
      if (clinicByDocument) {
        return buildClinicOwnerContext("customer_document_clinicas", pickString(clinicByDocument, ["id"]));
      }
    }

    if (normalizedEmail) {
      const userRows = await queryMany(client, "usuarios", "email", normalizedEmail);
      const matchedUser = pickBestUsuarioRow(userRows);
      const matchedClinicId = pickString(matchedUser, ["clinica_id", "clinic_id"]);

      if (matchedUser && matchedClinicId) {
        return buildClinicOwnerContext(
          "customer_email_usuarios_clinic_link",
          matchedClinicId,
          extractRowAuthUserId(matchedUser) || null,
        );
      }
    }

    return buildPendingLocalOwner();
  }

  if (expectedOwnerType === "user") {
    if (normalizedEmail) {
      const userRows = await queryMany(client, "usuarios", "email", normalizedEmail);
      const matchedUser = pickBestUsuarioRow(userRows);

      if (matchedUser) {
        return buildUserOwnerContext(
          "customer_email_usuarios",
          extractRowAuthUserId(matchedUser) || null,
          pickString(matchedUser, ["clinica_id", "clinic_id"]) || null,
        );
      }
    }

    return buildPendingLocalOwner();
  }

  if (normalizedEmail) {
    const userRows = await queryMany(client, "usuarios", "email", normalizedEmail);
    const matchedUser = pickBestUsuarioRow(userRows);

    if (matchedUser) {
      if (isClinicAdminRow(matchedUser)) {
        return buildClinicOwnerContext(
          "customer_email_usuarios",
          pickString(matchedUser, ["clinica_id", "clinic_id"]),
          extractRowAuthUserId(matchedUser) || null,
        );
      }

      return buildUserOwnerContext(
        "customer_email_usuarios",
        extractRowAuthUserId(matchedUser) || null,
        pickString(matchedUser, ["clinica_id", "clinic_id"]) || null,
      );
    }

    const clinicByEmail = await querySingle(client, "clinicas", "email", normalizedEmail);
    if (clinicByEmail) {
      return buildClinicOwnerContext("customer_email_clinicas", pickString(clinicByEmail, ["id"]));
    }
  }

  if (normalizedDocument.length === 14 || isClinicPlan(planSlug)) {
    const clinicByDocument = await querySingle(client, "clinicas", "cnpj", normalizedDocument);
    if (clinicByDocument) {
      return buildClinicOwnerContext("customer_document_clinicas", pickString(clinicByDocument, ["id"]));
    }
  }

  return buildPendingLocalOwner();
}

export async function resolveBillingOwnerContext(input, env = process.env) {
  const supabase = getServerSupabaseClient(env);
  const authAccessToken = extractBearerToken(input?.requestHeaders || {});
  const authenticatedUser = await resolveSupabaseAuthUser(authAccessToken, env);
  const normalizedPlanSlug = normalizePlanSlug(input?.planSlug);

  if (authenticatedUser) {
    const resolvedBySession = await resolveOwnerFromAuthenticatedUser(supabase, {
      ...authenticatedUser,
      planSlug: normalizedPlanSlug,
    });
    if (resolvedBySession) {
      return resolvedBySession;
    }
  }

  return resolveOwnerByCustomerIdentity(
    supabase,
    isRecord(input?.customer) ? input.customer : {},
    normalizedPlanSlug,
  );
}

async function findSubscriptionRecord(client, asaasSubscriptionId) {
  if (!asaasSubscriptionId) return null;

  const { data, error } = await client
    .from("assinaturas_asaas")
    .select("*")
    .eq("asaas_subscription_id", asaasSubscriptionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return isRecord(data) ? data : null;
}

function buildFullAuthMetadataPatch(currentMetadata, state) {
  const patch = {
    ...currentMetadata,
    asaas_customer_id: state.asaasCustomerId || currentMetadata.asaas_customer_id || null,
    asaas_subscription_id: state.asaasSubscriptionId,
    plano_slug: state.planSlug,
    plan_slug: state.planSlug,
    status_assinatura: state.localStatus,
    subscription_status: state.localStatus,
    plan_status: state.localStatus,
    assinatura_ativa: state.subscriptionActive,
    subscription_active: state.subscriptionActive,
    plan_active: state.subscriptionActive,
    valor_mensal: state.planValue,
    plan_price: state.planValue,
    subscription_amount: state.planValue,
    proximo_vencimento: state.nextDueDate,
    payment_due_date: state.nextDueDate,
    forma_pagamento: state.paymentMethod,
    payment_method: state.paymentMethod,
    professional_access_granted: state.subscriptionActive,
    professional_access_status: mapProfessionalAccessStatus(state.localStatus, state.subscriptionActive),
  };

  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
}

function buildAccessOnlyAuthMetadataPatch(currentMetadata, state) {
  const patch = {
    ...currentMetadata,
    asaas_customer_id: null,
    asaas_subscription_id: null,
    plano_slug: state.planSlug,
    plan_slug: state.planSlug,
    status_assinatura: state.localStatus,
    subscription_status: state.localStatus,
    plan_status: state.localStatus,
    valor_mensal: null,
    plan_price: null,
    subscription_amount: null,
    proximo_vencimento: state.nextDueDate,
    payment_due_date: state.nextDueDate,
    forma_pagamento: null,
    payment_method: null,
    assinatura_ativa: state.subscriptionActive,
    subscription_active: state.subscriptionActive,
    plan_active: state.subscriptionActive,
    professional_access_granted: state.subscriptionActive,
    professional_access_status: mapProfessionalAccessStatus(state.localStatus, state.subscriptionActive),
  };

  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
}

function buildFinancialRowPayload(row, state) {
  const payload = {};

  const assignIfColumnExists = (columnName, value) => {
    if (row && columnName in row) {
      payload[columnName] = value;
    }
  };

  assignIfColumnExists("asaas_customer_id", state.asaasCustomerId || null);
  assignIfColumnExists("asaas_subscription_id", state.asaasSubscriptionId || null);
  assignIfColumnExists("plano_slug", state.planSlug);
  assignIfColumnExists("plan_slug", state.planSlug);
  assignIfColumnExists("plan_id", state.planSlug);
  assignIfColumnExists("current_plan_id", state.planSlug);
  assignIfColumnExists("subscription_plan_id", state.planSlug);
  assignIfColumnExists("plan_name", state.planName);
  assignIfColumnExists("subscription_plan_name", state.planName);
  assignIfColumnExists("status_assinatura", state.localStatus);
  assignIfColumnExists("subscription_status", state.localStatus);
  assignIfColumnExists("plan_status", state.localStatus);
  assignIfColumnExists("valor_mensal", state.planValue);
  assignIfColumnExists("valor_plano", state.planValue);
  assignIfColumnExists("plan_price", state.planValue);
  assignIfColumnExists("subscription_amount", state.planValue);
  assignIfColumnExists("proximo_vencimento", state.nextDueDate);
  assignIfColumnExists("payment_due_date", state.nextDueDate);
  assignIfColumnExists("billing_due_date", state.nextDueDate);
  assignIfColumnExists("forma_pagamento", state.paymentMethod);
  assignIfColumnExists("payment_method", state.paymentMethod);
  assignIfColumnExists("billing_method", state.paymentMethod);
  assignIfColumnExists("assinatura_ativa", state.subscriptionActive);
  assignIfColumnExists("subscription_active", state.subscriptionActive);
  assignIfColumnExists("plan_active", state.subscriptionActive);
  assignIfColumnExists("professional_access_granted", state.subscriptionActive);
  assignIfColumnExists(
    "professional_access_status",
    mapProfessionalAccessStatus(state.localStatus, state.subscriptionActive),
  );
  assignIfColumnExists("updated_at", new Date().toISOString());

  return payload;
}

function buildClinicMemberAccessPayload(row, state) {
  const payload = {};

  const assignIfColumnExists = (columnName, value) => {
    if (row && columnName in row) {
      payload[columnName] = value;
    }
  };

  for (const columnName of [
    "asaas_customer_id",
    "asaas_subscription_id",
    "plan_name",
    "subscription_plan_name",
    "valor_mensal",
    "valor_plano",
    "plan_price",
    "subscription_amount",
    "forma_pagamento",
    "payment_method",
    "billing_method",
  ]) {
    assignIfColumnExists(columnName, null);
  }

  assignIfColumnExists("plano_slug", state.planSlug);
  assignIfColumnExists("plan_slug", state.planSlug);
  assignIfColumnExists("plan_id", state.planSlug);
  assignIfColumnExists("current_plan_id", state.planSlug);
  assignIfColumnExists("subscription_plan_id", state.planSlug);
  assignIfColumnExists("status_assinatura", state.localStatus);
  assignIfColumnExists("subscription_status", state.localStatus);
  assignIfColumnExists("plan_status", state.localStatus);
  assignIfColumnExists("proximo_vencimento", state.nextDueDate);
  assignIfColumnExists("payment_due_date", state.nextDueDate);
  assignIfColumnExists("billing_due_date", state.nextDueDate);
  assignIfColumnExists("assinatura_ativa", state.subscriptionActive);
  assignIfColumnExists("subscription_active", state.subscriptionActive);
  assignIfColumnExists("plan_active", state.subscriptionActive);
  assignIfColumnExists("professional_access_granted", state.subscriptionActive);
  assignIfColumnExists(
    "professional_access_status",
    mapProfessionalAccessStatus(state.localStatus, state.subscriptionActive),
  );
  assignIfColumnExists("updated_at", new Date().toISOString());

  return payload;
}

async function updateRowById(client, table, row, payload) {
  const rowId = pickString(row, ["id"]);
  if (!rowId || Object.keys(payload).length === 0) return;

  const { error } = await client.from(table).update(payload).eq("id", rowId);

  if (error) {
    throw error;
  }
}

async function updateUsersByAuthUserId(client, authUserId, state) {
  const normalizedAuthUserId = normalizeString(authUserId);
  if (!normalizedAuthUserId) {
    return {
      updatedRows: 0,
      matchColumn: null,
    };
  }

  let userRows = await queryMany(client, "usuarios", "auth_id", normalizedAuthUserId, 1000);
  let matchColumn = "auth_id";

  if (userRows.length === 0) {
    userRows = await queryMany(client, "usuarios", "id", normalizedAuthUserId, 1000);
    matchColumn = "id";
  }

  for (const userRow of userRows) {
    const userPayload = buildFinancialRowPayload(userRow, state);
    await updateRowById(client, "usuarios", userRow, userPayload);
  }

  return {
    updatedRows: userRows.length,
    matchColumn: userRows.length > 0 ? matchColumn : null,
  };
}

async function syncAuthUsers(client, authUserIds, state, mode = "financial") {
  for (const authUserId of authUserIds) {
    const normalizedUserId = normalizeString(authUserId);
    if (!normalizedUserId) continue;

    try {
      const currentUserResponse = await client.auth.admin.getUserById(normalizedUserId);
      const currentMetadata =
        isRecord(currentUserResponse.data?.user?.user_metadata) ? currentUserResponse.data.user.user_metadata : {};
      const metadataPatch =
        mode === "access_only"
          ? buildAccessOnlyAuthMetadataPatch(currentMetadata, state)
          : buildFullAuthMetadataPatch(currentMetadata, state);
      const { error } = await client.auth.admin.updateUserById(normalizedUserId, {
        user_metadata: metadataPatch,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      logBillingStoreError("auth_metadata_sync_failed", {
        authUserId: normalizedUserId,
        message: toSupabaseMessage(error),
      });
    }
  }
}

async function propagateStateToOwners(client, record) {
  if (!isResolvedOwnerSnapshot(record)) {
    logBillingStore("owner_link_pending", {
      asaasSubscriptionId: normalizeString(record?.asaas_subscription_id) || null,
      customerEmail: normalizeString(record?.customer_email) || null,
      customerDocument: normalizeDigits(record?.customer_document) || null,
    });
    return;
  }

  const metadata = isRecord(record.metadata) ? record.metadata : {};
  const state = {
    asaasCustomerId: normalizeString(record.asaas_customer_id),
    asaasSubscriptionId: normalizeString(record.asaas_subscription_id),
    planSlug: normalizeString(record.plano_slug),
    planName: normalizeString(metadata.planName) || normalizeString(record.plan_name) || null,
    planValue: parseMoney(record.valor_plano) ?? 0,
    nextDueDate: parseAsaasDate(record.proximo_vencimento) || null,
    paymentMethod: buildPaymentMethodLabel(record.forma_pagamento),
    localStatus: normalizeString(record.status_assinatura).toUpperCase() || "PENDING",
    subscriptionActive: record.assinatura_ativa === true,
  };
  const authUserIds = new Set();

  if (normalizeString(record.auth_user_id)) {
    authUserIds.add(normalizeString(record.auth_user_id));
  }

  if (normalizeString(record.owner_type) === "clinic" && normalizeString(record.clinica_id)) {
    const clinicRow = await querySingle(client, "clinicas", "id", normalizeString(record.clinica_id));
    if (clinicRow) {
      const clinicPayload = buildFinancialRowPayload(clinicRow, state);
      await updateRowById(client, "clinicas", clinicRow, clinicPayload);
    }

    let clinicUsers = await queryMany(client, "usuarios", "clinica_id", normalizeString(record.clinica_id), 1000);
    if (clinicUsers.length === 0) {
      clinicUsers = await queryMany(client, "usuarios", "clinic_id", normalizeString(record.clinica_id), 1000);
    }

    for (const userRow of clinicUsers) {
      const userPayload = buildClinicMemberAccessPayload(userRow, state);
      await updateRowById(client, "usuarios", userRow, userPayload);
      authUserIds.add(extractRowAuthUserId(userRow));
    }
  }

  if (normalizeString(record.owner_type) !== "clinic") {
    const ownerCandidates = [];
    if (normalizeString(record.auth_user_id)) {
      ownerCandidates.push(
        ...(await queryMany(client, "usuarios", "auth_id", normalizeString(record.auth_user_id), 25)),
        ...(await queryMany(client, "usuarios", "id", normalizeString(record.auth_user_id), 25)),
      );
    }

    if (normalizeString(record.customer_email)) {
      ownerCandidates.push(...(await queryMany(client, "usuarios", "email", normalizeString(record.customer_email), 25)));
    }

    const seenRowIds = new Set();
    for (const userRow of ownerCandidates) {
      const rowId = pickString(userRow, ["id"]);
      if (!rowId || seenRowIds.has(rowId)) continue;
      seenRowIds.add(rowId);
      const userPayload = buildFinancialRowPayload(userRow, state);
      await updateRowById(client, "usuarios", userRow, userPayload);
      authUserIds.add(extractRowAuthUserId(userRow));
    }
  }

  await syncAuthUsers(
    client,
    [...authUserIds],
    state,
    normalizeString(record.owner_type) === "clinic" ? "access_only" : "financial",
  );
}

export async function propagateWebhookSubscriptionToUserOwner(input, env = process.env) {
  const client = getServerSupabaseClient(env);
  const asaasSubscriptionId = normalizeString(input?.asaasSubscriptionId);

  if (!asaasSubscriptionId) {
    return {
      synced: false,
      reason: "missing_subscription_id",
    };
  }

  const record = await findSubscriptionRecord(client, asaasSubscriptionId);
  if (!record) {
    return {
      synced: false,
      reason: "subscription_not_found",
      asaasSubscriptionId,
    };
  }

  if (normalizeString(record.owner_type) !== "user") {
    return {
      synced: false,
      reason: "owner_is_not_user",
      asaasSubscriptionId,
      ownerType: normalizeString(record.owner_type) || null,
    };
  }

  if (!shouldPropagateActiveWebhookState(input)) {
    return {
      synced: false,
      reason: "event_is_not_active",
      asaasSubscriptionId,
      ownerType: "user",
    };
  }

  const state = {
    asaasCustomerId: normalizeString(record.asaas_customer_id),
    asaasSubscriptionId,
    planSlug: normalizeString(record.plano_slug),
    planName: null,
    planValue: parseMoney(record.valor_plano) ?? 0,
    nextDueDate:
      parseAsaasDate(input?.nextDueDate) ||
      parseAsaasDate(record.proximo_vencimento) ||
      null,
    paymentMethod:
      buildPaymentMethodLabel(input?.paymentMethod) ||
      buildPaymentMethodLabel(record.forma_pagamento),
    localStatus: "ACTIVE",
    subscriptionActive: true,
  };
  const authUserId = normalizeString(record.auth_user_id);
  const updateResult = await updateUsersByAuthUserId(client, authUserId, state);

  logBillingStore("webhook_user_owner_propagated", {
    asaasSubscriptionId,
    authUserId: authUserId || null,
    updatedRows: updateResult.updatedRows,
    matchColumn: updateResult.matchColumn,
    eventType: normalizeString(input?.eventType).toUpperCase() || null,
    paymentStatus: normalizeString(input?.paymentStatus).toUpperCase() || null,
    subscriptionStatus: normalizeString(input?.subscriptionStatus).toUpperCase() || null,
  });

  return {
    synced: updateResult.updatedRows > 0,
    updatedRows: updateResult.updatedRows,
    matchColumn: updateResult.matchColumn,
    asaasSubscriptionId,
    authUserId: authUserId || null,
  };
}

async function listPendingSubscriptionRecords(client, identity) {
  const records = new Map();
  const normalizedEmail = normalizeEmail(identity?.email);
  const normalizedDocument = normalizeDigits(identity?.cpfCnpj);
  const normalizedSubscriptionId = normalizeString(identity?.asaasSubscriptionId);

  if (normalizedSubscriptionId) {
    const record = await findSubscriptionRecord(client, normalizedSubscriptionId);
    if (record) {
      records.set(String(record.id || normalizedSubscriptionId), record);
    }
  }

  if (normalizedEmail) {
    const rows = await queryMany(client, "assinaturas_asaas", "customer_email", normalizedEmail, 1000);
    for (const row of rows) {
      records.set(String(row.id || row.asaas_subscription_id || normalizedEmail), row);
    }
  }

  if (normalizedDocument) {
    const rows = await queryMany(client, "assinaturas_asaas", "customer_document", normalizedDocument, 1000);
    for (const row of rows) {
      records.set(String(row.id || row.asaas_subscription_id || normalizedDocument), row);
    }
  }

  return [...records.values()]
    .filter((row) => !isResolvedOwnerSnapshot(row))
    .sort((left, right) => {
      const leftDate = Date.parse(normalizeString(left?.updated_at) || normalizeString(left?.created_at) || "");
      const rightDate = Date.parse(normalizeString(right?.updated_at) || normalizeString(right?.created_at) || "");
      const leftTime = Number.isFinite(leftDate) ? leftDate : 0;
      const rightTime = Number.isFinite(rightDate) ? rightDate : 0;

      return rightTime - leftTime;
    });
}

function isOpenSubscriptionRecord(record) {
  const subscriptionId = normalizeString(record?.asaas_subscription_id);
  const status = normalizeString(record?.status_assinatura).toUpperCase();

  return Boolean(
    subscriptionId &&
      !["CANCELLED", "INACTIVE", "DELETED", "EXPIRED"].includes(status),
  );
}

function recordMatchesResolvedOwner(record, ownerContext) {
  const ownerType = normalizeString(ownerContext?.ownerType || ownerContext?.owner_type);
  if (!ownerType) return false;

  if (ownerType === "clinic") {
    return (
      normalizeString(record?.owner_type) === "clinic" &&
      normalizeString(record?.clinica_id) ===
        normalizeString(ownerContext?.clinicaId || ownerContext?.clinica_id)
    );
  }

  if (ownerType === "user") {
    return (
      normalizeString(record?.owner_type) === "user" &&
      normalizeString(record?.auth_user_id) ===
        normalizeString(ownerContext?.authUserId || ownerContext?.auth_user_id)
    );
  }

  return false;
}

async function findConflictingResolvedOpenSubscription(client, ownerContext, ignoreRowId = null) {
  if (!isResolvedOwnerSnapshot(ownerContext)) {
    return null;
  }

  const ownerType = normalizeString(ownerContext?.ownerType || ownerContext?.owner_type);
  const ownerValue =
    ownerType === "clinic"
      ? normalizeString(ownerContext?.clinicaId || ownerContext?.clinica_id)
      : normalizeString(ownerContext?.authUserId || ownerContext?.auth_user_id);
  const ownerColumn = ownerType === "clinic" ? "clinica_id" : "auth_user_id";
  const rows = await queryMany(client, "assinaturas_asaas", ownerColumn, ownerValue, 1000);

  return (
    rows
      .filter((row) => {
        const rowId = pickString(row, ["id"]);
        if (ignoreRowId && rowId === ignoreRowId) return false;
        return recordMatchesResolvedOwner(row, ownerContext) && isOpenSubscriptionRecord(row);
      })
      .sort((left, right) => {
        const leftDate = Date.parse(normalizeString(left?.updated_at) || normalizeString(left?.created_at) || "");
        const rightDate = Date.parse(normalizeString(right?.updated_at) || normalizeString(right?.created_at) || "");
        const leftTime = Number.isFinite(leftDate) ? leftDate : 0;
        const rightTime = Number.isFinite(rightDate) ? rightDate : 0;

        return rightTime - leftTime;
      })[0] || null
  );
}

async function updateSubscriptionOwnerLink(client, record, ownerContext) {
  const rowId = pickString(record, ["id"]);
  if (!rowId) return null;

  if (isOpenSubscriptionRecord(record)) {
    const conflictingOpenRecord = await findConflictingResolvedOpenSubscription(client, ownerContext, rowId);
    if (conflictingOpenRecord) {
      throw new HttpError(
        409,
        "Ja existe uma assinatura aberta para este titular. O vinculo automatico do pendente foi bloqueado para evitar duplicidade no billing.",
        {
          code: "OWNER_ALREADY_HAS_OPEN_SUBSCRIPTION",
          details: {
            currentRecordId: rowId,
            conflictingRecordId: pickString(conflictingOpenRecord, ["id"]) || null,
            conflictingSubscriptionId:
              normalizeString(conflictingOpenRecord?.asaas_subscription_id) || null,
          },
        },
      );
    }
  }

  const updatePayload = {
    owner_type: normalizeString(ownerContext.ownerType) || null,
    owner_resolution_source:
      normalizeString(ownerContext.ownerResolutionSource) || "post_registration_link",
    auth_user_id: normalizeString(ownerContext.authUserId) || null,
    clinica_id: normalizeString(ownerContext.clinicaId) || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("assinaturas_asaas")
    .update(updatePayload)
    .eq("id", rowId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return isRecord(data) ? data : { ...record, ...updatePayload };
}

export async function persistAsaasSubscriptionState(input, env = process.env) {
  const client = getServerSupabaseClient(env);
  const asaasSubscriptionId = normalizeString(input?.asaasSubscriptionId);

  if (!asaasSubscriptionId) {
    throw new HttpError(500, "Nao foi possivel persistir a assinatura sem o ID retornado pelo Asaas.", {
      code: "SUBSCRIPTION_PERSISTENCE_ERROR",
    });
  }

  const existingRecord = await findSubscriptionRecord(client, asaasSubscriptionId);
  const resolvedOwner =
    input?.ownerContext ||
    (await resolveBillingOwnerContext(
      {
        requestHeaders: input?.requestHeaders,
        customer: input?.customer,
        planSlug: input?.plan?.slug,
      },
      env,
    ));
  const persistedOwner = resolvePersistedOwnerContext(existingRecord, resolvedOwner);
  const derivedState = deriveLocalSubscriptionState({
    eventType: input?.eventType,
    paymentStatus: input?.paymentStatus,
    subscriptionStatus: input?.subscriptionStatus,
    fallbackStatus: input?.fallbackStatus || existingRecord?.status_assinatura,
    preserveActiveState: input?.preserveActiveState === true,
    previousSubscriptionActive: existingRecord?.assinatura_ativa === true,
  });
  const payload = {
    owner_type: persistedOwner.ownerType,
    owner_resolution_source: persistedOwner.ownerResolutionSource,
    auth_user_id: persistedOwner.authUserId,
    clinica_id: persistedOwner.clinicaId,
    customer_name:
      normalizeString(input?.customer?.name) || normalizeString(existingRecord?.customer_name) || null,
    customer_email:
      normalizeEmail(input?.customer?.email) || normalizeEmail(existingRecord?.customer_email) || null,
    customer_document:
      normalizeDigits(input?.customer?.cpfCnpj) || normalizeDigits(existingRecord?.customer_document) || null,
    asaas_customer_id:
      normalizeString(input?.asaasCustomerId) || normalizeString(existingRecord?.asaas_customer_id) || null,
    asaas_subscription_id: asaasSubscriptionId,
    asaas_payment_id:
      normalizeString(input?.asaasPaymentId) || normalizeString(existingRecord?.asaas_payment_id) || null,
    plano_slug:
      normalizeString(input?.plan?.slug) || normalizeString(existingRecord?.plano_slug) || null,
    status_assinatura: derivedState.localStatus,
    payment_status:
      normalizeString(input?.paymentStatus).toUpperCase() ||
      normalizeString(existingRecord?.payment_status).toUpperCase() ||
      null,
    valor_plano:
      parseMoney(input?.plan?.value) ?? parseMoney(existingRecord?.valor_plano) ?? 0,
    proximo_vencimento:
      parseAsaasDate(input?.nextDueDate) || parseAsaasDate(existingRecord?.proximo_vencimento) || null,
    forma_pagamento:
      buildPaymentMethodLabel(input?.paymentMethod || input?.plan?.billingType || existingRecord?.forma_pagamento) ||
      null,
    assinatura_ativa: derivedState.subscriptionActive,
    last_event_id:
      normalizeString(input?.eventId) || normalizeString(existingRecord?.last_event_id) || null,
    last_event_type:
      normalizeString(input?.eventType) || normalizeString(existingRecord?.last_event_type) || null,
    asaas_payload: isRecord(input?.asaasPayload)
      ? {
          ...(isRecord(existingRecord?.asaas_payload) ? existingRecord.asaas_payload : {}),
          ...input.asaasPayload,
        }
      : isRecord(existingRecord?.asaas_payload)
        ? existingRecord.asaas_payload
        : {},
    metadata: isRecord(input?.metadata)
      ? {
          ...(isRecord(existingRecord?.metadata) ? existingRecord.metadata : {}),
          ...input.metadata,
        }
      : isRecord(existingRecord?.metadata)
        ? existingRecord.metadata
        : {},
    updated_at: new Date().toISOString(),
  };

  if (!normalizeString(payload.plano_slug)) {
    throw new HttpError(500, "Nao foi possivel identificar o plano da assinatura para persistir no banco local.", {
      code: "SUBSCRIPTION_PLAN_RESOLUTION_ERROR",
      details: {
        asaasSubscriptionId,
        eventType: normalizeString(input?.eventType) || null,
      },
    });
  }

  const { data, error } = await client
    .from("assinaturas_asaas")
    .upsert(payload, { onConflict: "asaas_subscription_id" })
    .select("*")
    .maybeSingle();

  if (error) {
    logBillingStoreError("subscription_state_upsert_failed", {
      asaasSubscriptionId,
      message: toSupabaseMessage(error),
    });
    throw new HttpError(500, "Nao foi possivel salvar a assinatura no banco local.", {
      code: "SUBSCRIPTION_PERSISTENCE_ERROR",
      details: { message: toSupabaseMessage(error) },
    });
  }

  const persistedRecord = isRecord(data) ? data : { ...payload };
  await propagateStateToOwners(client, persistedRecord);

  logBillingStore("subscription_state_persisted", {
    asaasSubscriptionId,
    ownerType: payload.owner_type,
    clinicaId: payload.clinica_id,
    authUserId: payload.auth_user_id,
    localStatus: payload.status_assinatura,
    subscriptionActive: payload.assinatura_ativa,
  });

  if (!payload.assinatura_ativa && PENDING_SUBSCRIPTION_EVENTS.has(normalizeString(input?.eventType).toUpperCase())) {
    logBillingStore("subscription_created_without_payment", {
      asaasSubscriptionId,
      eventType: normalizeString(input?.eventType).toUpperCase(),
      localStatus: payload.status_assinatura,
    });
  } else if (payload.assinatura_ativa && shouldPropagateActiveWebhookState(input)) {
    logBillingStore("subscription_payment_confirmed_access_granted", {
      asaasSubscriptionId,
      eventType: normalizeString(input?.eventType).toUpperCase() || null,
      paymentStatus: normalizeString(input?.paymentStatus).toUpperCase() || null,
    });
  } else if (
    !payload.assinatura_ativa &&
    normalizeString(input?.subscriptionStatus).toUpperCase() === "ACTIVE"
  ) {
    logBillingStore("subscription_access_denied_pending_payment", {
      asaasSubscriptionId,
      eventType: normalizeString(input?.eventType).toUpperCase() || null,
      paymentStatus: normalizeString(input?.paymentStatus).toUpperCase() || null,
    });
  }

  return persistedRecord;
}

export async function linkPendingAsaasSubscriptions(input, env = process.env) {
  const client = getServerSupabaseClient(env);
  const normalizedEmail = normalizeEmail(input?.email || input?.customer?.email);
  const normalizedDocument = normalizeDigits(input?.cpfCnpj || input?.customer?.cpfCnpj);
  const normalizedSubscriptionId = normalizeString(input?.asaasSubscriptionId);
  const pendingRecords = await listPendingSubscriptionRecords(client, {
    email: normalizedEmail,
    cpfCnpj: normalizedDocument,
    asaasSubscriptionId: normalizedSubscriptionId,
  });
  const resolvedPlanSlug =
    normalizePlanSlug(input?.planSlug) ||
    normalizePlanSlug(pendingRecords[0]?.plano_slug) ||
    null;
  const ownerContext =
    input?.ownerContext ||
    (await resolveBillingOwnerContext(
      {
        requestHeaders: input?.requestHeaders,
        customer: {
          email: normalizedEmail,
          cpfCnpj: normalizedDocument,
        },
        planSlug: resolvedPlanSlug,
      },
      env,
    ));

  if (!isResolvedOwnerSnapshot(ownerContext)) {
    logBillingStore("pending_subscription_link_skipped_without_owner", {
      email: normalizedEmail || null,
      customerDocument: normalizedDocument || null,
      asaasSubscriptionId: normalizedSubscriptionId || null,
    });

    return {
      linkedCount: 0,
      linkedSubscriptions: [],
      ownerType: null,
    };
  }

  const openPendingRecords = pendingRecords.filter((record) => isOpenSubscriptionRecord(record));
  const recordsToLink =
    openPendingRecords.length > 0
      ? [openPendingRecords[0]]
      : pendingRecords.slice(0, 1);

  if (pendingRecords.length > recordsToLink.length) {
    const selectedRecordIds = new Set(
      recordsToLink.map((record) => pickString(record, ["id"])).filter(Boolean),
    );

    logBillingStore("pending_subscription_link_multiple_candidates", {
      email: normalizedEmail || null,
      customerDocument: normalizedDocument || null,
      asaasSubscriptionId: normalizedSubscriptionId || null,
      selectedSubscriptionIds: recordsToLink.map((record) => normalizeString(record?.asaas_subscription_id)).filter(Boolean),
      skippedSubscriptionIds: pendingRecords
        .filter((record) => !selectedRecordIds.has(pickString(record, ["id"])))
        .map((record) => normalizeString(record?.asaas_subscription_id))
        .filter(Boolean),
    });
  }

  const linkedSubscriptions = [];

  for (const record of recordsToLink) {
    const updatedRecord = await updateSubscriptionOwnerLink(client, record, {
      ...ownerContext,
      ownerResolutionSource:
        normalizeString(ownerContext.ownerResolutionSource) || "post_registration_link",
    });

    if (!updatedRecord) continue;

    await propagateStateToOwners(client, updatedRecord);
    linkedSubscriptions.push(normalizeString(updatedRecord.asaas_subscription_id));
  }

  logBillingStore("pending_subscription_link_completed", {
    email: normalizedEmail || null,
    customerDocument: normalizedDocument || null,
    asaasSubscriptionId: normalizedSubscriptionId || null,
    ownerType: normalizeString(ownerContext.ownerType) || null,
    linkedCount: linkedSubscriptions.length,
  });

  return {
    linkedCount: linkedSubscriptions.length,
    linkedSubscriptions: linkedSubscriptions.filter(Boolean),
    ownerType: normalizeString(ownerContext.ownerType) || null,
  };
}

export async function registerAsaasWebhookEvent(input, env = process.env) {
  const client = getServerSupabaseClient(env);
  const eventId = normalizeString(input?.eventId);
  const eventType = normalizeString(input?.eventType).toUpperCase();

  if (!eventId || !eventType) {
    throw new HttpError(400, "Webhook do Asaas recebido sem id ou tipo de evento.", {
      code: "INVALID_WEBHOOK_PAYLOAD",
    });
  }

  const existing = await querySingle(client, "asaas_webhook_events", "event_id", eventId);
  if (existing && normalizeString(existing.processing_status) === "processed") {
    return {
      duplicate: true,
      event: existing,
    };
  }

  const payload = {
    event_id: eventId,
    event_type: eventType,
    processing_status: "processing",
    asaas_subscription_id: normalizeString(input?.asaasSubscriptionId) || null,
    asaas_payment_id: normalizeString(input?.asaasPaymentId) || null,
    payload: isRecord(input?.payload) ? input.payload : {},
    error_message: null,
    processed_at: null,
    attempts: existing ? Number(existing.attempts || 0) + 1 : 1,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("asaas_webhook_events")
    .upsert(payload, { onConflict: "event_id" });

  if (error) {
    logBillingStoreError("webhook_event_register_failed", {
      eventId,
      eventType,
      message: toSupabaseMessage(error),
    });
    throw new HttpError(500, "Nao foi possivel registrar o evento do webhook para idempotencia.", {
      code: "WEBHOOK_PERSISTENCE_ERROR",
      details: { message: toSupabaseMessage(error) },
    });
  }

  return {
    duplicate: false,
    event: existing || payload,
  };
}

export async function finalizeAsaasWebhookEvent(input, env = process.env) {
  const client = getServerSupabaseClient(env);
  const eventId = normalizeString(input?.eventId);

  if (!eventId) return;

  const updatePayload = {
    processing_status: input?.status || "processed",
    error_message: normalizeString(input?.errorMessage) || null,
    processed_at: input?.status === "failed" ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("asaas_webhook_events")
    .update(updatePayload)
    .eq("event_id", eventId);

  if (error) {
    logBillingStoreError("webhook_event_finalize_failed", {
      eventId,
      message: toSupabaseMessage(error),
    });
  }
}
