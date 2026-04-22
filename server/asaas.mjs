import {
  finalizeAsaasWebhookEvent,
  persistAsaasSubscriptionState,
  propagateWebhookSubscriptionToUserOwner,
  registerAsaasWebhookEvent,
  resolveBillingOwnerContext,
} from "./billing-store.mjs";
import { HttpError } from "./errors.mjs";
import { PLANOS, resolveSubscriptionPlan } from "./plans.mjs";
import {
  extractBearerToken,
  getServerSupabaseClient,
  getSupabaseServerConfig,
  resolveSupabaseAuthUser,
} from "./supabase.mjs";

const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const SUBSCRIPTION_PAYMENT_RETRY_DELAYS_MS = [0, 350, 900];
const ALLOWED_BILLING_TYPES = new Set(["UNDEFINED", "BOLETO", "CREDIT_CARD", "PIX"]);
const APPROVED_PAYMENT_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["CANCELLED", "INACTIVE", "DELETED", "EXPIRED"]);
const ASAAS_USER_AGENT = "Psivinculo/1.0";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== ""),
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickSourceString(source, keys) {
  if (!isRecord(source)) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function pickSourceBoolean(source, keys) {
  if (!isRecord(source)) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
  }

  return null;
}

function normalizePlanSlug(value) {
  return normalizeString(value).toLowerCase().replace(/-/g, "_");
}

function parseStoredDate(value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(normalizedValue) || /^\d{4}-\d{2}-\d{2}\s/.test(normalizedValue)) {
    return normalizedValue.slice(0, 10);
  }

  const brazilianFormatMatch = normalizedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!brazilianFormatMatch) return null;

  const [, day, month, year] = brazilianFormatMatch;
  return `${year}-${month}-${day}`;
}

function normalizeStatusToken(value) {
  return normalizeString(value).toUpperCase();
}

function isTerminalSubscriptionStatus(value) {
  return TERMINAL_SUBSCRIPTION_STATUSES.has(normalizeStatusToken(value));
}

function getSubscriptionStatusRank(record) {
  const status = normalizeStatusToken(record?.status_assinatura);

  if (record?.assinatura_ativa === true || status === "ACTIVE") return 3;
  if (["PENDING", "OVERDUE"].includes(status)) return 2;
  if (status) return 1;
  return 0;
}

