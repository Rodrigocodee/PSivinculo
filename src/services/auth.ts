import type { Session, User } from "@supabase/supabase-js";
import { resolveSubscriptionAccessFromSource } from "@/lib/subscriptionAccess";
import { getSupabaseRememberPreference, setSupabaseRememberPreference, supabase } from "@/lib/supabase";
import {
  CLINIC_ADMIN_USER_TYPE,
  getClinicAdminClinicId,
  getClinicAdminUserType,
  hasClinicAdminMetadataHint,
  isClinicAdmin,
} from "@/services/adminAccess";
import { validateClinicInviteCode } from "@/services/currentAdmin";
import {
  CLINIC_INVITED_PSYCHOLOGIST_ORIGIN,
  CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW,
  resolvePsychologistClinicAccess,
} from "@/services/psychologistAccess";
import { findPsychologistByInviteCode } from "@/services/psychologistInvite";
import { linkPendingSubscriptionAfterRegistration } from "@/services/subscriptionPersistence";

const AUTH_RECORD_TABLES = ["usuarios", "pacientes"] as const;
const AUTH_DEBUG_PREFIX = "[Psivinculo][auth-resolution]";
const AUTH_RECONCILIATION_DEBUG_PREFIX = "[Psivinculo][auth-reconciliation]";
const PSYCHOLOGIST_SIGNUP_DEBUG_PREFIX = "[Psivinculo][psychologist-signup]";
const AUTH_EXISTING_ACCOUNT_RECOVERY_MESSAGE =
  "Este e-mail ja existe no Auth. Entre com a senha atual ou redefina a senha para recriar o cadastro local.";

type AuthRecoveryResult = {
  user: User;
  session: Session | null;
  requiresEmailConfirmation: boolean;
  source: "sign_up" | "sign_in_repair" | "existing_session";
};

export type AppRole = "psychologist" | "admin" | "patient";
export const PSYCHOLOGIST_PROFILE_SETUP_ROUTE = "/cadastro/perfil-profissional";
export const PSYCHOLOGIST_HOME_ROUTE = "/dashboard";
export const PATIENT_HOME_ROUTE = "/paciente";

export type AuthenticatedAppUser = {
  user: User;
  role: AppRole;
  fullName: string;
  email: string;
  clinicId: string;
  userType: string;
  isClinicAdmin: boolean;
  isClinicInvitedPsychologist: boolean;
  recordTable: string | null;
  record: Record<string, unknown> | null;
  needsProfileSetup: boolean;
  hasProfessionalAccess: boolean;
};

type LookupRecord = {
  table: string;
  row: Record<string, unknown>;
};

type SignInInput = {
  email: string;
  password: string;
  rememberMe: boolean;
};

type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
  clinicInviteCode?: string;
};

type UsuariosRecordMatch = {
  row: Record<string, unknown>;
  matchColumn: string;
  matchValue: string;
};

