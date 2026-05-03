const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "CANCELLED",
  "INACTIVE",
  "DELETED",
]);

type SubscriptionSource = Record<string, unknown> | null | undefined;

function pickString(source: SubscriptionSource, keys: readonly string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function pickBoolean(source: SubscriptionSource, keys: readonly string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
  }

  return null;
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function normalizeSubscriptionStatus(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z_]/g, "");
}

export function parseSubscriptionDate(value: string | null | undefined) {
  const normalizedValue = (value || "").trim();
  if (!normalizedValue) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(normalizedValue) || /^\d{4}-\d{2}-\d{2}\s/.test(normalizedValue)) {
    return normalizedValue.slice(0, 10);
  }

  const brazilianDateMatch = normalizedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!brazilianDateMatch) return null;

  const [, day, month, year] = brazilianDateMatch;
  return `${year}-${month}-${day}`;
}

export function hasSubscriptionGraceAccess(
  status: string | null | undefined,
  dueDate: string | null | undefined,
) {
  const normalizedStatus = normalizeSubscriptionStatus(status);
  const normalizedDueDate = parseSubscriptionDate(dueDate);

  if (!TERMINAL_SUBSCRIPTION_STATUSES.has(normalizedStatus) || !normalizedDueDate) {
    return false;
  }

  return normalizedDueDate >= getTodayIsoDate();
}

export function resolveSubscriptionAccessFromSource(source: SubscriptionSource) {
  if (!source) return null;

  const planSlug = pickString(source, [
    "plano_slug",
    "plan_slug",
    "plan_id",
    "current_plan_id",
    "subscription_plan_id",
  ]);

  if (!planSlug) return null;

  const activeFlag = pickBoolean(source, [
    "assinatura_ativa",
    "subscription_active",
    "plan_active",
  ]);
  const subscriptionStatus = normalizeSubscriptionStatus(
    pickString(source, [
      "status_assinatura",
      "subscription_status",
      "plan_status",
    ]),
  );
  const dueDate = parseSubscriptionDate(
    pickString(source, ["proximo_vencimento", "payment_due_date", "billing_due_date"]),
  );

  if (activeFlag === true) {
    return true;
  }

  if (hasSubscriptionGraceAccess(subscriptionStatus, dueDate)) {
    return true;
  }

  if (
    activeFlag === false ||
    ["ACTIVE", "PENDING", "OVERDUE", "CANCELLED", "INACTIVE", "EXPIRED", "DELETED"].includes(subscriptionStatus)
  ) {
    return false;
  }

  return null;
}