function getRecordTimestamp(record) {
  const rawValue = normalizeString(record?.updated_at) || normalizeString(record?.created_at);
  if (!rawValue) return 0;

  const parsed = Date.parse(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeRecordsByKey(records) {
  const dedupedRecords = new Map();

  for (const record of records) {
    if (!isRecord(record)) continue;

    const key =
      normalizeString(record.asaas_subscription_id) ||
      normalizeString(record.id) ||
      crypto.randomUUID();

    if (!dedupedRecords.has(key)) {
      dedupedRecords.set(key, record);
    }
  }

  return [...dedupedRecords.values()];
}

function sortLocalSubscriptions(records) {
  return [...records].sort((left, right) => {
    const rankDiff = getSubscriptionStatusRank(right) - getSubscriptionStatusRank(left);
    if (rankDiff !== 0) return rankDiff;

    return getRecordTimestamp(right) - getRecordTimestamp(left);
  });
}

function buildDisplayNameFromEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return "Cliente";

  const localPart = normalizedEmail.split("@")[0] || "cliente";
  const parts = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  return parts.join(" ") || "Cliente";
}

function resolveAllowedBillingType(value) {
  const normalizedValue = normalizeString(value).toUpperCase();
  return ALLOWED_BILLING_TYPES.has(normalizedValue) ? normalizedValue : null;
}

function resolveBillingTypeFromSources(...sources) {
  for (const source of sources) {
    if (!source) continue;

    if (typeof source === "string") {
      const normalizedValue = resolveAllowedBillingType(source);
      if (normalizedValue) return normalizedValue;
      continue;
    }

    const nestedPayload = isRecord(source?.asaas_payload) ? source.asaas_payload : null;
    const nestedSubscription = isRecord(nestedPayload?.subscription) ? nestedPayload.subscription : null;
    const nestedPayment = isRecord(nestedPayload?.firstPayment) ? nestedPayload.firstPayment : null;
    const candidate = resolveAllowedBillingType(
      pickSourceString(source, ["forma_pagamento", "payment_method", "billing_method"]) ||
        pickSourceString(nestedSubscription, ["billingType"]) ||
        pickSourceString(nestedPayment, ["billingType"]),
    );

    if (candidate) return candidate;
  }

  return "UNDEFINED";
}

async function queryMany(client, table, column, value, limit = 20) {
  if (!value) return [];

  const { data, error } = await client
    .from(table)
    .select("*")
    .eq(column, value)
    .limit(limit);

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.filter(isRecord) : [];
}

async function querySingle(client, table, column, value) {
  const rows = await queryMany(client, table, column, value, 1);
  return rows[0] || null;
}

function hasResolvedOwnerContext(ownerContext) {
  const ownerType = normalizeString(ownerContext?.ownerType || ownerContext?.owner_type);
  const authUserId = normalizeString(ownerContext?.authUserId || ownerContext?.auth_user_id);
  const clinicaId = normalizeString(ownerContext?.clinicaId || ownerContext?.clinica_id);

  if (ownerType === "clinic") return Boolean(clinicaId);
  if (ownerType === "user") return Boolean(authUserId);

  return false;
}

function recordMatchesOwnerContext(record, ownerContext) {
  const recordOwnerType = normalizeString(record?.owner_type);
  const ownerType = normalizeString(ownerContext?.ownerType || ownerContext?.owner_type);

  if (!recordOwnerType || !ownerType || recordOwnerType !== ownerType) {
    return false;
  }

  if (ownerType === "clinic") {
    return (
      normalizeString(record?.clinica_id) ===
      normalizeString(ownerContext?.clinicaId || ownerContext?.clinica_id)
    );
  }

  if (ownerType === "user") {
    return (
      normalizeString(record?.auth_user_id) ===
      normalizeString(ownerContext?.authUserId || ownerContext?.auth_user_id)
    );
  }

  return false;
}

function doesRecordMatchCustomerIdentity(record, customer) {
  const customerDocument = normalizeDigits(customer?.cpfCnpj);
  const recordDocument = normalizeDigits(record?.customer_document);

  if (customerDocument && recordDocument) {
    return customerDocument === recordDocument;
  }

  const customerEmail = normalizeEmail(customer?.email);
  const recordEmail = normalizeEmail(record?.customer_email);

  return Boolean(customerEmail && recordEmail && customerEmail === recordEmail);
}

function isOpenLocalSubscriptionRecord(record) {
  return Boolean(
    normalizeString(record?.asaas_subscription_id) &&
      !isTerminalSubscriptionStatus(record?.status_assinatura),
  );
}

async function collectPotentialOpenSubscriptionRecords(client, ownerContext, customer) {
  const records = [];
  const ownerType = normalizeString(ownerContext?.ownerType || ownerContext?.owner_type);
  const authUserId = normalizeString(ownerContext?.authUserId || ownerContext?.auth_user_id);
  const clinicaId = normalizeString(ownerContext?.clinicaId || ownerContext?.clinica_id);
  const customerDocument = normalizeDigits(customer?.cpfCnpj);
  const customerEmail = normalizeEmail(customer?.email);

  if (ownerType === "user" && authUserId) {
    records.push(...(await queryMany(client, "assinaturas_asaas", "auth_user_id", authUserId, 50)));
  }

  if (ownerType === "clinic" && clinicaId) {
    records.push(...(await queryMany(client, "assinaturas_asaas", "clinica_id", clinicaId, 50)));
  }

  if (customerDocument) {
    records.push(...(await queryMany(client, "assinaturas_asaas", "customer_document", customerDocument, 50)));
  }

  if (customerEmail) {
    records.push(...(await queryMany(client, "assinaturas_asaas", "customer_email", customerEmail, 50)));
  }

  return sortLocalSubscriptions(
    dedupeRecordsByKey(records).filter((record) => {
      if (!isOpenLocalSubscriptionRecord(record)) return false;

      if (hasResolvedOwnerContext(ownerContext) && recordMatchesOwnerContext(record, ownerContext)) {
        return true;
      }

      return doesRecordMatchCustomerIdentity(record, customer);
    }),
  );
}

async function resolveExistingSubscriptionForCreate(input) {
  const candidateRecords = await collectPotentialOpenSubscriptionRecords(
    input.client,
    input.ownerContext,
    input.subscriptionInput.customer,
  );

  if (candidateRecords.length === 0) {
    return null;
  }

  const confirmedOpenSubscriptions = [];

  for (const record of candidateRecords) {
    const subscriptionId = normalizeString(record?.asaas_subscription_id);
    if (!subscriptionId) continue;

    const remoteSubscription = await fetchSubscriptionById(input.config, subscriptionId);
    const remoteStatus = normalizeStatusToken(remoteSubscription?.status);

    if (!remoteSubscription || isTerminalSubscriptionStatus(remoteStatus)) {
      await markSubscriptionAsReplaced(
        record,
        {
          planSlug:
            normalizeString(record?.plano_slug) || input.subscriptionInput.plan.slug || null,
        },
        input.env,
      );
      continue;
    }

    confirmedOpenSubscriptions.push({
      record,
      subscription: remoteSubscription,
    });
  }

  if (confirmedOpenSubscriptions.length === 0) {
    return null;
  }

  if (confirmedOpenSubscriptions.length > 1) {
    const subscriptionIds = confirmedOpenSubscriptions.map(({ record }) =>
      normalizeString(record?.asaas_subscription_id),
    );

    logAsaasEvent("create_subscription_blocked_multiple_open_records", {
      planSlug: input.subscriptionInput.plan.slug,
      ownerType:
        normalizeString(input.ownerContext?.ownerType || input.ownerContext?.owner_type) || null,
      subscriptionIds,
    });

    throw new HttpError(
      409,
      "Ja existe mais de uma assinatura aberta para este titular. Bloqueamos a criacao de uma nova recorrencia ate revisar o billing atual.",
      {
        code: "MULTIPLE_OPEN_SUBSCRIPTIONS_FOR_OWNER",
        details: {
          planSlug: input.subscriptionInput.plan.slug,
          subscriptionIds,
        },
      },
    );
  }

  const { record: existingRecord, subscription: existingSubscription } = confirmedOpenSubscriptions[0];
  const existingPlanSlug = normalizePlanSlug(existingRecord?.plano_slug);

  if (
    existingPlanSlug &&
    existingPlanSlug !== normalizePlanSlug(input.subscriptionInput.plan.slug)
  ) {
    logAsaasEvent("create_subscription_blocked_existing_open_record", {
      requestedPlanSlug: input.subscriptionInput.plan.slug,
      existingPlanSlug,
      asaasSubscriptionId: normalizeString(existingRecord?.asaas_subscription_id) || null,
    });

    throw new HttpError(
      409,
      "Ja existe uma assinatura aberta para este titular. Use a troca de plano dentro da conta em vez de criar uma nova recorrencia.",
      {
        code: "OPEN_SUBSCRIPTION_ALREADY_EXISTS",
        details: {
          requestedPlanSlug: input.subscriptionInput.plan.slug,
          existingPlanSlug,
          asaasSubscriptionId: normalizeString(existingRecord?.asaas_subscription_id) || null,
        },
      },
    );
  }

  const subscriptionId = normalizeString(existingRecord?.asaas_subscription_id);
  const firstPayment = await findFirstSubscriptionPayment(input.config, subscriptionId);
  const billingType = resolveBillingTypeFromSources(
    normalizeString(existingSubscription?.billingType),
    firstPayment,
    existingRecord,
    input.subscriptionInput.plan.billingType,
  );
  const paymentUrl = extractPaymentUrl(firstPayment) || null;
  const pixQrCode =
    billingType === "PIX" && normalizeString(firstPayment?.id)
      ? await tryGetPixQrCode(input.config, firstPayment.id)
      : null;
  const nextDueDate =
    normalizeString(existingSubscription?.nextDueDate) ||
    normalizeString(firstPayment?.dueDate) ||
    parseStoredDate(normalizeString(existingRecord?.proximo_vencimento)) ||
    input.subscriptionInput.nextDueDate;
  const persistedRecord = await persistAsaasSubscriptionState(
    {
      requestHeaders: input.requestHeaders,
      customer: input.subscriptionInput.customer,
      plan: input.subscriptionInput.plan,
      ownerContext: input.ownerContext,
      asaasCustomerId: normalizeString(existingRecord?.asaas_customer_id) || null,
      asaasSubscriptionId: subscriptionId,
      asaasPaymentId:
        normalizeString(firstPayment?.id) ||
        normalizeString(existingRecord?.asaas_payment_id) ||
        null,
      paymentStatus: normalizeString(firstPayment?.status) || null,
      subscriptionStatus:
        normalizeString(existingSubscription?.status) ||
        normalizeString(existingRecord?.status_assinatura) ||
        null,
      paymentMethod: billingType,
      nextDueDate,
      preserveActiveState: normalizeStatusToken(existingSubscription?.status) === "ACTIVE",
      asaasPayload: {
        subscription: existingSubscription,
        firstPayment,
      },
      metadata: {
        reusedExistingSubscription: true,
        reusedAt: new Date().toISOString(),
      },
    },
    input.env,
  );

  logAsaasEvent("create_subscription_reused_existing", {
    planSlug: input.subscriptionInput.plan.slug,
    asaasSubscriptionId: subscriptionId,
    paymentStatus: normalizeString(firstPayment?.status) || null,
  });

  return {
    customerSource: "existing",
    nextDueDate,
    plan: {
      id: input.subscriptionInput.plan.id,
      slug: input.subscriptionInput.plan.slug,
      routeKey: input.subscriptionInput.plan.routeKey,
      name: input.subscriptionInput.plan.name,
      value: input.subscriptionInput.plan.value,
      billingType,
      cycle: "MONTHLY",
      description: input.subscriptionInput.plan.description,
    },
    customer: null,
    subscription: existingSubscription,
    firstPayment,
    paymentUrl,
    pixQrCode,
    persistenceDraft: {
      asaas_customer_id:
        normalizeString(persistedRecord?.asaas_customer_id) ||
        normalizeString(existingRecord?.asaas_customer_id) ||
        null,
      asaas_subscription_id: subscriptionId,
      plano_slug:
        normalizeString(persistedRecord?.plano_slug) ||
        existingPlanSlug ||
        input.subscriptionInput.plan.slug,
      status_assinatura:
        normalizeString(persistedRecord?.status_assinatura) ||
        normalizeString(existingSubscription?.status) ||
        normalizeString(firstPayment?.status) ||
        normalizeString(existingRecord?.status_assinatura) ||
        "PENDING",
    },
  };
}

async function findAuthenticatedUserRow(client, authenticatedUser) {
  if (!authenticatedUser) return null;

  const candidates = [
    { column: "auth_id", value: normalizeString(authenticatedUser.id) },
    { column: "id", value: normalizeString(authenticatedUser.id) },
    { column: "email", value: normalizeEmail(authenticatedUser.email) },
  ];

  for (const candidate of candidates) {
    if (!candidate.value) continue;

    const row = await querySingle(client, "usuarios", candidate.column, candidate.value);
    if (row) return row;
  }

  return null;
}

async function collectRelevantSubscriptionRecords(client, authenticatedUser, clinicId) {
  const records = [];

  if (authenticatedUser?.id) {
    records.push(...(await queryMany(client, "assinaturas_asaas", "auth_user_id", authenticatedUser.id, 50)));
  }

  if (clinicId) {
    records.push(...(await queryMany(client, "assinaturas_asaas", "clinica_id", clinicId, 50)));
  }

  return sortLocalSubscriptions(dedupeRecordsByKey(records));
}

function buildEffectiveFinancialSnapshot(source, ownerType) {
  if (!isRecord(source)) return null;

  const planSlug = normalizePlanSlug(
    pickSourceString(source, [
      "plano_slug",
      "plan_slug",
      "plan_id",
      "current_plan_id",
      "subscription_plan_id",
    ]),
  );
  const status = normalizeStatusToken(
    pickSourceString(source, ["status_assinatura", "subscription_status", "plan_status"]),
  );
  const activeFlag = pickSourceBoolean(source, ["assinatura_ativa", "subscription_active", "plan_active"]);

  if (
    !planSlug &&
    !status &&
    activeFlag == null &&
    !pickSourceString(source, ["asaas_subscription_id"])
  ) {
    return null;
  }

  return {
    ownerType,
    row: source,
    planSlug: planSlug || null,
    subscriptionId: pickSourceString(source, ["asaas_subscription_id"]) || null,
    customerId: pickSourceString(source, ["asaas_customer_id"]) || null,
    status: status || null,
    active: activeFlag === true || status === "ACTIVE",
    monthlyPrice: parseMoney(pickSourceString(source, ["valor_mensal", "valor_plano", "plan_price"])) ?? null,
    dueDate:
      parseStoredDate(
        pickSourceString(source, ["proximo_vencimento", "payment_due_date", "billing_due_date"]),
      ) || null,
    paymentMethod:
      pickSourceString(source, ["forma_pagamento", "payment_method", "billing_method"]) || null,
  };
}

function pickCurrentFinancialSnapshot(context) {
  const userSnapshot = buildEffectiveFinancialSnapshot(context.adminRow, "user");
  const clinicSnapshot = buildEffectiveFinancialSnapshot(context.clinicRow, "clinic");
  const orderedSnapshots = [userSnapshot, clinicSnapshot]
    .filter(Boolean)
    .sort((left, right) => {
      const leftRank = left.active ? 3 : left.status === "PENDING" || left.status === "OVERDUE" ? 2 : 1;
      const rightRank = right.active ? 3 : right.status === "PENDING" || right.status === "OVERDUE" ? 2 : 1;

      if (rightRank !== leftRank) {
        return rightRank - leftRank;
      }

      const leftPlanOwnerRank = left.planSlug?.startsWith("clinica_") ? (left.ownerType === "clinic" ? 2 : 1) : left.ownerType === "user" ? 2 : 1;
      const rightPlanOwnerRank =
        right.planSlug?.startsWith("clinica_") ? (right.ownerType === "clinic" ? 2 : 1) : right.ownerType === "user" ? 2 : 1;

      return rightPlanOwnerRank - leftPlanOwnerRank;
    });

  return orderedSnapshots[0] || null;
}

async function resolveActorBillingContext(options = {}) {
  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
  getSupabaseServerConfig(env);

  const accessToken = extractBearerToken(requestHeaders);
  const authenticatedUser = await resolveSupabaseAuthUser(accessToken, env);
  if (!authenticatedUser) {
    throw new HttpError(401, "Sua sessao expirou. Entre novamente para alterar o plano.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const client = getServerSupabaseClient(env);
  const metadata = isRecord(authenticatedUser.user_metadata) ? authenticatedUser.user_metadata : {};
  const adminRow = await findAuthenticatedUserRow(client, authenticatedUser);

  if (!adminRow) {
    throw new HttpError(
      409,
      "Sua conta autenticada nao possui cadastro local em public.usuarios. Refaça o vinculo antes de gerenciar a assinatura.",
      {
        code: "LOCAL_USER_RECORD_NOT_FOUND",
      },
    );
  }

  const clinicId = pickSourceString(adminRow, ["clinica_id", "clinic_id"]) || null;
  const clinicRow = clinicId ? await querySingle(client, "clinicas", "id", clinicId) : null;
  const subscriptionRecords = await collectRelevantSubscriptionRecords(client, authenticatedUser, clinicId);

  return {
    env,
    client,
    requestHeaders,
    authenticatedUser,
    metadata,
    adminRow,
    clinicId,
    clinicRow,
    subscriptionRecords,
    currentSubscription: subscriptionRecords[0] || null,
    currentFinancialSnapshot: pickCurrentFinancialSnapshot({ adminRow, clinicRow }),
  };
}

function buildOwnerCustomerInput(context, ownerContext) {
  const ownerType = normalizeString(ownerContext?.ownerType || ownerContext?.owner_type);
  const source = ownerType === "clinic" ? context.clinicRow : context.adminRow;
  const fallbackSource = ownerType === "clinic" ? context.adminRow : context.clinicRow;
  const userEmail = normalizeEmail(context.authenticatedUser?.email);
  const name =
    pickSourceString(source, ["nome", "name"]) ||
    pickSourceString(context.metadata, ["full_name", "name", "nome"]) ||
    pickSourceString(fallbackSource, ["nome", "name"]) ||
    buildDisplayNameFromEmail(userEmail);
  const email =
    normalizeEmail(
      pickSourceString(source, ["email"]) ||
        pickSourceString(fallbackSource, ["email"]) ||
        userEmail,
    ) || "";
  const cpfCnpj =
    normalizeDigits(
      pickSourceString(source, ["cpf", "cnpj", "cpf_cnpj", "cpfCnpj", "documento", "document"]) ||
        pickSourceString(context.metadata, ["cpf", "cnpj", "cpf_cnpj", "cpfCnpj", "documento", "document"]),
    ) || "";
  const phone =
    normalizeDigits(
      pickSourceString(source, ["telefone", "phone", "mobilePhone"]) ||
        pickSourceString(fallbackSource, ["telefone", "phone", "mobilePhone"]),
    ) || undefined;

  if (!name) {
    throw new HttpError(400, "Nao foi possivel identificar o nome do titular para o Asaas.", {
      code: "MISSING_BILLING_NAME",
    });
  }

  if (!isValidEmail(email)) {
    throw new HttpError(400, "Nao foi possivel identificar um e-mail valido para o titular da assinatura.", {
      code: "MISSING_BILLING_EMAIL",
    });
  }

  if (![11, 14].includes(cpfCnpj.length)) {
    throw new HttpError(
      400,
      ownerType === "clinic"
        ? "A clinica precisa ter um CNPJ valido para trocar para um plano de clinica."
        : "O usuario precisa ter um CPF valido no metadata do Auth ou no cadastro para trocar para um plano individual.",
      {
        code: "MISSING_BILLING_DOCUMENT",
        details: {
          ownerType: ownerType || null,
        },
      },
    );
  }

  return compactObject({
    name,
    email,
    cpfCnpj,
    phone,
    externalReference:
      ownerType === "clinic"
        ? context.clinicId
          ? `clinica:${context.clinicId}`
          : undefined
        : context.authenticatedUser?.id
          ? `usuario:${context.authenticatedUser.id}`
          : undefined,
  });
}

function resolvePlanChangeDueDate(payload, currentSource) {
  const explicitDate = normalizeString(pickFirstValue(payload?.nextDueDate, payload?.dueDate));

  if (explicitDate) {
    return calculateNextDueDate({ nextDueDate: explicitDate });
  }

  const storedDueDate =
    parseStoredDate(currentSource?.dueDate) ||
    parseStoredDate(currentSource?.nextDueDate) ||
    parseStoredDate(currentSource?.proximo_vencimento);

  if (storedDueDate) {
    try {
      return calculateNextDueDate({ nextDueDate: storedDueDate });
    } catch {
      // Falls back to the next valid due date below.
    }
  }

  return calculateNextDueDate();
}

async function updateAsaasSubscription(config, subscriptionId, payload) {
  return asaasRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PUT",
    body: payload,
  });
}

async function deleteAsaasSubscription(config, subscriptionId) {
  if (!subscriptionId) return null;

  return asaasRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
  });
}

