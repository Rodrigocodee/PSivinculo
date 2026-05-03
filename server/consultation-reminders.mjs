import {
  sendPatientConsultation1HourReminderEmail,
  sendPatientConsultation12HourReminderEmail,
  sendPsychologistConsultation1HourReminderEmail,
} from "./email.mjs";
import { HttpError } from "./errors.mjs";
import { loadPsychologistNotificationPreferences } from "./notification-preferences.mjs";
import { getServerSupabaseClient } from "./supabase.mjs";

const CONSULTATION_EMAIL_EVENTS_TABLE = "consultation_email_events";
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_WINDOW_MINUTES = 10;
const MAX_WINDOW_MINUTES = 120;
const PATIENT_APPOINTMENTS_PATH = "/paciente/agendamentos";
const PSYCHOLOGIST_APPOINTMENTS_PATH = "/psi/agenda";
const REMINDER_CLAIMABLE_STATUSES = ["pending", "failed"];

export const CONSULTATION_REMINDER_EVENT_TYPES = Object.freeze({
  REMINDER_12H_PATIENT: "reminder_12h_patient",
  REMINDER_1H_PATIENT: "reminder_1h_patient",
  REMINDER_1H_PSYCHOLOGIST: "reminder_1h_psychologist",
});

const REMINDER_QUERY_WINDOWS = [
  {
    key: "reminder_12h_window",
    offsetMinutes: 12 * 60,
    eventTypes: [CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_12H_PATIENT],
  },
  {
    key: "reminder_1h_window",
    offsetMinutes: 60,
    eventTypes: [
      CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PATIENT,
      CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PSYCHOLOGIST,
    ],
  },
];

const dateTimeFormatterCache = new Map();

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function pickString(source, keys) {
  if (!isRecord(source)) return "";

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function pickBoolean(source, keys) {
  if (!isRecord(source)) return null;

  for (const key of keys) {
    if (typeof source[key] === "boolean") {
      return source[key];
    }
  }

  return null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean)
    .filter((entry, index, collection) => collection.indexOf(entry) === index);
}

function buildDisplayNameFromEmail(email, fallbackLabel) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return fallbackLabel;
  }

  const localPart = normalizedEmail.split("@")[0] || "";
  const parts = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  return parts.join(" ") || fallbackLabel;
}

function maskEmailForLogs(value) {
  const normalizedValue = normalizeEmail(value);
  if (!normalizedValue) return null;

  const [localPart, domain = ""] = normalizedValue.split("@");

  if (!localPart) {
    return `***@${domain}`;
  }

  const visibleStart = localPart.slice(0, 2);
  const visibleEnd = localPart.length > 3 ? localPart.slice(-1) : "";

  return `${visibleStart}***${visibleEnd}@${domain}`;
}

function getHeaderValue(headers, headerName) {
  if (!headers || typeof headers !== "object") return "";

  const value = headers[headerName];

  if (Array.isArray(value)) {
    return normalizeString(value[0]);
  }

  return normalizeString(value);
}

function toSupabaseHttpError(error, fallbackMessage, defaultStatus = 400) {
  if (error instanceof HttpError) {
    return error;
  }

  if (isRecord(error)) {
    const message = normalizeString(error.message) || fallbackMessage;
    const code = normalizeString(error.code) || "SUPABASE_REQUEST_FAILED";
    const details = {
      details: normalizeString(error.details) || null,
      hint: normalizeString(error.hint) || null,
    };

    return new HttpError(defaultStatus, message, {
      code,
      details,
    });
  }

  if (error instanceof Error && error.message.trim()) {
    return new HttpError(defaultStatus, error.message.trim(), {
      code: "SUPABASE_REQUEST_FAILED",
    });
  }

  return new HttpError(defaultStatus, fallbackMessage, {
    code: "SUPABASE_REQUEST_FAILED",
  });
}

function resolveDateTimeFormatter(timeZone) {
  if (dateTimeFormatterCache.has(timeZone)) {
    return dateTimeFormatterCache.get(timeZone);
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });

  dateTimeFormatterCache.set(timeZone, formatter);
  return formatter;
}

