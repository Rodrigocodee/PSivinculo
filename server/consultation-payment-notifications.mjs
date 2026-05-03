import {
  sendPatientConsultationPaymentConfirmedEmail,
  sendPatientConsultationPaymentPendingEmail,
} from "./email.mjs";
import { HttpError } from "./errors.mjs";
import { normalizeNotificationPreferences } from "./notification-preferences.mjs";

const CONSULTATION_EMAIL_EVENTS_TABLE = "consultation_email_events";
const PAYMENT_EMAIL_EVENT_TYPES = Object.freeze({
  PENDING_PATIENT: "payment_pending_patient",
  CONFIRMED_PATIENT: "payment_confirmed_patient",
});

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

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function pickNumber(source, keys) {
  if (!isRecord(source)) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim().replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function maskEmailForLogs(value) {
  const normalizedValue = normalizeEmail(value);
  if (!normalizedValue) return null;

  const [localPart, domain = ""] = normalizedValue.split("@");
  if (!localPart) return `***@${domain}`;

  return `${localPart.slice(0, 2)}***${localPart.length > 3 ? localPart.slice(-1) : ""}@${domain}`;
}

function formatConsultationDate(value) {
  const normalizedValue = normalizeString(value);
  const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);

  if (!match) {
    return {
      dateLabel: "data informada",
      timeLabel: "horario informado",
    };
  }

  return {
    dateLabel: `${match[3]}/${match[2]}/${match[1]}`,
    timeLabel: match[4] + ":" + match[5],
  };
}

function buildPublicBaseUrl(requestHeaders = {}, env = process.env) {
  const configuredBaseUrl = normalizeString(
    env.APP_BASE_URL || env.PUBLIC_APP_URL || env.SITE_URL,
  ).replace(/\/+$/g, "");

  if (configuredBaseUrl) return configuredBaseUrl;

  const host = normalizeString(requestHeaders["x-forwarded-host"]) || normalizeString(requestHeaders.host);
  const proto = normalizeString(requestHeaders["x-forwarded-proto"]).split(",")[0].trim() || "http";

  return host ? `${proto}://${host}` : "";
}

async function resolvePatientDestinationUserId(client, patientId, patientEmail) {
  const normalizedPatientId = normalizeString(patientId);
  const normalizedPatientEmail = normalizeEmail(patientEmail);

  if (normalizedPatientId) {
    try {
      const { data, error } = await client.auth?.admin?.getUserById?.(normalizedPatientId);
      if (!error && data?.user?.id) return data.user.id;
    } catch {
      // Keep the notification best-effort; email is still handled independently.
    }
  }

  if (normalizedPatientId && !normalizedPatientEmail) {
    return normalizedPatientId;
  }

  return normalizedPatientId || null;
}

async function loadPaymentContext(client, consultation) {
  const consultationId = pickString(consultation, ["id"]);
  const psychologistId = pickString(consultation, ["psicologo_id"]);
  const patientId = pickString(consultation, ["paciente_id"]);

  let psychologist = null;
  if (psychologistId) {
    for (const column of ["id", "auth_id"]) {
      const { data, error } = await client
        .from("usuarios")
        .select("id, auth_id, nome, email, notification_preferences")
        .eq(column, psychologistId)
        .limit(1)
        .maybeSingle();

      if (!error && isRecord(data)) {
        psychologist = data;
        break;
      }
    }
  }

  let patient = null;
  if (patientId) {
    const { data, error } = await client
      .from("pacientes")
      .select("id, nome, email")
      .eq("id", patientId)
      .limit(1)
      .maybeSingle();

    if (!error && isRecord(data)) {
      patient = data;
    }
  }

  const patientEmail = normalizeEmail(pickString(patient, ["email"]));

  return {
    consultationId,
    psychologistId,
    psychologistUserId: pickString(psychologist, ["auth_id", "id"]) || psychologistId,
    psychologistName: pickString(psychologist, ["nome"]) || "Seu psicologo",
    patientId,
    patientUserId: await resolvePatientDestinationUserId(client, patientId, patientEmail),
    patientName: pickString(patient, ["nome"]) || "Paciente",
    patientEmail,
    appointmentDateTime: pickString(consultation, ["data_consulta"]),
    amount: pickNumber(consultation, ["valor_consulta"]),
    paymentLink:
      pickString(consultation, ["asaas_invoice_url"]) ||
      pickString(consultation, ["asaas_bank_slip_url"]),
    bankSlipUrl: pickString(consultation, ["asaas_bank_slip_url"]),
    preferences: normalizeNotificationPreferences(psychologist?.notification_preferences),
  };
}