async function deleteAsaasPayment(config, paymentId) {
  if (!paymentId) return null;

  return asaasRequest(config, `/payments/${encodeURIComponent(paymentId)}`, {
    method: "DELETE",
  });
}

async function markSubscriptionAsReplaced(record, replacement, env = process.env) {
  const subscriptionId = normalizeString(record?.asaas_subscription_id);
  if (!subscriptionId) return null;

  return persistAsaasSubscriptionState(
    {
      asaasCustomerId: normalizeString(record?.asaas_customer_id) || null,
      asaasSubscriptionId: subscriptionId,
      asaasPaymentId: normalizeString(record?.asaas_payment_id) || null,
      subscriptionStatus: "INACTIVE",
      eventType: "SUBSCRIPTION_DELETED",
      paymentMethod: pickSourceString(record, ["forma_pagamento", "payment_method", "billing_method"]) || null,
      nextDueDate:
        parseStoredDate(
          pickSourceString(record, ["proximo_vencimento", "payment_due_date", "billing_due_date"]),
        ) || null,
      metadata: {
        replacedBySubscriptionId: normalizeString(replacement?.asaasSubscriptionId) || null,
        replacedByPlanSlug: normalizeString(replacement?.planSlug) || null,
        replacementAt: new Date().toISOString(),
      },
    },
    env,
  );
}

function serializePlanResult(plan, billingType) {
  return {
    id: plan.id,
    slug: plan.slug,
    routeKey: plan.routeKey,
    name: plan.name,
    value: plan.value,
    billingType,
    cycle: "MONTHLY",
    description: plan.description,
  };
}

function buildPlanChangeResponse(input) {
  return {
    action: input.action,
    customerSource: input.customerSource || null,
    nextDueDate: input.nextDueDate || null,
    plan: serializePlanResult(input.plan, input.billingType),
    customer: input.customer || null,
    subscription: input.subscription || null,
    firstPayment: input.firstPayment || null,
    paymentUrl: input.paymentUrl || null,
    pixQrCode: input.pixQrCode || null,
    persistenceDraft: {
      asaas_customer_id:
        normalizeString(input.persistedRecord?.asaas_customer_id) ||
        normalizeString(input.fallbackPersistenceDraft?.asaas_customer_id) ||
        null,
      asaas_subscription_id:
        normalizeString(input.persistedRecord?.asaas_subscription_id) ||
        normalizeString(input.fallbackPersistenceDraft?.asaas_subscription_id) ||
        null,
      plano_slug:
        normalizeString(input.persistedRecord?.plano_slug) ||
        normalizeString(input.fallbackPersistenceDraft?.plano_slug) ||
        input.plan.slug,
      status_assinatura:
        normalizeString(input.persistedRecord?.status_assinatura) ||
        normalizeString(input.fallbackPersistenceDraft?.status_assinatura) ||
        null,
    },
    previousSubscription: input.previousSubscription || null,
    warning: input.warning || null,
  };
}