const PHONE_RECORD_COLUMNS = ["telefone", "phone", "celular"] as const;
const PATIENT_INVITE_CODE_KEYS = [
  "codigo_convite_psicologo",
  "codigo_psicologo",
  "psychologist_invite_code",
  "invite_code_psicologo",
] as const;
const PSYCHOLOGIST_CLINIC_INVITE_CODE_KEYS = [
  "codigo_convite_clinica",
  "clinic_invite_code",
] as const;

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

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function normalizeDigits(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readSupabaseErrorField(
  error: unknown,
  field: "message" | "details" | "hint" | "code",
) {
  if (!isRecord(error)) return "";

  const value = error[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toSupabaseErrorMessage(error: unknown) {
  const message = readSupabaseErrorField(error, "message");
  const details = readSupabaseErrorField(error, "details");
  const hint = readSupabaseErrorField(error, "hint");
  const code = readSupabaseErrorField(error, "code");

  const fragments = [
    message,
    details ? `Detalhes: ${details}` : "",
    hint ? `Sugestao: ${hint}` : "",
    code ? `Codigo: ${code}` : "",
  ].filter(Boolean);

  if (fragments.length > 0) return fragments.join(" | ");
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Falha sem detalhes retornados.";
}

function logPsychologistSignupStep(action: string, payload: Record<string, unknown>) {
  console.info(`${PSYCHOLOGIST_SIGNUP_DEBUG_PREFIX}[${action}]`, payload);
}

function logPsychologistSignupFailure(action: string, payload: Record<string, unknown>) {
  console.warn(`${PSYCHOLOGIST_SIGNUP_DEBUG_PREFIX}[${action}]`, payload);
}

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.trim().toLowerCase();

  if ([
    "psychologist",
    "psicologo",
    "psicologa",
    "psicólogo",
    "psicóloga",
    "psi",
    "therapist",
  ].includes(normalized)) {
    return "psychologist";
  }

  if ([
    "admin",
    "admin_clinica",
    "adminclinica",
    "administradorclinica",
    "administradordeclinica",
    "clinicadmin",
    "clinicadministrator",
    "administrator",
    "administrador",
    "administradora",
    "receptionist",
    "recepcionista",
    "recepcao",
    "recepção",
  ].includes(normalized)) {
    return "admin";
  }

  if (["patient", "paciente", "cliente"].includes(normalized)) {
    return "patient";
  }

  return null;
}

function normalizeNonAdminRole(value: unknown): AppRole | null {
  const normalizedRole = normalizeRole(value);
  return normalizedRole === "admin" ? null : normalizedRole;
}

function getRoleFromRecord(table: string, row: Record<string, unknown> | null, user?: User | null) {
  if (isClinicAdmin({ user, recordTable: table || null, record: row })) {
    return "admin";
  }

  const roleFromFields = normalizeNonAdminRole(
    pickString(row, ["role", "perfil", "tipo", "tipo_usuario", "user_type", "cargo"]),
  );

  if (roleFromFields) return roleFromFields;
  if (table === "psicologos") return "psychologist";
  if (table === "pacientes") return "patient";
  if (pickString(row, ["paciente_id"])) return "patient";
  if (pickString(row, ["crp", "especialidade", "specialty", "psicologo_id"])) return "psychologist";

  return null;
}

function getFallbackName(user: User) {
  const email = user.email?.trim() || "";
  if (!email) return "Usuario";

  const localPart = email.split("@")[0] || "usuario";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function getCurrentAuthSnapshot() {
  const session = (await supabase.auth.getSession()).data.session;
  const user = session?.user ?? (await supabase.auth.getUser()).data.user ?? null;

  return {
    session: session ?? null,
    user,
  };
}

async function findRecordInTable(table: string, user: User): Promise<LookupRecord | null> {
  const email = user.email || "";
  const candidates =
    table === "usuarios"
      ? [
          { column: "auth_id", value: user.id },
          { column: "id", value: user.id },
          { column: "email", value: email },
        ]
      : table === "psicologos"
        ? [
            { column: "id", value: user.id },
            { column: "psicologo_id", value: user.id },
            { column: "email", value: email },
          ]
        : table === "pacientes"
          ? [
              { column: "id", value: user.id },
              { column: "paciente_id", value: user.id },
              { column: "email", value: email },
            ]
          : [
              { column: "id", value: user.id },
              { column: "user_id", value: user.id },
              { column: "email", value: email },
            ];

  for (const candidate of candidates) {
    if (!candidate.value) continue;

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(candidate.column, candidate.value)
      .maybeSingle();

    if (error || !data || !isRecord(data)) continue;

    return {
      table,
      row: data,
    };
  }

  return null;
}

async function findAuthenticatedRecord(user: User) {
  for (const table of AUTH_RECORD_TABLES) {
    const record = await findRecordInTable(table, user);
    if (record) return record;
  }

  return null;
}

export async function checkUserExistsByEmail(email: string) {
  for (const table of AUTH_RECORD_TABLES) {
    const { data, error } = await supabase.from(table).select("id").eq("email", email).limit(1);
    if (error) continue;
    if (Array.isArray(data) && data.length > 0) return true;
  }

  return false;
}

export async function checkUserExistsByPhone(phone: string) {
  const normalizedPhone = normalizePhoneDigits(phone);
  const phoneCandidates = Array.from(
    new Set([phone, normalizedPhone].map((value) => value.trim()).filter(Boolean)),
  );

  if (phoneCandidates.length === 0) return false;

  for (const table of AUTH_RECORD_TABLES) {
    for (const column of PHONE_RECORD_COLUMNS) {
      for (const phoneCandidate of phoneCandidates) {
        const { data, error } = await supabase.from(table).select("id").eq(column, phoneCandidate).limit(1);
        if (error) continue;
        if (Array.isArray(data) && data.length > 0) return true;
      }
    }
  }

  return false;
}

export async function assertEmailAvailable(email: string, message = "Este e-mail ja esta em uso.") {
  const normalizedEmail = normalizeEmail(email);

  if (await checkUserExistsByEmail(normalizedEmail)) {
    throw new Error(message);
  }
}

export async function assertPhoneAvailable(phone: string, message = "Este telefone ja esta vinculado a outra conta.") {
  const normalizedPhone = normalizePhoneDigits(phone);

  if (!normalizedPhone) return;

  if (await checkUserExistsByPhone(normalizedPhone)) {
    throw new Error(message);
  }
}

export function getFallbackRoleFromAuthUser(user: User | null | undefined) {
  if (!user) return null;
  if (isClinicAdmin({ user })) return "admin";
  const metadata = isRecord(user.user_metadata) ? user.user_metadata : null;
  return normalizeNonAdminRole(
    pickString(metadata, ["role", "perfil", "tipo", "tipo_usuario", "user_type", "cargo"]),
  );
}

function resolveProfessionalAccess(
  role: AppRole,
  _metadata: Record<string, unknown> | null,
  row: Record<string, unknown> | null,
  _needsProfileSetup: boolean,
  isClinicInvitedPsychologist: boolean,
) {
  if (role !== "psychologist") return true;
  if (isClinicInvitedPsychologist) return true;

  const rowSubscriptionAccess = resolveSubscriptionAccessFromSource(row);

  if (rowSubscriptionAccess !== null) return rowSubscriptionAccess;

  return false;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function getDefaultRouteForRole(role: AppRole) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "patient") return PATIENT_HOME_ROUTE;
  return PSYCHOLOGIST_HOME_ROUTE;
}

export function getDefaultRouteForAppUser(
  appUser?: Pick<AuthenticatedAppUser, "role" | "needsProfileSetup"> | null,
  fallbackRole: AppRole = "psychologist",
) {
  const resolvedRole = appUser?.role || fallbackRole;

  if (resolvedRole === "psychologist" && appUser?.needsProfileSetup) {
    return PSYCHOLOGIST_PROFILE_SETUP_ROUTE;
  }

  return getDefaultRouteForRole(resolvedRole);
}

export function getRememberPreference() {
  return getSupabaseRememberPreference();
}

export async function resolveAuthenticatedAppUser(user: User): Promise<AuthenticatedAppUser> {
  const metadata = isRecord(user.user_metadata) ? user.user_metadata : null;
  let record: LookupRecord | null = null;

  try {
    record = await findAuthenticatedRecord(user);
  } catch (error) {
    console.error("Erro ao localizar perfil autenticado:", error);
  }

  const hasMetadataClinicAdminHint = hasClinicAdminMetadataHint(user);
  const fallbackRole =
    getFallbackRoleFromAuthUser(user) ||
    (hasMetadataClinicAdminHint ? null : "psychologist");
  const preliminaryRole =
    getRoleFromRecord(record?.table || "", record?.row || null, user) ||
    fallbackRole ||
    (hasMetadataClinicAdminHint ? "admin" : null);

  if (preliminaryRole === "patient" && record?.table !== "pacientes") {
    const reconciledPacienteRecord = await reconcilePacienteRecordForAuthenticatedUser(user);
    if (reconciledPacienteRecord) {
      record = reconciledPacienteRecord;
    }
  } else if (record?.table !== "usuarios" && preliminaryRole !== "patient") {
    const reconciledUsuariosRecord = await reconcileUsuariosRecordForAuthenticatedUser(user, preliminaryRole);
    if (reconciledUsuariosRecord) {
      record = reconciledUsuariosRecord;
    }
  }

  const clinicId = getClinicAdminClinicId(record?.row || null, user);
  const userType = getClinicAdminUserType(record?.row || null, user);
  const clinicAdminAccess = isClinicAdmin({
    user,
    recordTable: record?.table || null,
    record: record?.row || null,
  });
  const role =
    getRoleFromRecord(record?.table || "", record?.row || null, user) ||
    fallbackRole ||
    (hasMetadataClinicAdminHint ? "admin" : "psychologist");
  const metadataProfileSetupCompleted = pickBoolean(metadata, ["profile_setup_completed", "onboarding_completed"]);
  const rowProfileSetupCompleted = pickBoolean(record?.row || null, ["profile_setup_completed", "onboarding_completed"]);
  const needsProfileSetup =
    role === "psychologist" &&
    (metadataProfileSetupCompleted === false || rowProfileSetupCompleted === false);
  const psychologistClinicAccess =
    role === "psychologist"
      ? resolvePsychologistClinicAccess(null, record?.row || null)
      : null;
  const isClinicInvitedPsychologist = Boolean(psychologistClinicAccess?.isClinicInvitedPsychologist);
  const hasProfessionalAccess = resolveProfessionalAccess(
    role,
    metadata,
    record?.row || null,
    needsProfileSetup,
    isClinicInvitedPsychologist,
  );

  const authResolutionPayload = {
    authUserId: user.id,
    authEmail: user.email?.trim() || null,
    recordTable: record?.table || null,
    usuariosRecordFound: record?.table === "usuarios",
    id: pickString(record?.row || null, ["id"]) || null,
    auth_id: pickString(record?.row || null, ["auth_id"]) || null,
    tipo_usuario: pickString(record?.row || null, ["tipo_usuario"]) || null,
    clinica_id: pickString(record?.row || null, ["clinica_id", "clinic_id"]) || null,
    role,
    isClinicAdmin: clinicAdminAccess,
    isClinicInvitedPsychologist,
    origem_cadastro: psychologistClinicAccess?.origin || null,
    clinic_invite_code: psychologistClinicAccess?.clinicInviteCode || null,
  };

  if (record?.row) {
    console.info(`${AUTH_DEBUG_PREFIX}[resolved]`, authResolutionPayload);
  } else {
    console.warn(`${AUTH_DEBUG_PREFIX}[missing_record]`, authResolutionPayload);
  }

  return {
    user,
    role,
    fullName:
      pickString(metadata, ["full_name", "name"]) ||
      pickString(record?.row || null, ["nome", "name", "full_name"]) ||
      getFallbackName(user),
    email: user.email?.trim() || pickString(record?.row || null, ["email"]) || "",
    clinicId,
    userType,
    isClinicAdmin: clinicAdminAccess,
    isClinicInvitedPsychologist,
    recordTable: record?.table || null,
    record: record?.row || null,
    needsProfileSetup,
    hasProfessionalAccess,
  };
}

async function resolveValidatedPsychologistClinicLinkFromMetadata(
  metadata: Record<string, unknown> | null,
) {
  const clinicInviteCode = pickString(metadata, [...PSYCHOLOGIST_CLINIC_INVITE_CODE_KEYS]);
  if (!clinicInviteCode) {
    return null;
  }

  try {
    const clinic = await validateClinicInviteCode(clinicInviteCode);
    return {
      clinicId: clinic.clinicId,
    };
  } catch (error) {
    console.warn(`${AUTH_RECONCILIATION_DEBUG_PREFIX}[psychologist_invalid_clinic_invite]`, {
      clinicInviteCode,
      error: error instanceof Error ? error.message : "Unknown clinic invite validation error",
    });
    return null;
  }
}

async function registerSelfPacienteRecordWithInvite(input: {
  inviteCode: string;
  fullName: string;
  phone: string | null;
  cpf: string | null;
}) {
  const { data, error } = await supabase.rpc("register_self_patient_with_invite", {
    invite_code_input: input.inviteCode,
    nome_input: input.fullName,
    telefone_input: input.phone,
    cpf_input: input.cpf,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return isRecord(row) ? row : null;
}

function mapPatientInvitePersistenceErrorMessage(error: unknown) {
  const rawMessage = toSupabaseErrorMessage(error);

  if (rawMessage.includes("PATIENT_ALREADY_LINKED_TO_ANOTHER_PSYCHOLOGIST")) {
    return "Sua conta ja esta vinculada a outro psicologo. Solicite a revisao do suporte antes de trocar o vinculo.";
  }

  if (rawMessage.includes("PATIENT_INVITE_NOT_FOUND")) {
    return "O codigo do psicologo nao foi encontrado.";
  }

  if (rawMessage.includes("AUTHENTICATION_REQUIRED")) {
    return "Sua sessao expirou. Entre novamente para concluir o vinculo do paciente.";
  }

  return rawMessage;
}

async function mapSignInErrorMessage(error: Error, email: string) {
  const rawMessage = error.message.toLowerCase();

  if (rawMessage.includes("invalid email")) {
    return "Informe um e-mail valido.";
  }

  if (rawMessage.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }

  if (rawMessage.includes("invalid login credentials")) {
    try {
      const userExists = await checkUserExistsByEmail(email);
      return userExists ? "A senha informada esta incorreta." : "Usuario nao encontrado.";
    } catch {
      return "E-mail ou senha incorretos.";
    }
  }

  return "Nao foi possivel autenticar agora. Tente novamente.";
}

function mapSignUpErrorMessage(error: Error) {
  const rawMessage = error.message.toLowerCase();

  if (rawMessage.includes("user already registered")) {
    return AUTH_EXISTING_ACCOUNT_RECOVERY_MESSAGE;
  }

  if (rawMessage.includes("password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (rawMessage.includes("invalid email")) {
    return "Informe um e-mail valido.";
  }

  return toSupabaseErrorMessage(error);
}

async function findUsuariosRecordByColumn(column: string, value: string) {
  if (!value) return null;

  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq(column, value)
      .limit(1)
      .maybeSingle();

    if (error || !data || !isRecord(data)) return null;
    return data;
  } catch {
    return null;
  }
}

async function findExistingUsuariosRecord(
  authUserId: string,
  email: string,
): Promise<UsuariosRecordMatch | null> {
  const normalizedEmail = normalizeEmail(email);
  const candidates = [
    { column: "auth_id", value: authUserId },
    { column: "id", value: authUserId },
    { column: "email", value: normalizedEmail },
  ];

  for (const candidate of candidates) {
    const row = await findUsuariosRecordByColumn(candidate.column, candidate.value);
    if (!row) continue;

    return {
      row,
      matchColumn: candidate.column,
      matchValue: candidate.value,
    };
  }

  return null;
}

async function findExistingPsychologistUserRecord(
  authUserId: string,
  email: string,
): Promise<UsuariosRecordMatch | null> {
  return findExistingUsuariosRecord(authUserId, email);
}

function buildPsychologistUserPayload(input: {
  authUserId: string;
  fullName: string;
  email: string;
  clinicId?: string | null;
  includeOrigin: boolean;
}) {
  const payload: Record<string, unknown> = {
    id: input.authUserId,
    auth_id: input.authUserId,
    nome: input.fullName.trim(),
    email: normalizeEmail(input.email),
    tipo_usuario: "psicologo",
  };

  if (input.clinicId?.trim()) {
    payload.clinica_id = input.clinicId.trim();
  }

  if (input.includeOrigin) {
    payload.origem_cadastro = CLINIC_INVITED_PSYCHOLOGIST_ORIGIN;
  }

  return payload;
}

function sanitizeUsuariosUpdatePayload(payload: Record<string, unknown>) {
  const updatePayload = { ...payload };
  delete updatePayload.id;
  return updatePayload;
}

async function persistPsychologistUserRecord(input: {
  authUserId: string;
  fullName: string;
  email: string;
  clinicId?: string | null;
  includeOrigin: boolean;
}) {
  const payload = buildPsychologistUserPayload(input);

  let existingRecord = await findExistingPsychologistUserRecord(input.authUserId, input.email);
  let lastError: unknown = null;

  logPsychologistSignupStep("usuarios_payload", {
    payload,
    id: payload.id,
    auth_id: payload.auth_id,
    nome: payload.nome,
    email: payload.email,
    tipo_usuario: payload.tipo_usuario,
    clinica_id: payload.clinica_id,
    origem_cadastro: payload.origem_cadastro ?? null,
  });

  if (existingRecord) {
    logPsychologistSignupStep("usuarios_existing_record", {
      matchColumn: existingRecord.matchColumn,
      matchValue: existingRecord.matchValue,
      id: pickString(existingRecord.row, ["id"]) || null,
      auth_id: pickString(existingRecord.row, ["auth_id"]) || null,
      tipo_usuario: pickString(existingRecord.row, ["tipo_usuario"]) || null,
      clinica_id: pickString(existingRecord.row, ["clinica_id", "clinic_id"]) || null,
      origem_cadastro: pickString(existingRecord.row, ["origem_cadastro"]) || null,
    });
  }

  if (existingRecord) {
    const updatePayload = sanitizeUsuariosUpdatePayload(payload);
    const updateResult = await supabase
      .from("usuarios")
      .update(updatePayload)
      .eq(existingRecord.matchColumn, existingRecord.matchValue)
      .select("*")
      .maybeSingle();

    logPsychologistSignupStep("usuarios_update_response", {
      response: updateResult,
      errorMessage: readSupabaseErrorField(updateResult.error, "message"),
      errorDetails: readSupabaseErrorField(updateResult.error, "details"),
      errorHint: readSupabaseErrorField(updateResult.error, "hint"),
      errorCode: readSupabaseErrorField(updateResult.error, "code"),
    });

    if (!updateResult.error && updateResult.data && isRecord(updateResult.data)) {
      return updateResult.data;
    }

    existingRecord = await findExistingPsychologistUserRecord(input.authUserId, input.email);
    if (existingRecord) {
      return existingRecord.row;
    }

    logPsychologistSignupFailure("usuarios_update_failed", {
      payload: updatePayload,
      errorMessage: readSupabaseErrorField(updateResult.error, "message"),
      errorDetails: readSupabaseErrorField(updateResult.error, "details"),
      errorHint: readSupabaseErrorField(updateResult.error, "hint"),
      errorCode: readSupabaseErrorField(updateResult.error, "code"),
      error: toSupabaseErrorMessage(updateResult.error),
    });
    lastError = updateResult.error;
  }

  const upsertResult = await supabase
    .from("usuarios")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .maybeSingle();

  logPsychologistSignupStep("usuarios_upsert_response", {
    response: upsertResult,
    errorMessage: readSupabaseErrorField(upsertResult.error, "message"),
    errorDetails: readSupabaseErrorField(upsertResult.error, "details"),
    errorHint: readSupabaseErrorField(upsertResult.error, "hint"),
    errorCode: readSupabaseErrorField(upsertResult.error, "code"),
  });

  if (!upsertResult.error && upsertResult.data && isRecord(upsertResult.data)) {
    return upsertResult.data;
  }

  const reloadedRecord = await findExistingPsychologistUserRecord(input.authUserId, input.email);
  if (reloadedRecord) {
    return reloadedRecord.row;
  }

  logPsychologistSignupFailure("usuarios_upsert_failed", {
    payload,
    errorMessage: readSupabaseErrorField(upsertResult.error, "message"),
    errorDetails: readSupabaseErrorField(upsertResult.error, "details"),
    errorHint: readSupabaseErrorField(upsertResult.error, "hint"),
    errorCode: readSupabaseErrorField(upsertResult.error, "code"),
    error: toSupabaseErrorMessage(upsertResult.error),
  });
  lastError = upsertResult.error;

  throw new Error(
    `Conta criada, mas nao foi possivel concluir o vinculo do psicologo com a clinica. ${toSupabaseErrorMessage(lastError)}`,
  );
}

function isMaskedExistingAuthUser(user: User | null | undefined) {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}

async function persistAdminUserRecordFromAuth(input: {
  authUserId: string;
  fullName: string;
  email: string;
  clinicId: string;
}) {
  const payload: Record<string, unknown> = {
    id: input.authUserId,
    auth_id: input.authUserId,
    nome: input.fullName.trim(),
    email: normalizeEmail(input.email),
    clinica_id: input.clinicId,
    tipo_usuario: CLINIC_ADMIN_USER_TYPE,
  };
  let existingRecord = await findExistingUsuariosRecord(input.authUserId, input.email);

  if (existingRecord) {
    const updatePayload = sanitizeUsuariosUpdatePayload(payload);
    const updateResult = await supabase
      .from("usuarios")
      .update(updatePayload)
      .eq(existingRecord.matchColumn, existingRecord.matchValue)
      .select("*")
      .maybeSingle();

    if (!updateResult.error && updateResult.data && isRecord(updateResult.data)) {
      return updateResult.data;
    }

    existingRecord = await findExistingUsuariosRecord(input.authUserId, input.email);
    if (existingRecord) {
      return existingRecord.row;
    }
  }

  const upsertResult = await supabase
    .from("usuarios")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (!upsertResult.error && upsertResult.data && isRecord(upsertResult.data)) {
    return upsertResult.data;
  }

  const reloadedRecord = await findExistingUsuariosRecord(input.authUserId, input.email);
  if (reloadedRecord) {
    return reloadedRecord.row;
  }

  throw new Error(
    `Seu acesso existe no Auth, mas nao foi possivel recriar o cadastro local em public.usuarios. ${toSupabaseErrorMessage(upsertResult.error)}`,
  );
}

async function reconcileUsuariosRecordForAuthenticatedUser(
  user: User,
  preferredRole?: AppRole | null,
): Promise<LookupRecord | null> {
  const currentAuth = await getCurrentAuthSnapshot();

  if (!currentAuth.session?.user || currentAuth.session.user.id !== user.id) {
    return null;
  }

  const existingUsuariosRecord = await findRecordInTable("usuarios", user);
  if (existingUsuariosRecord) {
    return existingUsuariosRecord;
  }

  const metadata = isRecord(user.user_metadata) ? user.user_metadata : null;
  const role = preferredRole || getFallbackRoleFromAuthUser(user);
  const fullName =
    pickString(metadata, ["full_name", "name", "nome"]) ||
    getFallbackName(user);
  const email = user.email?.trim() || "";

  if (!email || !role || role === "patient") {
    return null;
  }

  console.info(`${AUTH_RECONCILIATION_DEBUG_PREFIX}[start]`, {
    authUserId: user.id,
    email,
    role,
  });

  let row: Record<string, unknown> | null = null;

  if (role === "psychologist") {
    const validatedClinicLink = await resolveValidatedPsychologistClinicLinkFromMetadata(metadata);
    row = await persistPsychologistUserRecord({
      authUserId: user.id,
      fullName,
      email,
      clinicId: validatedClinicLink?.clinicId || null,
      includeOrigin: Boolean(validatedClinicLink),
    });
  } else if (role === "admin") {
    console.warn(`${AUTH_RECONCILIATION_DEBUG_PREFIX}[skip_admin_without_local_record]`, {
      authUserId: user.id,
      email,
      role,
    });
    return null;
  }

  if (!row) {
    return null;
  }

  console.info(`${AUTH_RECONCILIATION_DEBUG_PREFIX}[success]`, {
    authUserId: user.id,
    email,
    role,
    clinica_id: pickString(row, ["clinica_id", "clinic_id"]) || null,
    tipo_usuario: pickString(row, ["tipo_usuario"]) || null,
  });

  return {
    table: "usuarios",
    row,
  };
}

async function reconcilePacienteRecordForAuthenticatedUser(user: User): Promise<LookupRecord | null> {
  const currentAuth = await getCurrentAuthSnapshot();

  if (!currentAuth.session?.user || currentAuth.session.user.id !== user.id) {
    return null;
  }

  const existingPacienteRecord = await findRecordInTable("pacientes", user);
  if (existingPacienteRecord) {
    return existingPacienteRecord;
  }

  const metadata = isRecord(user.user_metadata) ? user.user_metadata : null;
  const email = user.email?.trim() || "";
  const inviteCode = pickString(metadata, [...PATIENT_INVITE_CODE_KEYS]);

  if (!email || !inviteCode) {
    return null;
  }

  console.info(`${AUTH_RECONCILIATION_DEBUG_PREFIX}[patient_start]`, {
    authUserId: user.id,
    email,
    inviteCode,
  });

  const inviteLookup = await findPsychologistByInviteCode(inviteCode);
  if (!inviteLookup?.psychologistId) {
    console.warn(`${AUTH_RECONCILIATION_DEBUG_PREFIX}[patient_invalid_invite]`, {
      authUserId: user.id,
      email,
      inviteCode,
    });
    return null;
  }

  let patientPersistenceError: unknown = null;
  let persistedPatientRow: Record<string, unknown> | null = null;

  try {
    persistedPatientRow = await registerSelfPacienteRecordWithInvite({
      inviteCode,
      fullName: pickString(metadata, ["full_name", "name", "nome"]) || getFallbackName(user),
      phone: normalizePhoneDigits(pickString(metadata, ["telefone", "phone"])) || null,
      cpf: normalizeDigits(pickString(metadata, ["cpf"])).slice(0, 11) || null,
    });
  } catch (error) {
    patientPersistenceError = error;
  }

  if (persistedPatientRow) {
    console.info(`${AUTH_RECONCILIATION_DEBUG_PREFIX}[patient_success]`, {
      authUserId: user.id,
      email,
      paciente_id: pickString(persistedPatientRow, ["id"]) || null,
      clinica_id: pickString(persistedPatientRow, ["clinica_id"]) || null,
      psicologo_id: pickString(persistedPatientRow, ["psicologo_id"]) || null,
    });

    return {
      table: "pacientes",
      row: persistedPatientRow,
    };
  }

  const reloadedRecord = await findRecordInTable("pacientes", user);
  if (reloadedRecord) {
    return reloadedRecord;
  }

  throw new Error(
    `Sua conta foi autenticada, mas nao foi possivel concluir o cadastro local em public.pacientes. ${patientPersistenceError ? mapPatientInvitePersistenceErrorMessage(patientPersistenceError) : "A RPC de vinculo do paciente nao retornou dados."}`,
  );
}

async function findClinicDocumentById(clinicId: string) {
  if (!clinicId) return null;

  const { data, error } = await supabase
    .from("clinicas")
    .select("cnpj")
    .eq("id", clinicId)
    .limit(1)
    .maybeSingle();

  if (error || !data || !isRecord(data)) {
    return null;
  }

  return normalizeDigits(pickString(data, ["cnpj"])) || null;
}

async function resolvePendingSubscriptionDocument(input: {
  user?: User | null;
  appUser?: AuthenticatedAppUser | null;
}) {
  const metadata = isRecord(input.user?.user_metadata) ? input.user?.user_metadata : null;
  const record = isRecord(input.appUser?.record) ? input.appUser?.record : null;
  const directDocument =
    normalizeDigits(
      pickString(metadata, ["cpf", "cnpj", "cpf_cnpj", "cpfCnpj", "documento", "document"]) ||
        pickString(record, ["cpf", "cnpj", "cpf_cnpj", "cpfCnpj", "documento", "document"]),
    ) || "";

  if (directDocument) {
    return directDocument;
  }

  if (input.appUser?.role === "admin" && input.appUser.clinicId) {
    return findClinicDocumentById(input.appUser.clinicId);
  }

  return null;
}

async function createOrRecoverPsychologistAuth(input: {
  email: string;
  password: string;
  fullName: string;
  clinicId: string | null;
  clinicName: string | null;
  clinicInviteCode: string | null;
  isClinicInvitedPsychologist: boolean;
}) {
  const currentAuth = await getCurrentAuthSnapshot();

  if (normalizeEmail(currentAuth.user?.email || "") === input.email && currentAuth.user) {
    return {
      user: currentAuth.user,
      session: currentAuth.session,
      requiresEmailConfirmation: !currentAuth.session,
      source: "existing_session",
    } satisfies AuthRecoveryResult;
  }

  const signUpResult = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        name: input.fullName,
        nome: input.fullName,
        email: input.email,
        onboarding_completed: false,
        profile_setup_completed: false,
        professional_access_granted: input.isClinicInvitedPsychologist,
        professional_access_status: input.isClinicInvitedPsychologist ? "active" : "preview",
        role: "psychologist",
        perfil: "psychologist",
        tipo_usuario: "psicologo",
        user_type: "psychologist",
        cargo: "psychologist",
        clinic_id: input.clinicId,
        clinica_id: input.clinicId,
        clinic_name: input.clinicName,
        nome_clinica: input.clinicName,
        clinic_invite_code: input.clinicInviteCode,
        codigo_convite_clinica: input.clinicInviteCode,
        origem_cadastro: input.isClinicInvitedPsychologist ? CLINIC_INVITED_PSYCHOLOGIST_ORIGIN : null,
        cadastro_por_convite: input.isClinicInvitedPsychologist,
        signup_flow: input.isClinicInvitedPsychologist
          ? CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW
          : "cadastro_psicologo",
      },
    },
  });

  logPsychologistSignupStep("auth_sign_up_response", {
    response: signUpResult,
    userId: signUpResult.data.user?.id || null,
    sessionExists: Boolean(signUpResult.data.session),
    maskedExistingUser: isMaskedExistingAuthUser(signUpResult.data.user),
    errorMessage: readSupabaseErrorField(signUpResult.error, "message"),
    errorDetails: readSupabaseErrorField(signUpResult.error, "details"),
    errorHint: readSupabaseErrorField(signUpResult.error, "hint"),
    errorCode: readSupabaseErrorField(signUpResult.error, "code"),
  });

  const { data, error } = signUpResult;
  const authAlreadyExists =
    (error && error.message.toLowerCase().includes("user already registered")) ||
    (!error && isMaskedExistingAuthUser(data.user));

  if (!authAlreadyExists) {
    if (error) {
      throw new Error(mapSignUpErrorMessage(error));
    }

    if (!data.user) {
      throw new Error("Nao foi possivel criar sua conta agora. Tente novamente.");
    }

    return {
      user: data.user,
      session: data.session,
      requiresEmailConfirmation: !data.session,
      source: "sign_up",
    } satisfies AuthRecoveryResult;
  }

  const signInResult = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (signInResult.error || !signInResult.data.user) {
    throw new Error(AUTH_EXISTING_ACCOUNT_RECOVERY_MESSAGE);
  }

  return {
    user: signInResult.data.user,
    session: signInResult.data.session,
    requiresEmailConfirmation: !signInResult.data.session,
    source: "sign_in_repair",
  } satisfies AuthRecoveryResult;
}

