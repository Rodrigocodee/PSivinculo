import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  CURRENT_PSYCHOLOGIST_NAME,
  findCurrentPsychologistRecord,
  getCurrentPsychologistContext,
} from "@/services/currentPsychologist";

const DEFAULT_CONSULTATION_DURATION_MINUTES = 50;
const USUARIOS_SETTINGS_SELECT =
  "id, auth_id, clinica_id, valor_consulta, duracao_consulta_min, modalidade_consulta, local_presencial, mensagem_lembrete_sessao";

export const currentPsychologistConsultationSettingsQueryKey = [
  "current-psychologist-consultation-settings",
] as const;

export type ConsultationModality = "presencial" | "online" | "presencial_e_online";
export type AppointmentModality = "presencial" | "online";

export type PsychologistConsultationSettings = {
  consultationPrice: number | null;
  consultationDurationMinutes: number;
  consultationModality: ConsultationModality;
  attendsPresential: boolean;
  attendsOnline: boolean;
  presentialLocation: string;
  onlineSessionLink: string;
  sessionReminderMessage: string;
};

export type CurrentPsychologistConsultationSettings = PsychologistConsultationSettings & {
  psychologistId: string;
  sourceTable: "usuarios" | null;
};

export type SaveCurrentPsychologistConsultationSettingsInput = {
  consultationPrice: number | string | null;
  consultationDurationMinutes: number | string;
  consultationModality: ConsultationModality;
  presentialLocation?: string | null;
  sessionReminderMessage?: string | null;
};

export type PsychologistConsultationSettingsSnapshotInput = {
  psychologistId?: string | null;
  sourceTable?: string | null;
  record?: Record<string, unknown> | null;
};

type UsuariosConsultationSettingsRecord = {
  row: Record<string, unknown>;
  matchColumn: string;
  matchValue: string;
};

type ConsultationSettingsPsychologistResolution = {
  user: User;
  context: Awaited<ReturnType<typeof getCurrentPsychologistContext>> | null;
  primaryRecord: Awaited<ReturnType<typeof findCurrentPsychologistRecord>> | null;
};

function logConsultationSettingsError(label: string, payload: Record<string, unknown>) {
  console.error(`[Psivinculo][psychologist-consultation-settings][${label}]`, payload);
}

function resolveUsuariosRecordFromContext(
  context: Awaited<ReturnType<typeof getCurrentPsychologistContext>> | null,
): UsuariosConsultationSettingsRecord | null {
  if (context?.usuariosRecord?.row) {
    return {
      row: context.usuariosRecord.row,
      matchColumn: context.usuariosRecord.matchColumn,
      matchValue: context.usuariosRecord.matchValue,
    };
  }

  if (context?.record?.table === "usuarios" && context.record.row) {
    return {
      row: context.record.row,
      matchColumn: context.record.matchColumn,
      matchValue: context.record.matchValue,
    };
  }

  return null;
}

async function getUsuariosTemplateRow() {
  const { data, error } = await supabase.from("usuarios").select("*").limit(1).maybeSingle();

  if (error || !data || !isRecord(data)) {
    return null;
  }

  return data;
}

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

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function resolvePsychologistDisplayName(
  resolution: ConsultationSettingsPsychologistResolution,
) {
  const metadata = (resolution.user.user_metadata || {}) as Record<string, unknown>;

  return (
    pickString(metadata, ["full_name", "name"]) ||
    pickString(resolution.context?.record?.row || null, ["nome", "name", "full_name"]) ||
    pickString(resolution.primaryRecord?.row || null, ["nome", "name", "full_name"]) ||
    CURRENT_PSYCHOLOGIST_NAME
  );
}

function resolvePsychologistClinicId(
  resolution: ConsultationSettingsPsychologistResolution,
) {
  return (
    resolution.context?.clinicId ||
    pickString(resolution.context?.usuariosRecord?.row || null, ["clinica_id", "clinic_id"]) ||
    pickString(resolution.context?.record?.row || null, ["clinica_id", "clinic_id"]) ||
    pickString(resolution.primaryRecord?.row || null, ["clinica_id", "clinic_id"]) ||
    ""
  );
}