export function normalizeDigits(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).replace(/\D+/g, "");
  }

  return typeof value === "string" ? value.replace(/\D+/g, "") : "";
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function getHeaderValue(headers, headerName) {
  if (!headers || typeof headers !== "object") return "";

  const value = headers[headerName];

  if (Array.isArray(value)) {
    return normalizeString(value[0]);
  }

  return normalizeString(value);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/\s+/g, "");

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const normalizedValue = value.trim();
  if (!/^-?\d+$/.test(normalizedValue)) return null;

  const parsed = Number.parseInt(normalizedValue, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function normalizePlanToken(value) {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function maskEmailForLogs(value) {
  const normalizedValue = normalizeEmail(value);
  if (!normalizedValue) return null;

  const [localPart, domain = ""] = normalizedValue.split("@");
  if (!localPart) return `***@${domain}`;

  const visibleStart = localPart.slice(0, 2);
  const visibleEnd = localPart.length > 3 ? localPart.slice(-1) : "";
  return `${visibleStart}***${visibleEnd}@${domain}`;
}

function maskDocumentForLogs(value) {
  const digits = normalizeDigits(value);
  if (!digits) return null;

  return `***${digits.slice(-4)}`;
}

function maskApiKeyForLogs(value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return null;

  if (normalizedValue.length <= 12) {
    return `${normalizedValue.slice(0, 4)}***`;
  }

  return `${normalizedValue.slice(0, 10)}***${normalizedValue.slice(-4)}`;
}

function logAsaasEvent(step, context) {
  console.info(`[Psivinculo][asaas][${step}]`, context);
}

function extractDatePartsInTimeZone(date, timeZone = BRAZIL_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return { year, month, day };
}

function buildDateString(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function ensureFutureOrCurrentDate(dateString, referenceDate = new Date()) {
  const today = calculateNextDueDate({ referenceDate });

  if (dateString < today) {
    throw new HttpError(400, "A data informada para a primeira cobranca nao pode estar no passado.", {
      code: "INVALID_DUE_DATE",
      details: { nextDueDate: dateString, today },
    });
  }

  return dateString;
}

export function calculateNextDueDate(input = {}) {
  const referenceDate = input.referenceDate instanceof Date ? input.referenceDate : new Date();
  const explicitDueDate = normalizeString(input.nextDueDate || input.dueDate);

  if (explicitDueDate) {
    if (!isValidIsoDate(explicitDueDate)) {
      throw new HttpError(400, "Use o formato YYYY-MM-DD para a primeira cobranca.", {
        code: "INVALID_DUE_DATE_FORMAT",
      });
    }

    return ensureFutureOrCurrentDate(explicitDueDate, referenceDate);
  }

  const { year, month, day } = extractDatePartsInTimeZone(referenceDate, BRAZIL_TIME_ZONE);
  const billingDay = parseInteger(input.billingDay);

  if (billingDay != null) {
    if (billingDay < 1 || billingDay > 31) {
      throw new HttpError(400, "billingDay deve estar entre 1 e 31.", {
        code: "INVALID_BILLING_DAY",
      });
    }

    let candidateYear = year;
    let candidateMonth = month;
    let candidateDay = Math.min(billingDay, getDaysInMonth(candidateYear, candidateMonth));
    let candidate = buildDateString(candidateYear, candidateMonth, candidateDay);
    const today = buildDateString(year, month, day);

    if (candidate < today) {
      candidateMonth += 1;

      if (candidateMonth > 12) {
        candidateMonth = 1;
        candidateYear += 1;
      }

      candidateDay = Math.min(billingDay, getDaysInMonth(candidateYear, candidateMonth));
      candidate = buildDateString(candidateYear, candidateMonth, candidateDay);
    }

    return candidate;
  }

  const trialDays = parseInteger(input.trialDays);

  if (trialDays != null) {
    if (trialDays < 0) {
      throw new HttpError(400, "trialDays nao pode ser negativo.", {
        code: "INVALID_TRIAL_DAYS",
      });
    }

    const trialDate = new Date(Date.UTC(year, month - 1, day + trialDays));

    return buildDateString(
      trialDate.getUTCFullYear(),
      trialDate.getUTCMonth() + 1,
      trialDate.getUTCDate(),
    );
  }

  return buildDateString(year, month, day);
}

function sanitizeBaseUrl(value) {
  const normalizedValue = normalizeString(value);

  if (!normalizedValue) {
    throw new HttpError(500, "ASAAS_BASE_URL nao foi configurada no servidor.", {
      code: "ASAAS_CONFIG_ERROR",
    });
  }

  return normalizedValue.replace(/\/+$/, "");
}

function normalizeBillingType(value) {
  const normalizedValue = normalizeString(value).toUpperCase();

  if (!normalizedValue) return "UNDEFINED";

  if (!ALLOWED_BILLING_TYPES.has(normalizedValue)) {
    throw new HttpError(400, "billingType invalido. Use UNDEFINED, BOLETO, CREDIT_CARD ou PIX.", {
      code: "INVALID_BILLING_TYPE",
      details: { billingType: normalizedValue },
    });
  }

  return normalizedValue;
}

function getAsaasConfig(env = process.env) {
  const apiKey = normalizeString(env.ASAAS_API_KEY);
  const baseUrl = sanitizeBaseUrl(env.ASAAS_BASE_URL);

  if (!apiKey) {
    throw new HttpError(500, "ASAAS_API_KEY nao foi configurada no servidor.", {
      code: "ASAAS_CONFIG_ERROR",
    });
  }

  return { apiKey, baseUrl };
}

function getAsaasWebhookConfig(env = process.env) {
  const webhookToken = normalizeString(env.ASAAS_WEBHOOK_TOKEN);

  if (!webhookToken) {
    throw new HttpError(500, "ASAAS_WEBHOOK_TOKEN nao foi configurada no servidor.", {
      code: "ASAAS_WEBHOOK_CONFIG_ERROR",
    });
  }

  return {
    webhookToken,
  };
}

function buildCustomerInput(payload) {
  const customer = isRecord(payload.customer) ? payload.customer : {};
  const name = normalizeString(pickFirstValue(customer.name, payload.customerName, payload.name, payload.nome));
  const cpfCnpj = normalizeDigits(
    pickFirstValue(customer.cpfCnpj, customer.document, payload.customerDocument, payload.cpfCnpj, payload.document),
  );
  const email = normalizeEmail(pickFirstValue(customer.email, payload.customerEmail, payload.email));
  const phone = normalizeDigits(pickFirstValue(customer.phone, payload.customerPhone, payload.phone));
  const mobilePhone = normalizeDigits(
    pickFirstValue(customer.mobilePhone, customer.phone, payload.customerMobilePhone, payload.mobilePhone, payload.phone),
  );
  const postalCode = normalizeDigits(
    pickFirstValue(customer.postalCode, customer.zipCode, payload.customerPostalCode, payload.postalCode, payload.zipCode),
  );

  if (!name) {
    throw new HttpError(400, "Informe o nome do cliente para criar a assinatura.", {
      code: "MISSING_CUSTOMER_NAME",
    });
  }

  if (![11, 14].includes(cpfCnpj.length)) {
    throw new HttpError(400, "Informe um CPF ou CNPJ valido para o cliente.", {
      code: "INVALID_CUSTOMER_DOCUMENT",
    });
  }

  if (!email) {
    throw new HttpError(400, "Informe o e-mail do cliente para criar a assinatura.", {
      code: "MISSING_CUSTOMER_EMAIL",
    });
  }

  if (!isValidEmail(email)) {
    throw new HttpError(400, "Informe um e-mail valido para o cliente.", {
      code: "INVALID_CUSTOMER_EMAIL",
    });
  }

  if (phone && ![10, 11].includes(phone.length)) {
    throw new HttpError(400, "Informe um telefone valido com DDD para o cliente.", {
      code: "INVALID_CUSTOMER_PHONE",
    });
  }

  if (mobilePhone && ![10, 11].includes(mobilePhone.length)) {
    throw new HttpError(400, "Informe um celular valido com DDD para o cliente.", {
      code: "INVALID_CUSTOMER_MOBILE_PHONE",
    });
  }

  if (postalCode && postalCode.length !== 8) {
    throw new HttpError(400, "Informe um CEP valido com 8 digitos.", {
      code: "INVALID_CUSTOMER_POSTAL_CODE",
    });
  }

  return compactObject({
    name,
    cpfCnpj,
    email: email || undefined,
    phone: phone || undefined,
    mobilePhone: mobilePhone || undefined,
    address: normalizeString(pickFirstValue(customer.address, payload.customerAddress, payload.address)) || undefined,
    addressNumber:
      normalizeString(pickFirstValue(customer.addressNumber, payload.customerAddressNumber, payload.addressNumber)) ||
      undefined,
    complement:
      normalizeString(pickFirstValue(customer.complement, payload.customerComplement, payload.complement)) ||
      undefined,
    province:
      normalizeString(pickFirstValue(customer.province, payload.customerProvince, payload.province)) || undefined,
    postalCode: postalCode || undefined,
    externalReference:
      normalizeString(
        pickFirstValue(
          customer.externalReference,
          payload.customerExternalReference,
          payload.externalCustomerReference,
        ),
      ) || undefined,
    notificationDisabled:
      typeof customer.notificationDisabled === "boolean"
        ? customer.notificationDisabled
        : typeof payload.notificationDisabled === "boolean"
          ? payload.notificationDisabled
          : undefined,
    additionalEmails:
      normalizeString(pickFirstValue(customer.additionalEmails, payload.additionalEmails)) || undefined,
    observations:
      normalizeString(pickFirstValue(customer.observations, payload.customerObservations, payload.observations)) ||
      undefined,
    company: normalizeString(pickFirstValue(customer.company, payload.company)) || undefined,
    foreignCustomer:
      typeof customer.foreignCustomer === "boolean"
        ? customer.foreignCustomer
        : typeof payload.foreignCustomer === "boolean"
          ? payload.foreignCustomer
          : undefined,
  });
}

function buildPlanInput(payload) {
  const plan = isRecord(payload.plan)
    ? payload.plan
    : typeof payload.plan === "string"
      ? { slug: payload.plan }
      : {};
  const rawPlanKey = normalizeString(
    pickFirstValue(
      plan.slug,
      plan.id,
      plan.name,
      payload.planKey,
      payload.planSlug,
      payload.planId,
      payload.plano_slug,
      payload.plano,
      payload.plan,
    ),
  );
  const resolvedPlan = resolveSubscriptionPlan(rawPlanKey);
  const cycle = normalizeString(pickFirstValue(plan.cycle, payload.cycle)).toUpperCase();
  const endDate = normalizeString(pickFirstValue(plan.endDate, payload.endDate)) || undefined;
  const maxPayments = parseInteger(pickFirstValue(plan.maxPayments, payload.maxPayments)) ?? undefined;

  if (cycle && cycle !== "MONTHLY") {
    throw new HttpError(400, "Esta rota cria apenas assinatura mensal recorrente.", {
      code: "INVALID_SUBSCRIPTION_CYCLE",
    });
  }

  if (!resolvedPlan) {
    throw new HttpError(400, `Plano invalido: ${rawPlanKey}`, {
      code: "INVALID_PLAN_SLUG",
      details: {
        planKey: rawPlanKey || null,
        availablePlanKeys: Object.keys(PLANOS),
      },
    });
  }

  const value = Number(resolvedPlan.value);

  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError(400, "Informe um valor mensal valido para o plano", {
      code: "INVALID_PLAN_VALUE",
      details: {
        planKey: rawPlanKey || null,
      },
    });
  }

  if (endDate && !isValidIsoDate(endDate)) {
    throw new HttpError(400, "Use o formato YYYY-MM-DD em endDate.", {
      code: "INVALID_END_DATE_FORMAT",
    });
  }

  if (maxPayments !== undefined && maxPayments <= 0) {
    throw new HttpError(400, "maxPayments deve ser maior que zero.", {
      code: "INVALID_MAX_PAYMENTS",
    });
  }

  return {
    id: resolvedPlan.slug,
    slug: resolvedPlan.slug,
    routeKey: resolvedPlan.routeKey,
    name: resolvedPlan.name,
    value,
    billingType: normalizeBillingType(pickFirstValue(plan.billingType, payload.billingType)),
    description: resolvedPlan.description,
    callback: isRecord(pickFirstValue(plan.callback, payload.callback))
      ? pickFirstValue(plan.callback, payload.callback)
      : undefined,
    endDate,
    maxPayments,
    discount: isRecord(pickFirstValue(plan.discount, payload.discount))
      ? pickFirstValue(plan.discount, payload.discount)
      : undefined,
    fine: isRecord(pickFirstValue(plan.fine, payload.fine)) ? pickFirstValue(plan.fine, payload.fine) : undefined,
    interest: isRecord(pickFirstValue(plan.interest, payload.interest))
      ? pickFirstValue(plan.interest, payload.interest)
      : undefined,
    externalReference:
      normalizeString(
        pickFirstValue(plan.externalReference, payload.subscriptionExternalReference, payload.externalReference),
      ) || undefined,
  };
}

function buildSubscriptionExternalReference(planInput, customerInput) {
  if (planInput.externalReference) {
    return planInput.externalReference;
  }

  const planToken = normalizePlanToken(planInput.id || planInput.name || "plano");
  const customerToken = normalizePlanToken(
    customerInput.externalReference || customerInput.email || customerInput.name || customerInput.cpfCnpj.slice(-4),
  );

  return `psivinculo-${planToken || "plano"}-${customerToken || "cliente"}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildSubscriptionInput(payload) {
  const customer = buildCustomerInput(payload);
  const plan = buildPlanInput(payload);
  const nextDueDate = calculateNextDueDate({
    nextDueDate: pickFirstValue(payload.nextDueDate, payload.dueDate),
    billingDay: payload.billingDay,
    trialDays: payload.trialDays,
  });

  return {
    customer,
    plan,
    nextDueDate,
  };
}

function buildAsaasUrl(config, endpoint, query) {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const url = new URL(`${config.baseUrl}/${normalizedEndpoint}`);

  if (query && isRecord(query)) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function buildAsaasError(status, payload) {
  const errors = Array.isArray(payload?.errors)
    ? payload.errors
        .map((errorItem) => {
          if (typeof errorItem === "string") return errorItem;
          if (isRecord(errorItem)) {
            return normalizeString(errorItem.description || errorItem.message || errorItem.code);
          }

          return "";
        })
        .filter(Boolean)
    : [];

  const upstreamMessage = errors[0] || normalizeString(payload?.message) || normalizeString(payload?.error);

  if (status === 400) {
    return new HttpError(400, upstreamMessage || "O Asaas rejeitou a solicitacao.", {
      code: "ASAAS_VALIDATION_ERROR",
      details: { upstreamStatus: status, errors: errors.length ? errors : undefined },
    });
  }

  if (status === 401 || status === 403) {
    return new HttpError(
      502,
      "Falha de autenticacao com o Asaas. Verifique a configuracao do backend.",
      {
        code: "ASAAS_AUTH_ERROR",
        details: { upstreamStatus: status, errors: errors.length ? errors : undefined },
      },
    );
  }

  if (status === 404) {
    return new HttpError(502, upstreamMessage || "O recurso esperado nao foi encontrado no Asaas.", {
      code: "ASAAS_NOT_FOUND",
      details: { upstreamStatus: status, errors: errors.length ? errors : undefined },
    });
  }

  return new HttpError(502, upstreamMessage || "Erro inesperado ao comunicar com o Asaas.", {
    code: "ASAAS_UPSTREAM_ERROR",
    details: { upstreamStatus: status, errors: errors.length ? errors : undefined },
  });
}

async function asaasRequest(config, endpoint, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = buildAsaasUrl(config, endpoint, options.query);
  const requestMethod = options.method || "GET";
  const requestHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": ASAAS_USER_AGENT,
    access_token: config.apiKey,
  };
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  console.info("[Psivinculo][asaas][request]", {
    baseUrl: config.baseUrl,
    endpoint: normalizedEndpoint,
    method: requestMethod,
    timeoutMs,
    headers: {
      Accept: requestHeaders.Accept,
      "Content-Type": requestHeaders["Content-Type"],
      "User-Agent": requestHeaders["User-Agent"],
      access_token: maskApiKeyForLogs(requestHeaders.access_token),
    },
  });

  try {
    const response = await fetch(url, {
      method: requestMethod,
      headers: requestHeaders,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const responseText = await response.text();
    const responsePayload = responseText ? JSON.parse(responseText) : null;

    console.info("[Psivinculo][asaas][response]", {
      baseUrl: config.baseUrl,
      endpoint: normalizedEndpoint,
      method: requestMethod,
      statusCode: response.status,
    });

    if (!response.ok) {
      console.error("[Psivinculo][asaas][response_error]", {
        baseUrl: config.baseUrl,
        endpoint: normalizedEndpoint,
        method: requestMethod,
        statusCode: response.status,
        errorResponseData: responsePayload,
        errorCode:
          responsePayload?.errors?.[0]?.code ||
          responsePayload?.code ||
          null,
        errorMessage:
          responsePayload?.errors?.[0]?.description ||
          responsePayload?.message ||
          responsePayload?.error ||
          null,
      });
      throw buildAsaasError(response.status, responsePayload);
    }

    return responsePayload;
  } catch (error) {
    console.error("[Psivinculo][asaas][request_exception]", {
      baseUrl: config.baseUrl,
      endpoint: normalizedEndpoint,
      method: requestMethod,
      statusCode: error instanceof HttpError ? error.status : null,
      errorResponseData: error?.response?.data || error?.details?.responseData || null,
      errorCode:
        error?.code ||
        error?.cause?.code ||
        null,
      errorMessage: error instanceof Error ? error.message : "Unknown Asaas error",
    });

    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new HttpError(502, "O Asaas respondeu com um payload invalido.", {
        code: "ASAAS_INVALID_JSON",
      });
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "Tempo limite excedido ao comunicar com o Asaas.", {
        code: "ASAAS_TIMEOUT",
        details: {
          baseUrl: config.baseUrl,
          endpoint: normalizedEndpoint,
          timeoutMs,
        },
      });
    }

    throw new HttpError(502, "Nao foi possivel concluir a comunicacao com o Asaas.", {
      code: "ASAAS_NETWORK_ERROR",
      details: {
        baseUrl: config.baseUrl,
        endpoint: normalizedEndpoint,
        errorCode: error?.code || error?.cause?.code || null,
        errorMessage: error instanceof Error ? error.message : "Unknown Asaas error",
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function findExactCustomer(customers, field, expectedValue, normalizer = normalizeString) {
  const normalizedExpectedValue = normalizer(expectedValue);
  if (!normalizedExpectedValue) return null;

  return (
    customers.find((customer) => normalizer(customer?.[field]) === normalizedExpectedValue) ||
    null
  );
}

async function listCustomers(config, query) {
  const response = await asaasRequest(config, "/customers", {
    query: { limit: 20, ...compactObject(query) },
  });

  return Array.isArray(response?.data) ? response.data : [];
}

async function findCustomer(config, customerInput) {
  if (customerInput.externalReference) {
    const customersByExternalReference = await listCustomers(config, {
      externalReference: customerInput.externalReference,
    });

    const exactExternalReferenceCustomer = findExactCustomer(
      customersByExternalReference,
      "externalReference",
      customerInput.externalReference,
    );

    if (exactExternalReferenceCustomer) {
      return exactExternalReferenceCustomer;
    }
  }

  const customersByDocument = await listCustomers(config, {
    cpfCnpj: customerInput.cpfCnpj,
  });

  return findExactCustomer(customersByDocument, "cpfCnpj", customerInput.cpfCnpj, normalizeDigits);
}

async function createCustomer(config, customerInput) {
  return asaasRequest(config, "/customers", {
    method: "POST",
    body: customerInput,
  });
}

async function findOrCreateCustomer(config, customerInput) {
  const existingCustomer = await findCustomer(config, customerInput);

  if (existingCustomer) {
    return { source: "existing", customer: existingCustomer };
  }

  const createdCustomer = await createCustomer(config, customerInput);
  return { source: "created", customer: createdCustomer };
}

function sortPaymentsByPriority(payments) {
  return [...payments].sort((left, right) => {
    const leftDueDate = normalizeString(left?.dueDate);
    const rightDueDate = normalizeString(right?.dueDate);

    if (leftDueDate && rightDueDate && leftDueDate !== rightDueDate) {
      return leftDueDate.localeCompare(rightDueDate);
    }

    const leftCreatedAt = normalizeString(left?.dateCreated);
    const rightCreatedAt = normalizeString(right?.dateCreated);

    return leftCreatedAt.localeCompare(rightCreatedAt);
  });
}

async function findFirstSubscriptionPayment(config, subscriptionId) {
  if (!subscriptionId) return null;

  for (const delayMs of SUBSCRIPTION_PAYMENT_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const response = await asaasRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`);
    const payments = Array.isArray(response?.data) ? response.data : [];

    if (payments.length > 0) {
      return sortPaymentsByPriority(payments)[0] || null;
    }
  }

  return null;
}