function formatDateTimeForDatabase(date, timeZone = DEFAULT_TIME_ZONE) {
  const formatter = resolveDateTimeFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

function parseReferenceTime(value) {
  const normalizedValue = normalizeString(value);

  if (!normalizedValue) {
    return new Date();
  }

  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new HttpError(400, "Informe um referenceTime valido em formato ISO.", {
      code: "REMINDER_REFERENCE_TIME_INVALID",
    });
  }

  return parsedDate;
}

function parseWindowMinutes(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_WINDOW_MINUTES;
  }

  const parsedValue =
    typeof value === "number" ? value : Number.parseInt(normalizeString(value), 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0 || parsedValue > MAX_WINDOW_MINUTES) {
    throw new HttpError(
      400,
      `Informe windowMinutes entre 1 e ${MAX_WINDOW_MINUTES} minutos.`,
      {
        code: "REMINDER_WINDOW_MINUTES_INVALID",
      },
    );
  }

  return Math.round(parsedValue);
}

function buildReminderWindowBounds(referenceTime, offsetMinutes, windowMinutes) {
  const halfWindowMs = Math.floor((windowMinutes * 60 * 1000) / 2);
  const targetTimeMs = referenceTime.getTime() + offsetMinutes * 60 * 1000;

  return {
    lowerBound: formatDateTimeForDatabase(new Date(targetTimeMs - halfWindowMs)),
    upperBound: formatDateTimeForDatabase(new Date(targetTimeMs + halfWindowMs)),
  };
}

function buildPublicBaseUrl(requestHeaders, env) {
  const configuredBaseUrl = normalizeString(
    env.APP_BASE_URL || env.PUBLIC_APP_URL || env.SITE_URL,
  ).replace(/\/+$/g, "");

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const forwardedProto = getHeaderValue(requestHeaders, "x-forwarded-proto")
    .split(",")[0]
    .trim();
  const forwardedHost = getHeaderValue(requestHeaders, "x-forwarded-host");
  const host = forwardedHost || getHeaderValue(requestHeaders, "host");
  const protocol = forwardedProto || "http";

  if (!host) {
    return "";
  }

  return `${protocol}://${host}`.replace(/\/+$/g, "");
}

async function fetchDueConsultations(client, queryWindow, consultationIds) {
  const bounds = buildReminderWindowBounds(
    queryWindow.referenceTime,
    queryWindow.offsetMinutes,
    queryWindow.windowMinutes,
  );

  let query = client
    .from("consultas")
    .select(
      "id, clinica_id, psicologo_id, paciente_id, data_consulta, status, modalidade_consulta, modalidade, local_presencial",
    )
    .eq("status", "confirmada")
    .gte("data_consulta", bounds.lowerBound)
    .lt("data_consulta", bounds.upperBound)
    .order("data_consulta", { ascending: true });

  if (consultationIds.length > 0) {
    query = query.in("id", consultationIds);
  }

  const { data, error } = await query;

  if (error) {
    throw toSupabaseHttpError(
      error,
      "Nao foi possivel localizar as consultas elegiveis para lembretes.",
      500,
    );
  }

  return {
    bounds,
    consultations: Array.isArray(data) ? data.filter((row) => isRecord(row)) : [],
  };
}

async function resolvePatientEmail(client, patientId, fallbackEmail) {
  const normalizedFallbackEmail = normalizeEmail(fallbackEmail);

  if (normalizedFallbackEmail) {
    return normalizedFallbackEmail;
  }

  const normalizedPatientId = normalizeString(patientId);

  if (!normalizedPatientId) {
    return "";
  }

  try {
    const { data, error } = await client.auth.admin.getUserById(normalizedPatientId);

    if (error) {
      return "";
    }

    return normalizeEmail(data.user?.email);
  } catch {
    return "";
  }
}

async function resolvePsychologistEmail(client, psychologistId, fallbackEmail, fallbackAuthId) {
  const normalizedFallbackEmail = normalizeEmail(fallbackEmail);

  if (normalizedFallbackEmail) {
    return normalizedFallbackEmail;
  }

  const lookupIds = [normalizeString(fallbackAuthId), normalizeString(psychologistId)].filter(Boolean);

  for (const lookupId of lookupIds) {
    try {
      const { data, error } = await client.auth.admin.getUserById(lookupId);

      if (!error && normalizeEmail(data.user?.email)) {
        return normalizeEmail(data.user?.email);
      }
    } catch {
      // Ignore auth-admin lookup failures and keep trying fallback ids.
    }
  }

  return "";
}

