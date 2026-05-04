import {
  findProductPlanByIdOrName,
  mapProductPlanRow,
  normalizePlanToken,
  type ProductPlanDefinition,
} from "@/config/productPlans";
import {
  hasSubscriptionGraceAccess,
  normalizeSubscriptionStatus,
  parseSubscriptionDate,
  resolveSubscriptionAccessFromSource,
} from "@/lib/subscriptionAccess";
import { supabase } from "@/lib/supabase";
import { buildServerApiUrl } from "@/services/serverApi";
import { getCurrentAdminContext } from "@/services/currentAdmin";

type UserRow = {
  id: string;
  tipo_usuario: string | null;
  ativo: boolean | null;
};

type PlanRow = Record<string, unknown>;
type BillingRow = Record<string, unknown>;
type BillingSourceTable = "usuarios" | "clinicas";

type CurrentPlanSourceSnapshot = {
  sourceTable: BillingSourceTable;
  ownerType: "user" | "clinic";
  rawSlug: string | null;
  planId: string | null;
  planName: string | null;
  matchedPlan: ProductPlanDefinition | null;
  monthlyPrice: number | null;
  professionalLimit: number | null;
  dueDateIso: string | null;
  dueDate: string | null;
  paymentMethod: string | null;
  summary: string | null;
  status: string | null;
  subscriptionActive: boolean;
  graceAccess: boolean;
  subscriptionId: string | null;
  hasData: boolean;
};

export type CurrentPlanInfo = {
  id: string | null;
  rawSlug: string | null;
  name: string | null;
  monthlyPrice: number | null;
  professionalLimit: number | null;
  dueDate: string | null;
  dueDateIso: string | null;
  paymentMethod: string | null;
  summary: string | null;
  matchedPlan: ProductPlanDefinition | null;
  status: string | null;
  subscriptionActive: boolean;
  graceAccess: boolean;
  subscriptionId: string | null;
  sourceTable: BillingSourceTable | null;
  ownerType: "user" | "clinic" | null;
};

export type AdminPlanChangeResponse = {
  success: true;
  action: "updated_existing_subscription" | "created_new_subscription";
  nextDueDate: string | null;
  plan: {
    id: string | null;
    slug: string;
    routeKey: string;
    name: string | null;
    value: number;
    billingType: string;
    cycle: string;
    description: string;
  };
  customer: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  firstPayment: Record<string, unknown> | null;
  paymentUrl: string | null;
  pixQrCode: Record<string, unknown> | null;
  persistenceDraft: {
    asaas_customer_id: string | null;
    asaas_subscription_id: string | null;
    plano_slug: string;
    status_assinatura: string | null;
  };
  previousSubscription: Record<string, unknown> | null;
  warning: string | null;
};

export type AdminPaymentLinkResponse = {
  success: true;
  subscriptionId: string;
  billingType: string;
  paymentUrl: string;
  payment: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
};

export type AdminPlanCancellationResponse = {
  success: true;
  action: "cancelled_subscription";
  cancellationMode: "end_of_cycle" | "immediate";
  accessUntil: string | null;
  subscriptionId: string;
  deletedPendingPayments: Array<{
    id: string;
    status: string | null;
    dueDate: string | null;
  }>;
  persistedRecord: {
    asaas_subscription_id: string | null;
    plano_slug: string | null;
    status_assinatura: string | null;
    assinatura_ativa: boolean;
    proximo_vencimento: string | null;
  };
  warning: string | null;
};

export type AdminPlansData = {
  adminName: string;
  clinicName: string;
  currentPlan: CurrentPlanInfo;
  currentPlanError: string | null;
  activePsychologistsCount: number;
  activePsychologistsLabel: string;
  availablePlans: ProductPlanDefinition[];
  hasClinicScope: boolean;
};

