import { supabase } from "@/lib/supabase";
import { resolveSubscriptionAccessFromSource } from "@/lib/subscriptionAccess";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import {
  CURRENT_PSYCHOLOGIST_NAME,
  getCurrentPsychologistContext,
} from "@/services/currentPsychologist";

const USUARIOS_PAYMENT_SETTINGS_SELECT =
  "id, auth_id, clinica_id, email, nome, tipo_usuario, tipo_recebimento, asaas_wallet_id, percentual_repasse";
export const PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE = 95;
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

export const currentPsychologistPaymentSettingsQueryKey = [
  "current-psychologist-payment-settings",
] as const;

export type PsychologistPaymentType = "externo" | "asaas_split";

export type CurrentPsychologistPaymentSettings = {
  psychologistId: string;
  sourceTable: "usuarios" | null;
  paymentType: PsychologistPaymentType;
  asaasWalletId: string;
  payoutPercentage: number;
  receivablesEnabled: boolean;
};

export type SaveCurrentPsychologistPaymentSettingsInput = {
  receivablesEnabled: boolean;
  asaasWalletId?: string | null;
  payoutPercentage?: number | string | null;
};

type UsuariosPaymentSettingsRecord = {
  row: Record<string, unknown>;
  matchColumn: string;
  matchValue: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function pickNumber(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const normalized = value.replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) return parsed;
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

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function normalizePaymentType(value: string | null | undefined): PsychologistPaymentType {
  return value === "asaas_split" ? "asaas_split" : "externo";
}

function normalizeProfessionalAccessStatus(value: string) {
  const normalized = value.trim().toLowerCase();

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

function hasProfessionalPaymentAccess(row: Record<string, unknown> | null | undefined) {
  const subscriptionAccess = resolveSubscriptionAccessFromSource(row);
  if (subscriptionAccess !== null) return subscriptionAccess;

  const accessFlag = pickBoolean(row, PROFESSIONAL_ACCESS_FLAG_KEYS);
  if (accessFlag !== null) return accessFlag;

  const accessStatus = normalizeProfessionalAccessStatus(
    pickString(row, [...PROFESSIONAL_ACCESS_STATUS_KEYS]),
  );
  if (accessStatus !== null) return accessStatus;

  return false;
}

function resolveUsuariosRecordFromContext(
  context: Awaited<ReturnType<typeof getCurrentPsychologistContext>>,
): UsuariosPaymentSettingsRecord | null {
  if (context.usuariosRecord?.row) {
    return {
      row: context.usuariosRecord.row,
      matchColumn: context.usuariosRecord.matchColumn,
      matchValue: context.usuariosRecord.matchValue,
    };
  }

  if (context.record?.table === "usuarios" && context.record.row) {
    return {
      row: context.record.row,
      matchColumn: context.record.matchColumn,
      matchValue: context.record.matchValue,
    };
  }

  return null;
}

function buildSeedPayload(
  context: Awaited<ReturnType<typeof getCurrentPsychologistContext>>,
) {
  const metadata = (context.user?.user_metadata || {}) as Record<string, unknown>;
  const fullName =
    pickString(metadata, ["full_name", "name"]) ||
    pickString(context.record?.row || null, ["nome", "name", "full_name"]) ||
    CURRENT_PSYCHOLOGIST_NAME;

  return {
    id: context.user?.id || context.psychologistId,
    auth_id: context.user?.id || context.psychologistId,
    email: normalizeEmail(context.user?.email),
    nome: fullName,
    clinica_id: context.clinicId || null,
    tipo_usuario: "psicologo",
  };
}

function resolvePsychologistId(
  row: Record<string, unknown> | null | undefined,
  fallbackId?: string | null,
) {
  return pickString(row, ["auth_id", "id"]) || fallbackId?.trim() || "";
}

function buildSettingsFromRow(
  row: Record<string, unknown> | null | undefined,
  psychologistId?: string | null,
): CurrentPsychologistPaymentSettings {
  const paymentType = normalizePaymentType(pickString(row, ["tipo_recebimento"]));
  const payoutPercentage =
    paymentType === "asaas_split"
      ? PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE
      : pickNumber(row, ["percentual_repasse"]) ?? PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE;

  return {
    psychologistId: resolvePsychologistId(row, psychologistId),
    sourceTable: row ? "usuarios" : null,
    paymentType,
    asaasWalletId: pickString(row, ["asaas_wallet_id"]),
    payoutPercentage: Number(payoutPercentage.toFixed(2)),
    receivablesEnabled: paymentType === "asaas_split",
  };
}

async function ensureUsuariosRecordForCurrentPsychologist() {
  const context = await getCurrentPsychologistContext();

  if (!context.user) {
    throw new Error("Nao foi possivel localizar uma sessao autenticada.");
  }

  const fromContext = resolveUsuariosRecordFromContext(context);
  if (fromContext) {
    return {
      context,
      record: fromContext,
    };
  }

  const { data, error } = await supabase
    .from("usuarios")
    .upsert(buildSeedPayload(context), { onConflict: "id" })
    .select(USUARIOS_PAYMENT_SETTINGS_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error("Nao foi possivel preparar o cadastro financeiro do psicologo.");
  }

  if (!data || !isRecord(data)) {
    throw new Error("Nao foi possivel localizar o registro financeiro do psicologo.");
  }

  return {
    context,
    record: {
      row: data,
      matchColumn: "id",
      matchValue: String(data.id || context.user.id),
    } satisfies UsuariosPaymentSettingsRecord,
  };
}

export function isPsychologistReceivablesEnabled(
  settings: Pick<CurrentPsychologistPaymentSettings, "paymentType" | "receivablesEnabled"> | null | undefined,
) {
  if (!settings) return false;
  return settings.receivablesEnabled || settings.paymentType === "asaas_split";
}

export async function getCurrentPsychologistPaymentSettings() {
  const { context, record } = await ensureUsuariosRecordForCurrentPsychologist();

  const { data, error } = await supabase
    .from("usuarios")
    .select(USUARIOS_PAYMENT_SETTINGS_SELECT)
    .eq(record.matchColumn, record.matchValue)
    .maybeSingle();

  if (error) {
    throw new Error("Nao foi possivel carregar as configuracoes de recebimento.");
  }

  if (!data || !isRecord(data)) {
    return buildSettingsFromRow(record.row, context.user?.id || context.psychologistId);
  }

  return buildSettingsFromRow(data, context.user?.id || context.psychologistId);
}

export async function saveCurrentPsychologistPaymentSettings(
  input: SaveCurrentPsychologistPaymentSettingsInput,
) {
  const { context, record } = await ensureUsuariosRecordForCurrentPsychologist();
  const paymentType: PsychologistPaymentType = input.receivablesEnabled ? "asaas_split" : "externo";
  const asaasWalletId = input.asaasWalletId?.trim() || "";

  if (paymentType === "asaas_split" && !hasProfessionalPaymentAccess(record.row)) {
    throw new Error(PREVIEW_FEATURE_LOCK_MESSAGE);
  }

  if (paymentType === "asaas_split" && !asaasWalletId) {
    throw new Error("Informe o Asaas Wallet ID para ativar os recebimentos.");
  }

  const payload =
    paymentType === "asaas_split"
      ? {
          tipo_recebimento: paymentType,
          asaas_wallet_id: asaasWalletId,
          percentual_repasse: PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE,
        }
      : {
          tipo_recebimento: paymentType,
        };

  const { data, error } = await supabase
    .from("usuarios")
    .update(payload)
    .eq(record.matchColumn, record.matchValue)
    .select(USUARIOS_PAYMENT_SETTINGS_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error("Nao foi possivel salvar as configuracoes de recebimento.");
  }

  if (!data || !isRecord(data)) {
    throw new Error("O Supabase nao retornou as configuracoes atualizadas.");
  }

  return buildSettingsFromRow(data, context.user?.id || context.psychologistId);
}