async function listSubscriptionPayments(config, subscriptionId) {
  if (!subscriptionId) return [];

  const response = await asaasRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`);
  return Array.isArray(response?.data) ? response.data : [];
}

async function tryGetPixQrCode(config, paymentId) {
  if (!paymentId) return null;

  try {
    return await asaasRequest(config, `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
  } catch (error) {
    if (error instanceof HttpError && error.code === "ASAAS_NOT_FOUND") {
      return null;
    }

    throw error;
  }
}

function extractPaymentUrl(payment) {
  return (
    normalizeString(payment?.invoiceUrl) ||
    normalizeString(payment?.bankSlipUrl) ||
    ""
  );
}

async function fetchSubscriptionById(config, subscriptionId) {
  if (!subscriptionId) return null;

  try {
    return await asaasRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  } catch (error) {
    if (error instanceof HttpError && error.code === "ASAAS_NOT_FOUND") {
      return null;
    }

    throw error;
  }
}

function resolveCreateSubscriptionOptions(options) {
  if (isRecord(options) && ("env" in options || "requestHeaders" in options)) {
    return {
      env: options.env || process.env,
      requestHeaders: options.requestHeaders || {},
    };
  }

  return {
    env: options || process.env,
    requestHeaders: {},
  };
}

function validateAsaasWebhookRequest(headers, env = process.env) {
  const config = getAsaasWebhookConfig(env);
  const headerCandidates = ["asaas-access-token", "Asaas-Access-Token"];
  const resolvedHeaderName =
    headerCandidates.find((headerName) => Boolean(getHeaderValue(headers, headerName))) || "asaas-access-token";
  const receivedToken = getHeaderValue(headers, resolvedHeaderName);

  console.info("[Psivinculo][asaas][webhook_auth_check]", {
    expectedToken: config.webhookToken ? "presente" : "ausente",
    receivedToken: receivedToken ? "presente" : "ausente",
    tokenSource: "header",
    headerName: resolvedHeaderName,
    envSource: "process.env.ASAAS_WEBHOOK_TOKEN",
  });

  if (!receivedToken) {
    throw new HttpError(401, "Webhook do Asaas recebido sem token de autenticacao.", {
      code: "ASAAS_WEBHOOK_UNAUTHORIZED",
    });
  }

  if (receivedToken !== config.webhookToken) {
    console.warn("[Psivinculo][asaas][webhook_auth_mismatch]", {
      expectedToken: config.webhookToken ? "presente" : "ausente",
      receivedToken: receivedToken ? "presente" : "ausente",
      tokenSource: "header",
      headerName: resolvedHeaderName,
      envSource: "process.env.ASAAS_WEBHOOK_TOKEN",
    });
    throw new HttpError(401, "Webhook do Asaas com token invalido.", {
      code: "ASAAS_WEBHOOK_UNAUTHORIZED",
    });
  }
}

