import type { User } from "@supabase/supabase-js";

const CLINIC_ADMIN_ROLE_FIELDS = [
  "tipo_usuario",
  "role",
  "perfil",
  "tipo",
  "user_type",
  "cargo",
] as const;
const CLINIC_ADMIN_ID_FIELDS = ["clinica_id", "clinic_id"] as const;
const CLINIC_ADMIN_ROLE_TOKENS = new Set([
  "adminclinica",
  "administradorclinica",
  "administradordeclinica",
  "clinicadmin",
  "clinicadministrator",
]);
const ADMIN_DEBUG_PREFIX = "[Psivinculo][admin-access]";

export const CLINIC_ADMIN_USER_TYPE = "admin_clinica";
export const CLINIC_ADMIN_ACCESS_DENIED_ROUTE = "/acesso-negado";

export type ClinicAdminAccessReason =
  | "ok"
  | "not_authenticated"
  | "missing_local_record"
  | "missing_admin_type"
  | "missing_clinic_id";

export type ClinicAdminAccessSnapshot = {
  authUserId: string;
  recordTable: string | null;
  userType: string;
  normalizedUserType: string;
  clinicId: string;
  isClinicAdmin: boolean;
  reason: ClinicAdminAccessReason;
};

type ResolveClinicAdminAccessInput = {
  user?: User | null;
  recordTable?: string | null;
  record?: Record<string, unknown> | null;
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

function normalizeRoleToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getClinicAdminMetadataSnapshot(user?: User | null) {
  const metadata = isRecord(user?.user_metadata) ? user.user_metadata : null;
  const userType = pickString(metadata, CLINIC_ADMIN_ROLE_FIELDS);
  const clinicId = pickString(metadata, CLINIC_ADMIN_ID_FIELDS);

  return {
    userType,
    normalizedUserType: normalizeRoleToken(userType),
    clinicId,
  };
}

export function hasClinicAdminMetadataHint(user?: User | null) {
  const snapshot = getClinicAdminMetadataSnapshot(user);
  return Boolean(
    snapshot.clinicId && CLINIC_ADMIN_ROLE_TOKENS.has(snapshot.normalizedUserType),
  );
}

export function getClinicAdminUserType(
  record: Record<string, unknown> | null | undefined,
  user?: User | null,
  options?: {
    allowMetadataFallback?: boolean;
  },
) {
  const recordValue = pickString(record, CLINIC_ADMIN_ROLE_FIELDS);
  if (recordValue || !options?.allowMetadataFallback) return recordValue;
  return getClinicAdminMetadataSnapshot(user).userType;
}

export function getClinicAdminClinicId(
  record: Record<string, unknown> | null | undefined,
  user?: User | null,
  options?: {
    allowMetadataFallback?: boolean;
  },
) {
  const recordValue = pickString(record, CLINIC_ADMIN_ID_FIELDS);
  if (recordValue || !options?.allowMetadataFallback) return recordValue;
  return getClinicAdminMetadataSnapshot(user).clinicId;
}

export function resolveClinicAdminAccess(
  input: ResolveClinicAdminAccessInput,
): ClinicAdminAccessSnapshot {
  const authUserId = input.user?.id || "";
  const userType = getClinicAdminUserType(input.record, input.user);
  const normalizedUserType = normalizeRoleToken(userType);
  const clinicId = getClinicAdminClinicId(input.record, input.user);
  const metadataSnapshot = getClinicAdminMetadataSnapshot(input.user);
  const hasLocalRecord = Boolean(input.record && Object.keys(input.record).length > 0);
  const hasMetadataAdminHint = hasClinicAdminMetadataHint(input.user);
  const hasClinicAdminType = CLINIC_ADMIN_ROLE_TOKENS.has(normalizedUserType);
  const isClinicAdmin = Boolean(authUserId && hasLocalRecord && hasClinicAdminType && clinicId);

  if (!authUserId) {
    return {
      authUserId,
      recordTable: input.recordTable || null,
      userType,
      normalizedUserType,
      clinicId,
      isClinicAdmin: false,
      reason: "not_authenticated",
    };
  }

  if (!hasLocalRecord) {
    return {
      authUserId,
      recordTable: input.recordTable || null,
      userType: hasMetadataAdminHint ? metadataSnapshot.userType : userType,
      normalizedUserType: hasMetadataAdminHint
        ? metadataSnapshot.normalizedUserType
        : normalizedUserType,
      clinicId: hasMetadataAdminHint ? metadataSnapshot.clinicId : clinicId,
      isClinicAdmin: false,
      reason: hasMetadataAdminHint ? "missing_local_record" : "missing_admin_type",
    };
  }

  if (!hasClinicAdminType) {
    return {
      authUserId,
      recordTable: input.recordTable || null,
      userType,
      normalizedUserType,
      clinicId,
      isClinicAdmin: false,
      reason: "missing_admin_type",
    };
  }

  if (!clinicId) {
    return {
      authUserId,
      recordTable: input.recordTable || null,
      userType,
      normalizedUserType,
      clinicId,
      isClinicAdmin: false,
      reason: "missing_clinic_id",
    };
  }

  return {
    authUserId,
    recordTable: input.recordTable || null,
    userType,
    normalizedUserType,
    clinicId,
    isClinicAdmin,
    reason: "ok",
  };
}

export function isClinicAdmin(input: ResolveClinicAdminAccessInput) {
  return resolveClinicAdminAccess(input).isClinicAdmin;
}

export function logClinicAdminRouteAccess(input: {
  routePath: string;
  access: ClinicAdminAccessSnapshot;
}) {
  const payload = {
    authUserId: input.access.authUserId || null,
    userType: input.access.userType || null,
    clinica_id: input.access.clinicId || null,
    route: input.routePath,
    recordTable: input.access.recordTable,
    allowed: input.access.isClinicAdmin,
    reason: input.access.reason,
  };

  if (input.access.isClinicAdmin) {
    console.info(`${ADMIN_DEBUG_PREFIX}[allow]`, payload);
    return;
  }

  console.warn(`${ADMIN_DEBUG_PREFIX}[deny]`, payload);
}

export function buildClinicAdminAccessDeniedMessage(reason: ClinicAdminAccessReason) {
  if (reason === "missing_local_record") {
    return "Seu usuario do Auth existe, mas o cadastro local em public.usuarios nao foi encontrado. Refaça o vinculo da conta antes de entrar no admin.";
  }

  if (reason === "missing_admin_type") {
    return "A area administrativa e exclusiva para administradores de clinica vinculados.";
  }

  if (reason === "missing_clinic_id") {
    return "Seu acesso nao possui clinica vinculada. Conclua o cadastro da clinica para entrar no admin.";
  }

  return "Nao foi possivel validar o acesso administrativo desta sessao.";
}
