import { supabase } from "@/lib/supabase";
import { normalizePhoneDigits } from "@/services/auth";
import { getCurrentPaciente, type CurrentPacienteContext } from "@/services/currentPatient";
import { resolvePsychologistNameById } from "@/services/psychologistLookup";
import {
  AVATARS_BUCKET,
  resolveAvatarUrl,
} from "@/services/currentPsychologist";
import { normalizeCpfDigits } from "@/services/pacientes";

type PacienteProfileRow = Record<string, unknown>;
type LookupCandidate = {
  column: string;
  value: string;
};

export type PatientProfileData = {
  patient: CurrentPacienteContext;
  row: PacienteProfileRow | null;
  patientId: string;
  fullName: string;
  email: string;
  birthDate: string;
  cpf: string;
  clinicId: string;
  clinicName: string;
  psychologistId: string;
  psychologistName: string;
  phone: string;
  address: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  availableFields: {
    birthDate: boolean;
    cpf: boolean;
    phone: boolean;
    address: boolean;
  };
};

export type SavePatientProfileInput = {
  fullName: string;
  birthDate: string;
  cpf: string;
  phone: string;
  address: string;
};

export const patientProfileQueryKey = ["patient-profile"];

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function hasColumn(row: PacienteProfileRow | null, column: string) {
  return Boolean(row) && Object.prototype.hasOwnProperty.call(row, column);
}

function formatDateInputValue(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";

  const directDateMatch = trimmedValue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directDateMatch) return directDateMatch[1];

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) return "";

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchPatientProfileRow(patientId: string) {
  const { data, error } = await supabase
    .from("pacientes")
    .select("*")
    .eq("id", patientId)
    .maybeSingle();

  if (error) throw error;
  return (data as PacienteProfileRow | null) ?? null;
}

async function findRecordInTableByCandidates(
  table: string,
  candidates: LookupCandidate[],
) {
  for (const candidate of candidates) {
    if (!candidate.value) continue;

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(candidate.column, candidate.value)
      .maybeSingle();

    if (error || !data) continue;
    return data as Record<string, unknown>;
  }

  return null;
}

async function resolveClinicName(
  clinicId: string,
  metadata: Record<string, unknown>,
) {
  const metadataName = pickString(metadata, [
    "clinic_name",
    "clinicName",
    "nome_clinica",
    "nome_consultorio",
    "consultorio",
  ]);

  if (!clinicId) {
    return metadataName || "Nao informada";
  }

  const clinicRecord = await findRecordInTableByCandidates("clinicas", [
    { column: "id", value: clinicId },
    { column: "clinica_id", value: clinicId },
  ]);

  return (
    pickString(clinicRecord, [
      "nome",
      "name",
      "nome_clinica",
      "clinic_name",
      "clinicName",
      "nome_consultorio",
      "consultorio",
    ]) ||
    metadataName ||
    "Nao informada"
  );
}

async function resolvePsychologistName(
  psychologistId: string,
  metadata: Record<string, unknown>,
) {
  const metadataName = pickString(metadata, [
    "psychologist_name",
    "psychologistName",
    "psicologo_nome",
    "therapist_name",
    "professional_name",
  ]);

  if (!psychologistId) {
    return metadataName || "Nao informado";
  }

  return resolvePsychologistNameById(psychologistId, metadataName || "Nao informado");
}

function buildPatientProfilePayload(row: PacienteProfileRow, input: SavePatientProfileInput) {
  const payload: Record<string, unknown> = {};
  const trimmedName = input.fullName.trim();
  const normalizedCpf = input.cpf.trim() ? normalizeCpfDigits(input.cpf) : "";
  const normalizedPhone = input.phone.trim() ? normalizePhoneDigits(input.phone) : "";
  const normalizedAddress = input.address.trim();

  if ("nome" in row) payload.nome = trimmedName;
  if ("data_nascimento" in row) payload.data_nascimento = input.birthDate || null;
  if ("cpf" in row) payload.cpf = normalizedCpf || null;
  if ("telefone" in row) payload.telefone = normalizedPhone || null;
  if ("phone" in row) payload.phone = normalizedPhone || null;
  if ("celular" in row) payload.celular = normalizedPhone || null;
  if ("endereco" in row) payload.endereco = normalizedAddress || null;

  return payload;
}

function buildPatientAvatarPayload(row: PacienteProfileRow | null, filePath: string) {
  if (!row) return {};

  const payload: Record<string, unknown> = {};

  if ("avatar_url" in row) payload.avatar_url = filePath;
  if ("avatar" in row) payload.avatar = filePath;

  return payload;
}

