import { supabase } from "@/lib/supabase";
import {
  getPsychologistConsultationSettingsById,
  normalizeAppointmentModality,
  type AppointmentModality,
} from "@/services/psychologistConsultationSettings";

const DEFAULT_PATIENT_NAME = "Paciente";
const DEFAULT_PSYCHOLOGIST_NAME = "Psicologo(a)";
const DEFAULT_MODALITY_LABEL = "A definir";

export const DEFAULT_MENSAGEM_LEMBRETE_CONSULTA_TEMPLATE =
  "Ola, {paciente}! Sua sessao com {psicologo} esta confirmada para {data} as {hora}. Modalidade: {modalidade}. {link_sessao}";

export const CONSULTA_LEMBRETE_VARIAVEIS = [
  "{paciente}",
  "{psicologo}",
  "{data}",
  "{hora}",
  "{modalidade}",
  "{link_sessao}",
  "{local_presencial}",
] as const;

export type ConsultaLembreteVariavel = (typeof CONSULTA_LEMBRETE_VARIAVEIS)[number];

export type BuildMensagemLembreteConsultaInput = {
  consulta: {
    paciente: string;
    dataConsulta: string | Date;
    modalidadeConsulta: AppointmentModality | string | null | undefined;
    localPresencial?: string | null;
  };
  psicologo: {
    nome: string;
    linkSessaoOnline?: string | null;
    mensagemLembreteSessao?: string | null;
    localPresencial?: string | null;
  };
};

export type ConsultaLembreteVariaveisResolvidas = Record<ConsultaLembreteVariavel, string>;

export type ConsultaLembretePreparado = {
  consultationId: string;
  patientId: string;
  psychologistId: string;
  patientName: string;
  psychologistName: string;
  appointmentDateTime: string;
  appointmentModality: AppointmentModality;
  modalityLabel: string;
  dateLabel: string;
  timeLabel: string;
  presentialLocation: string;
  onlineSessionLink: string;
  templateUsed: string;
  resolvedVariables: ConsultaLembreteVariaveisResolvidas;
  message: string;
};

type ConsultaReminderLookupRow = Record<string, unknown> & {
  pacientes?: { nome?: string | null } | Array<{ nome?: string | null }> | null;
};

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

function parseDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatReminderDate(value: string | Date) {
  const date = parseDate(value);
  if (!date) return "data informada";

  return date.toLocaleDateString("pt-BR");
}

function formatReminderTime(value: string | Date) {
  const date = parseDate(value);
  if (!date) return "--:--";

  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getReminderModalityLabel(value: AppointmentModality | null) {
  if (value === "presencial") return "Presencial";
  if (value === "online") return "Online";
  return DEFAULT_MODALITY_LABEL;
}

type CleanedReminderLine = {
  value: string;
  preserveEmpty: boolean;
};

function cleanupReminderLine(value: string) {
  const preserveEmpty = value.trim().length === 0;
  const normalizedLine = value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/(?:\s*[-:;|]\s*)$/g, "")
    .trim();

  if (
    /^(?:link(?: da sessao)?|sala online|local(?: presencial)?|endereco(?: presencial)?)$/i.test(
      normalizedLine,
    )
  ) {
    return { value: "", preserveEmpty };
  }

  return { value: normalizedLine, preserveEmpty };
}

function cleanupReminderMessage(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(cleanupReminderLine)
    .filter(
      (line, index, lines) =>
        line.value.length > 0 || (line.preserveEmpty && lines[index - 1]?.value.length > 0),
    )
    .map((line) => line.value)
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function applyReminderTemplate(
  template: string,
  variables: ConsultaLembreteVariaveisResolvidas,
) {
  let message = template;

  for (const variable of CONSULTA_LEMBRETE_VARIAVEIS) {
    message = message.split(variable).join(variables[variable] || "");
  }

  return cleanupReminderMessage(message);
}

function resolveReminderTemplate(value: string | null | undefined) {
  return value?.trim() || DEFAULT_MENSAGEM_LEMBRETE_CONSULTA_TEMPLATE;
}

export function resolveMensagemLembreteConsultaVariaveis(
  input: BuildMensagemLembreteConsultaInput,
): ConsultaLembreteVariaveisResolvidas {
  const patientName = input.consulta.paciente.trim() || DEFAULT_PATIENT_NAME;
  const psychologistName = input.psicologo.nome.trim() || DEFAULT_PSYCHOLOGIST_NAME;
  const appointmentModality = normalizeAppointmentModality(input.consulta.modalidadeConsulta);
  const isPresentialAppointment = appointmentModality === "presencial";
  const isOnlineAppointment = appointmentModality === "online";
  const presentialLocation = isPresentialAppointment
    ? input.consulta.localPresencial?.trim() || input.psicologo.localPresencial?.trim() || ""
    : "";
  const onlineSessionLink = isOnlineAppointment ? input.psicologo.linkSessaoOnline?.trim() || "" : "";

  return {
    "{paciente}": patientName,
    "{psicologo}": psychologistName,
    "{data}": formatReminderDate(input.consulta.dataConsulta),
    "{hora}": formatReminderTime(input.consulta.dataConsulta),
    "{modalidade}": getReminderModalityLabel(appointmentModality),
    "{link_sessao}": onlineSessionLink,
    "{local_presencial}": presentialLocation,
  };
}

export function buildMensagemLembreteConsulta(input: BuildMensagemLembreteConsultaInput) {
  const templateUsed = resolveReminderTemplate(input.psicologo.mensagemLembreteSessao);
  const resolvedVariables = resolveMensagemLembreteConsultaVariaveis(input);

  return applyReminderTemplate(templateUsed, resolvedVariables);
}

async function resolvePatientNameById(patientId: string) {
  const normalizedPatientId = patientId.trim();
  if (!normalizedPatientId) return "";

  const { data, error } = await supabase
    .from("pacientes")
    .select("nome")
    .eq("id", normalizedPatientId)
    .maybeSingle();

  if (error || !isRecord(data)) return "";

  return pickString(data, ["nome", "name", "full_name"]);
}

async function resolvePsychologistNameById(psychologistId: string) {
  const normalizedPsychologistId = psychologistId.trim();
  if (!normalizedPsychologistId) return "";

  for (const table of ["usuarios", "psicologos", "profiles"] as const) {
    for (const column of ["id", "auth_id", "user_id", "psicologo_id"] as const) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq(column, normalizedPsychologistId)
        .maybeSingle();

      if (error || !isRecord(data)) continue;

      const resolvedName = pickString(data, ["nome", "name", "full_name"]);
      if (resolvedName) return resolvedName;
    }
  }

  return "";
}

