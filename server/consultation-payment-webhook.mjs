import {
  finalizeAsaasWebhookEvent,
  registerAsaasWebhookEvent,
} from "./billing-store.mjs";
import { notifyConsultationPaymentConfirmed } from "./consultation-payment-notifications.mjs";
import { HttpError } from "./errors.mjs";
import { normalizeNotificationPreferences } from "./notification-preferences.mjs";
import { getServerSupabaseClient } from "./supabase.mjs";

const CONSULTATION_WEBHOOK_LOG_PREFIX = "[Psivinculo][asaas-consulta-webhook]";
const EVENT_TO_PAYMENT_STATUS = {
  PAYMENT_RECEIVED: "pago",
  PAYMENT_CONFIRMED: "pago",
  PAYMENT_OVERDUE: "vencido",
  PAYMENT_DELETED: "cancelado",
  PAYMENT_REFUNDED: "cancelado",
};

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalizeString(value),
  );
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

function toSupabaseHttpError(error, fallbackMessage, defaultStatus = 500) {
  if (error instanceof HttpError) {
    return error;
  }

  if (isRecord(error)) {
    return new HttpError(defaultStatus, normalizeString(error.message) || fallbackMessage, {
      code: normalizeString(error.code) || "SUPABASE_REQUEST_FAILED",
      details: {
        details: normalizeString(error.details) || null,
        hint: normalizeString(error.hint) || null,
      },
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

function validateAsaasWebhookRequest(headers, env = process.env) {
  const expectedToken = normalizeString(env.ASAAS_WEBHOOK_TOKEN);

  if (!expectedToken) {
    throw new HttpError(500, "ASAAS_WEBHOOK_TOKEN nao foi configurada no servidor.", {
      code: "ASAAS_WEBHOOK_CONFIG_ERROR",
    });
  }

  const headerCandidates = ["asaas-access-token", "Asaas-Access-Token"];
  const resolvedHeaderName =
    headerCandidates.find((headerName) => Boolean(getHeaderValue(headers, headerName))) ||
    "asaas-access-token";
  const receivedToken = getHeaderValue(headers, resolvedHeaderName);

  if (!receivedToken) {
    console.warn(CONSULTATION_WEBHOOK_LOG_PREFIX, {
      message: "Webhook recebido sem token de autenticacao.",
      headerName: resolvedHeaderName,
    });
    throw new HttpError(401, "Webhook do Asaas recebido sem token de autenticacao.", {
      code: "ASAAS_WEBHOOK_UNAUTHORIZED",
    });
  }

  if (receivedToken !== expectedToken) {
    console.warn(CONSULTATION_WEBHOOK_LOG_PREFIX, {
      message: "Webhook recebido com token invalido.",
      headerName: resolvedHeaderName,
    });
    throw new HttpError(401, "Webhook do Asaas com token invalido.", {
      code: "ASAAS_WEBHOOK_UNAUTHORIZED",
    });
  }
}

function mapWebhookEventToPaymentStatus(eventType) {
  return EVENT_TO_PAYMENT_STATUS[eventType] || null;
}

function resolveWebhookEventId(payload, eventType, paymentId, externalReference) {
  const explicitEventId = normalizeString(payload?.id);

  if (explicitEventId) {
    return explicitEventId;
  }

  return [eventType, paymentId, externalReference].filter(Boolean).join(":");
}

function resolvePaymentDate(payment) {
  if (!isRecord(payment)) return null;

  const dateCandidates = [
    payment.clientPaymentDate,
    payment.paymentDate,
    payment.confirmedDate,
    payment.creditDate,
  ];

  for (const candidate of dateCandidates) {
    const normalizedCandidate = normalizeString(candidate);

    if (normalizedCandidate) {
      return normalizedCandidate;
    }
  }

  return null;
}

function shouldPersistPaymentDate(consultation) {
  return isRecord(consultation) && Object.prototype.hasOwnProperty.call(consultation, "data_pagamento");
}

function shouldPersistConsultationColumn(consultation, columnName) {
  return isRecord(consultation) && Object.prototype.hasOwnProperty.call(consultation, columnName);
}

async function findConsultationById(client, consultationId) {
  if (!consultationId) return null;

  const { data, error } = await client
    .from("consultas")
    .select("*")
    .eq("id", consultationId)
    .maybeSingle();

  if (error) {
    throw toSupabaseHttpError(error, "Nao foi possivel localizar a consulta do webhook.");
  }

  return isRecord(data) ? data : null;
}

async function findConsultationByPaymentId(client, paymentId) {
  if (!paymentId) return null;

  const { data, error } = await client
    .from("consultas")
    .select("*")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle();

  if (error) {
    throw toSupabaseHttpError(error, "Nao foi possivel localizar a consulta do webhook.");
  }

  return isRecord(data) ? data : null;
}

async function resolveConsultationForWebhook(client, externalReference, paymentId) {
  const consultationByPaymentId = await findConsultationByPaymentId(client, paymentId);

  if (consultationByPaymentId) {
    return {
      consultation: consultationByPaymentId,
      lookupSource: "asaas_payment_id",
    };
  }

  if (isUuid(externalReference)) {
    const consultationByExternalReference = await findConsultationById(client, externalReference);

    if (consultationByExternalReference) {
      return {
        consultation: consultationByExternalReference,
        lookupSource: "externalReference",
      };
    }
  }

  return {
    consultation: null,
    lookupSource: null,
  };
}

async function updateConsultationPaymentStatus(client, consultation, nextStatus, paymentId, payment) {
  const updatePayload = {
    status_pagamento: nextStatus,
    asaas_payment_id: paymentId || normalizeString(consultation?.asaas_payment_id) || null,
  };

  if (nextStatus === "pago" && shouldPersistPaymentDate(consultation)) {
    const paymentDate = resolvePaymentDate(payment);

    if (paymentDate) {
      updatePayload.data_pagamento = paymentDate;
    }
  }

  if (shouldPersistConsultationColumn(consultation, "asaas_invoice_url")) {
    const invoiceUrl = pickString(payment, ["invoiceUrl", "invoiceURL", "paymentLink"]);

    if (invoiceUrl) {
      updatePayload.asaas_invoice_url = invoiceUrl;
    }
  }

  if (shouldPersistConsultationColumn(consultation, "asaas_bank_slip_url")) {
    const bankSlipUrl = pickString(payment, ["bankSlipUrl", "bankSlipURL"]);

    if (bankSlipUrl) {
      updatePayload.asaas_bank_slip_url = bankSlipUrl;
    }
  }

  const { data, error } = await client
    .from("consultas")
    .update(updatePayload)
    .eq("id", consultation.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw toSupabaseHttpError(error, "Nao foi possivel atualizar o pagamento da consulta.");
  }

  return isRecord(data) ? data : {
    ...consultation,
    ...updatePayload,
  };
}

async function loadPsychologistPaymentNotificationContext(client, consultation) {
  const consultationId = normalizeString(consultation?.id);
  const psychologistId = pickString(consultation, ["psicologo_id"]);
  const patientId = pickString(consultation, ["paciente_id"]);
  let psychologist = null;

  if (psychologistId) {
    const { data, error } = await client
      .from("usuarios")
      .select("id, auth_id, notification_preferences")
      .eq("id", psychologistId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.info("[Psivinculo][notifications][notification_preferences_loaded]", {
        consultationId,
        psychologistId,
        flow: "consultation_payment_webhook",
        source: "defaults_lookup_error",
        errorCode: normalizeString(error.code) || null,
        errorMessage: normalizeString(error.message) || null,
        preferences: normalizeNotificationPreferences(null),
      });
    } else if (isRecord(data)) {
      psychologist = data;
    }
  }

  const preferences = normalizeNotificationPreferences(psychologist?.notification_preferences);
  if (psychologist || !psychologistId) {
    console.info("[Psivinculo][notifications][notification_preferences_loaded]", {
      consultationId,
      psychologistId: psychologistId || null,
      flow: "consultation_payment_webhook",
      source: psychologist
        ? isRecord(psychologist.notification_preferences)
          ? "public.usuarios"
          : "defaults_empty_preferences"
        : "defaults_missing_psychologist_id",
      preferences,
    });
  }

  let patientName = "";
  if (patientId) {
    const { data: patient, error: patientError } = await client
      .from("pacientes")
      .select("id, nome")
      .eq("id", patientId)
      .limit(1)
      .maybeSingle();

    if (!patientError && isRecord(patient)) {
      patientName = pickString(patient, ["nome"]);
    }
  }

  return {
    consultationId,
    psychologistId,
    destinationUserId: pickString(psychologist, ["auth_id", "id"]) || psychologistId,
    patientName: patientName || "Paciente",
    preferences,
  };
}

function resolvePaymentNotificationConfig(status) {
  if (status === "pago") {
    return {
      type: "pagamento_recebido",
      title: "Pagamento recebido",
      message: (patientName) => `${patientName} pagou uma consulta.`,
      event: "payment_received",
    };
  }

  if (status === "vencido") {
    return {
      type: "pagamento_vencido",
      title: "Pagamento vencido",
      message: (patientName) => `O pagamento de ${patientName} venceu.`,
      event: "payment_overdue",
    };
  }

  return null;
}

async function hasExistingPaymentNotification(client, consultationId, notificationType) {
  if (!consultationId || !notificationType) return false;

  const { data, error } = await client
    .from("notificacoes")
    .select("id")
    .eq("tipo", notificationType)
    .eq("entidade_tipo", "consulta")
    .eq("entidade_id", consultationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[Psivinculo][notifications][payment_notification_lookup_failed]", {
      consultationId,
      notificationType,
      code: normalizeString(error.code) || "NOTIFICATION_LOOKUP_FAILED",
      message: normalizeString(error.message) || "Unknown notification lookup error",
    });
    return false;
  }

  return isRecord(data);
}

async function maybeCreatePaymentNotification(client, previousConsultation, updatedConsultation, options = {}) {
  const previousStatus = normalizeString(previousConsultation?.status_pagamento).toLowerCase();
  const nextStatus = normalizeString(updatedConsultation?.status_pagamento).toLowerCase();
  const consultationId = normalizeString(updatedConsultation?.id || previousConsultation?.id);
  const notificationConfig = resolvePaymentNotificationConfig(nextStatus);

  if (!notificationConfig || previousStatus === nextStatus) {
    return {
      attempted: false,
      created: false,
      skippedReason: "not_payment_transition",
    };
  }

  if (nextStatus === "pago") {
    try {
      return await notifyConsultationPaymentConfirmed(client, updatedConsultation, options);
    } catch (error) {
      console.warn("[Psivinculo][notifications][payment_confirmed_notification_failed]", {
        consultationId,
        code: error instanceof HttpError ? error.code : "PAYMENT_NOTIFICATION_FAILED",
        message: error instanceof Error ? error.message : "Unknown payment notification error",
      });
      return {
        attempted: true,
        created: false,
        skippedReason: "notification_failed",
      };
    }
  }

  try {
    const context = await loadPsychologistPaymentNotificationContext(client, updatedConsultation);

    if (context.preferences.payments === false) {
      console.info("[Psivinculo][notifications][notification_skipped_due_to_preferences]", {
        consultationId,
        psychologistId: context.psychologistId || null,
        event: notificationConfig.event,
        preference: "payments",
      });
      return {
        attempted: true,
        created: false,
        skippedReason: "notification_preferences_disabled",
      };
    }

    if (!context.destinationUserId) {
      console.warn("[Psivinculo][notifications][payment_notification_skipped_missing_destination]", {
        consultationId,
        psychologistId: context.psychologistId || null,
      });
      return {
        attempted: true,
        created: false,
        skippedReason: "missing_destination_user",
      };
    }

    if (await hasExistingPaymentNotification(client, consultationId, notificationConfig.type)) {
      console.info("[Psivinculo][notifications][payment_notification_duplicate_skipped]", {
        consultationId,
        psychologistId: context.psychologistId || null,
        event: notificationConfig.event,
      });
      return {
        attempted: true,
        created: false,
        skippedReason: "already_exists",
      };
    }

    const { data, error } = await client
      .from("notificacoes")
      .insert({
        usuario_id_destino: context.destinationUserId,
        tipo: notificationConfig.type,
        titulo: notificationConfig.title,
        mensagem: notificationConfig.message(context.patientName),
        rota_destino: `/psi/recebimentos?consultaId=${consultationId}`,
        entidade_tipo: "consulta",
        entidade_id: consultationId,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("[Psivinculo][notifications][payment_notification_insert_failed]", {
        consultationId,
        psychologistId: context.psychologistId || null,
        code: normalizeString(error.code) || "NOTIFICATION_INSERT_FAILED",
        message: normalizeString(error.message) || "Unknown notification insert error",
      });
      return {
        attempted: true,
        created: false,
        skippedReason: "insert_failed",
      };
    }

    console.info("[Psivinculo][notifications][notification_sent]", {
      consultationId,
      notificationId: pickString(data, ["id"]) || null,
      psychologistId: context.psychologistId || null,
      recipientUserId: context.destinationUserId,
      event: notificationConfig.event,
      preference: "payments",
    });

    return {
      attempted: true,
      created: true,
      notificationId: pickString(data, ["id"]) || null,
    };
  } catch (error) {
    console.warn("[Psivinculo][notifications][payment_notification_failed]", {
      consultationId,
      code: error instanceof HttpError ? error.code : "PAYMENT_NOTIFICATION_FAILED",
      message: error instanceof Error ? error.message : "Unknown payment notification error",
    });
    return {
      attempted: true,
      created: false,
      skippedReason: "notification_failed",
    };
  }
}

function buildWebhookLogPayload(input) {
  return {
    event: input.event,
    paymentId: input.paymentId || null,
    externalReference: input.externalReference || null,
    consultaId: input.consultaId || null,
    consultaLookupSource: input.lookupSource || null,
    statusAnterior: input.previousStatus || null,
    novoStatus: input.nextStatus || null,
    duplicate: input.duplicate === true,
    ignored: input.ignored === true,
  };
}

export async function handleConsultationAsaasWebhook(payload, options = {}) {
  if (!isRecord(payload)) {
    throw new HttpError(400, "O webhook do Asaas precisa enviar um objeto JSON valido.", {
      code: "INVALID_WEBHOOK_PAYLOAD",
    });
  }

  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
  validateAsaasWebhookRequest(requestHeaders, env);

  const eventType = normalizeString(payload.event).toUpperCase();
  const payment = isRecord(payload.payment) ? payload.payment : null;
  const paymentId = normalizeString(payment?.id);
  const externalReference = normalizeString(payment?.externalReference);
  const eventId = resolveWebhookEventId(payload, eventType, paymentId, externalReference);

  if (!eventType) {
    throw new HttpError(400, "Webhook do Asaas sem tipo de evento.", {
      code: "INVALID_WEBHOOK_PAYLOAD",
    });
  }

  if (!eventId) {
    throw new HttpError(400, "Webhook do Asaas sem identificador suficiente para processamento.", {
      code: "INVALID_WEBHOOK_PAYLOAD",
    });
  }

  const registration = await registerAsaasWebhookEvent(
    {
      eventId,
      eventType,
      asaasPaymentId: paymentId || null,
      payload,
    },
    env,
  );

  if (registration.duplicate) {
    console.info(
      CONSULTATION_WEBHOOK_LOG_PREFIX,
      buildWebhookLogPayload({
        event: eventType,
        paymentId,
        externalReference,
        duplicate: true,
        ignored: true,
      }),
    );

    return {
      received: true,
      duplicate: true,
      eventId,
      eventType,
    };
  }

  try {
    const client = getServerSupabaseClient(env);
    const mappedStatus = mapWebhookEventToPaymentStatus(eventType);
    const { consultation, lookupSource } = await resolveConsultationForWebhook(
      client,
      externalReference,
      paymentId,
    );
    const previousStatus = normalizeString(consultation?.status_pagamento) || null;

    if (!mappedStatus) {
      console.info(
        CONSULTATION_WEBHOOK_LOG_PREFIX,
        buildWebhookLogPayload({
          event: eventType,
          paymentId,
          externalReference,
          consultaId: normalizeString(consultation?.id) || null,
          lookupSource,
          previousStatus,
          ignored: true,
        }),
      );

      await finalizeAsaasWebhookEvent(
        {
          eventId,
          status: "processed",
        },
        env,
      );

      return {
        received: true,
        duplicate: false,
        ignored: true,
        eventId,
        eventType,
        consultationId: normalizeString(consultation?.id) || null,
      };
    }

    if (!consultation) {
      console.warn(
        CONSULTATION_WEBHOOK_LOG_PREFIX,
        buildWebhookLogPayload({
          event: eventType,
          paymentId,
          externalReference,
          nextStatus: mappedStatus,
          ignored: true,
        }),
      );

      await finalizeAsaasWebhookEvent(
        {
          eventId,
          status: "processed",
        },
        env,
      );

      return {
        received: true,
        duplicate: false,
        ignored: true,
        notFound: true,
        eventId,
        eventType,
      };
    }

    const updatedConsultation = await updateConsultationPaymentStatus(
      client,
      consultation,
      mappedStatus,
      paymentId,
      payment,
    );
    const notification = await maybeCreatePaymentNotification(
      client,
      consultation,
      updatedConsultation,
      {
        env,
        requestHeaders,
      },
    );

    console.info(
      CONSULTATION_WEBHOOK_LOG_PREFIX,
      buildWebhookLogPayload({
        event: eventType,
        paymentId,
        externalReference,
        consultaId: normalizeString(updatedConsultation?.id) || normalizeString(consultation?.id) || null,
        lookupSource,
        previousStatus,
        nextStatus: normalizeString(updatedConsultation?.status_pagamento) || mappedStatus,
      }),
    );

    await finalizeAsaasWebhookEvent(
      {
        eventId,
        status: "processed",
      },
      env,
    );

    return {
      received: true,
      duplicate: false,
      eventId,
      eventType,
      consultationId: normalizeString(updatedConsultation?.id) || normalizeString(consultation?.id) || null,
      paymentStatus: normalizeString(updatedConsultation?.status_pagamento) || mappedStatus,
      notification,
    };
  } catch (error) {
    await finalizeAsaasWebhookEvent(
      {
        eventId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown webhook processing error",
      },
      env,
    );

    throw error;
  }
}
