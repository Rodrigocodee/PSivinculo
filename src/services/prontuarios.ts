import { getPsychologistServiceScope } from "@/services/psychologistScope";
import { supabase } from "../lib/supabase";
export const PRONTUARIOS_BUCKET = "prontuarios-anexos";

export type NovoProntuario = {
  paciente_id: string;
  data_sessao: string;
  anotacoes: string;
  numero_sessao?: number | null;
  anexos_url?: string | null;
};

type ProntuarioRow = Record<string, unknown> & {
  id?: string;
  clinica_id?: string;
  paciente_id?: string;
  data_sessao?: string;
  numero_sessao?: number | string | null;
  anexos_url?: unknown;
  anexos?: unknown;
};

export type Prontuario = {
  id: string;
  clinica_id: string;
  paciente_id: string;
  data_sessao: string;
  numero_sessao: number | null;
  anotacoes: string;
  anexos: string[];
};

function getStringValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function getNumberValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return null;
}

function getAttachments(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  return [];
}

function normalizeProntuario(row: ProntuarioRow): Prontuario {
  return {
    id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
    clinica_id: typeof row.clinica_id === "string" ? row.clinica_id : "",
    paciente_id: typeof row.paciente_id === "string" ? row.paciente_id : "",
    data_sessao: typeof row.data_sessao === "string" ? row.data_sessao : "",
    numero_sessao: getNumberValue(row, ["numero_sessao", "session_number", "sessao_numero"]),
    anotacoes: getStringValue(row, ["anotacoes", "conteudo", "evolucao", "anotacao", "observacoes"]),
    anexos: getAttachments(row.anexos_url).length > 0 ? getAttachments(row.anexos_url) : getAttachments(row.anexos),
  };
}

export async function listarProntuariosPorPaciente(pacienteId: string) {
  const scope = await getPsychologistServiceScope();
  let query = supabase
    .from("prontuarios")
    .select("*")
    .eq("psicologo_id", scope.psychologistId)
    .eq("paciente_id", pacienteId)
    .order("data_sessao", { ascending: false });

  if (scope.clinicId) {
    query = query.eq("clinica_id", scope.clinicId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return ((data ?? []) as ProntuarioRow[]).map(normalizeProntuario);
}

export async function cadastrarProntuario(prontuario: NovoProntuario) {
  const scope = await getPsychologistServiceScope();
  const { data, error } = await supabase
    .from("prontuarios")
    .insert([
      {
        clinica_id: scope.clinicId,
        psicologo_id: scope.psychologistId,
        paciente_id: prontuario.paciente_id,
        data_sessao: prontuario.data_sessao,
        numero_sessao: prontuario.numero_sessao ?? null,
        anotacoes: prontuario.anotacoes,
        anexos_url: prontuario.anexos_url ?? null,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return normalizeProntuario(data as ProntuarioRow);
}

export async function uploadAnexoProntuario(file: File, pacienteId: string) {
  const scope = await getPsychologistServiceScope();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${scope.clinicId || "clinica"}/${pacienteId}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from(PRONTUARIOS_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  return {
    bucket: PRONTUARIOS_BUCKET,
    path: filePath,
    fileName: file.name,
  };
}