async function hasExistingNotification(client, recipientUserId, consultationId, type) {
  if (!recipientUserId || !consultationId || !type) return false;

  const { data, error } = await client
    .from("notificacoes")
    .select("id")
    .eq("usuario_id_destino", recipientUserId)
    .eq("tipo", type)
    .eq("entidade_tipo", "consulta")
    .eq("entidade_id", consultationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[Psivinculo][notifications][payment_notification_lookup_failed]", {
      consultationId,
      recipientUserId,
      type,
      code: normalizeString(error.code) || "NOTIFICATION_LOOKUP_FAILED",
      message: normalizeString(error.message) || "Unknown notification lookup error",
    });
    return false;
  }

  return isRecord(data);
}

async function createNotification(client, payload, logLabel) {
  if (await hasExistingNotification(client, payload.usuario_id_destino, payload.entidade_id, payload.tipo)) {
    return {
      attempted: true,
      created: false,
      skippedReason: "already_exists",
    };
  }

  const { data, error } = await client
    .from("notificacoes")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[Psivinculo][notifications][payment_notification_insert_failed]", {
      consultationId: payload.entidade_id,
      recipientUserId: payload.usuario_id_destino,
      type: payload.tipo,
      code: normalizeString(error.code) || "NOTIFICATION_INSERT_FAILED",
      message: normalizeString(error.message) || "Unknown notification insert error",
    });
    return {
      attempted: true,
      created: false,
      skippedReason: "insert_failed",
    };
  }

  console.info(`[Psivinculo][notifications][${logLabel}]`, {
    consultationId: payload.entidade_id,
    notificationId: pickString(data, ["id"]) || null,
    recipientUserId: payload.usuario_id_destino,
    type: payload.tipo,
  });

  return {
    attempted: true,
    created: true,
    notificationId: pickString(data, ["id"]) || null,
  };
}

async function ensureEmailEventRow(client, event, nowIso) {
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
    throw new HttpError(500, "Nao foi possivel preparar a deduplicacao do e-mail de pagamento.", {
      code: normalizeString(error.code) || "PAYMENT_EMAIL_EVENT_UPSERT_FAILED",
    });
  }
}

async function claimEmailEvent(client, event, nowIso) {
  await ensureEmailEventRow(client, event, nowIso);

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
    .in("status", ["pending", "failed"])
    .select("id, status")
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Nao foi possivel reservar o e-mail de pagamento.", {
      code: normalizeString(error.code) || "PAYMENT_EMAIL_EVENT_CLAIM_FAILED",
    });
  }

  if (isRecord(data)) {
    return {
      claimed: true,
      rowId: pickString(data, ["id"]),
    };
  }

  return {
    claimed: false,
    reason: "already_sent_or_processing",
  };
}

