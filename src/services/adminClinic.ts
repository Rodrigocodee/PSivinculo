import { formatCNPJ, formatPhone } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { normalizePhoneDigits } from "@/services/auth";
import { AVATARS_BUCKET, resolveAvatarUrl } from "@/services/currentPsychologist";
import {
  getCurrentAdminContext,
  type CurrentAdminContext,
} from "@/services/currentAdmin";

type ClinicRow = Record<string, unknown>;

type ClinicFieldAvailability = {
  name: boolean;
  cnpj: boolean;
  phone: boolean;
  email: boolean;
  address: boolean;
  workingHours: boolean;
  sessionDuration: boolean;
  logo: boolean;
};

export type AdminClinicData = {
  context: CurrentAdminContext;
  row: ClinicRow | null;
  clinicId: string;
  clinicName: string;
  adminName: string;
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  workingHours: string;
  sessionDuration: number | null;
  logoPath: string | null;
  logoUrl: string | null;
  hasClinicScope: boolean;
  hasClinicRecord: boolean;
  availableFields: ClinicFieldAvailability;
};

export type SaveAdminClinicInput = {
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  workingHours: string;
  sessionDuration: string;
};

export const currentAdminClinicQueryKey = ["current-admin-clinic"];

const CLINIC_NAME_COLUMNS = ["nome", "name", "nome_clinica", "clinic_name", "clinicName", "consultorio"] as const;
const CLINIC_CNPJ_COLUMNS = ["cnpj"] as const;
const CLINIC_PHONE_COLUMNS = ["telefone", "phone", "celular"] as const;
const CLINIC_EMAIL_COLUMNS = ["email"] as const;
const CLINIC_ADDRESS_COLUMNS = ["endereco", "address"] as const;
const CLINIC_WORKING_HOURS_COLUMNS = ["working_hours", "horarios_funcionamento", "horario_funcionamento", "horarios_atendimento"] as const;
const CLINIC_SESSION_DURATION_COLUMNS = ["duracao_padrao_sessao_min", "duracao_sessao_padrao", "session_duration", "duracao_padrao_sessao", "duracao_sessao", "default_session_duration", "tempo_padrao_sessao"] as const;
const CLINIC_LOGO_COLUMNS = ["logo_url", "logo", "imagem_url", "imagem", "avatar_url", "avatar"] as const;