async function loadPsychologistRecord(client, psychologistId) {
  const normalizedPsychologistId = normalizeString(psychologistId);

  if (!normalizedPsychologistId) {
    return null;
  }

  for (const column of ["id", "auth_id"]) {
    const { data, error } = await client
      .from("usuarios")
      .select(
        "id, auth_id, clinica_id, nome, email, link_sessao_online, info_online, mensagem_lembrete_sessao, local_presencial",
      )
      .eq(column, normalizedPsychologistId)
      .limit(1)
      .maybeSingle();

    if (!error && isRecord(data)) {
      return data;
    }
  }

  return null;
}

function resolveRoomLinkFromCandidates(candidates) {
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = isRecord(candidates[index]) ? candidates[index] : null;
    const roomLink = normalizeString(candidate?.value);

    if (!roomLink) {
      continue;
    }

    return {
      roomLink,
      source: normalizeString(candidate?.source) || null,
      status: index === 0 ? "available" : "fallback_used",
    };
  }

  return {
    roomLink: "",
    source: null,
    status: "missing",
  };
}

function resolvePatientReminderRoomLink(patient, psychologist) {
  return resolveRoomLinkFromCandidates([
    {
      source: "pacientes.link_sessao_online_paciente",
      value: pickString(patient, ["link_sessao_online_paciente"]),
    },
    {
      source: "pacientes.link_sessao_online",
      value: pickString(patient, ["link_sessao_online"]),
    },
    {
      source: "usuarios.link_sessao_online",
      value: pickString(psychologist, ["link_sessao_online"]),
    },
  ]);
}

function resolvePsychologistReminderRoomLink(patient, psychologist) {
  return resolveRoomLinkFromCandidates([
    {
      source: "pacientes.link_sessao_online_psicologo",
      value: pickString(patient, ["link_sessao_online_psicologo"]),
    },
    {
      source: "pacientes.link_sessao_online_paciente",
      value: pickString(patient, ["link_sessao_online_paciente"]),
    },
    {
      source: "pacientes.link_sessao_online",
      value: pickString(patient, ["link_sessao_online"]),
    },
    {
      source: "usuarios.link_sessao_online",
      value: pickString(psychologist, ["link_sessao_online"]),
    },
  ]);
}

async function loadConsultationReminderContext(client, consultationRow, logger = console) {
  const consultationId = pickString(consultationRow, ["id"]);
  const patientId = pickString(consultationRow, ["paciente_id"]);
  const psychologistId = pickString(consultationRow, ["psicologo_id"]);
  const consultationClinicId = pickString(consultationRow, ["clinica_id"]);
  const appointmentModality = pickString(consultationRow, [
    "modalidade_consulta",
    "modalidade",
  ]);

  const { data: patient, error: patientError } = patientId
    ? await client
        .from("pacientes")
        .select(
          "id, clinica_id, psicologo_id, nome, email, link_sessao_online, link_sessao_online_paciente, link_sessao_online_psicologo",
        )
        .eq("id", patientId)
        .maybeSingle()
    : { data: null, error: null };

  if (patientError) {
    throw toSupabaseHttpError(
      patientError,
      "Nao foi possivel carregar os dados do paciente da consulta.",
      500,
    );
  }

  const psychologist = await loadPsychologistRecord(client, psychologistId);
  const clinicId =
    consultationClinicId ||
    pickString(psychologist, ["clinica_id"]) ||
    pickString(patient, ["clinica_id"]) ||
    "";
  const { data: clinic, error: clinicError } = clinicId
    ? await client
        .from("clinicas")
        .select("id, notificacao_lembrete_consulta, template_mensagem_lembrete")
        .eq("id", clinicId)
        .maybeSingle()
    : { data: null, error: null };

  if (clinicError) {
    throw toSupabaseHttpError(
      clinicError,
      "Nao foi possivel carregar as configuracoes da clinica para os lembretes.",
      500,
    );
  }

  const patientEmail = await resolvePatientEmail(client, patientId, pickString(patient, ["email"]));
  const psychologistEmail = await resolvePsychologistEmail(
    client,
    psychologistId,
    pickString(psychologist, ["email"]),
    pickString(psychologist, ["auth_id"]),
  );
  const patientRoomLink = resolvePatientReminderRoomLink(patient, psychologist);
  const psychologistRoomLink = resolvePsychologistReminderRoomLink(patient, psychologist);
  const notificationPreferences = await loadPsychologistNotificationPreferences(
    client,
    psychologistId,
    logger,
    {
      consultationId,
      flow: "consultation_reminders",
    },
  );

  return {
    consultationId,
    clinicId,
    patientId,
    psychologistId,
    patientName:
      pickString(patient, ["nome"]) || buildDisplayNameFromEmail(patientEmail, "Paciente"),
    patientEmail,
    psychologistName:
      pickString(psychologist, ["nome"]) ||
      buildDisplayNameFromEmail(psychologistEmail, "Psicologo"),
    psychologistEmail,
    appointmentDateTime: pickString(consultationRow, ["data_consulta"]),
    appointmentModality,
    presentialLocation:
      pickString(consultationRow, ["local_presencial"]) ||
      pickString(psychologist, ["local_presencial"]),
    patientRoomLink,
    psychologistRoomLink,
    clinicReminderEnabled: pickBoolean(clinic, ["notificacao_lembrete_consulta"]) !== false,
    appointmentReminderEnabled: notificationPreferences.appointment_reminder !== false,
    clinicReminderTemplate: pickString(clinic, ["template_mensagem_lembrete"]),
    psychologistReminderMessage: pickString(psychologist, ["mensagem_lembrete_sessao"]),
  };
}

