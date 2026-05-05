import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const PACIENTES_TABLE = "pacientes";

type CurrentPacienteLookup = {
  row: Record<string, unknown>;
  matchColumn: string;
  matchValue: string;
  table: string;
};

type LookupCandidate = {
  column: string;
  value: string;
};

export type CurrentPacienteContext = {
  user: User | null;
  record: Record<string, unknown> | null;
  patientId: string;
  clinicId: string;
  psychologistId: string;
  fullName: string;
  email: string;
  isLinked: boolean;
};

export type CurrentPatientContext = CurrentPacienteContext;

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

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function normalizeDigits(value: string | null | undefined) {
  return value?.replace(/\D/g, "").trim() || "";
}

function getFallbackName(user: User | null) {
  const email = user?.email?.trim() || "";
  if (!email) return "Paciente";

  const localPart = email.split("@")[0] || "paciente";
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

function logCurrentPacienteDebug(label: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[Psivinculo][current-paciente][${label}]`, payload);
}

function getPacienteLookupCandidates(user: User | null): LookupCandidate[] {
  if (!user) return [];

  const metadata = isRecord(user.user_metadata) ? user.user_metadata : null;
  const normalizedEmail = normalizeEmail(user.email);
  const normalizedPhone = normalizeDigits(pickString(metadata, ["telefone", "phone"]));
  const normalizedCpf = normalizeDigits(pickString(metadata, ["cpf"]));

  const candidates: LookupCandidate[] = [
    { column: "id", value: pickString(metadata, ["patient_id", "paciente_id"]) },
    { column: "user_id", value: user.id },
    { column: "paciente_id", value: user.id },
    { column: "id", value: user.id },
    { column: "email", value: normalizedEmail },
    { column: "telefone", value: normalizedPhone },
    { column: "cpf", value: normalizedCpf },
  ];

  return candidates.filter((candidate, index, collection) => {
    if (!candidate.value) return false;

    return (
      collection.findIndex(
        (item) => item.column === candidate.column && item.value === candidate.value,
      ) === index
    );
  });
}

async function findCurrentPacienteRecord(user: User | null): Promise<CurrentPacienteLookup | null> {
  const candidates = getPacienteLookupCandidates(user);

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from(PACIENTES_TABLE)
      .select("id, clinica_id, psicologo_id, nome, email, telefone, cpf")
      .eq(candidate.column, candidate.value)
      .limit(1)
      .maybeSingle();

    logCurrentPacienteDebug("lookup_attempt", {
      authUserId: user?.id || null,
      tabelaUsada: PACIENTES_TABLE,
      column: candidate.column,
      value: candidate.value,
      rawResult: data ?? null,
      error: error
        ? {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          }
        : null,
    });

    if (error || !data || !isRecord(data)) continue;

    logCurrentPacienteDebug("lookup_match", {
      authUserId: user?.id || null,
      tabelaUsada: PACIENTES_TABLE,
      column: candidate.column,
      value: candidate.value,
      rawResult: data,
    });

    return {
      row: data,
      matchColumn: candidate.column,
      matchValue: candidate.value,
      table: PACIENTES_TABLE,
    };
  }

  return null;
}

let currentPacienteRequest: Promise<CurrentPacienteContext> | null = null;

async function resolveCurrentPaciente(): Promise<CurrentPacienteContext> {
  const user = await getAuthenticatedUser();
  const lookup = await findCurrentPacienteRecord(user);
  const record = lookup?.row || null;
  const metadata = isRecord(user?.user_metadata) ? user.user_metadata : null;
  const patientId = pickString(record, ["id"]);
  const clinicId = pickString(record, ["clinica_id"]);
  const recordPsychologistId = pickString(record, ["psicologo_id"]);
  const psychologistId = recordPsychologistId;
  const isLinked = Boolean(recordPsychologistId);

  logCurrentPacienteDebug("resolved", {
    authUserId: user?.id || null,
    resultadoBrutoBuscaEmPacientes: record,
    pacienteEncontrado: Boolean(record),
    patientLookupResult: record
      ? {
          id: pickString(record, ["id"]) || null,
          nome: pickString(record, ["nome", "name", "full_name"]) || null,
          psicologo_id: psychologistId || null,
          clinica_id: clinicId || null,
        }
      : null,
    psicologoIdEncontrado: psychologistId || null,
    clinicaIdEncontrada: clinicId || null,
    tabelaUsada: lookup?.table || PACIENTES_TABLE,
    matchColumn: lookup?.matchColumn || null,
    matchValue: lookup?.matchValue || null,
    isLinked,
  });

  return {
    user,
    record,
    patientId,
    clinicId,
    psychologistId,
    fullName:
      pickString(record, ["nome", "name", "full_name"]) ||
      pickString(metadata, ["full_name", "name"]) ||
      getFallbackName(user),
    email: normalizeEmail(user?.email) || pickString(record, ["email"]),
    isLinked,
  };
}

export async function getCurrentPaciente(): Promise<CurrentPacienteContext> {
  if (!currentPacienteRequest) {
    currentPacienteRequest = resolveCurrentPaciente().finally(() => {
      currentPacienteRequest = null;
    });
  }

  return currentPacienteRequest;
}

export const getCurrentPatientContext = getCurrentPaciente;
