import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { resolveSubscriptionAccessFromSource } from "@/lib/subscriptionAccess";
import { formatPhone as formatPhoneValue } from "@/lib/formatters";
import {
  buildPsychologistInviteCode,
  findPsychologistByInviteCode,
  getStoredInviteCode,
  isSupportedInviteCode,
  MAX_INVITE_CODE_GENERATION_ATTEMPTS,
} from "@/services/psychologistInvite";
import {
  CLINIC_INVITED_PSYCHOLOGIST_ORIGIN,
  CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW,
  resolvePsychologistClinicAccess,
} from "@/services/psychologistAccess";

export const CURRENT_PSYCHOLOGIST_NAME = "Dra. Camila Rodrigues";
export const CURRENT_PSYCHOLOGIST_EMAIL = "camila@psivinculo.com";
export const AVATARS_BUCKET = "avatars";
export const MIN_CRP_DIGITS = 4;
export const MAX_CRP_DIGITS = 7;
export const CRP_VALIDATION_MESSAGE = "O CRP deve conter entre 4 e 7 digitos.";
const CURRENT_PROFESSIONAL_ACCESS_FLAG_KEYS = [
  "professional_access_granted",
  "access_granted",
  "subscription_active",
  "plan_active",
  "assinatura_ativa",
] as const;
const CURRENT_PROFESSIONAL_ACCESS_STATUS_KEYS = [
  "professional_access_status",
  "access_status",
  "subscription_status",
  "plan_status",
  "status_assinatura",
] as const;
const CURRENT_PSYCHOLOGIST_LOOKUP_TABLES = ["usuarios"] as const;

export type CurrentPsychologistRecord = {
  table: string;
  row: Record<string, unknown>;
  matchColumn: string;
  matchValue: string;
};

export type CurrentPsychologistContext = {
  user: User | null;
  record: CurrentPsychologistRecord | null;
  usuariosRecord: CurrentPsychologistRecord | null;
  psychologistId: string;
  clinicId: string;
};

export type CurrentPsychologistProfile = CurrentPsychologistContext & {
  fullName: string;
  email: string;
  phone: string;
  crp: string;
  specialty: string;
  clinicName: string;
  inviteCode: string;
  avatarPath: string | null;
  avatarUrl: string | null;
};

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function pickBoolean(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
  }

  return null;
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "CR";
}