function buildReminderEventsForWindow(windowConfig, context) {
  const events = [];

  for (const eventType of windowConfig.eventTypes) {
    if (eventType === CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_12H_PATIENT) {
      events.push({
        consultationId: context.consultationId,
        eventType,
        recipientType: "patient",
        recipientEmail: context.patientEmail,
        appointmentsAreaPath: PATIENT_APPOINTMENTS_PATH,
      });
      continue;
    }

    if (eventType === CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PATIENT) {
      events.push({
        consultationId: context.consultationId,
        eventType,
        recipientType: "patient",
        recipientEmail: context.patientEmail,
        appointmentsAreaPath: PATIENT_APPOINTMENTS_PATH,
      });
      continue;
    }

    if (eventType === CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PSYCHOLOGIST) {
      events.push({
        consultationId: context.consultationId,
        eventType,
        recipientType: "psychologist",
        recipientEmail: context.psychologistEmail,
        appointmentsAreaPath: PSYCHOLOGIST_APPOINTMENTS_PATH,
      });
    }
  }

  return events;
}

function createSummary(referenceTime, windowMinutes, dryRun, baseUrl) {
  return {
    processedAt: new Date().toISOString(),
    referenceTime: referenceTime.toISOString(),
    dryRun,
    windowMinutes,
    baseUrl: baseUrl || null,
    windows: {},
    counts: {
      consultationsMatched: 0,
      eventsConsidered: 0,
      eventsSent: 0,
      eventsFailed: 0,
      eventsSkipped: 0,
      duplicatesPrevented: 0,
    },
    events: [],
  };
}

function shouldIncludeRoomLinkForEvent(context, event) {
  return (
    normalizeString(context.appointmentModality).toLowerCase() === "online" &&
    event.eventType !== CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_12H_PATIENT
  );
}

function getRoomLinkResolution(context, recipientType) {
  return recipientType === "psychologist"
    ? context.psychologistRoomLink
    : context.patientRoomLink;
}

function getRoomLinkStatus(context, event) {
  if (!shouldIncludeRoomLinkForEvent(context, event)) {
    return "missing";
  }

  return getRoomLinkResolution(context, event.recipientType)?.status || "missing";
}

function getRoomLinkSource(context, event) {
  if (!shouldIncludeRoomLinkForEvent(context, event)) {
    return null;
  }

  return getRoomLinkResolution(context, event.recipientType)?.source || null;
}

function getRoomLinkValue(context, event) {
  if (!shouldIncludeRoomLinkForEvent(context, event)) {
    return "";
  }

  return getRoomLinkResolution(context, event.recipientType)?.roomLink || "";
}