function extractWebhookSubscriptionSummary(payload, subscriptionDetails) {
  const payment = isRecord(payload?.payment) ? payload.payment : null;
  const subscription = isRecord(payload?.subscription) ? payload.subscription : null;

  return {
    asaasCustomerId:
      normalizeString(payment?.customer) ||
      normalizeString(subscriptionDetails?.customer) ||
      normalizeString(subscription?.customer) ||
      null,
    asaasSubscriptionId:
      normalizeString(payment?.subscription) ||
      normalizeString(subscriptionDetails?.id) ||
      normalizeString(subscription?.id) ||
      null,
    asaasPaymentId: normalizeString(payment?.id) || null,
    paymentStatus: normalizeString(payment?.status) || null,
    subscriptionStatus:
      normalizeString(subscriptionDetails?.status) ||
      normalizeString(subscription?.status) ||
      null,
    paymentMethod:
      normalizeString(payment?.billingType) ||
      normalizeString(subscriptionDetails?.billingType) ||
      normalizeString(subscription?.billingType) ||
      null,
    nextDueDate:
      normalizeString(subscriptionDetails?.nextDueDate) ||
      normalizeString(subscription?.nextDueDate) ||
      normalizeString(payment?.dueDate) ||
      null,
  };
}

export async function createSubscriptionOnAsaas(payload, options = {}) {
  if (!isRecord(payload)) {
    throw new HttpError(400, "O corpo da requisicao deve ser um objeto JSON valido.", {
      code: "INVALID_REQUEST_BODY",
    });
  }

  const { env, requestHeaders } = resolveCreateSubscriptionOptions(options);
  const config = getAsaasConfig(env);
  getSupabaseServerConfig(env);
  const subscriptionInput = buildSubscriptionInput(payload);
  const client = getServerSupabaseClient(env);
  const ownerContext = await resolveBillingOwnerContext(
    {
      requestHeaders,
      customer: subscriptionInput.customer,
      planSlug: subscriptionInput.plan.slug,
    },
    env,
  );
  logAsaasEvent("create_subscription_requested", {
    planSlug: subscriptionInput.plan.slug,
    billingType: subscriptionInput.plan.billingType,
    customerEmail: maskEmailForLogs(subscriptionInput.customer.email),
    customerDocument: maskDocumentForLogs(subscriptionInput.customer.cpfCnpj),
  });
  const reusableSubscription = await resolveExistingSubscriptionForCreate({
    client,
    config,
    env,
    requestHeaders,
    ownerContext,
    subscriptionInput,
  });

  if (reusableSubscription) {
    return reusableSubscription;
  }

  const customerResult = await findOrCreateCustomer(config, subscriptionInput.customer);
  if (!normalizeString(customerResult.customer?.id)) {
    throw new HttpError(502, "Nao foi possivel obter o identificador do cliente no Asaas.", {
      code: "ASAAS_CUSTOMER_ID_MISSING",
    });
  }
  logAsaasEvent("customer_resolved", {
    planSlug: subscriptionInput.plan.slug,
    customerSource: customerResult.source,
    asaasCustomerId: customerResult.customer.id,
  });
  const subscriptionPayload = compactObject({
    customer: customerResult.customer?.id,
    billingType: subscriptionInput.plan.billingType,
    value: subscriptionInput.plan.value,
    nextDueDate: subscriptionInput.nextDueDate,
    cycle: "MONTHLY",
    description: subscriptionInput.plan.description,
    externalReference: buildSubscriptionExternalReference(subscriptionInput.plan, subscriptionInput.customer),
    callback: subscriptionInput.plan.callback,
    endDate: subscriptionInput.plan.endDate,
    maxPayments: subscriptionInput.plan.maxPayments,
    discount: subscriptionInput.plan.discount,
    fine: subscriptionInput.plan.fine,
    interest: subscriptionInput.plan.interest,
  });
  const subscription = await asaasRequest(config, "/subscriptions", {
    method: "POST",
    body: subscriptionPayload,
  });
  if (!normalizeString(subscription?.id)) {
    throw new HttpError(502, "O Asaas nao retornou o identificador da assinatura.", {
      code: "ASAAS_SUBSCRIPTION_ID_MISSING",
    });
  }
  const firstPayment = await findFirstSubscriptionPayment(config, normalizeString(subscription?.id));
  const pixQrCode =
    subscriptionInput.plan.billingType === "PIX" && normalizeString(firstPayment?.id)
      ? await tryGetPixQrCode(config, firstPayment.id)
      : null;
  const paymentUrl = extractPaymentUrl(firstPayment) || null;
  const persistenceDraft = {
    asaas_customer_id: customerResult.customer.id || null,
    asaas_subscription_id: subscription.id || null,
    plano_slug: subscriptionInput.plan.slug,
    status_assinatura:
      normalizeString(subscription?.status) ||
      normalizeString(firstPayment?.status) ||
      "PENDING",
  };
  logAsaasEvent("subscription_created", {
    planSlug: subscriptionInput.plan.slug,
    asaasSubscriptionId: subscription.id,
    firstPaymentId: normalizeString(firstPayment?.id) || null,
    hasPaymentUrl: Boolean(paymentUrl),
    hasPixQrCode: Boolean(pixQrCode),
    nextDueDate: subscriptionInput.nextDueDate,
  });
  let persistedRecord = null;

  try {
    persistedRecord = await persistAsaasSubscriptionState(
      {
        requestHeaders,
        customer: subscriptionInput.customer,
        plan: subscriptionInput.plan,
        asaasCustomerId: customerResult.customer.id || null,
        asaasSubscriptionId: subscription.id || null,
        asaasPaymentId: normalizeString(firstPayment?.id) || null,
        paymentStatus: normalizeString(firstPayment?.status) || null,
        subscriptionStatus: normalizeString(subscription?.status) || null,
        paymentMethod:
          normalizeString(firstPayment?.billingType) ||
          subscriptionInput.plan.billingType ||
          null,
        nextDueDate:
          normalizeString(subscription?.nextDueDate) ||
          subscriptionInput.nextDueDate,
        asaasPayload: {
          customer: customerResult.customer,
          subscription,
          firstPayment,
        },
        metadata: {
          planName: subscriptionInput.plan.name,
          paymentUrl,
        },
      },
      env,
    );
  } catch (error) {
    console.error("[Psivinculo][asaas][subscription_local_persistence_failed]", {
      asaasSubscriptionId: subscription.id,
      asaasCustomerId: customerResult.customer.id || null,
      message: error instanceof Error ? error.message : "Unknown persistence error",
    });
    throw new HttpError(
      500,
      "A assinatura foi criada no Asaas, mas nao foi possivel salva-la no banco local. Verifique o servidor antes de tentar novamente.",
      {
        code: "LOCAL_SUBSCRIPTION_PERSISTENCE_FAILED",
        details: {
          asaasSubscriptionId: subscription.id || null,
        },
      },
    );
  }

  return {
    customerSource: customerResult.source,
    nextDueDate: subscriptionInput.nextDueDate,
    plan: {
      id: subscriptionInput.plan.id,
      slug: subscriptionInput.plan.slug,
      routeKey: subscriptionInput.plan.routeKey,
      name: subscriptionInput.plan.name,
      value: subscriptionInput.plan.value,
      billingType: subscriptionInput.plan.billingType,
      cycle: "MONTHLY",
      description: subscriptionInput.plan.description,
    },
    customer: customerResult.customer,
    subscription,
    firstPayment,
    paymentUrl,
    pixQrCode,
    persistenceDraft: {
      asaas_customer_id:
        normalizeString(persistedRecord?.asaas_customer_id) ||
        persistenceDraft.asaas_customer_id,
      asaas_subscription_id:
        normalizeString(persistedRecord?.asaas_subscription_id) ||
        persistenceDraft.asaas_subscription_id,
      plano_slug:
        normalizeString(persistedRecord?.plano_slug) ||
        persistenceDraft.plano_slug,
      status_assinatura:
        normalizeString(persistedRecord?.status_assinatura) ||
        persistenceDraft.status_assinatura,
    },
  };
}