function mapResetPasswordErrorMessage(error: Error) {
  const rawMessage = error.message.toLowerCase();

  if (rawMessage.includes("invalid email")) {
    return "Informe um e-mail valido.";
  }

  return "Nao foi possivel enviar o link de recuperacao agora. Tente novamente.";
}

function mapUpdatePasswordErrorMessage(error: Error) {
  const rawMessage = error.message.toLowerCase();

  if (rawMessage.includes("same password")) {
    return "Escolha uma senha diferente da atual.";
  }

  if (rawMessage.includes("password should be at least")) {
    return "A nova senha precisa ter pelo menos 6 caracteres.";
  }

  return "Nao foi possivel redefinir sua senha agora. Tente novamente.";
}

async function tryLinkPendingSubscriptionForAuthIdentity(input: {
  email: string;
  user?: User | null;
  appUser?: AuthenticatedAppUser | null;
}) {
  try {
    const pendingDocument = await resolvePendingSubscriptionDocument({
      user: input.user,
      appUser: input.appUser,
    });

    await linkPendingSubscriptionAfterRegistration({
      email: input.email,
      cpfCnpj: pendingDocument,
    });
  } catch (error) {
    console.warn("[Psivinculo][subscription-link][auth_flow_failed]", {
      email: input.email,
      error: error instanceof Error ? error.message : "Unknown link failure",
    });
  }
}