function buildUsuariosSeedPayload(
  template: Record<string, unknown> | null,
  resolution: ConsultationSettingsPsychologistResolution,
) {
  const payload: Record<string, unknown> = {};
  const allowFallbackKeys = template == null;
  const normalizedEmail = normalizeEmail(resolution.user.email);
  const fullName = resolvePsychologistDisplayName(resolution);
  const clinicId = resolvePsychologistClinicId(resolution);

  if (allowFallbackKeys || "id" in (template || {})) payload.id = resolution.user.id;
  if (allowFallbackKeys || "auth_id" in (template || {})) payload.auth_id = resolution.user.id;
  if (normalizedEmail && (allowFallbackKeys || "email" in (template || {}))) payload.email = normalizedEmail;
  if (fullName && (allowFallbackKeys || "nome" in (template || {}))) payload.nome = fullName;
  if (template && "name" in template) payload.name = fullName;
  if (template && "full_name" in template) payload.full_name = fullName;
  if (clinicId && (allowFallbackKeys || "clinica_id" in (template || {}))) payload.clinica_id = clinicId;
  if (allowFallbackKeys || "tipo_usuario" in (template || {})) payload.tipo_usuario = "psicologo";
  if (template && "tipo" in template) payload.tipo = "psicologo";
  if (template && "perfil" in template) payload.perfil = "psychologist";
  if (template && "role" in template) payload.role = "psychologist";
  if (template && "user_type" in template) payload.user_type = "psychologist";

  return payload;
}

function toSupabaseMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (isRecord(error)) {
    const fragments = [
      typeof error.message === "string" ? error.message.trim() : "",
      typeof error.details === "string" ? error.details.trim() : "",
      typeof error.hint === "string" ? error.hint.trim() : "",
      typeof error.code === "string" ? `Codigo: ${error.code.trim()}` : "",
    ].filter(Boolean);

    if (fragments.length > 0) {
      return fragments.join(" | ");
    }
  }

  return fallbackMessage;
}

function normalizeConsultationModality(value: string | null | undefined): ConsultationModality | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;

  if (["presencial", "presential", "in_person", "in-person"].includes(normalized)) {
    return "presencial";
  }

  if (["online", "remoto", "remote", "virtual"].includes(normalized)) {
    return "online";
  }

  if (["presencial_e_online", "ambos", "both", "hybrid", "hibrido", "hibrido_presencial_online"].includes(normalized)) {
    return "presencial_e_online";
  }

  return null;
}

export function normalizeAppointmentModality(value: string | null | undefined): AppointmentModality | null {
  const modality = normalizeConsultationModality(value);
  return modality === "presencial" || modality === "online" ? modality : null;
}

function resolvePsychologistId(row: Record<string, unknown> | null | undefined, fallbackId?: string | null) {
  return (
    pickString(row, ["auth_id", "id"]) ||
    fallbackId?.trim() ||
    ""
  );
}

function buildSettingsFromRow(
  row: Record<string, unknown> | null | undefined,
  psychologistId?: string | null,
): CurrentPsychologistConsultationSettings {
  const consultationModality =
    normalizeConsultationModality(pickString(row, ["modalidade_consulta"])) || "presencial_e_online";
  const consultationDurationMinutes =
    pickNumber(row, ["duracao_consulta_min"]) ?? DEFAULT_CONSULTATION_DURATION_MINUTES;
  const consultationPrice = pickNumber(row, ["valor_consulta"]);

  return {
    consultationPrice,
    consultationDurationMinutes: Math.max(1, Math.round(consultationDurationMinutes)),
    consultationModality,
    attendsPresential: consultationModality !== "online",
    attendsOnline: consultationModality !== "presencial",
    presentialLocation: pickString(row, ["local_presencial"]),
    onlineSessionLink: "",
    sessionReminderMessage: pickString(row, ["mensagem_lembrete_sessao"]),
    psychologistId: resolvePsychologistId(row, psychologistId),
    sourceTable: row ? "usuarios" : null,
  };
}

async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    logConsultationSettingsError("auth_get_user_failed", {
      message: toSupabaseMessage(error, "Nao foi possivel validar a sessao autenticada."),
      rawError: error,
    });
    throw new Error(toSupabaseMessage(error, "Nao foi possivel validar a sessao autenticada."));
  }

  return data.user ?? null;
}

async function findUsuariosRecordByColumn(
  column: string,
  value: string,
): Promise<UsuariosConsultationSettingsRecord | null> {
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  const { data, error } = await supabase
    .from("usuarios")
    .select(USUARIOS_SETTINGS_SELECT)
    .eq(column, normalizedValue)
    .limit(1)
    .maybeSingle();

  if (error) {
    logConsultationSettingsError("usuarios_lookup_failed", {
      column,
      value: normalizedValue,
      message: toSupabaseMessage(error, "Falha ao buscar configuracoes na tabela public.usuarios."),
      rawError: error,
    });
    return null;
  }

  if (!data || !isRecord(data)) return null;

  return {
    row: data,
    matchColumn: column,
    matchValue: normalizedValue,
  };
}