function pushEventResult(summary, result) {
  summary.events.push(result);
  summary.counts.eventsConsidered += 1;

  if (result.status === "sent") {
    summary.counts.eventsSent += 1;
    return;
  }

  if (result.status === "failed") {
    summary.counts.eventsFailed += 1;
    return;
  }

  summary.counts.eventsSkipped += 1;

  if (result.reason === "already_sent" || result.reason === "already_processing") {
    summary.counts.duplicatesPrevented += 1;
  }
}

async function ensureReminderEventRow(client, event, nowIso) {
  const { error } = await client.from(CONSULTATION_EMAIL_EVENTS_TABLE).upsert(
    {
      consulta_id: event.consultationId,
      tipo_evento: event.eventType,
      destinatario_email: event.recipientEmail,
      status: "pending",
      criado_em: nowIso,
      atualizado_em: nowIso,
    },
    {
      onConflict: "consulta_id,tipo_evento,destinatario_email",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw toSupabaseHttpError(
      error,
      "Nao foi possivel preparar o controle de deduplicacao do lembrete.",
      500,
    );
  }
}

async function claimReminderEvent(client, event, nowIso) {
  await ensureReminderEventRow(client, event, nowIso);

  const { data, error } = await client
    .from(CONSULTATION_EMAIL_EVENTS_TABLE)
    .update({
      status: "processing",
      erro: null,
      atualizado_em: nowIso,
    })
    .eq("consulta_id", event.consultationId)
    .eq("tipo_evento", event.eventType)
    .eq("destinatario_email", event.recipientEmail)
    .in("status", REMINDER_CLAIMABLE_STATUSES)
    .select("id, status")
    .maybeSingle();

  if (error) {
    throw toSupabaseHttpError(
      error,
      "Nao foi possivel reservar o lembrete antes do envio.",
      500,
    );
  }

  if (isRecord(data)) {
    return {
      claimed: true,
      rowId: pickString(data, ["id"]),
    };
  }

  const { data: existingRow, error: existingRowError } = await client
    .from(CONSULTATION_EMAIL_EVENTS_TABLE)
    .select("id, status, enviado_em")
    .eq("consulta_id", event.consultationId)
    .eq("tipo_evento", event.eventType)
    .eq("destinatario_email", event.recipientEmail)
    .maybeSingle();

  if (existingRowError) {
    throw toSupabaseHttpError(
      existingRowError,
      "Nao foi possivel verificar o status atual do lembrete.",
      500,
    );
  }

  const currentStatus = pickString(existingRow, ["status"]);

  return {
    claimed: false,
    rowId: pickString(existingRow, ["id"]),
    reason: currentStatus === "sent" ? "already_sent" : "already_processing",
  };
}

async function markReminderEventSent(client, rowId, emailResult, nowIso) {
  const normalizedRowId = normalizeString(rowId);

  if (!normalizedRowId) {
    return;
  }

  const { error } = await client
    .from(CONSULTATION_EMAIL_EVENTS_TABLE)
    .update({
      status: "sent",
      erro: null,
      enviado_em: nowIso,
      atualizado_em: nowIso,
    })
    .eq("id", normalizedRowId);

  if (error) {
    console.error("[Psivinculo][consultation-reminders][mark_sent_failed]", {
      reminderEventId: normalizedRowId,
      emailId: normalizeString(emailResult?.emailId) || null,
      code: error.code || "CONSULTATION_REMINDER_EVENT_UPDATE_FAILED",
      message: error.message || "Unknown update error",
    });
  }
}

async function markReminderEventFailed(client, rowId, errorMessage, nowIso) {
  const normalizedRowId = normalizeString(rowId);

  if (!normalizedRowId) {
    return;
  }

  const { error } = await client
    .from(CONSULTATION_EMAIL_EVENTS_TABLE)
    .update({
      status: "failed",
      erro: normalizeString(errorMessage) || "Unknown reminder error",
      atualizado_em: nowIso,
    })
    .eq("id", normalizedRowId);

  if (error) {
    console.error("[Psivinculo][consultation-reminders][mark_failed_failed]", {
      reminderEventId: normalizedRowId,
      code: error.code || "CONSULTATION_REMINDER_EVENT_UPDATE_FAILED",
      message: error.message || "Unknown update error",
    });
  }
}

async function sendReminderEmail(event, context, env, baseUrl) {
  const emailInput = {
    to: event.recipientEmail,
    consultationId: context.consultationId,
    patientName: context.patientName,
    psychologistName: context.psychologistName,
    appointmentDateTime: context.appointmentDateTime,
    appointmentModality: context.appointmentModality,
    presentialLocation: context.presentialLocation,
    roomLink: getRoomLinkValue(context, event),
  };

  if (event.eventType === CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_12H_PATIENT) {
    return sendPatientConsultation12HourReminderEmail(emailInput, {
      env,
      baseUrl,
    });
  }

  if (event.eventType === CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PATIENT) {
    return sendPatientConsultation1HourReminderEmail(emailInput, {
      env,
      baseUrl,
    });
  }

  if (event.eventType === CONSULTATION_REMINDER_EVENT_TYPES.REMINDER_1H_PSYCHOLOGIST) {
    return sendPsychologistConsultation1HourReminderEmail(emailInput, {
      env,
      baseUrl,
    });
  }

  throw new HttpError(400, "Tipo de lembrete nao suportado.", {
    code: "REMINDER_EVENT_TYPE_UNSUPPORTED",
    details: {
      eventType: event.eventType,
    },
  });
}

function buildSkippedResult(event, context, reason, details = {}) {
  return {
    consultationId: context.consultationId,
    eventType: event.eventType,
    recipientType: event.recipientType,
    recipientEmail: event.recipientEmail || null,
    status: "skipped",
    reason,
    roomLinkStatus: getRoomLinkStatus(context, event),
    roomLinkSource: getRoomLinkSource(context, event),
    ...details,
  };
}

async function processReminderEvent(event, context, runtime) {
  const recipientEmail = normalizeEmail(event.recipientEmail);

  if (!context.clinicReminderEnabled) {
    return buildSkippedResult(event, context, "clinic_reminders_disabled");
  }

  if (!context.appointmentReminderEnabled) {
    runtime.logger.info("[Psivinculo][notifications][notification_skipped_due_to_preferences]", {
      consultationId: context.consultationId,
      eventType: event.eventType,
      recipientType: event.recipientType,
      psychologistId: context.psychologistId || null,
      preference: "appointment_reminder",
    });
    return buildSkippedResult(event, context, "notification_preferences_disabled");
  }

  if (!recipientEmail) {
    return buildSkippedResult(
      event,
      {
        ...context,
        [event.recipientType === "patient" ? "patientEmail" : "psychologistEmail"]: "",
      },
      event.recipientType === "patient" ? "missing_patient_email" : "missing_psychologist_email",
    );
  }

  const roomLinkExpected = shouldIncludeRoomLinkForEvent(context, event);

  if (roomLinkExpected && !getRoomLinkValue(context, event)) {
    runtime.logger.warn("[Psivinculo][consultation-reminders][missing_room_link]", {
      consultationId: context.consultationId,
      eventType: event.eventType,
      recipientType: event.recipientType,
      patientId: context.patientId || null,
      psychologistId: context.psychologistId || null,
    });
  }

  if (runtime.dryRun) {
    return {
      consultationId: context.consultationId,
      eventType: event.eventType,
      recipientType: event.recipientType,
      recipientEmail,
      status: "skipped",
      reason: "dry_run",
      roomLinkStatus: getRoomLinkStatus(context, event),
      roomLinkSource: getRoomLinkSource(context, event),
    };
  }

  const nowIso = new Date().toISOString();
  const claimResult = await claimReminderEvent(runtime.client, {
    ...event,
    recipientEmail,
  }, nowIso);

  if (!claimResult.claimed) {
    return buildSkippedResult(
      {
        ...event,
        recipientEmail,
      },
      context,
      claimResult.reason || "already_processing",
    );
  }

  try {
    const emailResult = await sendReminderEmail(
      {
        ...event,
        recipientEmail,
      },
      context,
      runtime.env,
      runtime.baseUrl,
    );

    await markReminderEventSent(runtime.client, claimResult.rowId, emailResult, new Date().toISOString());

    runtime.logger.info("[Psivinculo][consultation-reminders][sent]", {
      consultationId: context.consultationId,
      eventType: event.eventType,
      recipientType: event.recipientType,
      recipientEmail: maskEmailForLogs(recipientEmail),
      emailId: normalizeString(emailResult?.emailId) || null,
    });
    runtime.logger.info("[Psivinculo][notifications][notification_sent]", {
      consultationId: context.consultationId,
      eventType: event.eventType,
      recipientType: event.recipientType,
      recipientEmail: maskEmailForLogs(recipientEmail),
      psychologistId: context.psychologistId || null,
      preference: "appointment_reminder",
      emailId: normalizeString(emailResult?.emailId) || null,
    });

    return {
      consultationId: context.consultationId,
      eventType: event.eventType,
      recipientType: event.recipientType,
      recipientEmail,
      status: "sent",
      reason: null,
      roomLinkStatus: getRoomLinkStatus(context, event),
      roomLinkSource: getRoomLinkSource(context, event),
      emailId: normalizeString(emailResult?.emailId) || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown reminder error";

    await markReminderEventFailed(runtime.client, claimResult.rowId, message, new Date().toISOString());

    runtime.logger.error("[Psivinculo][consultation-reminders][send_failed]", {
      consultationId: context.consultationId,
      eventType: event.eventType,
      recipientType: event.recipientType,
      recipientEmail: maskEmailForLogs(recipientEmail),
      code: error instanceof HttpError ? error.code : "CONSULTATION_REMINDER_SEND_FAILED",
      message,
    });

    return {
      consultationId: context.consultationId,
      eventType: event.eventType,
      recipientType: event.recipientType,
      recipientEmail,
      status: "failed",
      reason: "email_send_failed",
      roomLinkStatus: getRoomLinkStatus(context, event),
      roomLinkSource: getRoomLinkSource(context, event),
      error: message,
    };
  }
}

export async function processConsultationReminders(payload = {}, options = {}) {
  const env = options.env || process.env;
  const client = options.client || getServerSupabaseClient(env);
  const requestHeaders = options.requestHeaders || {};
  const logger = options.logger || console;
  const dryRun = payload?.dryRun === true;
  const referenceTime = parseReferenceTime(payload?.referenceTime);
  const windowMinutes = parseWindowMinutes(payload?.windowMinutes);
  const consultationIds = normalizeStringArray(payload?.consultationIds);
  const baseUrl = buildPublicBaseUrl(requestHeaders, env);
  const summary = createSummary(referenceTime, windowMinutes, dryRun, baseUrl);

  logger.info("[Psivinculo][consultation-reminders][started]", {
    dryRun,
    referenceTime: referenceTime.toISOString(),
    windowMinutes,
    consultationIdsCount: consultationIds.length,
  });

  for (const windowConfig of REMINDER_QUERY_WINDOWS) {
    const windowResult = await fetchDueConsultations(
      client,
      {
        referenceTime,
        offsetMinutes: windowConfig.offsetMinutes,
        windowMinutes,
      },
      consultationIds,
    );

    summary.windows[windowConfig.key] = {
      lowerBound: windowResult.bounds.lowerBound,
      upperBound: windowResult.bounds.upperBound,
      consultationsMatched: windowResult.consultations.length,
    };
    summary.counts.consultationsMatched += windowResult.consultations.length;

    for (const consultationRow of windowResult.consultations) {
      let context;

      try {
        context = await loadConsultationReminderContext(client, consultationRow, logger);
      } catch (error) {
        logger.error("[Psivinculo][consultation-reminders][context_failed]", {
          consultationId: pickString(consultationRow, ["id"]) || null,
          code: error instanceof HttpError ? error.code : "CONSULTATION_REMINDER_CONTEXT_FAILED",
          message: error instanceof Error ? error.message : "Unknown context error",
        });

        continue;
      }

      const events = buildReminderEventsForWindow(windowConfig, context);

      for (const event of events) {
        const result = await processReminderEvent(event, context, {
          client,
          env,
          baseUrl,
          dryRun,
          logger,
        });

        pushEventResult(summary, result);
      }
    }
  }

  logger.info("[Psivinculo][consultation-reminders][finished]", {
    dryRun,
    consultationsMatched: summary.counts.consultationsMatched,
    eventsConsidered: summary.counts.eventsConsidered,
    eventsSent: summary.counts.eventsSent,
    eventsFailed: summary.counts.eventsFailed,
    eventsSkipped: summary.counts.eventsSkipped,
    duplicatesPrevented: summary.counts.duplicatesPrevented,
  });

  return summary;
}