export async function signInWithEmailPassword(input: SignInInput) {
  const email = normalizeEmail(input.email);
  setSupabaseRememberPreference(input.rememberMe);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error) {
    throw new Error(await mapSignInErrorMessage(error, email));
  }

  const initialAppUser = data.user ? await resolveAuthenticatedAppUser(data.user) : null;
  await tryLinkPendingSubscriptionForAuthIdentity({
    email,
    user: data.user,
    appUser: initialAppUser,
  });
  const appUser = data.user ? await resolveAuthenticatedAppUser(data.user) : initialAppUser;

  console.info(`${AUTH_DEBUG_PREFIX}[sign_in]`, {
    authUserId: data.user?.id || null,
    authEmail: data.user?.email?.trim() || email,
    recordTable: appUser?.recordTable || null,
    id: pickString(appUser?.record || null, ["id"]) || null,
    auth_id: pickString(appUser?.record || null, ["auth_id"]) || null,
    tipo_usuario: appUser?.userType || null,
    clinica_id: appUser?.clinicId || null,
    isClinicAdmin: appUser?.isClinicAdmin || false,
    isClinicInvitedPsychologist: appUser?.isClinicInvitedPsychologist || false,
  });

  return {
    session: data.session,
    user: data.user,
    appUser,
  };
}