async function findUsuariosRecordByUser(user: User): Promise<UsuariosConsultationSettingsRecord | null> {
  const candidates = [
    { column: "auth_id", value: user.id },
    { column: "id", value: user.id },
  ].filter((candidate, index, collection) => {
    if (!candidate.value) return false;

    return (
      collection.findIndex(
        (item) => item.column === candidate.column && item.value === candidate.value,
      ) === index
    );
  });

  for (const candidate of candidates) {
    const record = await findUsuariosRecordByColumn(candidate.column, candidate.value);
    if (record) return record;
  }

  return null;
}

async function resolvePsychologistResolution(
  user: User,
): Promise<ConsultationSettingsPsychologistResolution> {
  const context = await getCurrentPsychologistContext().catch((error) => {
    logConsultationSettingsError("resolve_context_failed", {
      message:
        error instanceof Error
          ? error.message
          : "Nao foi possivel resolver o contexto do psicologo.",
      rawError: error,
    });
    return null;
  });
  const primaryRecord = context?.record || await findCurrentPsychologistRecord(user).catch((error) => {
    logConsultationSettingsError("resolve_primary_record_failed", {
      authUserId: user.id,
      authEmail: normalizeEmail(user.email),
      message:
        error instanceof Error
          ? error.message
          : "Nao foi possivel localizar o registro principal do psicologo.",
      rawError: error,
    });
    return null;
  });

  return {
    user,
    context,
    primaryRecord,
  };
}

async function ensureUsuariosRecordForCurrentPsychologist(
  resolution: ConsultationSettingsPsychologistResolution,
) {
  const fromContext = resolveUsuariosRecordFromContext(resolution.context);
  if (fromContext) return fromContext;

  const existingRecord = await findUsuariosRecordByUser(resolution.user);
  if (existingRecord) return existingRecord;

  const template = await getUsuariosTemplateRow();
  const candidatePayloads = [
    buildUsuariosSeedPayload(template, resolution),
    buildUsuariosSeedPayload(null, resolution),
    {
      id: resolution.user.id,
      auth_id: resolution.user.id,
      email: normalizeEmail(resolution.user.email),
      nome: resolvePsychologistDisplayName(resolution),
      clinica_id: resolvePsychologistClinicId(resolution),
      tipo_usuario: "psicologo",
    },
    {
      id: resolution.user.id,
      auth_id: resolution.user.id,
      email: normalizeEmail(resolution.user.email),
    },
  ].filter((payload, index, collection) => {
    if (Object.keys(payload).length === 0) return false;

    const serializedPayload = JSON.stringify(payload);
    return collection.findIndex((candidate) => JSON.stringify(candidate) === serializedPayload) === index;
  });

  let lastError: unknown = null;

  for (const payload of candidatePayloads) {
    const { data, error } = await supabase
      .from("usuarios")
      .upsert(payload, { onConflict: "id" })
      .select(USUARIOS_SETTINGS_SELECT)
      .maybeSingle();

    if (!error && data && isRecord(data)) {
      return {
        row: data,
        matchColumn: "id",
        matchValue: String(payload.id || resolution.user.id),
      };
    }

    lastError = error;
    logConsultationSettingsError("usuarios_seed_upsert_failed", {
      authUserId: resolution.user.id,
      authEmail: normalizeEmail(resolution.user.email),
      payloadKeys: Object.keys(payload),
      message: toSupabaseMessage(error, "Falha ao criar o registro do psicologo em public.usuarios."),
      rawError: error,
    });
  }

  const reloadedRecord = await findUsuariosRecordByUser(resolution.user);
  if (reloadedRecord) return reloadedRecord;

  if (lastError) {
    throw new Error(
      toSupabaseMessage(lastError, "Nao foi possivel criar o registro do psicologo em public.usuarios."),
    );
  }

  return null;
}

async function findUsuariosRecordByPsychologistId(psychologistId: string) {
  const normalizedPsychologistId = psychologistId.trim();
  if (!normalizedPsychologistId) return null;

  for (const column of ["auth_id", "id"] as const) {
    const record = await findUsuariosRecordByColumn(column, normalizedPsychologistId);
    if (record) return record.row;
  }

  return null;
}

function normalizePriceInput(value: number | string | null) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Number(value.toFixed(2));
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const normalized = trimmedValue.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;

  return Number(parsed.toFixed(2));
}

function normalizeDurationInput(value: number | string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  const parsed = Number(String(value).trim());
  if (Number.isNaN(parsed)) return null;

  return Math.round(parsed);
}

