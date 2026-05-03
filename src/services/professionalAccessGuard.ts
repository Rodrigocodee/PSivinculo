import { resolveSubscriptionAccessFromSource } from "@/lib/subscriptionAccess";
import {
  getCurrentPsychologistContext,
  type CurrentPsychologistContext,
} from "@/services/currentPsychologist";
import { resolvePsychologistClinicAccess } from "@/services/psychologistAccess";

export const PREVIEW_FEATURE_LOCK_MESSAGE =
  "Este recurso está disponível após ativar sua assinatura.";

const PROFESSIONAL_ACCESS_FLAG_KEYS = [
  "professional_access_granted",
  "access_granted",
  "subscription_active",
  "plan_active",
  "assinatura_ativa",
] as const;
const PROFESSIONAL_ACCESS_STATUS_KEYS = [
  "professional_access_status",
  "access_status",
  "subscription_status",
  "plan_status",
  "status_assinatura",
] as const;

type AccessScope = {
  hasProfessionalAccess?: boolean;
};

function pickString(source: Record<string, unknown> | null | undefined, keys: readonly string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
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

function normalizeProfessionalAccessStatus(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!normalized) return null;

  if ([
    "preview",
    "pending",
    "blocked",
    "locked",
    "awaiting_plan",
    "aguardando_plano",
    "inactive",
    "trial_locked",
  ].includes(normalized)) {
    return false;
  }

  if ([
    "active",
    "enabled",
    "granted",
    "released",
    "liberado",
    "full",
    "paid",
  ].includes(normalized)) {
    return true;
  }

  return null;
}

export function resolveProfessionalAccessFromCurrentPsychologistContext(
  context: CurrentPsychologistContext,
) {
  const metadata = (context.user?.user_metadata || {}) as Record<string, unknown>;
  const row = context.usuariosRecord?.row || context.record?.row || null;
  const clinicAccess = resolvePsychologistClinicAccess(metadata, row);

  if (clinicAccess.isClinicInvitedPsychologist) return true;

  const subscriptionAccess = resolveSubscriptionAccessFromSource(row);
  if (subscriptionAccess !== null) return subscriptionAccess;

  const accessFlag = pickBoolean(row, PROFESSIONAL_ACCESS_FLAG_KEYS);
  if (accessFlag !== null) return accessFlag;

  const accessStatus = normalizeProfessionalAccessStatus(
    pickString(row, PROFESSIONAL_ACCESS_STATUS_KEYS),
  );
  if (accessStatus !== null) return accessStatus;

  return false;
}

export function assertProfessionalAccessFromScope(scope: AccessScope | null | undefined) {
  if (scope?.hasProfessionalAccess === false) {
    throw new Error(PREVIEW_FEATURE_LOCK_MESSAGE);
  }
}

export async function assertCurrentPsychologistProfessionalAccess() {
  const context = await getCurrentPsychologistContext();

  if (!resolveProfessionalAccessFromCurrentPsychologistContext(context)) {
    throw new Error(PREVIEW_FEATURE_LOCK_MESSAGE);
  }
}