export async function signUpPsychologist(input: SignUpInput) {
  setSupabaseRememberPreference(true);
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedFullName = input.fullName.trim();
  const clinicInviteCode = input.clinicInviteCode?.trim() || "";
  await assertEmailAvailable(normalizedEmail);
  const clinic = clinicInviteCode ? await validateClinicInviteCode(clinicInviteCode) : null;
  const isClinicInvitedPsychologist = Boolean(clinic);

  if (clinic) {
    logPsychologistSignupStep("clinic_invite_resolved", {
      requestedCode: clinicInviteCode,
      persistedCode: clinic.inviteCode,
      clinicId: clinic.clinicId,
      clinicName: clinic.clinicName,
    });
  }

  const authSignUpPayload = {
    email: normalizedEmail,
    password: input.password,
    options: {
      data: {
        full_name: normalizedFullName,
        name: normalizedFullName,
        nome: normalizedFullName,
        email: normalizedEmail,
        onboarding_completed: false,
        profile_setup_completed: false,
        professional_access_granted: isClinicInvitedPsychologist,
        professional_access_status: isClinicInvitedPsychologist ? "active" : "preview",
        role: "psychologist",
        perfil: "psychologist",
        tipo_usuario: "psicologo",
        user_type: "psychologist",
        cargo: "psychologist",
        clinic_id: clinic?.clinicId || null,
        clinica_id: clinic?.clinicId || null,
        clinic_name: clinic?.clinicName || null,
        nome_clinica: clinic?.clinicName || null,
        clinic_invite_code: clinic?.inviteCode || null,
        codigo_convite_clinica: clinic?.inviteCode || null,
        origem_cadastro: isClinicInvitedPsychologist ? CLINIC_INVITED_PSYCHOLOGIST_ORIGIN : null,
        cadastro_por_convite: isClinicInvitedPsychologist,
        signup_flow: isClinicInvitedPsychologist
          ? CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW
          : "cadastro_psicologo",
      },
    },
  };

  logPsychologistSignupStep("auth_sign_up_payload", {
    email: normalizedEmail,
    passwordRedacted: true,
    passwordLength: input.password.length,
    clinicInviteCode: clinic?.inviteCode || null,
    clinicId: clinic?.clinicId || null,
    metadata: {
      ...authSignUpPayload.options.data,
    },
  });
  let authResult: AuthRecoveryResult;

  try {
    authResult = await createOrRecoverPsychologistAuth({
      email: normalizedEmail,
      password: input.password,
      fullName: normalizedFullName,
      clinicId: clinic?.clinicId || null,
      clinicName: clinic?.clinicName || null,
      clinicInviteCode: clinic?.inviteCode || null,
      isClinicInvitedPsychologist,
    });
  } catch (error) {
    logPsychologistSignupFailure("auth_sign_up_failed", {
      email: normalizedEmail,
      clinicId: clinic?.clinicId || null,
      clinicInviteCode: clinic?.inviteCode || null,
      payload: {
        email: authSignUpPayload.email,
        passwordRedacted: true,
        passwordLength: input.password.length,
        metadata: authSignUpPayload.options.data,
      },
      error: toSupabaseErrorMessage(error),
    });
    throw error instanceof Error ? error : new Error("Nao foi possivel criar sua conta agora. Tente novamente.");
  }

  if (clinic) {
    try {
      await persistPsychologistUserRecord({
        authUserId: authResult.user.id,
        fullName: normalizedFullName,
        email: normalizedEmail,
        clinicId: clinic.clinicId,
        includeOrigin: true,
      });
    } catch (registrationError) {
      console.error("Erro ao concluir cadastro do psicologo convidado:", registrationError);
      throw new Error(
        registrationError instanceof Error
          ? registrationError.message
          : "Conta criada, mas nao foi possivel concluir o vinculo do psicologo com a clinica.",
      );
    }
  }

  const initialAppUser = await resolveAuthenticatedAppUser(authResult.user);
  await tryLinkPendingSubscriptionForAuthIdentity({
    email: normalizedEmail,
    user: authResult.user,
    appUser: initialAppUser,
  });
  const appUser = await resolveAuthenticatedAppUser(authResult.user);

  return {
    session: authResult.session,
    user: authResult.user,
    appUser,
    clinic,
    requiresEmailConfirmation: authResult.requiresEmailConfirmation,
  };
}