function pickString(source: ClinicRow | null | undefined, keys: readonly string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function pickNumber(source: ClinicRow | null | undefined, keys: readonly string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function hasAnyColumn(row: ClinicRow | null | undefined, keys: readonly string[]) {
  if (!row) return false;

  return keys.some((key) => Object.prototype.hasOwnProperty.call(row, key));
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveLogoValue(row: ClinicRow | null) {
  return pickString(row, CLINIC_LOGO_COLUMNS) || null;
}

function resolveLogoPath(row: ClinicRow | null) {
  const logoValue = resolveLogoValue(row);
  if (!logoValue || /^https?:\/\//i.test(logoValue)) return null;
  return logoValue;
}

function buildAvailableFields(row: ClinicRow | null): ClinicFieldAvailability {
  return {
    name: hasAnyColumn(row, CLINIC_NAME_COLUMNS),
    cnpj: hasAnyColumn(row, CLINIC_CNPJ_COLUMNS),
    phone: hasAnyColumn(row, CLINIC_PHONE_COLUMNS),
    email: hasAnyColumn(row, CLINIC_EMAIL_COLUMNS),
    address: hasAnyColumn(row, CLINIC_ADDRESS_COLUMNS),
    workingHours: hasAnyColumn(row, CLINIC_WORKING_HOURS_COLUMNS),
    sessionDuration: hasAnyColumn(row, CLINIC_SESSION_DURATION_COLUMNS),
    logo: hasAnyColumn(row, CLINIC_LOGO_COLUMNS),
  };
}

function mapAdminClinicData(
  context: CurrentAdminContext,
  row: ClinicRow | null,
): AdminClinicData {
  const logoValue = resolveLogoValue(row);
  const clinicNameFromRow = pickString(row, CLINIC_NAME_COLUMNS);

  return {
    context,
    row,
    clinicId: context.clinicId,
    clinicName: clinicNameFromRow || context.clinicName,
    adminName: context.adminName,
    name: clinicNameFromRow,
    cnpj: pickString(row, CLINIC_CNPJ_COLUMNS),
    email: pickString(row, CLINIC_EMAIL_COLUMNS),
    phone: pickString(row, CLINIC_PHONE_COLUMNS),
    address: pickString(row, CLINIC_ADDRESS_COLUMNS),
    workingHours: pickString(row, CLINIC_WORKING_HOURS_COLUMNS),
    sessionDuration: pickNumber(row, CLINIC_SESSION_DURATION_COLUMNS),
    logoPath: resolveLogoPath(row),
    logoUrl: resolveAvatarUrl(logoValue),
    hasClinicScope: Boolean(context.clinicId),
    hasClinicRecord: Boolean(row),
    availableFields: buildAvailableFields(row),
  };
}

function persistPhoneValue(input: string, currentValue: string) {
  const digits = normalizePhoneDigits(input);
  if (!digits) return null;

  return /[^\d]/.test(currentValue) ? formatPhone(digits) : digits;
}

function buildClinicUpdatePayload(row: ClinicRow, input: SaveAdminClinicInput) {
  const payload: Record<string, unknown> = {};
  const trimmedName = input.name.trim();
  const trimmedEmail = input.email.trim();
  const trimmedAddress = input.address.trim();
  const trimmedWorkingHours = input.workingHours.trim();
  const normalizedPhone = input.phone.trim();
  const parsedSessionDuration = input.sessionDuration.trim() ? Number(input.sessionDuration.trim()) : null;

  for (const key of CLINIC_NAME_COLUMNS) {
    if (key in row) payload[key] = trimmedName || null;
  }

  for (const key of CLINIC_PHONE_COLUMNS) {
    if (key in row) payload[key] = persistPhoneValue(normalizedPhone, String(row[key] ?? ""));
  }

  for (const key of CLINIC_EMAIL_COLUMNS) {
    if (key in row) payload[key] = trimmedEmail || null;
  }

  for (const key of CLINIC_ADDRESS_COLUMNS) {
    if (key in row) payload[key] = trimmedAddress || null;
  }

  for (const key of CLINIC_WORKING_HOURS_COLUMNS) {
    if (key in row) payload[key] = trimmedWorkingHours || null;
  }

  for (const key of CLINIC_SESSION_DURATION_COLUMNS) {
    if (key in row) payload[key] = parsedSessionDuration;
  }

  return payload;
}

function buildClinicLogoPayload(row: ClinicRow, filePath: string) {
  const payload: Record<string, unknown> = {};

  for (const key of CLINIC_LOGO_COLUMNS) {
    if (key in row) payload[key] = filePath;
  }

  return payload;
}

export async function fetchCurrentAdminClinic(): Promise<AdminClinicData> {
  const context = await getCurrentAdminContext();
  return mapAdminClinicData(context, context.clinicRow);
}

export async function saveCurrentAdminClinic(
  input: SaveAdminClinicInput,
): Promise<AdminClinicData> {
  const clinic = await fetchCurrentAdminClinic();

  if (!clinic.context.user) {
    throw new Error("Nao foi possivel salvar a clinica sem uma sessao autenticada.");
  }

  if (!clinic.clinicId || !clinic.row) {
    throw new Error("Nao foi possivel localizar a clinica vinculada a este admin.");
  }

  const trimmedName = input.name.trim();
  const normalizedPhone = normalizePhoneDigits(input.phone);
  const trimmedEmail = input.email.trim();
  const trimmedSessionDuration = input.sessionDuration.trim();

  if (clinic.availableFields.name && !trimmedName) {
    throw new Error("Informe o nome da clinica.");
  }

  if (clinic.availableFields.phone && normalizedPhone && ![10, 11].includes(normalizedPhone.length)) {
    throw new Error("Informe um telefone valido com DDD.");
  }

  if (clinic.availableFields.email && trimmedEmail && !isValidEmail(trimmedEmail)) {
    throw new Error("Informe um e-mail valido.");
  }

  if (clinic.availableFields.sessionDuration && trimmedSessionDuration) {
    const parsedValue = Number(trimmedSessionDuration);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new Error("Informe uma duracao padrao valida em minutos.");
    }
  }

  const payload = buildClinicUpdatePayload(clinic.row, input);

  if (Object.keys(payload).length === 0) {
    return clinic;
  }

  const { data, error } = await supabase
    .from("clinicas")
    .update(payload)
    .eq("id", clinic.clinicId)
    .select("*")
    .maybeSingle();

  if (error) throw error;

  const nextRow = (data as ClinicRow | null) ?? clinic.row;

  return mapAdminClinicData(
    {
      ...clinic.context,
      clinicRow: nextRow,
      clinicName: pickString(nextRow, CLINIC_NAME_COLUMNS) || clinic.context.clinicName,
    },
    nextRow,
  );
}

export async function uploadCurrentAdminClinicLogo(file: File): Promise<AdminClinicData> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem valido.");
  }

  const clinic = await fetchCurrentAdminClinic();

  if (!clinic.context.user) {
    throw new Error("Nao foi possivel enviar a imagem da clinica sem uma sessao autenticada.");
  }

  if (!clinic.clinicId || !clinic.row) {
    throw new Error("Nao foi possivel localizar a clinica vinculada a este admin.");
  }

  const logoPayload = buildClinicLogoPayload(clinic.row, "");
  if (Object.keys(logoPayload).length === 0) {
    throw new Error("O schema atual da tabela clinicas ainda nao possui uma coluna de logo disponivel.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `clinicas/${clinic.clinicId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(filePath, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("clinicas")
    .update(buildClinicLogoPayload(clinic.row, filePath))
    .eq("id", clinic.clinicId)
    .select("*")
    .maybeSingle();

  if (error) throw error;

  const nextRow = (data as ClinicRow | null) ?? clinic.row;

  return mapAdminClinicData(
    {
      ...clinic.context,
      clinicRow: nextRow,
      clinicName: pickString(nextRow, CLINIC_NAME_COLUMNS) || clinic.context.clinicName,
    },
    nextRow,
  );
}