type ApiErrorPayload = {
  success?: false;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export const adminPlansQueryKey = ["admin-plans"];

const EMPTY_CURRENT_PLAN: CurrentPlanInfo = {
  id: null,
  rawSlug: null,
  name: null,
  monthlyPrice: null,
  professionalLimit: null,
  dueDate: null,
  dueDateIso: null,
  paymentMethod: null,
  summary: null,
  matchedPlan: null,
  status: null,
  subscriptionActive: false,
  graceAccess: false,
  subscriptionId: null,
  sourceTable: null,
  ownerType: null,
};

function pickString(source: Record<string, unknown> | null | undefined, keys: readonly string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function pickNumber(source: Record<string, unknown> | null | undefined, keys: readonly string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().replace(",", ".");
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function pickBoolean(source: Record<string, unknown> | null | undefined, keys: readonly string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
  }

  return null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("pt-BR");
}

function normalizeRole(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizePlanSlug(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function isClinicPlanSlug(value: string | null | undefined) {
  return normalizePlanSlug(value).startsWith("clinica_");
}

function isTerminalSubscriptionStatus(value: string | null | undefined) {
  return ["CANCELLED", "INACTIVE", "DELETED", "EXPIRED"].includes(normalizeSubscriptionStatus(value));
}

function isPsychologistUser(user: UserRow) {
  return ["psicologo", "psicologa", "psychologist", "therapist", "psi"].includes(
    normalizeRole(user.tipo_usuario),
  );
}

function buildPaymentMethodLabel(source: Record<string, unknown> | null | undefined) {
  const label =
    pickString(source, ["forma_pagamento", "payment_method", "payment_method_label", "billing_method"]) || "";
  const last4 = pickString(source, ["card_last4", "last4"]);

  if (!label) return null;
  if (!last4) return label;
  return `${label} ****${last4}`;
}

function buildPlanSourceSnapshot(
  row: BillingRow | null,
  sourceTable: BillingSourceTable,
  availablePlans: ProductPlanDefinition[],
): CurrentPlanSourceSnapshot | null {
  if (!row) return null;

  const rawPlanValue = pickString(row, [
    "plano_slug",
    "plan_slug",
    "plan_id",
    "current_plan_id",
    "subscription_plan_id",
    "plano_nome",
    "plan_name",
    "subscription_plan_name",
  ]);
  const matchedPlan = findProductPlanByIdOrName(availablePlans, rawPlanValue);
  const monthlyPrice =
    pickNumber(row, ["valor_mensal", "valor_plano", "plan_price", "subscription_amount"]) ??
    matchedPlan?.monthlyPrice ??
    null;
  const professionalLimit =
    pickNumber(row, [
      "limite_profissionais",
      "professional_limit",
      "professionals_limit",
      "team_limit",
      "max_professionals",
      "limite_psicologos",
    ]) ??
    matchedPlan?.professionalLimit ??
    null;
  const dueDateIso = parseSubscriptionDate(
    pickString(row, ["proximo_vencimento", "payment_due_date", "billing_due_date"]),
  );
  const status = normalizeSubscriptionStatus(
    pickString(row, ["status_assinatura", "subscription_status", "plan_status"]),
  );
  const subscriptionActive = resolveSubscriptionAccessFromSource(row) === true;
  const graceAccess = hasSubscriptionGraceAccess(status, dueDateIso);
  const summary =
    pickString(row, ["plan_summary", "plano_resumo", "subscription_summary", "plan_description"]) ||
    matchedPlan?.summary ||
    matchedPlan?.description ||
    null;
  const paymentMethod = buildPaymentMethodLabel(row);
  const rawSlug = normalizePlanSlug(rawPlanValue || matchedPlan?.slug || matchedPlan?.name || "");
  const planId = matchedPlan?.id || (rawPlanValue || null);
  const hasData = Boolean(rawSlug || monthlyPrice != null || dueDateIso || paymentMethod || status || pickString(row, ["asaas_subscription_id"]));

  if (!hasData) return null;

  return {
    sourceTable,
    ownerType: sourceTable === "clinicas" ? "clinic" : "user",
    rawSlug: rawSlug || null,
    planId,
    planName: matchedPlan?.name || rawPlanValue || null,
    matchedPlan,
    monthlyPrice,
    professionalLimit,
    dueDateIso,
    dueDate: formatDate(dueDateIso),
    paymentMethod,
    summary,
    status: status || null,
    subscriptionActive,
    graceAccess,
    subscriptionId: pickString(row, ["asaas_subscription_id"]) || null,
    hasData,
  };
}

function getSnapshotSourcePreference(snapshot: CurrentPlanSourceSnapshot) {
  const clinicPlan = isClinicPlanSlug(snapshot.rawSlug || snapshot.matchedPlan?.slug || snapshot.matchedPlan?.name);
  if (clinicPlan) {
    return snapshot.sourceTable === "clinicas" ? 2 : 1;
  }

  return snapshot.sourceTable === "usuarios" ? 2 : 1;
}

function getSnapshotStatePreference(snapshot: CurrentPlanSourceSnapshot) {
  if (snapshot.subscriptionActive) return 3;
  if (snapshot.status && !isTerminalSubscriptionStatus(snapshot.status)) return 2;
  return snapshot.hasData ? 1 : 0;
}

function resolveCurrentPlanFromRows(
  rows: Array<{ row: BillingRow | null; sourceTable: BillingSourceTable }>,
  availablePlans: ProductPlanDefinition[],
) {
  const snapshots = rows
    .map(({ row, sourceTable }) => buildPlanSourceSnapshot(row, sourceTable, availablePlans))
    .filter((snapshot): snapshot is CurrentPlanSourceSnapshot => snapshot != null)
    .sort((left, right) => {
      const stateDiff = getSnapshotStatePreference(right) - getSnapshotStatePreference(left);
      if (stateDiff !== 0) return stateDiff;

      const sourceDiff = getSnapshotSourcePreference(right) - getSnapshotSourcePreference(left);
      if (sourceDiff !== 0) return sourceDiff;

      if (right.subscriptionId && !left.subscriptionId) return 1;
      if (left.subscriptionId && !right.subscriptionId) return -1;

      return 0;
    });

  const current = snapshots[0];
  if (!current) return EMPTY_CURRENT_PLAN;

  return {
    id: current.matchedPlan?.id || current.planId || null,
    rawSlug: current.rawSlug,
    name: current.planName,
    monthlyPrice: current.monthlyPrice,
    professionalLimit: current.professionalLimit,
    dueDate: current.dueDate,
    dueDateIso: current.dueDateIso,
    paymentMethod: current.paymentMethod,
    summary: current.summary,
    matchedPlan: current.matchedPlan,
    status: current.status,
    subscriptionActive: current.subscriptionActive,
    graceAccess: current.graceAccess,
    subscriptionId: current.subscriptionId,
    sourceTable: current.sourceTable,
    ownerType: current.ownerType,
  } satisfies CurrentPlanInfo;
}

function buildActivePsychologistsLabel(
  activeCount: number,
  limit: number | null,
  matchedPlan: ProductPlanDefinition | null,
) {
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return `${activeCount} / ${limit}`;
  }

  if (matchedPlan && matchedPlan.professionalLimit == null) {
    return `${activeCount}`;
  }

  return `${activeCount}`;
}

function extractErrorMessage(payload: ApiErrorPayload | null, fallbackMessage: string) {
  return payload?.error?.message?.trim() || fallbackMessage;
}

async function buildAuthorizedHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = session?.access_token?.trim();

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  } catch {
    // Keep API calls resilient even if auth context is temporarily unavailable.
  }

  return headers;
}

async function callSubscriptionApi<T>(path: string, body: Record<string, unknown>, fallbackMessage: string) {
  const response = await fetch(buildServerApiUrl(path), {
    method: "POST",
    headers: await buildAuthorizedHeaders(),
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as T | ApiErrorPayload | null;

  if (!response.ok || !payload || !("success" in payload) || payload.success !== true) {
    throw new Error(extractErrorMessage(payload as ApiErrorPayload | null, fallbackMessage));
  }

  return payload as T;
}

async function fetchAvailablePlans() {
  const { data, error } = await supabase
    .from("planos")
    .select("id, nome, slug, descricao, preco_mensal, limite_psicologos, limite_pacientes, ativo, ordem")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as PlanRow[]).map(mapProductPlanRow);
}

export async function fetchAdminPlansData(): Promise<AdminPlansData> {
  const context = await getCurrentAdminContext();
  const availablePlans = await fetchAvailablePlans();
  const currentPlan = resolveCurrentPlanFromRows(
    [
      { row: context.record?.row || null, sourceTable: "usuarios" },
      { row: context.clinicRow, sourceTable: "clinicas" },
    ],
    availablePlans,
  );

  const emptyScopedResponse = {
    adminName: context.adminName,
    clinicName: context.clinicName,
    currentPlan,
    currentPlanError: null,
    activePsychologistsCount: 0,
    activePsychologistsLabel: "--",
    availablePlans,
    hasClinicScope: Boolean(context.clinicId),
  } satisfies AdminPlansData;

  if (!context.clinicId) {
    return emptyScopedResponse;
  }

  try {
    const usersResult = await supabase
      .from("usuarios")
      .select("id, tipo_usuario, ativo")
      .eq("clinica_id", context.clinicId);

    if (usersResult.error) throw usersResult.error;

    const users = (usersResult.data ?? []) as UserRow[];
    const activePsychologistsCount = users.filter(
      (user) => isPsychologistUser(user) && user.ativo !== false,
    ).length;

    return {
      adminName: context.adminName,
      clinicName: context.clinicName,
      currentPlan,
      currentPlanError: null,
      activePsychologistsCount,
      activePsychologistsLabel: buildActivePsychologistsLabel(
        activePsychologistsCount,
        currentPlan.professionalLimit,
        currentPlan.matchedPlan,
      ),
      availablePlans,
      hasClinicScope: true,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel carregar os dados atuais da clinica.";

    return {
      ...emptyScopedResponse,
      currentPlanError: message,
    };
  }
}

export async function changeAdminPlan(input: {
  plan: Pick<ProductPlanDefinition, "id" | "slug" | "name">;
}) {
  const planSlug = input.plan.slug || normalizePlanToken(input.plan.name).replace(/-/g, "_");

  return callSubscriptionApi<AdminPlanChangeResponse>(
    "/api/asaas/change-plan",
    {
      planSlug,
    },
    "Nao foi possivel alterar o plano agora.",
  );
}

export async function createAdminSubscriptionPaymentLink() {
  return callSubscriptionApi<AdminPaymentLinkResponse>(
    "/api/asaas/subscription-payment-link",
    {},
    "Nao foi possivel gerar o link de pagamento agora.",
  );
}

export async function cancelAdminPlan() {
  return callSubscriptionApi<AdminPlanCancellationResponse>(
    "/api/asaas/cancel-plan",
    {},
    "Nao foi possivel cancelar o plano agora.",
  );
}