export async function requestPasswordReset(email: string) {
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/redefinir-senha` : undefined;

  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo,
  });

  if (error) {
    throw new Error(mapResetPasswordErrorMessage(error));
  }
}

export async function updateAuthenticatedPassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(mapUpdatePasswordErrorMessage(error));
  }
}

export async function signOutCurrentSession() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function getSafeRedirectPath(
  roleOrAppUser: AppRole | Pick<AuthenticatedAppUser, "role" | "needsProfileSetup" | "isClinicAdmin"> | null | undefined,
  from?: string | null,
  fallbackUser?: User | null,
) {
  const isSafePath = typeof from === "string" && from.startsWith("/") && !from.startsWith("//");
  const isAdminPath = typeof from === "string" && from.startsWith("/admin");
  const canAccessRequestedAdminPath =
    !isAdminPath ||
    (typeof roleOrAppUser === "string"
      ? roleOrAppUser === "admin" && isClinicAdmin({ user: fallbackUser })
      : Boolean(roleOrAppUser?.role === "admin" && roleOrAppUser.isClinicAdmin));

  if (isSafePath && canAccessRequestedAdminPath) {
    return from;
  }

  if (typeof roleOrAppUser === "string") {
    return getDefaultRouteForRole(roleOrAppUser);
  }

  const fallbackRole = roleOrAppUser?.role || getFallbackRoleFromAuthUser(fallbackUser);
  if (!fallbackRole) return "/acesso-negado";

  return getDefaultRouteForAppUser(roleOrAppUser, fallbackRole);
}

export type AuthSessionResult = {
  session: Session | null;
  appUser: AuthenticatedAppUser | null;
};
