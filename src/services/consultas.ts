import { getPsychologistServiceScope } from "@/services/psychologistScope";
import {
  CONSULTA_RESPONSE_MIGRATION_MESSAGE,
  isConsultaResponseRpcMissingError,
} from "@/services/consultaResponseSchema";
import {
  buildAuthenticatedJsonRequestHeaders,
  buildServerApiUrl,
  readServerJsonResponse,
} from "@/services/serverApi";
import { assertProfessionalAccessFromScope } from "@/services/professionalAccessGuard";
import {
  getCurrentPsychologistConsultationSettings,
  getPsychologistConsultationSettingsById,
} from "@/services/psychologistConsultationSettings";
import {
  getPsychologistAvailabilityById,
  validateAppointmentAvailability,
} from "@/services/psychologistAvailability";
import { supabase } from "../lib/supabase";

const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const PSYCHOLOGIST_DAY_APPOINTMENTS_SELECT = `
  id,
  paciente_id,
  data_consulta,
  data_consulta_solicitada_original,
  respondida_em,
  status,
  observacoes,
  modalidade_consulta,
  valor_consulta,
  duracao_consulta_min,
  local_presencial,
  status_pagamento,
  asaas_invoice_url,
  asaas_bank_slip_url,
  pacientes (
    id,
    nome
  )
`;

export type ConsultaStatus =
  | "solicitada"
  | "pendente"
  | "confirmada"
  | "cancelada"
  | "recusada"
  | "contraproposta"
  | "realizada"
  | "faltou"
  | "reagendada";

export type RespostaSolicitacaoConsultaAcao =
  | "confirmar"
  | "recusar"
  | "sugerir_outro_horario";

export type NovaConsulta = {
  paciente_id: string;
  data_consulta: string;
  status: ConsultaStatus;
  observacoes?: string | null;
  modalidade?: "presencial" | "online" | null;
  modalidade_consulta?: "presencial" | "online" | null;
  psicologo_id?: string | null;
  clinica_id?: string | null;
  valor_consulta?: number | string | null;
  duracao_consulta_min?: number | null;
  local_presencial?: string | null;
};

type ConsultationMutationApiResponse = {
  success: true;
  consultation: Record<string, unknown> | null;
  email?: Record<string, unknown> | null;
  payment?: ConsultationPaymentResult | null;
};

export type ConsultationPaymentResult = {
  consultationId: string;
  paymentMode: "external" | "asaas_split";
  paymentStatus: string | null;
  created: boolean;
  reusedExisting: boolean;
  success: boolean;
  asaasPaymentId: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  billingType: string | null;
  externalReference: string | null;
  splitSent: boolean;
  walletIdMasked: string | null;
  payoutPercentage: number | null;
  message: string | null;
  errorCode: string | null;
};

export type ConsultationMutationResult = {
  consultation: Record<string, unknown> | null;
  email: Record<string, unknown> | null;
  payment: ConsultationPaymentResult | null;
};

async function resolveConsultaScope(input?: { clinica_id?: string | null; psicologo_id?: string | null }) {
  const scope = await getPsychologistServiceScope();

  return {
    clinicId: input?.clinica_id?.trim() || scope.clinicId,
    psychologistId: input?.psicologo_id?.trim() || scope.psychologistId,
    psychologistIds: input?.psicologo_id?.trim()
      ? [input.psicologo_id.trim()]
      : scope.psychologistIds,
    hasProfessionalAccess: scope.hasProfessionalAccess,
  };
}

function normalizeConsultationValueInput(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  let parsedValue = Number(normalizedValue);

  if (!Number.isFinite(parsedValue) && /^\d{1,3}(\.\d{3})*,\d+$/.test(normalizedValue)) {
    parsedValue = Number(normalizedValue.replace(/\./g, "").replace(",", "."));
  }

  if (!Number.isFinite(parsedValue) && /^\d+,\d+$/.test(normalizedValue)) {
    parsedValue = Number(normalizedValue.replace(",", "."));
  }

  return Number.isFinite(parsedValue) ? Number(parsedValue.toFixed(2)) : null;
}

