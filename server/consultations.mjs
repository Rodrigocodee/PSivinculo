import {
  sendPatientConsultationConfirmationEmail,
  sendPatientConsultationRescheduleEmail,
} from "./email.mjs";
import { createConsultationPayment } from "./consultation-payments.mjs";
import { HttpError } from "./errors.mjs";
import { loadPsychologistNotificationPreferences } from "./notification-preferences.mjs";
import { assertProfessionalAccessForAuthenticatedUser } from "./professional-access.mjs";
import {
  extractBearerToken,
  getRequestSupabaseClient,
  getServerSupabaseClient,
  resolveSupabaseAuthUser,
} from "./supabase.mjs";

const CONSULTATION_UPDATE_FIELDS = [
  "paciente_id",
  "data_consulta",
  "status",
  "observacoes",
  "modalidade_consulta",
  "psicologo_id",
  "clinica_id",
  "valor_consulta",
  "duracao_consulta_min",
  "local_presencial",
];
const CONSULTATION_SCHEDULE_TERMINAL_STATUSES = new Set([
  "cancelada",
  "recusada",
  "realizada",
  "faltou",
  "solicitada",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function isValidEmail(value) {
  const normalizedValue = normalizeEmail(value);
  return Boolean(normalizedValue) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue);
}

function pickString(source, keys) {
  if (!isRecord(source)) return "";

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function getHeaderValue(headers, headerName) {
  if (!headers || typeof headers !== "object") return "";

  const value = headers[headerName];

  if (Array.isArray(value)) {
    return normalizeString(value[0]);
  }

  return normalizeString(value);
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

async function resolveAuthenticatedRequestContext(requestHeaders, env) {
  const accessToken = extractBearerToken(requestHeaders);

  if (!accessToken) {
    throw new HttpError(401, "A requisicao precisa enviar um token Bearer valido.", {
      code: "AUTH_TOKEN_REQUIRED",
    });
  }

  const authenticatedUser = await resolveSupabaseAuthUser(accessToken, env);

  if (!authenticatedUser) {
    throw new HttpError(401, "Nao foi possivel validar a sessao autenticada da requisicao.", {
      code: "AUTH_SESSION_INVALID",
    });
  }

  return {
    accessToken,
    authenticatedUser,
    userClient: getRequestSupabaseClient(accessToken, env),
  };
}

function normalizeConsultaRecord(data) {
  if (Array.isArray(data)) {
    return isRecord(data[0]) ? data[0] : null;
  }

  return isRecord(data) ? data : null;
}

async function loadConsultaSnapshot(client, consultationId) {
  const { data, error } = await client
    .from("consultas")
    .select("*")
    .eq("id", consultationId)
    .maybeSingle();

  if (error) {
    throw toSupabaseHttpError(error, "Nao foi possivel localizar a consulta informada.");
  }

  return isRecord(data) ? data : null;
}

function sanitizeConsultaUpdates(input) {
  const source = isRecord(input) ? input : {};
  const updates = {};

  for (const field of CONSULTATION_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      updates[field] = source[field];
    }
  }

  return updates;
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

async function loadPatientEmailRecord(client, patientId) {
  const normalizedPatientId = normalizeString(patientId);

  if (!normalizedPatientId) {
    return {
      patient: null,
      error: null,
      selectMode: "patient_id_missing",
    };
  }

  const detailedSelect =
    "id, nome, email, link_sessao_online, link_sessao_online_paciente";
  const minimalSelect = "id, nome, email";
  const detailedResult = await client
    .from("pacientes")
    .select(detailedSelect)
    .eq("id", normalizedPatientId)
    .maybeSingle();

  if (!detailedResult.error) {
    return {
      patient: isRecord(detailedResult.data) ? detailedResult.data : null,
      error: null,
      selectMode: "detailed",
    };
  }

  const minimalResult = await client
    .from("pacientes")
    .select(minimalSelect)
    .eq("id", normalizedPatientId)
    .maybeSingle();

  return {
    patient: isRecord(minimalResult.data) ? minimalResult.data : null,
    error: minimalResult.error || detailedResult.error,
    selectMode: minimalResult.error ? "failed" : "minimal",
  };
}

async function resolvePsychologistName(client, psychologistId) {
  const normalizedPsychologistId = normalizeString(psychologistId);

  if (!normalizedPsychologistId) {
    return "Seu psicologo";
  }

  for (const column of ["id", "auth_id"]) {
    const { data, error } = await client
      .from("usuarios")
      .select("id, auth_id, nome, email")
      .eq(column, normalizedPsychologistId)
      .limit(1)
      .maybeSingle();

    if (error || !isRecord(data)) {
      continue;
    }

    return (
      pickString(data, ["nome"]) ||
      buildDisplayNameFromEmail(pickString(data, ["email"]), "Seu psicologo")
    );
  }

  try {
    const { data, error } = await client.auth.admin.getUserById(normalizedPsychologistId);

    if (!error && data.user) {
      const metadata = isRecord(data.user.user_metadata) ? data.user.user_metadata : {};
      return (
        pickString(metadata, ["full_name", "name"]) ||
        buildDisplayNameFromEmail(data.user.email, "Seu psicologo")
      );
    }
  } catch {
    // Ignore auth-admin fallback errors and use the default label below.
  }

  return "Seu psicologo";
}

async function resolvePsychologistEmailContext(client, psychologistId) {
  const normalizedPsychologistId = normalizeString(psychologistId);

  if (!normalizedPsychologistId) {
    return {
      name: "Seu psicologo",
      onlineSessionLink: "",
      presentialLocation: "",
    };
  }

  for (const column of ["id", "auth_id"]) {
    const { data, error } = await client
      .from("usuarios")
      .select("id, auth_id, nome, email, link_sessao_online, local_presencial")
      .eq(column, normalizedPsychologistId)
      .limit(1)
      .maybeSingle();

    if (error || !isRecord(data)) {
      continue;
    }

    return {
      name:
        pickString(data, ["nome"]) ||
        buildDisplayNameFromEmail(pickString(data, ["email"]), "Seu psicologo"),
      onlineSessionLink: pickString(data, ["link_sessao_online"]),
      presentialLocation: pickString(data, ["local_presencial"]),
    };
  }

  return {
    name: await resolvePsychologistName(client, normalizedPsychologistId),
    onlineSessionLink: "",
    presentialLocation: "",
  };
}

async function loadConsultationEmailContext(consultationId, env) {
  const client = getServerSupabaseClient(env);
  const { data: consultation, error: consultationError } = await client
    .from("consultas")
        .select(
      "id, paciente_id, psicologo_id, data_consulta, data_consulta_solicitada_original, status, modalidade_consulta, local_presencial, valor_consulta",
    )
    .eq("id", consultationId)
    .maybeSingle();

  if (consultationError) {
    throw toSupabaseHttpError(
      consultationError,
      "Nao foi possivel carregar os dados atuais da consulta para enviar o e-mail.",
      500,
    );
  }

  if (!isRecord(consultation)) {
    throw new HttpError(404, "Nao foi possivel localizar a consulta atualizada para enviar o e-mail.", {
      code: "CONSULTATION_NOT_FOUND",
    });
  }

  const patientId = pickString(consultation, ["paciente_id"]);
  const psychologistId = pickString(consultation, ["psicologo_id"]);
  const patientLookup = await loadPatientEmailRecord(client, patientId);
  const patient = patientLookup.patient;
  const patientError = patientLookup.error;

  if (patientError) {
    throw toSupabaseHttpError(
      patientError,
      "Nao foi possivel carregar o paciente vinculado a consulta para enviar o e-mail.",
      500,
    );
  }

  const patientEmail = await resolvePatientEmail(
    client,
    patientId,
    pickString(patient, ["email"]),
  );
  const patientEmailFromRecord = normalizeEmail(pickString(patient, ["email"]));
  const psychologist = await resolvePsychologistEmailContext(client, psychologistId);
  const notificationPreferences = await loadPsychologistNotificationPreferences(
    client,
    psychologistId,
    console,
    {
      consultationId: pickString(consultation, ["id"]) || consultationId,
      flow: "consultation_email",
    },
  );

  return {
    consultationId: pickString(consultation, ["id"]) || consultationId,
    patientId,
    psychologistId,
    patientName:
      pickString(patient, ["nome"]) || buildDisplayNameFromEmail(patientEmail, "Paciente"),
    patientEmail,
    patientFound: Boolean(patient),
    patientEmailFromRecord,
    patientLookupMode: patientLookup.selectMode,
    psychologistName: psychologist.name,
    appointmentDateTime: pickString(consultation, ["data_consulta"]),
    requestedOriginalDateTime: pickString(consultation, ["data_consulta_solicitada_original"]),
    appointmentModality: pickString(consultation, ["modalidade_consulta"]),
    presentialLocation:
      pickString(consultation, ["local_presencial"]) || psychologist.presentialLocation,
    roomLink:
      pickString(patient, ["link_sessao_online_paciente", "link_sessao_online"]) ||
      psychologist.onlineSessionLink ||
      pickString(consultation, ["local_presencial"]),
    amount: pickString(consultation, ["valor_consulta"]),
    status: pickString(consultation, ["status"]),
    notificationPreferences,
  };
}

function shouldSendConfirmationEmail(previousConsultation, currentConsultation) {
  const previousStatus = normalizeString(previousConsultation?.status).toLowerCase();
  const currentStatus = normalizeString(currentConsultation?.status).toLowerCase();

  return currentStatus === "confirmada" && previousStatus !== "confirmada";
}

function shouldCreateConsultationPayment(previousConsultation, currentConsultation) {
  const previousStatus = normalizeString(previousConsultation?.status).toLowerCase();
  const currentStatus = normalizeString(currentConsultation?.status).toLowerCase();

  return currentStatus === "confirmada" && previousStatus !== "confirmada";
}

function shouldSendRescheduleEmail(previousConsultation, currentConsultation) {
  const previousStatus = normalizeString(previousConsultation?.status).toLowerCase();
  const currentStatus = normalizeString(currentConsultation?.status).toLowerCase();
  const previousDateTime = normalizeString(previousConsultation?.data_consulta);
  const currentDateTime = normalizeString(currentConsultation?.data_consulta);
  const dateChanged =
    Boolean(previousDateTime && currentDateTime) && previousDateTime !== currentDateTime;
  const enteredRescheduleStatus =
    currentStatus !== previousStatus &&
    (currentStatus === "contraproposta" || currentStatus === "reagendada");

  if (!currentStatus || CONSULTATION_SCHEDULE_TERMINAL_STATUSES.has(currentStatus)) {
    return false;
  }

  return dateChanged || enteredRescheduleStatus;
}

function resolvePreviousAppointmentDateTime(previousConsultation, emailContext) {
  const previousDateTime = normalizeString(previousConsultation?.data_consulta);
  const currentDateTime = normalizeString(emailContext.appointmentDateTime);

  if (previousDateTime && previousDateTime !== currentDateTime) {
    return previousDateTime;
  }

  const requestedOriginalDateTime = normalizeString(emailContext.requestedOriginalDateTime);

  if (requestedOriginalDateTime && requestedOriginalDateTime !== currentDateTime) {
    return requestedOriginalDateTime;
  }

  return "";
}

function logConsultationConfirmationEmailDiagnostic({
  label,
  previousConsultation,
  currentConsultation,
  emailContext = null,
  event,
  skippedReason = null,
}) {
  const currentConsultationId = pickString(currentConsultation, ["id"]);
  const patientId =
    pickString(emailContext || null, ["patientId"]) ||
    pickString(currentConsultation, ["paciente_id"]);
  const psychologistId =
    pickString(emailContext || null, ["psychologistId"]) ||
    pickString(currentConsultation, ["psicologo_id"]);
  const patientEmail =
    pickString(emailContext || null, ["patientEmail"]) ||
    normalizeEmail(pickString(currentConsultation, ["email", "paciente_email", "email_paciente"]));
  const patientEmailFromRecord = pickString(emailContext || null, ["patientEmailFromRecord"]);

  console.info(`[Psivinculo][consultation-email][${label}]`, {
    consultationId: currentConsultationId || null,
    patientId: patientId || null,
    psychologistId: psychologistId || null,
    previousStatus: normalizeString(previousConsultation?.status) || null,
    currentStatus: normalizeString(currentConsultation?.status) || null,
    event: event || null,
    patientFound:
      emailContext && Object.prototype.hasOwnProperty.call(emailContext, "patientFound")
        ? Boolean(emailContext.patientFound)
        : null,
    patientLookupMode: pickString(emailContext || null, ["patientLookupMode"]) || null,
    patientEmailExists: isValidEmail(patientEmail),
    patientEmailMasked: maskEmailForLogs(patientEmail),
    patientRecordEmailExists: isValidEmail(patientEmailFromRecord),
    patientRecordEmailMasked: maskEmailForLogs(patientEmailFromRecord),
    skippedReason,
  });
}

async function maybeSendConsultationEmailNotification({
  previousConsultation,
  currentConsultation,
  env,
  requestHeaders,
}) {
  const currentConsultationId = pickString(currentConsultation, ["id"]);

  if (!currentConsultationId) {
    return {
      attempted: false,
      sent: false,
      event: null,
      skippedReason: "consultation_id_missing",
    };
  }

  const baseUrl = buildPublicBaseUrl(requestHeaders, env);
  const shouldSendConfirmation = shouldSendConfirmationEmail(
    previousConsultation,
    currentConsultation,
  );
  const shouldSendReschedule = !shouldSendConfirmation
    ? shouldSendRescheduleEmail(previousConsultation, currentConsultation)
    : false;

  if (!shouldSendConfirmation && !shouldSendReschedule) {
    if (normalizeString(currentConsultation?.status).toLowerCase() === "confirmada") {
      logConsultationConfirmationEmailDiagnostic({
        label: "not_applicable",
        previousConsultation,
        currentConsultation,
        event: null,
        skippedReason: "not_applicable",
      });
    }

    return {
      attempted: false,
      sent: false,
      event: null,
      skippedReason: "not_applicable",
    };
  }

  const emailContext = await loadConsultationEmailContext(currentConsultationId, env);
  emailContext.patientEmail =
    emailContext.patientEmail ||
    normalizeEmail(pickString(currentConsultation, ["email", "paciente_email", "email_paciente"]));
  const event = shouldSendConfirmation ? "confirmation" : "reschedule";

  if (shouldSendConfirmation) {
    logConsultationConfirmationEmailDiagnostic({
      label: "confirmation_diagnostic",
      previousConsultation,
      currentConsultation,
      emailContext,
      event,
    });
  }

  if (emailContext.notificationPreferences?.patient_confirmation === false) {
    logConsultationConfirmationEmailDiagnostic({
      label: "skipped_preferences_diagnostic",
      previousConsultation,
      currentConsultation,
      emailContext,
      event,
      skippedReason: "notification_preferences_disabled",
    });
    console.info("[Psivinculo][notifications][notification_skipped_due_to_preferences]", {
      consultationId: currentConsultationId,
      patientId: emailContext.patientId || null,
      psychologistId: emailContext.psychologistId || null,
      event,
      preference: "patient_confirmation",
    });

    return {
      attempted: true,
      sent: false,
      event,
      skippedReason: "notification_preferences_disabled",
    };
  }

  if (!isValidEmail(emailContext.patientEmail)) {
    logConsultationConfirmationEmailDiagnostic({
      label: "skipped_missing_patient_email_diagnostic",
      previousConsultation,
      currentConsultation,
      emailContext,
      event,
      skippedReason: "missing_patient_email",
    });
    console.warn("[Psivinculo][consultation-email][skipped_missing_patient_email]", {
      consultationId: currentConsultationId,
      patientId: emailContext.patientId || null,
      psychologistId: emailContext.psychologistId || null,
      event,
    });

    return {
      attempted: true,
      sent: false,
      event,
      skippedReason: "missing_patient_email",
    };
  }

  const emailInput = {
    to: emailContext.patientEmail,
    consultationId: emailContext.consultationId,
    patientName: emailContext.patientName,
    psychologistName: emailContext.psychologistName,
    appointmentDateTime: emailContext.appointmentDateTime,
    previousAppointmentDateTime: resolvePreviousAppointmentDateTime(
      previousConsultation,
      emailContext,
    ),
    appointmentModality: emailContext.appointmentModality,
    presentialLocation: emailContext.presentialLocation,
    roomLink: emailContext.roomLink,
    amount: emailContext.amount,
    status: emailContext.status,
  };

  try {
    const result = shouldSendConfirmation
      ? await sendPatientConsultationConfirmationEmail(emailInput, {
          env,
          baseUrl,
        })
      : await sendPatientConsultationRescheduleEmail(emailInput, {
          env,
          baseUrl,
        });

    console.info("[Psivinculo][consultation-email][sent]", {
      consultationId: currentConsultationId,
      patientId: emailContext.patientId || null,
      patientEmail: maskEmailForLogs(emailContext.patientEmail),
      event,
      emailId: normalizeString(result?.emailId) || null,
    });
    console.info("[Psivinculo][notifications][notification_sent]", {
      consultationId: currentConsultationId,
      patientId: emailContext.patientId || null,
      psychologistId: emailContext.psychologistId || null,
      recipientType: "patient",
      recipientEmail: maskEmailForLogs(emailContext.patientEmail),
      event,
      preference: "patient_confirmation",
      emailId: normalizeString(result?.emailId) || null,
    });

    return {
      attempted: true,
      sent: true,
      event,
      emailId: normalizeString(result?.emailId) || null,
    };
  } catch (error) {
    logConsultationConfirmationEmailDiagnostic({
      label: "send_failed_diagnostic",
      previousConsultation,
      currentConsultation,
      emailContext,
      event,
      skippedReason: "email_send_failed",
    });
    console.error("[Psivinculo][consultation-email][send_failed]", {
      consultationId: currentConsultationId,
      patientId: emailContext.patientId || null,
      patientEmail: maskEmailForLogs(emailContext.patientEmail),
      event,
      code: error instanceof HttpError ? error.code : "EMAIL_SEND_FAILED",
      message: error instanceof Error ? error.message : "Unknown email error",
    });

    return {
      attempted: true,
      sent: false,
      event,
      skippedReason: "email_send_failed",
    };
  }
}

async function maybeCreateConsultationPaymentAfterConfirmation({
  previousConsultation,
  currentConsultation,
  env,
  requestHeaders,
}) {
  const currentConsultationId = pickString(currentConsultation, ["id"]);

  if (!currentConsultationId) {
    return null;
  }

  if (!shouldCreateConsultationPayment(previousConsultation, currentConsultation)) {
    return null;
  }

  try {
    return await createConsultationPayment(
      {
        consultaId: currentConsultationId,
      },
      {
        env,
        requestHeaders,
      },
    );
  } catch (error) {
    console.error("[Psivinculo][consultation-payment][create_failed_after_confirmation]", {
      consultationId: currentConsultationId,
      code: error instanceof HttpError ? error.code : "CONSULTATION_PAYMENT_CREATE_FAILED",
      message: error instanceof Error ? error.message : "Unknown consultation payment error",
    });

    return {
      consultationId: currentConsultationId,
      paymentMode: "asaas_split",
      paymentStatus: "erro",
      created: false,
      reusedExisting: false,
      success: false,
      asaasPaymentId: null,
      invoiceUrl: null,
      bankSlipUrl: null,
      billingType: null,
      externalReference: currentConsultationId,
      splitSent: false,
      walletIdMasked: null,
      payoutPercentage: 95,
      message:
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Nao foi possivel gerar a cobranca da consulta no Asaas.",
      errorCode:
        error instanceof HttpError && error.code
          ? error.code
          : "CONSULTATION_PAYMENT_CREATE_FAILED",
    };
  }
}

export async function respondConsultaRequestAndNotify(payload, options = {}) {
  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
  const consultationId = normalizeString(payload?.consultaId);
  const action = normalizeString(payload?.acao);
  const suggestedDateTime = normalizeString(payload?.novaDataConsulta) || null;

  if (!consultationId) {
    throw new HttpError(400, "Informe o id da consulta para responder a solicitacao.", {
      code: "CONSULTATION_ID_REQUIRED",
    });
  }

  if (!action) {
    throw new HttpError(400, "Informe a acao da resposta da solicitacao de consulta.", {
      code: "CONSULTATION_ACTION_REQUIRED",
    });
  }

  const { authenticatedUser, userClient } = await resolveAuthenticatedRequestContext(requestHeaders, env);
  await assertProfessionalAccessForAuthenticatedUser(
    getServerSupabaseClient(env),
    authenticatedUser,
  );
  const previousConsultation = await loadConsultaSnapshot(userClient, consultationId);

  if (!previousConsultation) {
    throw new HttpError(404, "Nao foi possivel localizar a solicitacao de consulta informada.", {
      code: "CONSULTATION_NOT_FOUND",
    });
  }

  const { data, error } = await userClient.rpc("respond_consulta_request", {
    consulta_id_input: consultationId,
    action_input: action,
    suggested_datetime_input: suggestedDateTime,
  });

  if (error) {
    throw toSupabaseHttpError(
      error,
      "Nao foi possivel responder a solicitacao da consulta agora.",
    );
  }

  const consultation = normalizeConsultaRecord(data);

  if (!consultation) {
    throw new HttpError(500, "A resposta da solicitacao nao retornou uma consulta valida.", {
      code: "CONSULTATION_RESPONSE_EMPTY",
    });
  }

  const email = await maybeSendConsultationEmailNotification({
    previousConsultation,
    currentConsultation: consultation,
    env,
    requestHeaders,
  });
  const payment = await maybeCreateConsultationPaymentAfterConfirmation({
    previousConsultation,
    currentConsultation: consultation,
    env,
    requestHeaders,
  });

  return {
    consultation,
    email,
    payment,
  };
}

export async function updateConsultaAndNotify(payload, options = {}) {
  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
  const consultationId = normalizeString(payload?.consultaId);
  const updates = sanitizeConsultaUpdates(payload?.updates);

  if (!consultationId) {
    throw new HttpError(400, "Informe o id da consulta que sera atualizada.", {
      code: "CONSULTATION_ID_REQUIRED",
    });
  }

  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, "Informe pelo menos um campo valido para atualizar a consulta.", {
      code: "CONSULTATION_UPDATES_REQUIRED",
    });
  }

  const { authenticatedUser, userClient } = await resolveAuthenticatedRequestContext(requestHeaders, env);
  await assertProfessionalAccessForAuthenticatedUser(
    getServerSupabaseClient(env),
    authenticatedUser,
  );
  const previousConsultation = await loadConsultaSnapshot(userClient, consultationId);

  if (!previousConsultation) {
    throw new HttpError(404, "Nao foi possivel localizar a consulta informada para atualizacao.", {
      code: "CONSULTATION_NOT_FOUND",
    });
  }

  const { data, error } = await userClient
    .from("consultas")
    .update(updates)
    .eq("id", consultationId)
    .select("*")
    .single();

  if (error) {
    throw toSupabaseHttpError(error, "Nao foi possivel atualizar a consulta agora.");
  }

  if (!isRecord(data)) {
    throw new HttpError(500, "A atualizacao nao retornou a consulta esperada.", {
      code: "CONSULTATION_UPDATE_EMPTY",
    });
  }

  const consultation = data;
  const email = await maybeSendConsultationEmailNotification({
    previousConsultation,
    currentConsultation: consultation,
    env,
    requestHeaders,
  });
  const payment = await maybeCreateConsultationPaymentAfterConfirmation({
    previousConsultation,
    currentConsultation: consultation,
    env,
    requestHeaders,
  });

  return {
    consultation,
    email,
    payment,
  };
}

export async function respondConsultaCounterproposalAndNotify(payload, options = {}) {
  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
  const consultationId = normalizeString(payload?.consultaId);
  const action = normalizeString(payload?.acao);

  if (!consultationId) {
    throw new HttpError(400, "Informe o id da consulta para responder ao reagendamento.", {
      code: "CONSULTATION_ID_REQUIRED",
    });
  }

  if (!action) {
    throw new HttpError(400, "Informe a acao para responder a contraproposta.", {
      code: "CONSULTATION_ACTION_REQUIRED",
    });
  }

  const { userClient } = await resolveAuthenticatedRequestContext(requestHeaders, env);
  const previousConsultation = await loadConsultaSnapshot(userClient, consultationId);

  if (!previousConsultation) {
    throw new HttpError(404, "Nao foi possivel localizar a consulta informada.", {
      code: "CONSULTATION_NOT_FOUND",
    });
  }

  const { data, error } = await userClient.rpc("respond_consulta_counterproposal", {
    consulta_id_input: consultationId,
    action_input: action,
  });

  if (error) {
    throw toSupabaseHttpError(
      error,
      "Nao foi possivel responder a contraproposta da consulta agora.",
    );
  }

  const consultation = normalizeConsultaRecord(data);

  if (!consultation) {
    throw new HttpError(500, "A resposta da contraproposta nao retornou uma consulta valida.", {
      code: "CONSULTATION_RESPONSE_EMPTY",
    });
  }

  const email = await maybeSendConsultationEmailNotification({
    previousConsultation,
    currentConsultation: consultation,
    env,
    requestHeaders,
  });

  return {
    consultation,
    email,
    payment: null,
  };
}
