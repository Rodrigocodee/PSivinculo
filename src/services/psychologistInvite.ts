import { resolveSubscriptionAccessFromSource } from "@/lib/subscriptionAccess";
import { supabase } from "@/lib/supabase";

const USERS_TABLE = "usuarios";
const USERS_INVITE_CODE_COLUMN = "codigo_convite";
const INVITE_CODE_COLUMNS = ["codigo_convite", "invite_code"] as const;
const INVITE_CODE_PREFIX = "PSI";
const GENERATED_INVITE_CODE_BODY_LENGTH = 6;
const SUPPORTED_INVITE_CODE_PATTERN = /^PSI-[A-Z0-9]{6,8}$/;
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
export const MAX_INVITE_CODE_LENGTH = 16;
export const MAX_INVITE_CODE_GENERATION_ATTEMPTS = 12;

export type PsychologistInviteLookup = {
  table: string;
  row: Record<string, unknown>;
  inviteCode: string;
  psychologistId: string;
  clinicId: string | null;
  clinicName: string;
  psychologistName: string;
  email: string;
  hasProfessionalAccess: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
  }

  return null;
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
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

function normalizeInviteSeed(seed: string) {
  return seed.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function hashInviteSeed(seed: string, salt: number) {
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  const normalizedSeed = `${seed}:${salt}`;

  for (const character of normalizedSeed) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash;
}

function buildInviteCodeBody(seed: string, attempt: number) {
  const normalizedSeed = normalizeInviteSeed(seed);
  if (!normalizedSeed) return "";

  const primaryHash = hashInviteSeed(normalizedSeed, attempt).toString(36).toUpperCase();
  const secondaryHash = hashInviteSeed(
    normalizedSeed.split("").reverse().join(""),
    attempt + 17,
  ).toString(36).toUpperCase();
  const pool = `${primaryHash}${secondaryHash}${normalizedSeed}${secondaryHash}`;

  return pool
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, GENERATED_INVITE_CODE_BODY_LENGTH)
    .padEnd(GENERATED_INVITE_CODE_BODY_LENGTH, "0");
}

function resolvePsychologistId(row: Record<string, unknown>) {
  return pickString(row, ["psicologo_id", "user_id", "id", "usuario_id"]);
}

function resolveProfessionalAccess(row: Record<string, unknown>) {
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

function resolveValidatedClinicId(row: Record<string, unknown>) {
  const clinicId = pickString(row, ["clinica_id"]);
  if (!clinicId) return null;

  const clinicName = pickString(row, [
    "nome_clinica",
    "clinic_name",
    "clinicName",
    "nome_consultorio",
    "consultorio",
  ]);

  return clinicName ? clinicId : null;
}

function logInviteDebug(label: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[Psivinculo][invite][${label}]`, payload);
}

function buildInviteLookup(row: Record<string, unknown>, requestedCode: string): PsychologistInviteLookup {
  const clinicName = pickString(row, [
    "nome_clinica",
    "clinic_name",
    "clinicName",
    "nome_consultorio",
    "consultorio",
  ]);

  return {
    table: USERS_TABLE,
    row,
    inviteCode: normalizeInviteCode(pickString(row, [USERS_INVITE_CODE_COLUMN])) || normalizeInviteCode(requestedCode),
    psychologistId: resolvePsychologistId(row),
    clinicId: resolveValidatedClinicId(row),
    clinicName,
    psychologistName: pickString(row, ["nome", "name", "full_name"]) || "Psicologo(a) responsavel",
    email: normalizeEmail(pickString(row, ["email"])),
    hasProfessionalAccess: resolveProfessionalAccess(row),
  };
}

type InviteLookupRpcResponse = {
  data: unknown;
  error: {
    message: string;
    code?: string;
    details?: string | null;
    hint?: string | null;
  } | null;
};

async function runPsychologistInviteLookupRpc(
  inviteCode: string,
  parameterName: "invite_code_input" | "invite_code",
): Promise<InviteLookupRpcResponse> {
  return supabase.rpc("lookup_public_psychologist_invite", {
    [parameterName]: inviteCode,
  });
}

async function findPsychologistByUsuariosInviteCodeExact(
  inviteCode: string,
): Promise<PsychologistInviteLookup | null> {
  let { data, error } = await runPsychologistInviteLookupRpc(inviteCode, "invite_code_input");

  if (error?.code === "PGRST202") {
    const legacyResponse = await runPsychologistInviteLookupRpc(inviteCode, "invite_code");
    data = legacyResponse.data;
    error = legacyResponse.error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (error) {
    logInviteDebug("lookup_rpc_error", {
      requestedCode: inviteCode,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw new Error("Nao foi possivel validar o codigo do psicologo agora.");
  }

  if (!isRecord(row)) {
    return null;
  }

  return buildInviteLookup(row, inviteCode);
}

export function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function getStoredInviteCode(source: Record<string, unknown> | null | undefined) {
  return normalizeInviteCode(pickString(source, INVITE_CODE_COLUMNS));
}

export function isSupportedInviteCode(code: string) {
  return SUPPORTED_INVITE_CODE_PATTERN.test(normalizeInviteCode(code));
}

export function buildPsychologistInviteCode(seed: string, attempt = 0) {
  const body = buildInviteCodeBody(seed, attempt);
  return body ? `${INVITE_CODE_PREFIX}-${body}` : "";
}

export async function findPsychologistByInviteCode(code: string): Promise<PsychologistInviteLookup | null> {
  const normalizedCode = normalizeInviteCode(code);

  if (!normalizedCode || !isSupportedInviteCode(normalizedCode)) {
    logInviteDebug("lookup_invalid_code", { requestedCode: code, normalizedCode });
    return null;
  }

  const exactMatch = await findPsychologistByUsuariosInviteCodeExact(normalizedCode);
  if (exactMatch) {
    logInviteDebug("lookup_result", {
      requestedCode: normalizedCode,
      found: true,
      psychologistId: exactMatch.psychologistId,
      clinicId: exactMatch.clinicId,
      persistedCode: exactMatch.inviteCode,
    });
    return exactMatch;
  }

  const legacyTruncatedMatch = normalizedCode.match(/^PSI-([A-Z0-9]{8})$/);
  if (legacyTruncatedMatch) {
    const shortenedCode = `${INVITE_CODE_PREFIX}-${legacyTruncatedMatch[1].slice(0, 6)}`;
    const legacyMatch = await findPsychologistByUsuariosInviteCodeExact(shortenedCode);
    if (legacyMatch) {
      logInviteDebug("lookup_legacy_result", {
        requestedCode: normalizedCode,
        shortenedCode,
        found: true,
        psychologistId: legacyMatch.psychologistId,
        clinicId: legacyMatch.clinicId,
        persistedCode: legacyMatch.inviteCode,
      });
      return legacyMatch;
    }
  }

  logInviteDebug("lookup_result", {
    requestedCode: normalizedCode,
    found: false,
  });

  return null;
}