function pickNestedPatientName(row: ConsultaReminderLookupRow | null | undefined) {
  const pacientes = row?.pacientes;

  if (Array.isArray(pacientes)) {
    return pacientes[0]?.nome?.trim() || "";
  }

  if (pacientes && typeof pacientes.nome === "string" && pacientes.nome.trim()) {
    return pacientes.nome.trim();
  }

  return "";
}

function resolveAppointmentModalityFromSettings(
  rawModality: string | null | undefined,
  settings: Awaited<ReturnType<typeof getPsychologistConsultationSettingsById>>,
) {
  const directModality = normalizeAppointmentModality(rawModality);
  if (directModality) return directModality;

  if (settings.attendsPresential && !settings.attendsOnline) {
    return "presencial" as const;
  }

  if (settings.attendsOnline && !settings.attendsPresential) {
    return "online" as const;
  }

  return null;
}

export async function prepareConsultaLembreteById(
  consultationId: string,
): Promise<ConsultaLembretePreparado> {
  const normalizedConsultationId = consultationId.trim();

  if (!normalizedConsultationId) {
    throw new Error("Informe o id da consulta para montar o lembrete.");
  }

  const { data, error } = await supabase
    .from("consultas")
    .select(`
      id,
      paciente_id,
      psicologo_id,
      data_consulta,
      modalidade_consulta,
      local_presencial,
      pacientes (
        nome
      )
    `)
    .eq("id", normalizedConsultationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!isRecord(data)) {
    throw new Error("Nao foi possivel localizar a consulta informada.");
  }

  const consultationRow = data as ConsultaReminderLookupRow;
  const psychologistId = pickString(consultationRow, ["psicologo_id"]);
  const patientId = pickString(consultationRow, ["paciente_id"]);
  const appointmentDateTime = pickString(consultationRow, ["data_consulta"]);
  const patientNameFromRelation = pickNestedPatientName(consultationRow);

  const [consultationSettings, patientNameFromLookup, psychologistNameFromLookup] = await Promise.all([
    getPsychologistConsultationSettingsById(psychologistId),
    patientNameFromRelation ? Promise.resolve(patientNameFromRelation) : resolvePatientNameById(patientId),
    resolvePsychologistNameById(psychologistId),
  ]);

  const appointmentModality = resolveAppointmentModalityFromSettings(
    pickString(consultationRow, ["modalidade_consulta", "modalidade"]),
    consultationSettings,
  );

  if (!appointmentModality) {
    throw new Error("Nao foi possivel determinar a modalidade real da consulta para montar o lembrete.");
  }

  const patientName = patientNameFromLookup || DEFAULT_PATIENT_NAME;
  const psychologistName = psychologistNameFromLookup || DEFAULT_PSYCHOLOGIST_NAME;
  const reminderInput: BuildMensagemLembreteConsultaInput = {
    consulta: {
      paciente: patientName,
      dataConsulta: appointmentDateTime,
      modalidadeConsulta: appointmentModality,
      localPresencial: pickString(consultationRow, ["local_presencial"]) || consultationSettings.presentialLocation,
    },
    psicologo: {
      nome: psychologistName,
      linkSessaoOnline: consultationSettings.onlineSessionLink,
      mensagemLembreteSessao: consultationSettings.sessionReminderMessage,
      localPresencial: consultationSettings.presentialLocation,
    },
  };
  const templateUsed = resolveReminderTemplate(consultationSettings.sessionReminderMessage);
  const resolvedVariables = resolveMensagemLembreteConsultaVariaveis(reminderInput);

  return {
    consultationId: pickString(consultationRow, ["id"]) || normalizedConsultationId,
    patientId,
    psychologistId,
    patientName,
    psychologistName,
    appointmentDateTime,
    appointmentModality,
    modalityLabel: getReminderModalityLabel(appointmentModality),
    dateLabel: resolvedVariables["{data}"],
    timeLabel: resolvedVariables["{hora}"],
    presentialLocation: resolvedVariables["{local_presencial}"],
    onlineSessionLink: resolvedVariables["{link_sessao}"],
    templateUsed,
    resolvedVariables,
    message: applyReminderTemplate(templateUsed, resolvedVariables),
  };
}