function logConsultationValueDebug(payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info("[Psivinculo][valor-consulta]", payload);
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeLabel(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

async function listConsultationsForAvailabilityValidation(input: {
  dateKey: string;
  clinicId: string | null;
  psychologistIds: string[];
}) {
  const rangeStart = `${input.dateKey}T00:00:00`;
  const rangeEnd = `${input.dateKey}T23:59:59`;

  let query = supabase
    .from("consultas")
    .select("id, data_consulta, status, duracao_consulta_min, psicologo_id")
    .in("psicologo_id", input.psychologistIds)
    .gte("data_consulta", rangeStart)
    .lte("data_consulta", rangeEnd);

  if (input.clinicId) {
    query = query.eq("clinica_id", input.clinicId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as Array<Record<string, unknown>>;
}

async function resolveConsultationDurationForInsert(
  consulta: NovaConsulta,
  scope: { psychologistId: string | null },
) {
  if (
    typeof consulta.duracao_consulta_min === "number" &&
    Number.isFinite(consulta.duracao_consulta_min) &&
    consulta.duracao_consulta_min > 0
  ) {
    return Math.round(consulta.duracao_consulta_min);
  }

  const responsiblePsychologistId =
    scope.psychologistId?.trim() || consulta.psicologo_id?.trim() || "";

  if (responsiblePsychologistId) {
    const availability = await getPsychologistAvailabilityById(responsiblePsychologistId);
    return availability.consultationDurationMinutes;
  }

  const settings = await getCurrentPsychologistConsultationSettings();
  return settings.consultationDurationMinutes;
}

async function validateConsultationAvailabilityBeforeInsert(
  consulta: NovaConsulta,
  scope: { clinicId: string | null; psychologistId: string | null; psychologistIds: string[] },
  durationMinutes: number,
) {
  const parsedDateTime = new Date(consulta.data_consulta);

  if (Number.isNaN(parsedDateTime.getTime())) {
    throw new Error("Informe uma data e um horario validos.");
  }

  const dateKey = formatDateKey(parsedDateTime);
  const time = formatTimeLabel(parsedDateTime);
  const responsiblePsychologistId =
    scope.psychologistId?.trim() || consulta.psicologo_id?.trim() || "";
  const availability = await getPsychologistAvailabilityById(responsiblePsychologistId);
  const existingAppointments = await listConsultationsForAvailabilityValidation({
    dateKey,
    clinicId: scope.clinicId,
    psychologistIds: scope.psychologistIds,
  });
  const validation = validateAppointmentAvailability({
    dateKey,
    time,
    schedule: availability.schedule,
    consultationDurationMinutes: durationMinutes,
    existingAppointments: existingAppointments.map((appointment) => ({
      id: typeof appointment.id === "string" ? appointment.id : null,
      data_consulta: typeof appointment.data_consulta === "string" ? appointment.data_consulta : null,
      status: typeof appointment.status === "string" ? appointment.status : null,
      duracao_consulta_min:
        typeof appointment.duracao_consulta_min === "number"
          ? appointment.duracao_consulta_min
          : null,
    })),
  });

  if (!validation.ok) {
    throw new Error(validation.message);
  }
}

async function postConsultationMutation(
  pathname: string,
  payload: Record<string, unknown>,
  fallbackMessage: string,
): Promise<ConsultationMutationResult> {
  const response = await fetch(buildServerApiUrl(pathname), {
    method: "POST",
    headers: await buildAuthenticatedJsonRequestHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await readServerJsonResponse<ConsultationMutationApiResponse>(
    response,
    fallbackMessage,
  );

  return {
    consultation: data.consultation,
    email: data.email ?? null,
    payment: data.payment ?? null,
  };
}

function getExpiredPendingConsultasIds(consultas: Array<Record<string, unknown>>) {
  const now = Date.now();

  return consultas
    .filter((consulta) => consulta.status === "pendente")
    .filter((consulta) => {
      const rawDate = typeof consulta.data_consulta === "string" ? consulta.data_consulta : "";
      const appointmentTime = new Date(rawDate).getTime();

      if (Number.isNaN(appointmentTime)) return false;
      return appointmentTime + ONE_HOUR_IN_MS <= now;
    })
    .map((consulta) => consulta.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function resolveConsultationValueForInsert(
  consulta: NovaConsulta,
  scope: { psychologistId: string | null },
) {
  const explicitValue = normalizeConsultationValueInput(consulta.valor_consulta);

  if (explicitValue !== null) {
    return {
      userConfiguredValue: null,
      finalValue: explicitValue,
    };
  }

  const responsiblePsychologistId =
    scope.psychologistId?.trim() || consulta.psicologo_id?.trim() || "";
  let userConfiguredValue: number | null = null;

  if (responsiblePsychologistId) {
    try {
      const settings = await getPsychologistConsultationSettingsById(responsiblePsychologistId);
      if (typeof settings.consultationPrice === "number") {
        userConfiguredValue = Number(settings.consultationPrice.toFixed(2));
      }
    } catch {
      userConfiguredValue = null;
    }
  }

  if (userConfiguredValue === null) {
    try {
      const settings = await getCurrentPsychologistConsultationSettings();
      if (typeof settings.consultationPrice === "number") {
        userConfiguredValue = Number(settings.consultationPrice.toFixed(2));
      }
    } catch {
      userConfiguredValue = null;
    }
  }

  return {
    userConfiguredValue,
    finalValue: userConfiguredValue,
  };
}

export async function cadastrarConsulta(consulta: NovaConsulta) {
  const scope = await resolveConsultaScope({
    clinica_id: consulta.clinica_id,
    psicologo_id: consulta.psicologo_id,
  });
  assertProfessionalAccessFromScope(scope);
  const consultationModality = consulta.modalidade_consulta ?? consulta.modalidade ?? null;
  const consultationDurationMinutes = await resolveConsultationDurationForInsert(consulta, {
    psychologistId: scope.psychologistId,
  });
  const consultationValueResolution = await resolveConsultationValueForInsert(consulta, {
    psychologistId: scope.psychologistId,
  });
  const consultationValue = consultationValueResolution.finalValue;

  await validateConsultationAvailabilityBeforeInsert(
    consulta,
    scope,
    consultationDurationMinutes,
  );

  const result = await postConsultationMutation(
    "/api/consultas/create",
    {
      consulta: {
        clinica_id: scope.clinicId,
        psicologo_id: scope.psychologistId,
        paciente_id: consulta.paciente_id,
        data_consulta: consulta.data_consulta,
        status: consulta.status,
        observacoes: consulta.observacoes || null,
        modalidade_consulta: consultationModality,
        valor_consulta: consultationValue,
        duracao_consulta_min: consultationDurationMinutes,
        local_presencial: consulta.local_presencial ?? null,
      },
    },
    "Nao foi possivel cadastrar a consulta.",
  );
  const data = result.consultation ? [result.consultation] : [];

  logConsultationValueDebug({
    origem: "criacao",
    consultaId:
      Array.isArray(data) && data[0] && typeof data[0].id === "string" ? data[0].id : null,
    psicologoId: scope.psychologistId,
    valorConsultaNaConsulta: consulta.valor_consulta ?? null,
    valorConsultaNoUsuario: consultationValueResolution.userConfiguredValue,
    valorFinalUsado: consultationValue,
  });

  return data;
}

export async function listarConsultasDoDia(data: string, options?: { syncStatuses?: boolean }) {
  const inicio = `${data}T00:00:00`;
  const fim = `${data}T23:59:59`;
  const scope = await resolveConsultaScope();

  let query = supabase
    .from("consultas")
    .select(PSYCHOLOGIST_DAY_APPOINTMENTS_SELECT)
    .in("psicologo_id", scope.psychologistIds)
    .gte("data_consulta", inicio)
    .lte("data_consulta", fim)
    .order("data_consulta", { ascending: true });

  if (scope.clinicId) {
    query = query.eq("clinica_id", scope.clinicId);
  }

  const { data: consultas, error } = await query;

  if (error) throw error;

  const normalizedConsultas = (consultas ?? []) as Array<Record<string, unknown>>;
  const expiredPendingIds = getExpiredPendingConsultasIds(normalizedConsultas);

  if (expiredPendingIds.length === 0 || options?.syncStatuses === false) {
    return normalizedConsultas;
  }

  let updateQuery = supabase
    .from("consultas")
    .update({ status: "faltou" })
    .in("id", expiredPendingIds)
    .in("psicologo_id", scope.psychologistIds)
    .eq("status", "pendente");

  if (scope.clinicId) {
    updateQuery = updateQuery.eq("clinica_id", scope.clinicId);
  }

  const { error: updateError } = await updateQuery;

  if (updateError) throw updateError;

  return normalizedConsultas.map((consulta) =>
    expiredPendingIds.includes(String(consulta.id))
      ? { ...consulta, status: "faltou" }
      : consulta,
  );
}

export async function atualizarConsulta(id: string, consulta: Partial<NovaConsulta>) {
  const scope = await resolveConsultaScope({
    clinica_id: consulta.clinica_id,
    psicologo_id: consulta.psicologo_id,
  });
  assertProfessionalAccessFromScope(scope);
  const payload: Record<string, unknown> = {};
  const consultationModality =
    consulta.modalidade_consulta !== undefined ? consulta.modalidade_consulta : consulta.modalidade;

  if (consulta.paciente_id !== undefined) payload.paciente_id = consulta.paciente_id;
  if (consulta.data_consulta !== undefined) payload.data_consulta = consulta.data_consulta;
  if (consulta.status !== undefined) payload.status = consulta.status;
  if (consulta.observacoes !== undefined) payload.observacoes = consulta.observacoes;
  if (consultationModality !== undefined) payload.modalidade_consulta = consultationModality;
  if (consulta.psicologo_id !== undefined) payload.psicologo_id = consulta.psicologo_id;
  if (consulta.clinica_id !== undefined) payload.clinica_id = consulta.clinica_id;
  if (consulta.valor_consulta !== undefined) payload.valor_consulta = consulta.valor_consulta;
  if (consulta.duracao_consulta_min !== undefined) {
    payload.duracao_consulta_min = consulta.duracao_consulta_min;
  }
  if (consulta.local_presencial !== undefined) payload.local_presencial = consulta.local_presencial;

  return postConsultationMutation(
    "/api/consultas/update",
    {
      consultaId: id,
      updates: payload,
    },
    "Nao foi possivel atualizar a consulta.",
  );
}

export async function responderSolicitacaoConsulta(input: {
  consultaId: string;
  acao: RespostaSolicitacaoConsultaAcao;
  novaDataConsulta?: string | null;
}) {
  const scope = await resolveConsultaScope();
  assertProfessionalAccessFromScope(scope);

  try {
    return await postConsultationMutation(
      "/api/consultas/respond-request",
      {
        consultaId: input.consultaId,
        acao: input.acao,
        novaDataConsulta: input.novaDataConsulta ?? null,
      },
      "Nao foi possivel responder a solicitacao da consulta agora.",
    );
  } catch (error) {
    if (isConsultaResponseRpcMissingError(error)) {
      throw new Error(CONSULTA_RESPONSE_MIGRATION_MESSAGE);
    }

    throw error;
  }
}

export async function listarConsultasPacientes() {
  const scope = await resolveConsultaScope();

  let query = supabase
    .from("consultas")
    .select("id, paciente_id, data_consulta, status")
    .in("psicologo_id", scope.psychologistIds)
    .neq("status", "cancelada")
    .order("data_consulta", { ascending: true });

  if (scope.clinicId) {
    query = query.eq("clinica_id", scope.clinicId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

export async function listarConsultasPorPaciente(pacienteId: string) {
  const scope = await resolveConsultaScope();

  let query = supabase
    .from("consultas")
    .select("id, paciente_id, data_consulta, status, observacoes, modalidade_consulta, valor_consulta, duracao_consulta_min, local_presencial")
    .in("psicologo_id", scope.psychologistIds)
    .eq("paciente_id", pacienteId)
    .neq("status", "cancelada")
    .order("data_consulta", { ascending: true });

  if (scope.clinicId) {
    query = query.eq("clinica_id", scope.clinicId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}