export function getFirstName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const normalized = parts.filter((part) => {
    const value = part.toLowerCase();
    return value !== "dr" && value !== "dr." && value !== "dra" && value !== "dra.";
  });

  return normalized[0] || parts[0] || "";
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function getCrpDigits(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

export function sanitizeCrpInput(value: string) {
  return getCrpDigits(value).slice(0, MAX_CRP_DIGITS);
}

export function isValidCrp(value: string) {
  return new RegExp(`^\\d{${MIN_CRP_DIGITS},${MAX_CRP_DIGITS}}$`).test(getCrpDigits(value));
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

function logInviteDebug(label: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[Psivinculo][invite][${label}]`, payload);
}

export function formatPhone(value: string) {
  return formatPhoneValue(value);
}

export function resolveAvatarUrl(value: string | null | undefined) {
  if (!value) return null;
  if (isAbsoluteUrl(value)) return value;

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(value);
  return data.publicUrl || null;
}

function resolveAvatarPath(value: string | null | undefined) {
  if (!value || isAbsoluteUrl(value)) return null;
  return value;
}

async function getAuthenticatedUser() {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

function resolveUsuariosRecordMatch(
  row: Record<string, unknown>,
  fallbackColumn: string,
  fallbackValue: string,
) {
  const authId = pickString(row, ["auth_id"]);
  if (authId) {
    return {
      matchColumn: "auth_id",
      matchValue: authId,
    };
  }

  const rowId = pickString(row, ["id"]);
  if (rowId) {
    return {
      matchColumn: "id",
      matchValue: rowId,
    };
  }

  return {
    matchColumn: fallbackColumn,
    matchValue: fallbackValue,
  };
}

async function reconcileUsuariosAuthRecord(
  record: CurrentPsychologistRecord,
  user: User | null,
): Promise<CurrentPsychologistRecord> {
  if (record.table !== "usuarios" || !user) return record;

  const payload: Record<string, unknown> = {};
  const normalizedEmail = normalizeEmail(user.email);

  if ("auth_id" in record.row && pickString(record.row, ["auth_id"]) !== user.id) {
    payload.auth_id = user.id;
  }

  if (
    normalizedEmail &&
    "email" in record.row &&
    normalizeEmail(pickString(record.row, ["email"])) !== normalizedEmail
  ) {
    payload.email = normalizedEmail;
  }

  if (Object.keys(payload).length === 0) {
    const match = resolveUsuariosRecordMatch(record.row, record.matchColumn, record.matchValue);
    return {
      ...record,
      matchColumn: match.matchColumn,
      matchValue: match.matchValue,
    };
  }

  const currentRowId = pickString(record.row, ["id"]);
  const { data, error } = await supabase
    .from("usuarios")
    .update(payload)
    .eq(currentRowId ? "id" : record.matchColumn, currentRowId || record.matchValue)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return record;
  }

  const reconciledRow = data as Record<string, unknown>;
  const match = resolveUsuariosRecordMatch(reconciledRow, record.matchColumn, record.matchValue);

  return {
    table: "usuarios",
    row: reconciledRow,
    matchColumn: match.matchColumn,
    matchValue: match.matchValue,
  };
}

async function findRecordInTable(table: string, user: User | null): Promise<CurrentPsychologistRecord | null> {
  if (!user) return null;

  const normalizedEmail = normalizeEmail(user.email);
  const candidates =
    table === "usuarios"
      ? [
          { column: "auth_id", value: user.id },
          { column: "email", value: normalizedEmail },
          { column: "id", value: user.id },
        ]
      : [
          { column: "id", value: user.id },
          { column: "user_id", value: user.id },
          { column: "psicologo_id", value: user.id },
          { column: "email", value: normalizedEmail },
        ];

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(candidate.column, candidate.value)
      .limit(1)
      .maybeSingle();
    if (error || !data) continue;

    const row = data as Record<string, unknown>;
    const resolvedRecord = {
      table,
      row,
      ...(table === "usuarios"
        ? resolveUsuariosRecordMatch(row, candidate.column, String(candidate.value))
        : {
            matchColumn: candidate.column,
            matchValue: String(candidate.value),
          }),
    } satisfies CurrentPsychologistRecord;

    return table === "usuarios"
      ? reconcileUsuariosAuthRecord(resolvedRecord, user)
      : resolvedRecord;
  }

  return null;
}

export async function findCurrentPsychologistRecord(user?: User | null) {
  const resolvedUser = user === undefined ? await getAuthenticatedUser() : user;

  for (const table of CURRENT_PSYCHOLOGIST_LOOKUP_TABLES) {
    const record = await findRecordInTable(table, resolvedUser);
    if (record) return record;
  }

  return null;
}

function pickRecordIdentity(record: CurrentPsychologistRecord | null) {
  if (!record?.row) return "";

  if (record.table === "usuarios") {
    return pickString(record.row, ["auth_id", "id"]);
  }

  return pickString(record.row, ["id", "user_id", "psicologo_id"]);
}

function resolvePsychologistIdFromRecord(record: CurrentPsychologistRecord | null, user: User | null) {
  const row = record?.row || null;

  if (record?.table === "usuarios") {
    return (
      pickString(row, ["auth_id", "id"]) ||
      user?.id ||
      ""
    );
  }

  return (
    pickString(row, ["psicologo_id"]) ||
    (record?.table === "psicologos" ? pickString(row, ["id"]) : "") ||
    pickString(row, ["user_id", "id"]) ||
    user?.id ||
    ""
  );
}

function resolveClinicIdFromRecord(record: CurrentPsychologistRecord | null, user: User | null) {
  void user;
  return pickString(record?.row || null, ["clinica_id"]);
}

function resolvePsychologistDisplayName(record: CurrentPsychologistRecord | null, user: User | null) {
  const metadata = ((user?.user_metadata || {}) as Record<string, unknown>);

  return (
    pickString(metadata, ["full_name", "name"]) ||
    pickString(record?.row || null, ["nome", "name", "full_name"]) ||
    CURRENT_PSYCHOLOGIST_NAME
  );
}

async function getUsuariosTemplateRow() {
  const { data, error } = await supabase.from("usuarios").select("*").limit(1).maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

type UsuariosRecordPayloadInput = {
  user: User;
  psychologistId: string;
  clinicId: string | null;
  inviteCode: string;
  hasProfessionalAccess: boolean;
  phone?: string | null;
  crp?: string | null;
  specialty?: string | null;
  clinicName?: string | null;
  profileSetupCompleted?: boolean;
};

function buildUsuariosRecordPayload(
  template: Record<string, unknown> | null,
  input: UsuariosRecordPayloadInput,
) {
  const payload: Record<string, unknown> = {};
  const userMetadata = (input.user.user_metadata || {}) as Record<string, unknown>;
  const fullName =
    pickString(userMetadata, ["full_name", "name"]) ||
    pickString(template, ["nome", "name", "full_name"]) ||
    CURRENT_PSYCHOLOGIST_NAME;
  const normalizedEmail = normalizeEmail(input.user.email);
  const allowFallbackKeys = template == null;
  const isClinicInvitedPsychologist = Boolean(input.clinicId && input.hasProfessionalAccess);

  if (allowFallbackKeys || "id" in (template || {})) payload.id = input.user.id;
  if (allowFallbackKeys || "auth_id" in (template || {})) payload.auth_id = input.user.id;
  if (normalizedEmail && (allowFallbackKeys || "email" in (template || {}))) payload.email = normalizedEmail;
  if (fullName && (allowFallbackKeys || "nome" in (template || {}))) payload.nome = fullName;
  if (template && "name" in template) payload.name = fullName;
  if (template && "full_name" in template) payload.full_name = fullName;
  if (allowFallbackKeys || "tipo" in (template || {})) payload.tipo = "psicologo";
  if (template && "perfil" in template) payload.perfil = "psychologist";
  if (template && "role" in template) payload.role = "psychologist";
  if (allowFallbackKeys || "tipo_usuario" in (template || {})) payload.tipo_usuario = "psicologo";
  if (template && "user_type" in template) payload.user_type = "psychologist";
  if (template && "cargo" in template) payload.cargo = "psychologist";
  if (input.clinicId && (allowFallbackKeys || "clinica_id" in (template || {}))) payload.clinica_id = input.clinicId;
  if (allowFallbackKeys || "codigo_convite" in (template || {})) payload.codigo_convite = input.inviteCode;
  if (template && "invite_code" in template) payload.invite_code = input.inviteCode;
  if (isClinicInvitedPsychologist) {
    if (template && "origem_cadastro" in template) payload.origem_cadastro = CLINIC_INVITED_PSYCHOLOGIST_ORIGIN;
    if (template && "cadastro_por_convite" in template) payload.cadastro_por_convite = true;
    if (template && "signup_flow" in template) {
      payload.signup_flow = CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW;
    }
  }
  if (template && "professional_access_granted" in template) {
    payload.professional_access_granted = input.hasProfessionalAccess;
  }
  if (template && "professional_access_status" in template) {
    payload.professional_access_status = input.hasProfessionalAccess ? "active" : "preview";
  }
  if (input.phone !== undefined) {
    if (allowFallbackKeys || "telefone" in (template || {})) payload.telefone = input.phone || null;
  }
  if (input.crp !== undefined) {
    if (template && "crp" in template) payload.crp = input.crp || null;
    if (template && "registro" in template) payload.registro = input.crp || null;
  }
  if (input.specialty !== undefined) {
    if (template && "especialidade" in template) payload.especialidade = input.specialty || null;
    if (template && "specialty" in template) payload.specialty = input.specialty || null;
  }
  if (input.clinicName !== undefined) {
    if (template && "nome_clinica" in template) payload.nome_clinica = input.clinicName;
    if (template && "clinic_name" in template) payload.clinic_name = input.clinicName;
    if (template && "clinicName" in template) payload.clinicName = input.clinicName;
    if (template && "nome_consultorio" in template) payload.nome_consultorio = input.clinicName;
    if (template && "consultorio" in template) payload.consultorio = input.clinicName;
  }
  if (input.profileSetupCompleted !== undefined) {
    if (template && "profile_setup_completed" in template) {
      payload.profile_setup_completed = input.profileSetupCompleted;
    }
    if (template && "onboarding_completed" in template) {
      payload.onboarding_completed = input.profileSetupCompleted;
    }
  }

  return payload;
}

async function createUsuariosPsychologistRecord(input: UsuariosRecordPayloadInput) {
  const template = await getUsuariosTemplateRow();
  const candidatePayloads = [
    buildUsuariosRecordPayload(template, input),
    buildUsuariosRecordPayload(null, input),
    {
      id: input.user.id,
      auth_id: input.user.id,
      email: normalizeEmail(input.user.email),
      nome: resolvePsychologistDisplayName(null, input.user),
      tipo_usuario: "psicologo",
      clinica_id: input.clinicId,
      codigo_convite: input.inviteCode,
    },
    {
      id: input.user.id,
      auth_id: input.user.id,
      email: normalizeEmail(input.user.email),
      codigo_convite: input.inviteCode,
    },
  ].filter((payload, index, collection) => {
    if (Object.keys(payload).length === 0) return false;
    const serialized = JSON.stringify(payload);
    return collection.findIndex((candidate) => JSON.stringify(candidate) === serialized) === index;
  });

  let lastError: unknown = null;

  for (const payload of candidatePayloads) {
    const { data, error } = await supabase
      .from("usuarios")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .maybeSingle();

    if (!error && data) {
      logInviteDebug("usuarios_record_created", {
        userId: input.user.id,
        persistedInviteCode: getStoredInviteCode(data as Record<string, unknown>),
      });

      return {
        table: "usuarios",
        row: data as Record<string, unknown>,
        matchColumn: "id",
        matchValue: input.user.id,
      } satisfies CurrentPsychologistRecord;
    }

    lastError = error;
    logInviteDebug("usuarios_record_create_attempt_failed", {
      userId: input.user.id,
      payloadKeys: Object.keys(payload),
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (lastError) throw lastError;

  return null;
}

async function ensureUsuariosPsychologistRecord(
  user: User | null,
  defaults: {
    psychologistId: string;
    clinicId: string | null;
    hasProfessionalAccess: boolean;
  },
) {
  if (!user) return null;

  const existingRecord = await findRecordInTable("usuarios", user);
  if (existingRecord) return existingRecord;

  return createUsuariosPsychologistRecord({
    user,
    psychologistId: defaults.psychologistId,
    clinicId: defaults.clinicId,
    inviteCode: buildPsychologistInviteCode(user.id),
    hasProfessionalAccess: defaults.hasProfessionalAccess,
    profileSetupCompleted: false,
  });
}

export async function getCurrentPsychologistContext(): Promise<CurrentPsychologistContext> {
  const user = await getAuthenticatedUser();
  const primaryRecord = await findCurrentPsychologistRecord(user);
  const metadata = (user?.user_metadata || {}) as Record<string, unknown>;
  const provisionalPsychologistId = resolvePsychologistIdFromRecord(primaryRecord, user);
  const provisionalClinicId = resolveClinicIdFromRecord(primaryRecord, user);
  const usuariosRecord = await ensureUsuariosPsychologistRecord(user, {
    psychologistId: provisionalPsychologistId,
    clinicId: provisionalClinicId,
    hasProfessionalAccess: resolveCurrentPsychologistProfessionalAccess(metadata, primaryRecord?.row || null),
  });
  const record =
    primaryRecord?.table === "usuarios"
      ? usuariosRecord || primaryRecord
      : primaryRecord || usuariosRecord;
  const usuariosRow = usuariosRecord?.row || null;

  return {
    user,
    record,
    usuariosRecord,
    psychologistId:
      pickString(usuariosRow, ["auth_id", "id"]) ||
      provisionalPsychologistId,
    clinicId: pickString(usuariosRow, ["clinica_id"]) || provisionalClinicId,
  };
}

export async function getCurrentPsychologistProfile(): Promise<CurrentPsychologistProfile> {
  const context = await getCurrentPsychologistContext();
  const metadata = (context.user?.user_metadata || {}) as Record<string, unknown>;
  const row = context.record?.row || null;
  const inviteCode = await ensureCurrentPsychologistInviteCode(context, metadata);
  const persistedInviteCode = getStoredInviteCode(context.usuariosRecord?.row || null);

  logInviteDebug("panel_code", {
    displayedCode: inviteCode,
    persistedCode: persistedInviteCode,
    userId: context.user?.id || "",
  });

  const avatarValue =
    pickString(metadata, ["avatar_url"]) ||
    pickString(row, ["avatar_url", "avatar"]) ||
    null;

  return {
    ...context,
    fullName:
      pickString(metadata, ["full_name", "name"]) ||
      pickString(row, ["nome", "name", "full_name"]) ||
      CURRENT_PSYCHOLOGIST_NAME,
    email: context.user?.email || pickString(row, ["email"]) || CURRENT_PSYCHOLOGIST_EMAIL,
    phone: pickString(metadata, ["phone", "telefone"]) || pickString(row, ["telefone"]),
    crp: pickString(metadata, ["crp"]) || pickString(row, ["crp", "registro"]),
    specialty:
      pickString(metadata, ["specialty", "especialidade"]) ||
      pickString(row, ["especialidade", "specialty"]),
    clinicName:
      pickString(metadata, ["clinic_name", "clinicName", "nome_clinica", "nome_consultorio", "consultorio"]) ||
      pickString(row, ["nome_clinica", "clinic_name", "clinicName", "nome_consultorio", "consultorio"]),
    inviteCode,
    avatarPath: resolveAvatarPath(avatarValue),
    avatarUrl: resolveAvatarUrl(avatarValue),
  };
}

export type CurrentPsychologistProfessionalProfileInput = {
  phone: string;
  crp: string;
  specialty: string;
  clinicName?: string | null;
};

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function isSamePsychologistIdentity(
  row: Record<string, unknown>,
  context: CurrentPsychologistContext,
) {
  const ownIds = new Set(
    [
      context.user?.id || "",
      context.psychologistId || "",
      context.record?.matchValue || "",
      pickRecordIdentity(context.record),
      context.usuariosRecord?.matchValue || "",
      pickRecordIdentity(context.usuariosRecord),
    ].filter(Boolean),
  );
  const ownEmails = new Set(
    [
      normalizeEmail(context.user?.email),
      normalizeEmail(pickString(context.record?.row || null, ["email"])),
      normalizeEmail(pickString(context.usuariosRecord?.row || null, ["email"])),
    ].filter(Boolean),
  );

  const rowIds = [
    pickString(row, ["auth_id"]),
    pickString(row, ["id"]),
    pickString(row, ["user_id"]),
    pickString(row, ["psicologo_id"]),
  ].filter(Boolean);

  if (rowIds.some((value) => ownIds.has(value))) {
    return true;
  }

  const rowEmail = normalizeEmail(pickString(row, ["email"]));
  if (rowEmail && ownEmails.has(rowEmail)) {
    return true;
  }

  return false;
}

export async function assertCurrentPsychologistPhoneAvailable(phone: string) {
  const context = await getCurrentPsychologistContext();
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("telefone", normalizedPhone)
    .limit(5);

  if (error || !Array.isArray(data)) return;

  const belongsToOtherUser = data.some((item) => {
    const row = item as Record<string, unknown>;
    return !isSamePsychologistIdentity(row, context);
  });

  if (belongsToOtherUser) {
    throw new Error("Este telefone ja esta vinculado a outra conta.");
  }
}

async function updateProfileRecord(
  record: CurrentPsychologistRecord,
  payload: Record<string, unknown>,
) {
  if (Object.keys(payload).length === 0) return;

  const match =
    record.table === "usuarios"
      ? resolveUsuariosRecordMatch(record.row, record.matchColumn, record.matchValue)
      : {
          matchColumn: record.matchColumn,
          matchValue: record.matchValue,
        };

  const { error } = await supabase
    .from(record.table)
    .update(payload)
    .eq(match.matchColumn, match.matchValue);

  if (error) throw error;
}

function buildInviteCodePayload(row: Record<string, unknown>, inviteCode: string) {
  const payload: Record<string, unknown> = {};

  if ("codigo_convite" in row) payload.codigo_convite = inviteCode;
  if ("invite_code" in row) payload.invite_code = inviteCode;

  return payload;
}

function resolveCurrentPsychologistProfessionalAccess(
  metadata: Record<string, unknown>,
  row: Record<string, unknown> | null,
) {
  void metadata;
  const psychologistClinicAccess = resolvePsychologistClinicAccess(null, row);
  if (psychologistClinicAccess.isClinicInvitedPsychologist) return true;

  const rowSubscriptionAccess = resolveSubscriptionAccessFromSource(row);
  if (rowSubscriptionAccess !== null) return rowSubscriptionAccess;

  const rowAccessFlag = pickBoolean(row, [...CURRENT_PROFESSIONAL_ACCESS_FLAG_KEYS]);
  if (rowAccessFlag !== null) return rowAccessFlag;

  const rowAccessStatus = normalizeProfessionalAccessStatus(
    pickString(row, [...CURRENT_PROFESSIONAL_ACCESS_STATUS_KEYS]),
  );
  if (rowAccessStatus !== null) return rowAccessStatus;

  return false;
}

function resolveCurrentInviteCodeSeed(context: CurrentPsychologistContext) {
  return (
    context.user?.id ||
    pickRecordIdentity(context.usuariosRecord) ||
    pickRecordIdentity(context.record) ||
    context.psychologistId ||
    "PSICOLOGO"
  );
}

function getOfficialUsuariosInviteCode(
  context: CurrentPsychologistContext,
) {
  const usuariosInviteCode = getStoredInviteCode(context.usuariosRecord?.row || null);
  return isSupportedInviteCode(usuariosInviteCode) ? usuariosInviteCode : "";
}

function lookupBelongsToCurrentPsychologist(
  lookup: Awaited<ReturnType<typeof findPsychologistByInviteCode>>,
  context: CurrentPsychologistContext,
) {
  if (!lookup) return false;

  const ownIds = new Set(
    [
      context.user?.id || "",
      context.psychologistId || "",
      context.record?.matchValue || "",
      context.usuariosRecord?.matchValue || "",
      pickRecordIdentity(context.record),
      pickRecordIdentity(context.usuariosRecord),
    ].filter(Boolean),
  );

  const lookupIds = [
    lookup.psychologistId,
    pickString(lookup.row, ["id", "user_id", "psicologo_id"]),
  ].filter(Boolean);

  return lookupIds.some((value) => ownIds.has(value));
}

async function generateUniqueCurrentPsychologistInviteCode(context: CurrentPsychologistContext) {
  const seed = resolveCurrentInviteCodeSeed(context);

  for (let attempt = 0; attempt < MAX_INVITE_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const inviteCode = buildPsychologistInviteCode(seed, attempt);
    if (!inviteCode) continue;

    const existingInvite = await findPsychologistByInviteCode(inviteCode);
    if (!existingInvite || lookupBelongsToCurrentPsychologist(existingInvite, context)) {
      return inviteCode;
    }
  }

  throw new Error("Nao foi possivel gerar um codigo de convite unico para este psicologo.");
}

async function resolveCurrentPsychologistInviteCodeValue(
  context: CurrentPsychologistContext,
  _metadata: Record<string, unknown>,
) {
  const persistedInviteCode = getOfficialUsuariosInviteCode(context);
  if (persistedInviteCode) {
    return persistedInviteCode;
  }

  return generateUniqueCurrentPsychologistInviteCode(context);
}

async function syncCurrentPsychologistInviteCode(
  context: CurrentPsychologistContext,
  inviteCode: string,
  metadata: Record<string, unknown>,
) {
  if (context.usuariosRecord) {
    const currentUsuariosInviteCode = getStoredInviteCode(context.usuariosRecord.row);
    if (currentUsuariosInviteCode !== inviteCode) {
      await updateProfileRecord(context.usuariosRecord, buildInviteCodePayload(context.usuariosRecord.row, inviteCode));
      context.usuariosRecord = await findRecordInTable("usuarios", context.user);
    }
  }

  if (context.record && context.record.table !== "usuarios") {
    const currentRowInviteCode = getStoredInviteCode(context.record.row);
    if (currentRowInviteCode !== inviteCode) {
      await updateProfileRecord(context.record, buildInviteCodePayload(context.record.row, inviteCode));
    }
  }

  const currentMetadataInviteCode = getStoredInviteCode(metadata);

  if (context.user && currentMetadataInviteCode !== inviteCode) {
    const { error } = await supabase.auth.updateUser({
      data: {
        ...metadata,
        codigo_convite: inviteCode,
        invite_code: inviteCode,
      },
    });

    if (error) throw error;
  }

  logInviteDebug("persisted_code", {
    userId: context.user?.id || "",
    persistedCode: getStoredInviteCode(context.usuariosRecord?.row || null) || inviteCode,
    mirroredMetadataCode: inviteCode,
  });
}

export async function ensureCurrentPsychologistInviteCode(
  contextInput?: CurrentPsychologistContext,
  metadataInput?: Record<string, unknown> | null,
) {
  const context = contextInput || await getCurrentPsychologistContext();
  const metadata = metadataInput || ((context.user?.user_metadata || {}) as Record<string, unknown>);
  const inviteCode = await resolveCurrentPsychologistInviteCodeValue(context, metadata);

  if (!inviteCode) return "";

  await syncCurrentPsychologistInviteCode(context, inviteCode, metadata);

  return inviteCode;
}

function buildProfessionalProfilePayload(
  row: Record<string, unknown>,
  input: {
    phone: string;
    crp: string;
    specialty: string;
    clinicName: string | null;
    clinicId: string | null;
    inviteCode: string;
    hasProfessionalAccess: boolean;
    isClinicInvitedPsychologist: boolean;
    clinicInviteCode: string | null;
  },
) {
  const payload: Record<string, unknown> = {};

  if ("telefone" in row) payload.telefone = input.phone || null;
  if ("crp" in row) payload.crp = input.crp || null;
  if ("registro" in row) payload.registro = input.crp || null;
  if ("especialidade" in row) payload.especialidade = input.specialty || null;
  if ("specialty" in row) payload.specialty = input.specialty || null;
  if ("nome_clinica" in row) payload.nome_clinica = input.clinicName;
  if ("clinic_name" in row) payload.clinic_name = input.clinicName;
  if ("clinicName" in row) payload.clinicName = input.clinicName;
  if ("nome_consultorio" in row) payload.nome_consultorio = input.clinicName;
  if ("consultorio" in row) payload.consultorio = input.clinicName;
  if ("clinica_id" in row) payload.clinica_id = input.clinicId || null;
  if ("profile_setup_completed" in row) payload.profile_setup_completed = true;
  if ("onboarding_completed" in row) payload.onboarding_completed = true;
  if ("professional_access_granted" in row) payload.professional_access_granted = input.hasProfessionalAccess;
  if ("professional_access_status" in row) {
    payload.professional_access_status = input.hasProfessionalAccess ? "active" : "preview";
  }
  if ("codigo_convite" in row) payload.codigo_convite = input.inviteCode;
  if ("invite_code" in row) payload.invite_code = input.inviteCode;
  if (input.isClinicInvitedPsychologist) {
    if ("origem_cadastro" in row) payload.origem_cadastro = CLINIC_INVITED_PSYCHOLOGIST_ORIGIN;
    if ("cadastro_por_convite" in row) payload.cadastro_por_convite = true;
    if ("clinic_invite_code" in row) payload.clinic_invite_code = input.clinicInviteCode;
    if ("codigo_convite_clinica" in row) payload.codigo_convite_clinica = input.clinicInviteCode;
    if ("signup_flow" in row) payload.signup_flow = CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW;
  }

  return payload;
}

export async function saveCurrentPsychologistProfessionalProfile(
  input: CurrentPsychologistProfessionalProfileInput,
) {
  const context = await getCurrentPsychologistContext();

  if (!context.user) {
    throw new Error("Nao foi possivel salvar seu perfil sem uma sessao autenticada.");
  }

  const normalizedPhone = normalizePhone(input.phone);
  const normalizedCrp = getCrpDigits(input.crp);
  const normalizedSpecialty = input.specialty.trim();
  const normalizedClinicName = input.clinicName?.trim() || null;

  if (!normalizedPhone || ![10, 11].includes(normalizedPhone.length)) {
    throw new Error("Informe um telefone valido.");
  }

  await assertCurrentPsychologistPhoneAvailable(normalizedPhone);

  if (!normalizedCrp) {
    throw new Error("Informe seu CRP.");
  }

  if (!isValidCrp(normalizedCrp)) {
    throw new Error(CRP_VALIDATION_MESSAGE);
  }

  if (!normalizedSpecialty) {
    throw new Error("Informe sua especialidade.");
  }

  const inviteCode = await resolveCurrentPsychologistInviteCodeValue(
    context,
    (context.user.user_metadata || {}) as Record<string, unknown>,
  );
  const psychologistClinicAccess = resolvePsychologistClinicAccess(
    null,
    context.usuariosRecord?.row || context.record?.row || null,
  );
  const hasProfessionalAccess =
    psychologistClinicAccess.isClinicInvitedPsychologist ||
    resolveCurrentPsychologistProfessionalAccess(
      (context.user.user_metadata || {}) as Record<string, unknown>,
      context.usuariosRecord?.row || context.record?.row || null,
    );

  if (context.record) {
    const recordPayload = buildProfessionalProfilePayload(context.record.row, {
      phone: normalizedPhone,
      crp: normalizedCrp,
      specialty: normalizedSpecialty,
      clinicName: normalizedClinicName,
      clinicId: context.clinicId,
      inviteCode,
      hasProfessionalAccess,
      isClinicInvitedPsychologist: psychologistClinicAccess.isClinicInvitedPsychologist,
      clinicInviteCode: psychologistClinicAccess.clinicInviteCode || null,
    });

    await updateProfileRecord(context.record, recordPayload);
  }

  if (context.usuariosRecord && context.usuariosRecord.table !== context.record?.table) {
    const usuariosPayload = buildProfessionalProfilePayload(context.usuariosRecord.row, {
      phone: normalizedPhone,
      crp: normalizedCrp,
      specialty: normalizedSpecialty,
      clinicName: normalizedClinicName,
      clinicId: context.clinicId,
      inviteCode,
      hasProfessionalAccess,
      isClinicInvitedPsychologist: psychologistClinicAccess.isClinicInvitedPsychologist,
      clinicInviteCode: psychologistClinicAccess.clinicInviteCode || null,
    });

    await updateProfileRecord(context.usuariosRecord, usuariosPayload);
  }

  const { error: authError } = await supabase.auth.updateUser({
    data: {
      ...(context.user.user_metadata || {}),
      phone: normalizedPhone,
      telefone: normalizedPhone,
      crp: normalizedCrp,
      specialty: normalizedSpecialty,
      especialidade: normalizedSpecialty,
      clinic_name: normalizedClinicName,
      clinicName: normalizedClinicName,
      nome_clinica: normalizedClinicName,
      professional_access_granted: hasProfessionalAccess,
      professional_access_status: hasProfessionalAccess ? "active" : "preview",
      profile_setup_completed: true,
      onboarding_completed: true,
      codigo_convite: inviteCode,
      invite_code: inviteCode,
      origem_cadastro: psychologistClinicAccess.isClinicInvitedPsychologist
        ? CLINIC_INVITED_PSYCHOLOGIST_ORIGIN
        : null,
      cadastro_por_convite: psychologistClinicAccess.isClinicInvitedPsychologist,
      clinic_invite_code: psychologistClinicAccess.clinicInviteCode || null,
      codigo_convite_clinica: psychologistClinicAccess.clinicInviteCode || null,
      signup_flow: psychologistClinicAccess.isClinicInvitedPsychologist
        ? CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW
        : "cadastro_psicologo",
    },
  });

  if (authError) throw authError;

  return getCurrentPsychologistProfile();
}

async function updateUsuariosAvatar(avatarPath: string, user: User | null) {
  const usuariosRecord = await findRecordInTable("usuarios", user);
  if (!usuariosRecord) return;

  const { error } = await supabase
    .from("usuarios")
    .update({ avatar_url: avatarPath })
    .eq(usuariosRecord.matchColumn, usuariosRecord.matchValue);

  if (error) throw error;
}

export async function uploadCurrentPsychologistAvatar(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem valido.");
  }

  const context = await getCurrentPsychologistContext();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${context.clinicId || "sem-clinica"}/${context.psychologistId}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(filePath, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) throw error;

  await updateUsuariosAvatar(filePath, context.user);

  if (context.record?.table !== "usuarios" && context.record?.row && "avatar_url" in context.record.row) {
    const { error: profileError } = await supabase
      .from(context.record.table)
      .update({ avatar_url: filePath })
      .eq(context.record.matchColumn, context.record.matchValue);

    if (profileError) throw profileError;
  }

  if (context.user) {
    const { error: authError } = await supabase.auth.updateUser({
      data: {
        ...(context.user.user_metadata || {}),
        avatar_url: filePath,
      },
    });

    if (authError) throw authError;
  }

  return getCurrentPsychologistProfile();
}
