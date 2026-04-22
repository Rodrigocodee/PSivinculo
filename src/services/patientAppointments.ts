import { getCurrentPaciente, type CurrentPacienteContext } from "@/services/currentPatient";
import { supabase } from "@/lib/supabase";
import {
  CONSULTA_RESPONSE_MIGRATION_MESSAGE,
  isConsultaResponseRpcMissingError,
  isConsultaResponseSchemaMissingError,
} from "@/services/consultaResponseSchema";
import {
  buildAuthenticatedJsonRequestHeaders,
  readServerJsonResponse,
} from "@/services/serverApi";
import { resolvePsychologistNameById } from "@/services/psychologistLookup";
import {
  getPsychologistConsultationSettingsById,
  normalizeAppointmentModality,
  type AppointmentModality,
  type CurrentPsychologistConsultationSettings,
} from "@/services/psychologistConsultationSettings";

type ConsultaRow = Record<string, unknown>;
type ConsultationMutationApiResponse = {
  success: true;
  consultation: Record<string, unknown> | null;
  email?: Record<string, unknown> | null;
};

const PATIENT_APPOINTMENT_SELECT_BASE =
  "id, paciente_id, psicologo_id, data_consulta, status, observacoes, modalidade_consulta, valor_consulta, duracao_consulta_min, local_presencial";
const PATIENT_APPOINTMENT_SELECT_WITH_RESPONSE =
  "id, paciente_id, psicologo_id, data_consulta, data_consulta_solicitada_original, respondida_em, ultima_resposta_por, status, observacoes, modalidade_consulta, valor_consulta, duracao_consulta_min, local_presencial";
const PATIENT_APPOINTMENT_INSERT_SELECT_BASE =
  "id, paciente_id, psicologo_id, clinica_id, data_consulta, status, observacoes, modalidade_consulta, valor_consulta, duracao_consulta_min, local_presencial, created_at";
const PATIENT_APPOINTMENT_INSERT_SELECT_WITH_RESPONSE =
  "id, paciente_id, psicologo_id, clinica_id, data_consulta, data_consulta_solicitada_original, respondida_em, status, observacoes, modalidade_consulta, valor_consulta, duracao_consulta_min, local_presencial, created_at";

export const patientAppointmentsQueryKey = ["patient-appointments"];

export type PatientAppointment = {
  id: string;
  dateTime: string | null;
  requestedDateTimeOriginal: string | null;
  respondedAt: string | null;
  lastResponseBy: "psicologo" | "paciente" | null;
  status: string;
  sessionType: AppointmentModality | null;
  psychologistName: string;
  notes: string | null;
  consultationPrice: number | null;
  consultationDurationMinutes: number | null;
  presentialLocation: string | null;
  isUpcoming: boolean;
};

export type PatientAppointmentsData = {
  patient: CurrentPacienteContext;
  appointments: PatientAppointment[];
  hasLinkedPatientRecord: boolean;
  canRequestAppointment: boolean;
  consultationSettings: CurrentPsychologistConsultationSettings | null;
};

export type PatientAppointmentRequestInput = {
  requestedDate: string;
  requestedTime: string;
  notes?: string;
  modality?: AppointmentModality | null;
};