export function resolvePsychologistConsultationSettingsSnapshot(
  input: PsychologistConsultationSettingsSnapshotInput,
) {
  const shouldUseUsuariosRecord = input.sourceTable === "usuarios";
  return buildSettingsFromRow(shouldUseUsuariosRecord ? input.record : null, input.psychologistId || "");
}

export function getConsultationModalityLabel(
  modality: ConsultationModality | AppointmentModality | string | null | undefined,
) {
  const normalized = normalizeConsultationModality(modality);

  if (normalized === "presencial") return "Presencial";
  if (normalized === "online") return "Online";
  if (normalized === "presencial_e_online") return "Presencial e online";

  return "A definir";
}

export async function getCurrentPsychologistConsultationSettings() {
  const user = await getAuthenticatedUser();

  if (!user) {
    logConsultationSettingsError("missing_authenticated_user", {
      hasContext: false,
    });
    throw new Error("Nao foi possivel localizar uma sessao autenticada.");
  }

  const resolution = await resolvePsychologistResolution(user);
  const usuariosRecord = await ensureUsuariosRecordForCurrentPsychologist(resolution);

  if (!usuariosRecord) {
    logConsultationSettingsError("usuarios_record_not_found", {
      authUserId: user.id,
      authEmail: normalizeEmail(user.email),
      psychologistId: resolution.context?.psychologistId || "",
      clinicId: resolution.context?.clinicId || "",
    });
    return buildSettingsFromRow(null, resolution.context?.psychologistId || user.id);
  }

  return buildSettingsFromRow(usuariosRecord.row, user.id);
}

export async function getPsychologistConsultationSettingsById(psychologistId: string) {
  const usuariosRow = await findUsuariosRecordByPsychologistId(psychologistId);
  return buildSettingsFromRow(usuariosRow, psychologistId);
}

export async function saveCurrentPsychologistConsultationSettings(
  input: SaveCurrentPsychologistConsultationSettingsInput,
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new Error("Nao foi possivel salvar sem uma sessao autenticada.");
  }

  const resolution = await resolvePsychologistResolution(user);
  const usuariosRecord = await ensureUsuariosRecordForCurrentPsychologist(resolution);

  if (!usuariosRecord) {
    logConsultationSettingsError("usuarios_record_not_found_on_save", {
      authUserId: user.id,
      authEmail: normalizeEmail(user.email),
      psychologistId: resolution.context?.psychologistId || "",
      clinicId: resolution.context?.clinicId || "",
    });
    throw new Error("Nao foi possivel localizar nem criar seu registro na tabela public.usuarios para salvar.");
  }

  const consultationPrice = normalizePriceInput(input.consultationPrice);
  const consultationDurationMinutes = normalizeDurationInput(input.consultationDurationMinutes);
  const consultationModality = normalizeConsultationModality(input.consultationModality);

  if (consultationPrice === null) {
    throw new Error("Informe um valor de consulta valido.");
  }

  if (!consultationDurationMinutes || consultationDurationMinutes <= 0) {
    throw new Error("Informe uma duracao valida em minutos.");
  }

  if (!consultationModality) {
    throw new Error("Selecione a modalidade da consulta.");
  }

  const presentialLocation =
    consultationModality === "online" ? null : input.presentialLocation?.trim() || null;
  const sessionReminderMessage = input.sessionReminderMessage?.trim() || null;

  const payload = {
    valor_consulta: consultationPrice,
    duracao_consulta_min: consultationDurationMinutes,
    modalidade_consulta: consultationModality,
    local_presencial: presentialLocation,
    mensagem_lembrete_sessao: sessionReminderMessage,
  };

  const { data, error } = await supabase
    .from("usuarios")
    .update(payload)
    .eq(usuariosRecord.matchColumn, usuariosRecord.matchValue)
    .select(USUARIOS_SETTINGS_SELECT)
    .maybeSingle();

  if (error) {
    logConsultationSettingsError("usuarios_update_failed", {
      authUserId: user.id,
      matchColumn: usuariosRecord.matchColumn,
      matchValue: usuariosRecord.matchValue,
      payload,
      message: toSupabaseMessage(error, "Nao foi possivel salvar as preferencias em public.usuarios."),
      rawError: error,
    });
    throw new Error(
      toSupabaseMessage(error, "Nao foi possivel salvar as preferencias em public.usuarios."),
    );
  }

  if (!data || !isRecord(data)) {
    throw new Error("O update foi executado, mas o Supabase nao retornou o registro atualizado.");
  }

  return buildSettingsFromRow(data, user.id);
}