export async function changeSubscriptionPlanOnAsaas(payload, options = {}) {
  if (!isRecord(payload)) {
    throw new HttpError(400, "O corpo da requisicao deve ser um objeto JSON valido.", {
      code: "INVALID_REQUEST_BODY",
    });
  }

  const { env, requestHeaders } = resolveCreateSubscriptionOptions(options);
  const config = getAsaasConfig(env);
  const actorContext = await resolveActorBillingContext({ env, requestHeaders });
  const plan = buildPlanInput(payload);
  const targetOwner = await resolveBillingOwnerContext(
    {
      requestHeaders,
      planSlug: plan.slug,
    },
    env,
  );
  const targetOwnerType = normalizeString(targetOwner?.ownerType || targetOwner?.owner_type);

  if (!targetOwnerType) {
    throw new HttpError(400, "Nao foi possivel identificar o titular correto para o plano selecionado.", {
      code: "SUBSCRIPTION_OWNER_RESOLUTION_ERROR",
      details: {
        planSlug: plan.slug,
      },
    });
  }

  const customer = buildOwnerCustomerInput(actorContext, targetOwner);
  const currentRecord = actorContext.currentSubscription;
  const explicitBillingType = normalizeString(payload.billingType)
    ? normalizeBillingType(payload.billingType)
    : null;
  const currentBillingType = resolveBillingTypeFromSources(
    currentRecord,
    actorContext.currentFinancialSnapshot,
    actorContext.adminRow,
    actorContext.clinicRow,
  );
  const updateBillingType = explicitBillingType || currentBillingType;
  const createBillingType =
    explicitBillingType || (currentBillingType === "CREDIT_CARD" ? "UNDEFINED" : currentBillingType);
  const currentSubscriptionId = normalizeString(currentRecord?.asaas_subscription_id);
  const currentSubscriptionStatus = normalizeStatusToken(
    currentRecord?.status_assinatura || actorContext.currentFinancialSnapshot?.status,
  );
  const currentAsaasSubscription =
    currentSubscriptionId && !isTerminalSubscriptionStatus(currentSubscriptionStatus)
      ? await fetchSubscriptionById(config, currentSubscriptionId)
      : null;
  const sameOwner =
    currentRecord &&
    normalizeString(currentRecord.owner_type) === targetOwnerType &&
    normalizeString(currentRecord.auth_user_id) ===
      normalizeString(targetOwner.authUserId || targetOwner.auth_user_id) &&
    normalizeString(currentRecord.clinica_id) ===
      normalizeString(targetOwner.clinicaId || targetOwner.clinica_id);

  if (currentSubscriptionId && sameOwner && currentAsaasSubscription) {
    const nextDueDate = resolvePlanChangeDueDate(payload, actorContext.currentFinancialSnapshot || currentRecord);
    const updatedSubscription = await updateAsaasSubscription(config, currentSubscriptionId, {
      billingType: updateBillingType,
      value: plan.value,
      nextDueDate,
      cycle: "MONTHLY",
      description: plan.description,
      updatePendingPayments: true,
    });
    const firstPayment = await findFirstSubscriptionPayment(config, currentSubscriptionId);
    const pixQrCode =
      updateBillingType === "PIX" && normalizeString(firstPayment?.id)
        ? await tryGetPixQrCode(config, firstPayment.id)
        : null;
    const paymentUrl = extractPaymentUrl(firstPayment) || null;
    const persistedRecord = await persistAsaasSubscriptionState(
      {
        requestHeaders,
        customer,
        plan,
        asaasCustomerId:
          normalizeString(currentRecord?.asaas_customer_id) ||
          normalizeString(actorContext.currentFinancialSnapshot?.customerId) ||
          null,
        asaasSubscriptionId: currentSubscriptionId,
        asaasPaymentId: normalizeString(firstPayment?.id) || null,
        paymentStatus: normalizeString(firstPayment?.status) || null,
        subscriptionStatus: normalizeString(updatedSubscription?.status) || normalizeString(currentRecord?.status_assinatura),
        paymentMethod:
          normalizeString(firstPayment?.billingType) ||
          normalizeString(updatedSubscription?.billingType) ||
          updateBillingType,
        nextDueDate: normalizeString(updatedSubscription?.nextDueDate) || nextDueDate,
        preserveActiveState: true,
        asaasPayload: {
          customerId: normalizeString(currentRecord?.asaas_customer_id) || null,
          subscription: updatedSubscription,
          firstPayment,
        },
        metadata: {
          planName: plan.name,
          paymentUrl,
          changeMode: "updated_existing_subscription",
          changedAt: new Date().toISOString(),
        },
      },
      env,
    );

    return buildPlanChangeResponse({
      action: "updated_existing_subscription",
      customerSource: "existing",
      nextDueDate: normalizeString(updatedSubscription?.nextDueDate) || nextDueDate,
      plan,
      billingType: updateBillingType,
      subscription: updatedSubscription,
      firstPayment,
      paymentUrl,
      pixQrCode,
      persistedRecord,
      fallbackPersistenceDraft: {
        asaas_customer_id:
          normalizeString(currentRecord?.asaas_customer_id) ||
          normalizeString(actorContext.currentFinancialSnapshot?.customerId) ||
          null,
        asaas_subscription_id: currentSubscriptionId,
        plano_slug: plan.slug,
        status_assinatura:
          normalizeString(updatedSubscription?.status) ||
          normalizeString(firstPayment?.status) ||
          normalizeString(currentRecord?.status_assinatura) ||
          "ACTIVE",
      },
      previousSubscription: {
        asaasSubscriptionId: currentSubscriptionId,
        ownerType: targetOwnerType,
        action: "updated_in_place",
      },
    });
  }

  const createdResult = await createSubscriptionOnAsaas(
    {
      planKey: plan.slug,
      billingType: createBillingType,
      nextDueDate: resolvePlanChangeDueDate(payload, actorContext.currentFinancialSnapshot || currentRecord),
      customer,
      name: customer.name,
      email: customer.email,
      cpfCnpj: customer.cpfCnpj,
      phone: customer.phone,
    },
    {
      env,
      requestHeaders,
    },
  );
  let warning = null;
  let previousSubscription = currentSubscriptionId
    ? {
        asaasSubscriptionId: currentSubscriptionId,
        ownerType: normalizeString(currentRecord?.owner_type) || null,
        action: "cancel_previous_subscription",
        cancelled: false,
      }
    : null;

  if (
    currentSubscriptionId &&
    currentSubscriptionId !== normalizeString(createdResult.persistenceDraft?.asaas_subscription_id)
  ) {
    try {
      await deleteAsaasSubscription(config, currentSubscriptionId);
      await markSubscriptionAsReplaced(
        currentRecord,
        {
          asaasSubscriptionId: createdResult.persistenceDraft?.asaas_subscription_id,
          planSlug: createdResult.persistenceDraft?.plano_slug || plan.slug,
        },
        env,
      );

      previousSubscription = {
        ...previousSubscription,
        cancelled: true,
      };
    } catch (error) {
      warning =
        error instanceof Error
          ? `A nova assinatura foi criada, mas o cancelamento da anterior exigiu revisao manual: ${error.message}`
          : "A nova assinatura foi criada, mas o cancelamento da anterior exigiu revisao manual.";
      previousSubscription = {
        ...previousSubscription,
        cancelled: false,
      };
    }
  }

  return buildPlanChangeResponse({
    action: "created_new_subscription",
    customerSource: createdResult.customerSource,
    nextDueDate: createdResult.nextDueDate,
    plan,
    billingType: createBillingType,
    customer: createdResult.customer,
    subscription: createdResult.subscription,
    firstPayment: createdResult.firstPayment,
    paymentUrl: createdResult.paymentUrl,
    pixQrCode: createdResult.pixQrCode,
    persistedRecord: createdResult.persistenceDraft,
    fallbackPersistenceDraft: createdResult.persistenceDraft,
    previousSubscription,
    warning,
  });
}

export async function createSubscriptionPaymentLink(payload = {}, options = {}) {
  if (!isRecord(payload)) {
    throw new HttpError(400, "O corpo da requisicao deve ser um objeto JSON valido.", {
      code: "INVALID_REQUEST_BODY",
    });
  }

  const { env, requestHeaders } = resolveCreateSubscriptionOptions(options);
  const config = getAsaasConfig(env);
  const actorContext = await resolveActorBillingContext({ env, requestHeaders });
  const currentRecord = actorContext.currentSubscription;
  const currentSubscriptionStatus = normalizeStatusToken(
    currentRecord?.status_assinatura || actorContext.currentFinancialSnapshot?.status,
  );
  const subscriptionId =
    normalizeString(payload.asaasSubscriptionId) ||
    normalizeString(currentRecord?.asaas_subscription_id) ||
    normalizeString(actorContext.currentFinancialSnapshot?.subscriptionId);

  if (!subscriptionId) {
    throw new HttpError(404, "Nenhuma assinatura ativa ou pendente foi encontrada para gerar o link de pagamento.", {
      code: "SUBSCRIPTION_NOT_FOUND",
    });
  }

  if (isTerminalSubscriptionStatus(currentSubscriptionStatus)) {
    throw new HttpError(409, "A assinatura atual ja foi cancelada e nao possui mais link de pagamento.", {
      code: "SUBSCRIPTION_ALREADY_CANCELLED",
      details: {
        subscriptionId,
        status: currentSubscriptionStatus || null,
      },
    });
  }

  const subscription = await fetchSubscriptionById(config, subscriptionId);
  const payment = await findFirstSubscriptionPayment(config, subscriptionId);
  const paymentUrl = extractPaymentUrl(payment) || null;
  const billingType = resolveBillingTypeFromSources(
    normalizeString(subscription?.billingType),
    payment,
    currentRecord,
    actorContext.currentFinancialSnapshot,
  );

  if (!paymentUrl) {
    throw new HttpError(
      billingType === "CREDIT_CARD" ? 409 : 404,
      billingType === "CREDIT_CARD"
        ? "A assinatura atual usa cartao e o Asaas exige um fluxo proprio de atualizacao do cartao, que nao existe nesta tela."
        : "Nao existe uma cobranca aberta com link disponivel para esta assinatura agora.",
      {
        code: billingType === "CREDIT_CARD" ? "PAYMENT_METHOD_UPDATE_NOT_AVAILABLE" : "PAYMENT_LINK_NOT_FOUND",
        details: {
          subscriptionId,
          billingType,
        },
      },
    );
  }

  return {
    subscriptionId,
    billingType,
    paymentUrl,
    payment,
    subscription,
  };
}