async function mapPatientProfileData(
  patient: CurrentPacienteContext,
  row: PacienteProfileRow | null,
): Promise<PatientProfileData> {
  const metadata = (patient.user?.user_metadata || {}) as Record<string, unknown>;
  const patientId = pickString(row, ["id"]) || patient.patientId;
  const clinicId = pickString(row, ["clinica_id"]) || patient.clinicId;
  const psychologistId = pickString(row, ["psicologo_id"]) || patient.psychologistId;
  const clinicName = await resolveClinicName(clinicId, metadata);
  const psychologistName = await resolvePsychologistName(psychologistId, metadata);
  const avatarValue =
    pickString(metadata, ["avatar_url", "avatar"]) ||
    pickString(row, ["avatar_url", "avatar"]) ||
    null;

  return {
    patient,
    row,
    patientId,
    fullName: pickString(row, ["nome"]) || patient.fullName,
    email: patient.email,
    birthDate: formatDateInputValue(pickString(row, ["data_nascimento"])),
    cpf: pickString(row, ["cpf"]),
    clinicId,
    clinicName,
    psychologistId,
    psychologistName,
    phone: pickString(row, ["telefone", "phone", "celular"]),
    address: pickString(row, ["endereco"]),
    avatarPath: avatarValue && !/^https?:\/\//i.test(avatarValue) ? avatarValue : null,
    avatarUrl: resolveAvatarUrl(avatarValue),
    availableFields: {
      birthDate: hasColumn(row, "data_nascimento"),
      cpf: hasColumn(row, "cpf"),
      phone: ["telefone", "phone", "celular"].some((column) => hasColumn(row, column)),
      address: hasColumn(row, "endereco"),
    },
  };
}

export async function fetchCurrentPatientProfile(): Promise<PatientProfileData> {
  const patient = await getCurrentPaciente();

  if (!patient.user) {
    throw new Error("Nao foi possivel localizar uma sessao autenticada.");
  }

  if (!patient.patientId) {
    return mapPatientProfileData(patient, null);
  }

  const row = await fetchPatientProfileRow(patient.patientId);
  return mapPatientProfileData(patient, row);
}

export async function saveCurrentPatientProfile(
  input: SavePatientProfileInput,
): Promise<PatientProfileData> {
  const profile = await fetchCurrentPatientProfile();

  if (!profile.patient.user) {
    throw new Error("Nao foi possivel salvar seu perfil sem uma sessao autenticada.");
  }

  if (!profile.row || !profile.patientId) {
    throw new Error("Nao foi possivel localizar seu cadastro em pacientes.");
  }

  const trimmedName = input.fullName.trim();
  const normalizedCpf = input.cpf.trim() ? normalizeCpfDigits(input.cpf) : "";
  const normalizedPhone = input.phone.trim() ? normalizePhoneDigits(input.phone) : "";

  if (!trimmedName) {
    throw new Error("Informe seu nome completo.");
  }

  if (normalizedCpf && normalizedCpf.length !== 11) {
    throw new Error("Informe um CPF valido.");
  }

  if (profile.availableFields.phone && normalizedPhone && ![10, 11].includes(normalizedPhone.length)) {
    throw new Error("Informe um telefone valido.");
  }

  const payload = buildPatientProfilePayload(profile.row, input);

  const { data, error } = await supabase
    .from("pacientes")
    .update(payload)
    .eq("id", profile.patientId)
    .select("*")
    .maybeSingle();

  if (error) throw error;

  const { error: authError } = await supabase.auth.updateUser({
    data: {
      ...(profile.patient.user.user_metadata || {}),
      full_name: trimmedName,
      name: trimmedName,
      cpf: normalizedCpf || null,
      telefone: normalizedPhone || null,
      phone: normalizedPhone || null,
    },
  });

  if (authError) {
    console.warn("[Psivinculo][patient-profile][auth-sync-warning]", authError);
  }

  const refreshedPatient = await getCurrentPaciente();
  return mapPatientProfileData(refreshedPatient, (data as PacienteProfileRow | null) ?? profile.row);
}

export async function uploadCurrentPatientAvatar(file: File): Promise<PatientProfileData> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem valido.");
  }

  const profile = await fetchCurrentPatientProfile();

  if (!profile.patient.user) {
    throw new Error("Nao foi possivel enviar sua foto sem uma sessao autenticada.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileOwnerId = profile.patientId || profile.patient.user.id;
  const fileClinicId = profile.clinicId || "pacientes";
  const filePath = `${fileClinicId}/${fileOwnerId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(filePath, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (uploadError) throw uploadError;

  const avatarPayload = buildPatientAvatarPayload(profile.row, filePath);

  if (Object.keys(avatarPayload).length > 0 && profile.patientId) {
    const { error: rowError } = await supabase
      .from("pacientes")
      .update(avatarPayload)
      .eq("id", profile.patientId);

    if (rowError) throw rowError;
  }

  const { error: authError } = await supabase.auth.updateUser({
    data: {
      ...(profile.patient.user.user_metadata || {}),
      avatar_url: filePath,
      avatar: filePath,
    },
  });

  if (authError) throw authError;

  return fetchCurrentPatientProfile();
}
