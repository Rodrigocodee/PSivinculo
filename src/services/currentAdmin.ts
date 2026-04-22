import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  buildClinicAdminAccessDeniedMessage,
  getClinicAdminClinicId,
  logClinicAdminRouteAccess,
  resolveClinicAdminAccess,
} from "@/services/adminAccess";

const CLINIC_INVITE_CODE_PREFIX = "CLI";
const GENERATED_INVITE_CODE_BODY_LENGTH = 6;
const SUPPORTED_CLINIC_INVITE_CODE_PATTERN = /^CLI-[A-Z0-9]{6,8}$/;
const MAX_CLINIC_INVITE_CODE_GENERATION_ATTEMPTS = 12;

type AdminLookupRecord = {
  table: string;
  row: Record<string, unknown>;
};

export type CurrentAdminContext = {
  user: User | null;
  record: AdminLookupRecord | null;
  clinicRow: Record<string, unknown> | null;
  clinicId: string;
  clinicName: string;
  adminName: string;
};

export type CurrentAdminClinicInvite = {
  context: CurrentAdminContext;
  inviteCode: string;
  inviteLink: string;
  isPersisted: boolean;
};

export type ClinicInviteLookup = {
  clinicId: string;
  clinicName: string;
  inviteCode: string;
  row: Record<string, unknown>;
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

function getUserFallbackName(user: User | null) {
  const email = user?.email?.trim() || "";
  if (!email) return "Administrador(a)";

  const localPart = email.split("@")[0] || "administrador";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function getAuthenticatedUser() {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

async function findAdminRecordInTable(table: string, user: User | null): Promise<AdminLookupRecord | null> {
  if (!user) return null;

  const candidates =
    table === "usuarios"
      ? [
          { column: "auth_id", value: user.id },
          { column: "id", value: user.id },
          { column: "email", value: user.email || "" },
        ]
      : [
          { column: "id", value: user.id },
          { column: "user_id", value: user.id },
          { column: "email", value: user.email || "" },
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

async function findCurrentAdminRecord(user: User | null) {
  for (const table of ["usuarios"] as const) {
    const record = await findAdminRecordInTable(table, user);
    if (record) return record;
  }

  return null;
}

async function findClinicRecord(clinicId: string) {
  if (!clinicId) return null;

  try {
    const { data, error } = await supabase
      .from("clinicas")
      .select("*")
      .eq("id", clinicId)
      .maybeSingle();

    if (error || !data || !isRecord(data)) return null;
    return data;
  } catch {
    return null;
  }
}

function resolveClinicName(
  clinicRow: Record<string, unknown> | null,
  adminRow: Record<string, unknown> | null,
  metadata: Record<string, unknown>,
) {
  return (
    pickString(clinicRow, ["nome", "name", "nome_clinica", "clinic_name", "clinicName", "consultorio"]) ||
    pickString(adminRow, ["nome_clinica", "clinic_name", "clinicName", "nome_consultorio", "consultorio"]) ||
    pickString(metadata, ["nome_clinica", "clinic_name", "clinicName", "nome_consultorio", "consultorio"]) ||
    "Clinica nao informada"
  );
}

export function normalizeClinicInviteCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function getStoredClinicInviteCode(source: Record<string, unknown> | null | undefined) {
  return normalizeClinicInviteCode(pickString(source, ["codigo_convite", "invite_code"]));
}

function isSupportedClinicInviteCode(code: string) {
  return SUPPORTED_CLINIC_INVITE_CODE_PATTERN.test(normalizeClinicInviteCode(code));
}

function buildClinicInviteCode(seed: string, attempt = 0) {
  const body = buildInviteCodeBody(seed, attempt);
  return body ? `${CLINIC_INVITE_CODE_PREFIX}-${body}` : "";
}

async function findClinicByInviteCode(code: string) {
  const normalizedCode = normalizeClinicInviteCode(code);
  if (!normalizedCode) return null;

  try {
    const { data, error } = await supabase.rpc("lookup_public_clinic_invite", {
      invite_code_input: normalizedCode,
    });
    const row = Array.isArray(data) ? data[0] : data;

    if (!error && row && isRecord(row)) {
      return row;
    }
  } catch {
    return null;
  }

  return null;
}

function buildClinicInvitePayload(clinicRow: Record<string, unknown> | null, inviteCode: string) {
  if (!clinicRow) return {};

  const payload: Record<string, unknown> = {};

  if ("codigo_convite" in clinicRow) payload.codigo_convite = inviteCode;
  if ("invite_code" in clinicRow) payload.invite_code = inviteCode;

  return payload;
}

export function buildClinicInviteLink(inviteCode: string) {
  const normalizedCode = normalizeClinicInviteCode(inviteCode);
  const basePath = normalizedCode
    ? `/cadastro/psicologo?codigo=${encodeURIComponent(normalizedCode)}`
    : "/cadastro/psicologo";

  if (typeof window === "undefined") return basePath;
  return `${window.location.origin}${basePath}`;
}

export async function validateClinicInviteCode(inviteCode: string): Promise<ClinicInviteLookup> {
  const normalizedCode = normalizeClinicInviteCode(inviteCode);

  if (!normalizedCode) {
    throw new Error("Informe o codigo da clinica.");
  }

  if (!isSupportedClinicInviteCode(normalizedCode)) {
    throw new Error("Informe um codigo de convite da clinica valido.");
  }

  const clinicRow = await findClinicByInviteCode(normalizedCode);

  if (!clinicRow) {
    throw new Error("O codigo da clinica nao foi encontrado.");
  }

  const clinicId = pickString(clinicRow, ["id"]);

  if (!clinicId) {
    throw new Error("Este convite da clinica ainda nao esta configurado corretamente.");
  }

  return {
    clinicId,
    clinicName: resolveClinicName(clinicRow, null, {}),
    inviteCode: normalizedCode,
    row: clinicRow,
  };
}

export async function getCurrentAdminContext(): Promise<CurrentAdminContext> {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new Error("Nao foi possivel localizar uma sessao autenticada.");
  }

  const metadata = isRecord(user.user_metadata) ? user.user_metadata : {};
  const record = await findCurrentAdminRecord(user);
  const adminRow = record?.row || null;
  const access = resolveClinicAdminAccess({
    user,
    recordTable: record?.table || null,
    record: adminRow,
  });

  if (!access.isClinicAdmin) {
    logClinicAdminRouteAccess({
      routePath: "service:getCurrentAdminContext",
      access,
    });
    throw new Error(buildClinicAdminAccessDeniedMessage(access.reason));
  }

  const clinicId = getClinicAdminClinicId(adminRow, user);
  const clinicRow = await findClinicRecord(clinicId);

  return {
    user,
    record,
    clinicRow,
    clinicId,
    clinicName: resolveClinicName(clinicRow, adminRow, metadata),
    adminName:
      pickString(metadata, ["full_name", "name"]) ||
      pickString(adminRow, ["nome", "name", "full_name"]) ||
      getUserFallbackName(user),
  };
}

export async function ensureCurrentAdminClinicInviteCode(
  existingContext?: CurrentAdminContext,
): Promise<CurrentAdminClinicInvite> {
  const context = existingContext || (await getCurrentAdminContext());
  const clinicRow = context.clinicRow;
  const storedCode = getStoredClinicInviteCode(clinicRow);

  if (isSupportedClinicInviteCode(storedCode)) {
    return {
      context,
      inviteCode: storedCode,
      inviteLink: buildClinicInviteLink(storedCode),
      isPersisted: true,
    };
  }

  const seed = context.clinicId || context.clinicName || context.adminName || context.user?.id || "CLINICA";
  const persistencePayloadTemplate = buildClinicInvitePayload(clinicRow, "TEMP");
  const canPersistInviteCode = Boolean(context.clinicId && clinicRow && Object.keys(persistencePayloadTemplate).length > 0);

  for (let attempt = 0; attempt < MAX_CLINIC_INVITE_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const inviteCode = buildClinicInviteCode(seed, attempt);
    if (!isSupportedClinicInviteCode(inviteCode)) continue;

    if (canPersistInviteCode) {
      const existingClinic = await findClinicByInviteCode(inviteCode);
      const existingClinicId = pickString(existingClinic, ["id"]);

      if (existingClinicId && existingClinicId !== context.clinicId) {
        continue;
      }

      const payload = buildClinicInvitePayload(clinicRow, inviteCode);
      const { error } = await supabase
        .from("clinicas")
        .update(payload)
        .eq("id", context.clinicId);

      if (!error) {
        return {
          context: {
            ...context,
            clinicRow: {
              ...(clinicRow || {}),
              ...payload,
            },
          },
          inviteCode,
          inviteLink: buildClinicInviteLink(inviteCode),
          isPersisted: true,
        };
      }
    }

    return {
      context,
      inviteCode,
      inviteLink: buildClinicInviteLink(inviteCode),
      isPersisted: false,
    };
  }

  const fallbackCode = buildClinicInviteCode(seed);

  return {
    context,
    inviteCode: fallbackCode,
    inviteLink: buildClinicInviteLink(fallbackCode),
    isPersisted: false,
  };
}
