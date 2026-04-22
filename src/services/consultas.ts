import { getPsychologistServiceScope } from "@/services/psychologistScope";
import {
  CONSULTA_RESPONSE_MIGRATION_MESSAGE,
  isConsultaResponseRpcMissingError,
} from "@/services/consultaResponseSchema";
import {
  buildAuthenticatedJsonRequestHeaders,
  readServerJsonResponse,
} from "@/services/serverApi";
import { supabase } from "../lib/supabase";

const ONE_HOUR_IN_MS = 60 * 60 * 1000;

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
  valor_consulta?: number | null;
  duracao_consulta_min?: number | null;
  local_presencial?: string | null;
};

type ConsultationMutationApiResponse = {
  success: true;
  consultation: Record<string, unknown> | null;
  email?: Record<string, unknown> | null;
};

async function resolveConsultaScope(input?: { clinica_id?: string | null; psicologo_id?: string | null }) {
  const scope = await getPsychologistServiceScope();

  return {
    clinicId: input?.clinica_id?.trim() || scope.clinicId,
    psychologistId: input?.psicologo_id?.trim() || scope.psychologistId,
  };
}

async function postConsultationMutation(
  pathname: string,
  payload: Record<string, unknown>,
  fallbackMessage: string,
) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: await buildAuthenticatedJsonRequestHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await readServerJsonResponse<ConsultationMutationApiResponse>(
    response,
    fallbackMessage,
  );

  return data.consultation;
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

export async function cadastrarConsulta(consulta: NovaConsulta) {
  const scope = await resolveConsultaScope({
    clinica_id: consulta.clinica_id,
    psicologo_id: consulta.psicologo_id,
  });
  const consultationModality = consulta.modalidade_consulta ?? consulta.modalidade ?? null;

  const { data, error } = await supabase
    .from("consultas")
    .insert([
      {
        clinica_id: scope.clinicId,
        psicologo_id: scope.psychologistId,
        paciente_id: consulta.paciente_id,
        data_consulta: consulta.data_consulta,
        status: consulta.status,
        observacoes: consulta.observacoes || null,
        modalidade_consulta: consultationModality,
        valor_consulta: consulta.valor_consulta ?? null,
        duracao_consulta_min: consulta.duracao_consulta_min ?? null,
        local_presencial: consulta.local_presencial ?? null,
      },
    ])
    .select();

  if (error) throw error;
  return data;
}

export async function listarConsultasDoDia(data: string, options?: { syncStatuses?: boolean }) {
  const inicio = `${data}T00:00:00`;
  const fim = `${data}T23:59:59`;
  const scope = await resolveConsultaScope();

  let query = supabase
    .from("consultas")
    .select(`
      *,
      pacientes (
        id,
        nome
      )
    `)
    .eq("psicologo_id", scope.psychologistId)
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
    .eq("psicologo_id", scope.psychologistId)
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
    .eq("psicologo_id", scope.psychologistId)
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
    .eq("psicologo_id", scope.psychologistId)
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