export async function cancelSubscriptionPlanOnAsaas(payload = {}, options = {}) {
  if (!isRecord(payload)) {
    throw new HttpError(400, "O corpo da requisicao deve ser um objeto JSON valido.", {
      code: "INVALID_REQUEST_BODY",
    });
  }

  const { env, requestHeaders } = resolveCreateSubscriptionOptions(options);
  const config = getAsaasConfig(env);
  const actorContext = await resolveActorBillingContext({ env, requestHeaders });
  const currentRecord = actorContext.currentSubscription;
  const subscriptionId =
    normalizeString(payload.asaasSubscriptionId) ||
    normalizeString(currentRecord?.asaas_subscription_id) ||
    normalizeString(actorContext.currentFinancialSnapshot?.subscriptionId);

  if (!subscriptionId) {
    throw new HttpError(404, "Nenhuma assinatura ativa foi encontrada para cancelar.", {
      code: "SUBSCRIPTION_NOT_FOUND",
    });
  }

  const currentStatus = normalizeStatusToken(
    currentRecord?.status_assinatura || actorContext.currentFinancialSnapshot?.status,
  );

  if (isTerminalSubscriptionStatus(currentStatus)) {
    throw new HttpError(409, "A assinatura atual ja esta cancelada.", {
      code: "SUBSCRIPTION_ALREADY_CANCELLED",
      details: {
        subscriptionId,
        status: currentStatus || null,
      },
    });
  }

  const subscription = await fetchSubscriptionById(config, subscriptionId);
  if (!subscription) {
    throw new HttpError(404, "Nao foi possivel localizar a assinatura atual no Asaas.", {
      code: "ASAAS_SUBSCRIPTION_NOT_FOUND",
      details: {
        subscriptionId,
      },
    });
  }

  const currentPlanSlug = normalizePlanSlug(
    currentRecord?.plano_slug || actorContext.currentFinancialSnapshot?.planSlug,
  );
  if (!currentPlanSlug) {
    throw new HttpError(500, "Nao foi possivel identificar o plano atual para concluir o cancelamento.", {
      code: "SUBSCRIPTION_PLAN_RESOLUTION_ERROR",
      details: {
        subscriptionId,
      },
    });
  }

  const currentPlanDefinition = resolveSubscriptionPlan(currentPlanSlug);
  const accessUntil =
    actorContext.currentFinancialSnapshot?.active === true || currentRecord?.assinatura_ativa === true
      ? parseStoredDate(
          actorContext.currentFinancialSnapshot?.dueDate ||
            currentRecord?.proximo_vencimento ||
            subscription?.nextDueDate,
        )
      : null;
  const cancellationMode = accessUntil ? "end_of_cycle" : "immediate";
  const payments = await listSubscriptionPayments(config, subscriptionId);

  await deleteAsaasSubscription(config, subscriptionId);

  const deletedPendingPayments = [];
  const paymentCleanupFailures = [];

  for (const payment of payments) {
    const paymentId = normalizeString(payment?.id);
    const paymentStatus = normalizeStatusToken(payment?.status);
    const dueDate = parseStoredDate(payment?.dueDate);

    if (!paymentId || APPROVED_PAYMENT_STATUSES.has(paymentStatus)) {
      continue;
    }

    try {
      await deleteAsaasPayment(config, paymentId);
      deletedPendingPayments.push({
        id: paymentId,
        status: paymentStatus || null,
        dueDate,
      });
    } catch (error) {
      if (error instanceof HttpError && error.code === "ASAAS_NOT_FOUND") {
        deletedPendingPayments.push({
          id: paymentId,
          status: paymentStatus || null,
          dueDate,
        });
        continue;
      }

      paymentCleanupFailures.push({
        id: paymentId,
        status: paymentStatus || null,
        dueDate,
        message: error instanceof Error ? error.message : "Falha ao remover cobranca pendente.",
      });
    }
  }

  const persistedRecord = await persistAsaasSubscriptionState(
    {
      requestHeaders,
      plan: {
        slug: currentPlanSlug,
        name:
          currentPlanDefinition?.name ||
          normalizeString(currentRecord?.plan_name) ||
          normalizeString(subscription?.description) ||
          null,
        value:
          currentPlanDefinition?.value ??
          parseMoney(currentRecord?.valor_plano) ??
          actorContext.currentFinancialSnapshot?.monthlyPrice ??
          0,
      },
      asaasCustomerId:
        normalizeString(currentRecord?.asaas_customer_id) ||
        normalizeString(actorContext.currentFinancialSnapshot?.customerId) ||
        normalizeString(subscription?.customer) ||
        null,
      asaasSubscriptionId: subscriptionId,
      subscriptionStatus: "CANCELLED",
      paymentMethod:
        normalizeString(subscription?.billingType) ||
        resolveBillingTypeFromSources(
          currentRecord,
          actorContext.currentFinancialSnapshot,
          actorContext.adminRow,
          actorContext.clinicRow,
        ),
      nextDueDate: accessUntil,
      eventType: "SUBSCRIPTION_DELETED",
      fallbackStatus: "CANCELLED",
      asaasPayload: {
        subscription,
        payments,
      },
      metadata: {
        planName:
          currentPlanDefinition?.name ||
          normalizeString(currentRecord?.plan_name) ||
          normalizeString(subscription?.description) ||
          null,
        cancellationRequestedAt: new Date().toISOString(),
        cancellationMode,
        accessUntil,
        deletedPendingPaymentIds: deletedPendingPayments.map((payment) => payment.id),
        paymentCleanupFailures,
      },
    },
    env,
  );

  return {
    action: "cancelled_subscription",
    cancellationMode,
    accessUntil,
    subscriptionId,
    deletedPendingPayments,
    persistedRecord: {
      asaas_subscription_id: normalizeString(persistedRecord?.asaas_subscription_id) || subscriptionId,
      plano_slug: normalizeString(persistedRecord?.plano_slug) || currentPlanSlug,
      status_assinatura: normalizeString(persistedRecord?.status_assinatura) || "CANCELLED",
      assinatura_ativa: persistedRecord?.assinatura_ativa === true,
      proximo_vencimento: parseStoredDate(persistedRecord?.proximo_vencimento) || accessUntil,
    },
    warning:
      paymentCleanupFailures.length > 0
        ? "A recorrencia foi cancelada, mas algumas cobrancas pendentes nao puderam ser removidas automaticamente."
        : null,
  };
}

export async function handleAsaasWebhook(payload, options = {}) {
  if (!isRecord(payload)) {
    throw new HttpError(400, "O webhook do Asaas precisa enviar um objeto JSON valido.", {
      code: "INVALID_WEBHOOK_PAYLOAD",
    });
  }

  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
  validateAsaasWebhookRequest(requestHeaders, env);

  const eventId = normalizeString(payload.id);
  const eventType = normalizeString(payload.event).toUpperCase();

  if (!eventId || !eventType) {
    throw new HttpError(400, "Webhook do Asaas sem id ou tipo de evento.", {
      code: "INVALID_WEBHOOK_PAYLOAD",
    });
  }

  const payment = isRecord(payload.payment) ? payload.payment : null;
  const subscriptionPayload = isRecord(payload.subscription) ? payload.subscription : null;
  const registration = await registerAsaasWebhookEvent(
    {
      eventId,
      eventType,
      asaasSubscriptionId:
        normalizeString(payment?.subscription) || normalizeString(subscriptionPayload?.id) || null,
      asaasPaymentId: normalizeString(payment?.id) || null,
      payload,
    },
    env,
  );

  if (registration.duplicate) {
    logAsaasEvent("webhook_duplicate_ignored", {
      eventId,
      eventType,
    });

    return {
      received: true,
      duplicate: true,
      eventId,
      eventType,
    };
  }

  try {
    const config = getAsaasConfig(env);
    const asaasSubscriptionId =
      normalizeString(payment?.subscription) || normalizeString(subscriptionPayload?.id) || "";
    const subscriptionDetails = asaasSubscriptionId
      ? await fetchSubscriptionById(config, asaasSubscriptionId)
      : null;

    if (!asaasSubscriptionId) {
      await finalizeAsaasWebhookEvent(
        {
          eventId,
          status: "processed",
        },
        env,
      );

      logAsaasEvent("webhook_event_ignored_without_subscription", {
        eventId,
        eventType,
        paymentId: normalizeString(payment?.id) || null,
      });

      return {
        received: true,
        duplicate: false,
        ignored: true,
        eventId,
        eventType,
      };
    }

    const webhookSummary = extractWebhookSubscriptionSummary(payload, subscriptionDetails);

    await persistAsaasSubscriptionState(
      {
        asaasCustomerId: webhookSummary.asaasCustomerId,
        asaasSubscriptionId: webhookSummary.asaasSubscriptionId,
        asaasPaymentId: webhookSummary.asaasPaymentId,
        paymentStatus: webhookSummary.paymentStatus,
        subscriptionStatus: webhookSummary.subscriptionStatus,
        paymentMethod: webhookSummary.paymentMethod,
        nextDueDate: webhookSummary.nextDueDate,
        eventId,
        eventType,
        asaasPayload: {
          event: payload,
          payment,
          subscription: subscriptionDetails || subscriptionPayload || null,
        },
        metadata: {
          planName:
            normalizeString(subscriptionDetails?.description) ||
            normalizeString(subscriptionPayload?.description) ||
            null,
        },
      },
      env,
    );

    await propagateWebhookSubscriptionToUserOwner(
      {
        asaasSubscriptionId: webhookSummary.asaasSubscriptionId,
        eventType,
        paymentStatus: webhookSummary.paymentStatus,
        subscriptionStatus: webhookSummary.subscriptionStatus,
        paymentMethod: webhookSummary.paymentMethod,
        nextDueDate: webhookSummary.nextDueDate,
      },
      env,
    );

    await finalizeAsaasWebhookEvent(
      {
        eventId,
        status: "processed",
      },
      env,
    );

    logAsaasEvent("webhook_processed", {
      eventId,
      eventType,
      asaasSubscriptionId: webhookSummary.asaasSubscriptionId,
      asaasPaymentId: webhookSummary.asaasPaymentId,
      paymentStatus: webhookSummary.paymentStatus,
      subscriptionStatus: webhookSummary.subscriptionStatus,
    });

    return {
      received: true,
      duplicate: false,
      eventId,
      eventType,
      asaasSubscriptionId: webhookSummary.asaasSubscriptionId,
    };
  } catch (error) {
    await finalizeAsaasWebhookEvent(
      {
        eventId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown webhook processing error",
      },
      env,
    );

    throw error;
  }
}