export type PatientCounterproposalResponseAction = "aceitar" | "recusar";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toError(value: unknown, fallbackMessage: string) {
  if (value instanceof Error) return value;

  if (isRecord(value) && typeof value.message === "string" && value.message.trim()) {
    return new Error(value.message.trim());
  }

  return new Error(fallbackMessage);
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function parseValidDate(value: string | null | undefined) {
  if (!value) return null;

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normalizeOptionalScopeId(value: string | null | undefined) {
  const normalizedValue = value?.trim() || "";
  return normalizedValue || null;
}

function buildAppointmentDateTime(requestedDate: string, requestedTime: string) {
  const normalizedTime = requestedTime.length === 5 ? `${requestedTime}:00` : requestedTime;
  return `${requestedDate}T${normalizedTime}`;
}

function logPatientAppointmentDebug(label: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[Psivinculo][patient-appointments][${label}]`, payload);
}

function sortAppointments(rows: ConsultaRow[]) {
  const now = Date.now();

  return rows.slice().sort((left, right) => {
    const leftDate = parseValidDate(pickString(left, ["data_consulta"]));
    const rightDate = parseValidDate(pickString(right, ["data_consulta"]));
    const leftTime = leftDate?.getTime() ?? 0;
    const rightTime = rightDate?.getTime() ?? 0;
    const leftIsUpcoming = leftTime >= now;
    const rightIsUpcoming = rightTime >= now;

    if (leftIsUpcoming !== rightIsUpcoming) {
      return leftIsUpcoming ? -1 : 1;
    }

    if (leftIsUpcoming) {
      return leftTime - rightTime;
    }

    return rightTime - leftTime;
  });
}

function mapAppointment(consulta: ConsultaRow, psychologistName: string): PatientAppointment {
  const dateTime = pickString(consulta, ["data_consulta"]) || null;
  const requestedDateTimeOriginal =
    pickString(consulta, ["data_consulta_solicitada_original"]) || dateTime;
  const respondedAt = pickString(consulta, ["respondida_em"]) || null;
  const lastResponseByRaw = pickString(consulta, ["ultima_resposta_por"]).toLowerCase();
  const parsedDate = parseValidDate(dateTime);
  const consultationPriceRaw = consulta.valor_consulta;
  const consultationDurationRaw = consulta.duracao_consulta_min;

  return {
    id: pickString(consulta, ["id"]) || crypto.randomUUID(),
    dateTime,
    requestedDateTimeOriginal,
    respondedAt,
    lastResponseBy:
      lastResponseByRaw === "psicologo" || lastResponseByRaw === "paciente"
        ? lastResponseByRaw
        : null,
    status: pickString(consulta, ["status"]) || "",
    sessionType: normalizeAppointmentModality(
      pickString(consulta, ["modalidade_consulta", "modalidade", "tipo_atendimento", "session_type", "tipo_sessao"]),
    ),
    psychologistName,
    notes: pickString(consulta, ["observacoes"]) || null,
    consultationPrice:
      typeof consultationPriceRaw === "number"
        ? consultationPriceRaw
        : typeof consultationPriceRaw === "string" && consultationPriceRaw.trim()
          ? Number(consultationPriceRaw)
          : null,
    consultationDurationMinutes:
      typeof consultationDurationRaw === "number"
        ? consultationDurationRaw
        : typeof consultationDurationRaw === "string" && consultationDurationRaw.trim()
          ? Number(consultationDurationRaw)
          : null,
    presentialLocation: pickString(consulta, ["local_presencial"]) || null,
    isUpcoming: (parsedDate?.getTime() ?? 0) >= Date.now(),
  };
}

export async function fetchPatientAppointmentsData(): Promise<PatientAppointmentsData> {
  const patient = await getCurrentPaciente();
  const linkedPsychologistId = normalizeOptionalScopeId(patient.psychologistId);

  if (!patient.user) {
    throw new Error("Nao foi possivel localizar uma sessao autenticada.");
  }

  if (!patient.patientId) {
    return {
      patient,
      appointments: [],
      hasLinkedPatientRecord: patient.isLinked,
      canRequestAppointment: patient.isLinked,
      consultationSettings: null,
    };
  }

  const consultationSettings = linkedPsychologistId
    ? await getPsychologistConsultationSettingsById(linkedPsychologistId)
    : null;

  let { data, error } = await supabase
    .from("consultas")
    .select(PATIENT_APPOINTMENT_SELECT_WITH_RESPONSE)
    .eq("paciente_id", patient.patientId)
    .order("data_consulta", { ascending: true });

  if (error && isConsultaResponseSchemaMissingError(error)) {
    const fallbackResult = await supabase
      .from("consultas")
      .select(PATIENT_APPOINTMENT_SELECT_BASE)
      .eq("paciente_id", patient.patientId)
      .order("data_consulta", { ascending: true });

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    console.error("[Psivinculo][patient-appointments][fetch_error]", {
      error,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      patientId: patient.patientId,
    });
    throw error;
  }

  const appointmentRows = (data ?? []) as ConsultaRow[];

  const psychologistIds = new Set<string>(
    [patient.psychologistId]
      .concat(appointmentRows.map((consulta) => pickString(consulta, ["psicologo_id"])))
      .filter(Boolean),
  );

  const fallbackPsychologistName = pickString(
    (patient.user.user_metadata || {}) as Record<string, unknown>,
    ["psychologist_name"],
  );

  const psychologistNameById = new Map<string, string>();

  await Promise.all(
    Array.from(psychologistIds).map(async (psychologistId) => {
      const psychologistName = await resolvePsychologistNameById(psychologistId, fallbackPsychologistName);
      psychologistNameById.set(psychologistId, psychologistName);
    }),
  );

  return {
    patient,
    appointments: sortAppointments(appointmentRows).map((consulta) =>
      mapAppointment(
        consulta,
        psychologistNameById.get(pickString(consulta, ["psicologo_id"])) || fallbackPsychologistName || "Psicologo(a)",
      ),
    ),
    hasLinkedPatientRecord: patient.isLinked,
    canRequestAppointment: Boolean(patient.isLinked && linkedPsychologistId),
    consultationSettings,
  };
}

export async function requestPatientAppointment(input: PatientAppointmentRequestInput) {
  const patient = await getCurrentPaciente();
  const linkedPsychologistId = normalizeOptionalScopeId(patient.psychologistId);
  const linkedClinicId = normalizeOptionalScopeId(patient.clinicId);

  if (!patient.user) {
    throw new Error("Sua sessao expirou. Entre novamente para solicitar um horario.");
  }

  if (!patient.isLinked) {
    throw new Error("Sua conta ainda nao esta vinculada a um psicologo.");
  }

  if (!patient.patientId) {
    throw new Error("Nao foi possivel localizar seu cadastro de paciente.");
  }

  if (!linkedPsychologistId) {
    throw new Error("Nao foi possivel localizar o psicologo vinculado ao seu cadastro.");
  }

  const requestedDate = input.requestedDate.trim();
  const requestedTime = input.requestedTime.trim();
  const notes = input.notes?.trim() || "";
  const requestedModality = normalizeAppointmentModality(input.modality);

  if (!requestedDate) {
    throw new Error("Escolha uma data desejada.");
  }

  if (!requestedTime) {
    throw new Error("Escolha um horario desejado.");
  }

  const dataConsulta = buildAppointmentDateTime(requestedDate, requestedTime);
  const requestedDateTime = new Date(dataConsulta);

  if (Number.isNaN(requestedDateTime.getTime())) {
    throw new Error("Informe uma data e um horario validos.");
  }

  if (requestedDateTime.getTime() <= Date.now()) {
    throw new Error("Escolha um horario futuro para enviar a solicitacao.");
  }

  const consultationSettings = linkedPsychologistId
    ? await getPsychologistConsultationSettingsById(linkedPsychologistId)
    : null;
  const allowsPresential = consultationSettings?.attendsPresential ?? true;
  const allowsOnline = consultationSettings?.attendsOnline ?? true;
  const consultationPrice =
    typeof consultationSettings?.consultationPrice === "number"
      ? Number(consultationSettings.consultationPrice.toFixed(2))
      : null;
  const consultationDurationMinutes = consultationSettings?.consultationDurationMinutes ?? null;
  let resolvedModality: AppointmentModality | null = null;

  if (allowsPresential && allowsOnline) {
    if (!requestedModality) {
      throw new Error("Escolha se o atendimento sera presencial ou online.");
    }

    resolvedModality = requestedModality;
  } else if (allowsPresential) {
    resolvedModality = "presencial";
  } else if (allowsOnline) {
    resolvedModality = "online";
  }

  if (!resolvedModality) {
    throw new Error("Este psicologo ainda nao possui uma modalidade de atendimento disponivel.");
  }

  const presentialLocation =
    resolvedModality === "presencial" ? consultationSettings?.presentialLocation?.trim() || null : null;

  logPatientAppointmentDebug("submit_started", {
    patientId: patient.patientId,
    psychologistId: linkedPsychologistId,
    clinicId: linkedClinicId,
    requestedDate,
    requestedTime,
    dataConsulta,
    modality: resolvedModality,
    consultationPrice,
    consultationDurationMinutes,
    presentialLocation,
    hasNotes: Boolean(notes),
    notesLength: notes.length,
  });

  try {
    const basePayload = {
      paciente_id: patient.patientId,
      psicologo_id: linkedPsychologistId,
      clinica_id: linkedClinicId,
      data_consulta: dataConsulta,
      modalidade_consulta: resolvedModality,
      valor_consulta: consultationPrice,
      duracao_consulta_min: consultationDurationMinutes,
      local_presencial: presentialLocation,
      status: "solicitada" as const,
      observacoes: notes || null,
    };
    const payload = {
      ...basePayload,
      data_consulta_solicitada_original: dataConsulta,
    };

    logPatientAppointmentDebug("insert_payload", {
      ...payload,
      observacoes: payload.observacoes ? "[preenchida]" : null,
      notesLength: notes.length,
    });

    let { data, error } = await supabase
      .from("consultas")
      .insert([payload])
      .select(PATIENT_APPOINTMENT_INSERT_SELECT_WITH_RESPONSE);

    if (error && isConsultaResponseSchemaMissingError(error)) {
      const fallbackResult = await supabase
        .from("consultas")
        .insert([basePayload])
        .select(PATIENT_APPOINTMENT_INSERT_SELECT_BASE);

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.error("[Psivinculo][patient-appointments][insert_error]", {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        payload: {
          ...payload,
          observacoes: payload.observacoes ? "[preenchida]" : null,
          notesLength: notes.length,
        },
      });
      throw toError(error, "Nao foi possivel solicitar este horario agora.");
    }

    const appointment = data?.[0] ?? null;

    logPatientAppointmentDebug("insert_success", {
      appointmentId: isRecord(appointment) ? pickString(appointment, ["id"]) : null,
      dataConsulta: isRecord(appointment) ? pickString(appointment, ["data_consulta"]) : dataConsulta,
      status: isRecord(appointment) ? pickString(appointment, ["status"]) : payload.status,
    });

    return {
      appointment,
      patient,
    };
  } catch (error) {
    const normalizedError = toError(error, "Nao foi possivel solicitar este horario agora.");

    logPatientAppointmentDebug("submit_failed", {
      message: normalizedError.message,
      patientId: patient.patientId,
      psychologistId: linkedPsychologistId,
      clinicId: linkedClinicId,
      dataConsulta,
    });

    throw normalizedError;
  }
}

export async function respondPatientCounterproposal(input: {
  consultaId: string;
  acao: PatientCounterproposalResponseAction;
}) {
  try {
    const response = await fetch("/api/consultas/respond-counterproposal", {
      method: "POST",
      headers: await buildAuthenticatedJsonRequestHeaders(),
      body: JSON.stringify({
        consultaId: input.consultaId,
        acao: input.acao,
      }),
    });
    const payload = await readServerJsonResponse<ConsultationMutationApiResponse>(
      response,
      "Nao foi possivel responder a contraproposta agora.",
    );

    return payload.consultation;
  } catch (error) {
    if (isConsultaResponseRpcMissingError(error)) {
      throw new Error(CONSULTA_RESPONSE_MIGRATION_MESSAGE);
    }

    throw toError(error, "Nao foi possivel responder a contraproposta agora.");
  }
}