async function markEmailEvent(client, rowId, status, payload = {}) {
  const normalizedRowId = normalizeString(rowId);
  if (!normalizedRowId) return;

  await client
    .from(CONSULTATION_EMAIL_EVENTS_TABLE)
    .update({
      status,
      erro: status === "failed" ? normalizeString(payload.errorMessage) || "Unknown payment email error" : null,
      enviado_em: status === "sent" ? new Date().toISOString() : null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", normalizedRowId);
}

async function maybeSendPatientPaymentEmail(client, context, eventType, sendEmailFn, options = {}) {
  if (!context.patientEmail) {
    return {
      attempted: true,
      sent: false,
      skippedReason: "missing_patient_email",
    };
  }

  const event = {
    consultationId: context.consultationId,
    eventType,
    recipientEmail: context.patientEmail,
  };
  const nowIso = new Date().toISOString();
  let claimedRowId = "";

  try {
    const claim = await claimEmailEvent(client, event, nowIso);

    if (!claim.claimed) {
      return {
        attempted: true,
        sent: false,
        skippedReason: claim.reason,
      };
    }

    claimedRowId = claim.rowId;
    const result = await sendEmailFn(
      {
        to: context.patientEmail,
        consultationId: context.consultationId,
        patientName: context.patientName,
        psychologistName: context.psychologistName,
        appointmentDateTime: context.appointmentDateTime,
        amount: context.amount,
        paymentLink: context.paymentLink,
        bankSlipUrl: context.bankSlipUrl,
      },
      {
        env: options.env,
        baseUrl: buildPublicBaseUrl(options.requestHeaders, options.env),
      },
    );

    await markEmailEvent(client, claimedRowId, "sent");

    return {
      attempted: true,
      sent: true,
      emailId: normalizeString(result?.emailId) || null,
    };
  } catch (error) {
    await markEmailEvent(
      client,
      claimedRowId,
      "failed",
      {
        errorMessage: error instanceof Error ? error.message : "Unknown payment email error",
      },
    );
    console.warn("[Psivinculo][notifications][payment_email_failed]", {
      consultationId: context.consultationId,
      recipientEmail: maskEmailForLogs(context.patientEmail),
      eventType,
      message: error instanceof Error ? error.message : "Unknown payment email error",
    });

    return {
      attempted: true,
      sent: false,
      skippedReason: "email_failed",
    };
  }
}

function buildPendingMessage(context) {
  const date = formatConsultationDate(context.appointmentDateTime);
  return `Cobranca gerada para a consulta de ${date.dateLabel} as ${date.timeLabel}.`;
}

async function runPaymentCommunications(client, consultation, config, options = {}) {
  const context = await loadPaymentContext(client, consultation);

  if (context.preferences.payments === false) {
    console.info("[Psivinculo][notifications][payment_notification_skipped_due_to_preferences]", {
      consultationId: context.consultationId,
      psychologistId: context.psychologistId || null,
      event: config.event,
      preference: "payments",
    });
    console.info("[Psivinculo][notifications][payment_email_skipped_due_to_preferences]", {
      consultationId: context.consultationId,
      patientId: context.patientId || null,
      event: config.event,
      preference: "payments",
    });

    return {
      skippedReason: "notification_preferences_disabled",
      psychologistNotification: { attempted: true, created: false, skippedReason: "notification_preferences_disabled" },
      patientNotification: { attempted: true, created: false, skippedReason: "notification_preferences_disabled" },
      patientEmail: { attempted: true, sent: false, skippedReason: "notification_preferences_disabled" },
    };
  }

  const psychologistNotification = context.psychologistUserId
    ? await createNotification(
        client,
        {
          usuario_id_destino: context.psychologistUserId,
          tipo: config.notificationType,
          titulo: config.title,
          mensagem: config.psychologistMessage(context),
          rota_destino: `/psi/recebimentos?consultaId=${context.consultationId}`,
          entidade_tipo: "consulta",
          entidade_id: context.consultationId,
        },
        config.notificationLogLabel,
      )
    : { attempted: true, created: false, skippedReason: "missing_destination_user" };

  const patientNotification = context.patientUserId
    ? await createNotification(
        client,
        {
          usuario_id_destino: context.patientUserId,
          tipo: config.notificationType,
          titulo: config.title,
          mensagem: config.patientMessage(context),
          rota_destino: `/paciente/agendamentos?consultaId=${context.consultationId}`,
          entidade_tipo: "consulta",
          entidade_id: context.consultationId,
        },
        config.notificationLogLabel,
      )
    : { attempted: true, created: false, skippedReason: "missing_patient_user" };

  const patientEmail = await maybeSendPatientPaymentEmail(
    client,
    context,
    config.emailEventType,
    config.sendEmail,
    options,
  );

  if (patientEmail.sent) {
    console.info(`[Psivinculo][notifications][${config.emailLogLabel}]`, {
      consultationId: context.consultationId,
      patientId: context.patientId || null,
      patientEmail: maskEmailForLogs(context.patientEmail),
      emailId: patientEmail.emailId || null,
    });
  }

  return {
    psychologistNotification,
    patientNotification,
    patientEmail,
  };
}

export async function notifyConsultationPaymentPending(client, consultation, options = {}) {
  return runPaymentCommunications(
    client,
    consultation,
    {
      event: "payment_pending",
      notificationType: "pagamento_pendente",
      title: "Pagamento pendente",
      psychologistMessage: buildPendingMessage,
      patientMessage: buildPendingMessage,
      notificationLogLabel: "payment_pending_notification_created",
      emailEventType: PAYMENT_EMAIL_EVENT_TYPES.PENDING_PATIENT,
      sendEmail: sendPatientConsultationPaymentPendingEmail,
      emailLogLabel: "payment_pending_email_sent",
    },
    options,
  );
}

export async function notifyConsultationPaymentConfirmed(client, consultation, options = {}) {
  return runPaymentCommunications(
    client,
    consultation,
    {
      event: "payment_confirmed",
      notificationType: "pagamento_recebido",
      title: "Pagamento recebido",
      psychologistMessage: (context) => `${context.patientName} pagou uma consulta.`,
      patientMessage: () => "Pagamento confirmado para sua consulta.",
      notificationLogLabel: "payment_confirmed_notification_created",
      emailEventType: PAYMENT_EMAIL_EVENT_TYPES.CONFIRMED_PATIENT,
      sendEmail: sendPatientConsultationPaymentConfirmedEmail,
      emailLogLabel: "payment_confirmed_email_sent",
    },
    options,
  );
}
