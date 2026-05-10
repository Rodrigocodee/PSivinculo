import { Resend } from "resend";
import { HttpError } from "./errors.mjs";

const DEFAULT_EMAIL_FROM = "Psivinculo <onboarding@resend.dev>";
const DEFAULT_CONSULTATION_AREA_PATH = "/paciente/agendamentos";
const DEFAULT_PSYCHOLOGIST_CONSULTATION_AREA_PATH = "/psi/agenda";
const DEFAULT_PATIENT_REGISTRATION_AREA_PATH = "/cadastro/paciente";
const DEFAULT_CONSULTATION_TIME_ZONE = "America/Sao_Paulo";

let cachedResendClient = null;
let cachedResendApiKey = "";

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

function parseEmailAddress(value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return "";

  const match = normalizedValue.match(/<([^>]+)>/);
  const emailAddress = match ? normalizeEmail(match[1]) : normalizeEmail(normalizedValue);

  return isValidEmail(emailAddress) ? emailAddress : "";
}

function normalizeRecipientList(value) {
  const values = Array.isArray(value) ? value : [value];
  const recipients = [];

  for (const entry of values) {
    const normalizedEntry = normalizeString(entry);
    const parsedEmail = parseEmailAddress(normalizedEntry);

    if (!parsedEmail || recipients.includes(parsedEmail)) {
      continue;
    }

    recipients.push(parsedEmail);
  }

  return recipients;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildDetailRows(details) {
  return details
    .filter((detail) => isRecord(detail))
    .map((detail) => ({
      label: normalizeString(detail.label),
      value: normalizeString(detail.value),
    }))
    .filter((detail) => detail.label && detail.value);
}

function renderConsultationEmailContent(input) {
  const title = normalizeString(input.title) || "Atualizacao de consulta";
  const intro = normalizeString(input.intro) || "Temos uma nova atualizacao no seu agendamento.";
  const footerNote =
    normalizeString(input.footerNote) ||
    "Se voce nao esperava este e-mail, revise sua configuracao de notificacoes no Psivinculo.";
  const ctaLabel = normalizeString(input.ctaLabel);
  const ctaUrl = normalizeString(input.ctaUrl);
  const secondaryCtaLabel = normalizeString(input.secondaryCtaLabel);
  const secondaryCtaUrl = normalizeString(input.secondaryCtaUrl);
  const details = buildDetailRows(input.details);

  const detailsHtml = details.length
    ? `
      <div style="margin-top:24px;border:1px solid #e5e7eb;border-radius:16px;padding:20px;background:#f8fafc;">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">Resumo</p>
        <ul style="margin:0;padding-left:18px;color:#334155;font-size:14px;line-height:1.7;">
          ${details
            .map(
              (detail) =>
                `<li><strong>${escapeHtml(detail.label)}:</strong> ${escapeHtml(detail.value)}</li>`,
            )
            .join("")}
        </ul>
      </div>
    `
    : "";

  const ctaHtml =
    ctaLabel && ctaUrl
      ? `
        <div style="margin-top:24px;">
          <a href="${escapeHtml(
            ctaUrl,
          )}" style="display:inline-block;background:#6477d9;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600;font-size:14px;">
            ${escapeHtml(ctaLabel)}
          </a>
        </div>
      `
      : "";

  const secondaryCtaHtml =
    secondaryCtaLabel && secondaryCtaUrl
      ? `
        <div style="margin-top:12px;">
          <a href="${escapeHtml(
            secondaryCtaUrl,
          )}" style="display:inline-block;background:#ffffff;color:#334155;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600;font-size:14px;border:1px solid #cbd5e1;">
            ${escapeHtml(secondaryCtaLabel)}
          </a>
        </div>
      `
      : "";

  const html = `
    <div style="margin:0;padding:32px 16px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;border:1px solid #e2e8f0;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">
          Psivinculo
        </p>
        <h1 style="margin:0;font-size:24px;line-height:1.25;color:#0f172a;">
          ${escapeHtml(title)}
        </h1>
        <p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#334155;">
          ${escapeHtml(intro)}
        </p>
        ${detailsHtml}
        ${ctaHtml}
        ${secondaryCtaHtml}
        <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#64748b;">
          ${escapeHtml(footerNote)}
        </p>
      </div>
    </div>
  `;

  const textParts = [title, "", intro];

  if (details.length) {
    textParts.push("", "Resumo:");
    for (const detail of details) {
      textParts.push(`- ${detail.label}: ${detail.value}`);
    }
  }

  if (ctaLabel && ctaUrl) {
    textParts.push("", `${ctaLabel}: ${ctaUrl}`);
  }

  if (secondaryCtaLabel && secondaryCtaUrl) {
    textParts.push("", `${secondaryCtaLabel}: ${secondaryCtaUrl}`);
  }

  textParts.push("", footerNote);

  return {
    html,
    text: textParts.join("\n"),
  };
}

function parseConsultationDateTimeParts(value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return null;

  const isoMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);

  if (isoMatch) {
    const [, year, month, day, hour, minute] = isoMatch;

    return {
      dateLabel: `${day}/${month}/${year}`,
      timeLabel: `${hour}:${minute}`,
    };
  }

  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return {
    dateLabel: parsedDate.toLocaleDateString("pt-BR", {
      timeZone: DEFAULT_CONSULTATION_TIME_ZONE,
    }),
    timeLabel: parsedDate.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: DEFAULT_CONSULTATION_TIME_ZONE,
    }),
  };
}

function formatConsultationDateTime(value) {
  const parts = parseConsultationDateTimeParts(value);

  if (!parts) {
    return {
      dateLabel: "Data nao informada",
      timeLabel: "Horario nao informado",
      fullLabel: "Data e horario nao informados",
    };
  }

  return {
    ...parts,
    fullLabel: `${parts.dateLabel} as ${parts.timeLabel}`,
  };
}

function getConsultationModalityLabel(value) {
  const normalizedValue = normalizeString(value).toLowerCase();

  if (normalizedValue === "presencial") return "Presencial";
  if (normalizedValue === "online") return "Online";

  return "A definir";
}

function resolveConsultationCtaUrl(input, options = {}) {
  const explicitCtaUrl = normalizeString(input.ctaUrl);
  if (explicitCtaUrl) return explicitCtaUrl;

  const baseUrl = normalizeString(options.baseUrl).replace(/\/+$/g, "");
  const consultationId = normalizeString(input.consultationId);
  const areaPath =
    normalizeString(options.areaPath) || normalizeString(input.areaPath) || DEFAULT_CONSULTATION_AREA_PATH;
  const appointmentsPath = consultationId
    ? `${areaPath}?consultaId=${encodeURIComponent(consultationId)}`
    : areaPath;

  return baseUrl ? `${baseUrl}${appointmentsPath}` : appointmentsPath;
}

function buildConsultationEmailDetails(input, options = {}) {
  const details = [];
  const patientName = normalizeString(input.patientName);
  const psychologistName = normalizeString(input.psychologistName);
  const appointmentDateTime = formatConsultationDateTime(input.appointmentDateTime);
  const previousAppointmentDateTime = formatConsultationDateTime(input.previousAppointmentDateTime);
  const modalityLabel = getConsultationModalityLabel(input.appointmentModality);
  const presentialLocation = normalizeString(input.presentialLocation);
  const roomLink = normalizeString(input.roomLink);
  const amountLabel = formatCurrency(input.amount);
  const shouldIncludePreviousDateTime =
    options.includePreviousDateTime === true &&
    normalizeString(input.previousAppointmentDateTime) &&
    previousAppointmentDateTime.fullLabel !== appointmentDateTime.fullLabel;

  if (patientName) {
    details.push({ label: "Paciente", value: patientName });
  }

  if (psychologistName) {
    details.push({ label: "Psicologo", value: psychologistName });
  }

  if (shouldIncludePreviousDateTime) {
    details.push({ label: "Horario anterior", value: previousAppointmentDateTime.fullLabel });
  }

  details.push(
    { label: "Data", value: appointmentDateTime.dateLabel },
    { label: "Horario", value: appointmentDateTime.timeLabel },
  );

  details.push({ label: "Modalidade", value: modalityLabel });

  if (roomLink) {
    details.push({
      label: normalizeString(input.appointmentModality).toLowerCase() === "online" ? "Sala online" : "Local",
      value: roomLink,
    });
  } else if (presentialLocation) {
    details.push({ label: "Local", value: presentialLocation });
  }

  if (amountLabel) {
    details.push({ label: "Valor", value: amountLabel });
  }

  return details;
}

function formatCurrency(value) {
  const numericValue = typeof value === "number" ? value : Number(normalizeString(value));

  if (!Number.isFinite(numericValue)) {
    return "";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numericValue);
}

function buildConsultationPaymentEmailDetails(input) {
  const details = buildConsultationEmailDetails(input);
  const amountLabel = formatCurrency(input.amount);
  const paymentLink = normalizeString(input.paymentLink);
  const bankSlipUrl = normalizeString(input.bankSlipUrl);

  if (amountLabel) {
    details.push({ label: "Valor", value: amountLabel });
  }

  if (paymentLink) {
    details.push({ label: "Link de pagamento", value: paymentLink });
  }

  if (bankSlipUrl && bankSlipUrl !== paymentLink) {
    details.push({ label: "Boleto", value: bankSlipUrl });
  }

  return details;
}

function isOnlineConsultation(value) {
  return normalizeString(value).toLowerCase() === "online";
}

function buildOneHourReminderDetails(input) {
  const details = buildConsultationEmailDetails(input);
  const roomLink = normalizeString(input.roomLink);

  if (isOnlineConsultation(input.appointmentModality)) {
    details.push({
      label: "Sala online",
      value: roomLink || "Confira sua area de agendamentos para acessar a sala da consulta.",
    });
  }

  return details;
}

function getResendClient(apiKey) {
  if (cachedResendClient && cachedResendApiKey === apiKey) {
    return cachedResendClient;
  }

  cachedResendClient = new Resend(apiKey);
  cachedResendApiKey = apiKey;

  return cachedResendClient;
}

export function resolveEmailServerConfig(env = process.env) {
  const apiKey = normalizeString(env.RESEND_API_KEY);
  const emailFrom = normalizeString(env.EMAIL_FROM) || DEFAULT_EMAIL_FROM;
  const emailFromAddress = parseEmailAddress(emailFrom);

  if (!apiKey) {
    throw new HttpError(500, "RESEND_API_KEY nao foi configurada no servidor.", {
      code: "RESEND_CONFIG_ERROR",
    });
  }

  if (!emailFromAddress) {
    throw new HttpError(500, "EMAIL_FROM configurado no servidor e invalido.", {
      code: "EMAIL_FROM_INVALID",
      details: {
        fallback: DEFAULT_EMAIL_FROM,
      },
    });
  }

  return {
    apiKey,
    emailFrom,
    emailFromAddress,
  };
}

export async function sendEmail(message, options = {}) {
  const normalizedMessage = isRecord(message) ? message : {};
  const config = resolveEmailServerConfig(options.env);
  const recipients = normalizeRecipientList(normalizedMessage.to);
  const subject = normalizeString(normalizedMessage.subject);
  const html = normalizeString(normalizedMessage.html);
  const text = normalizeString(normalizedMessage.text);
  const replyTo = parseEmailAddress(normalizedMessage.replyTo) || config.emailFromAddress;

  if (recipients.length === 0) {
    throw new HttpError(400, "Informe pelo menos um destinatario valido para enviar o e-mail.", {
      code: "EMAIL_RECIPIENT_INVALID",
    });
  }

  if (!subject) {
    throw new HttpError(400, "Informe um assunto valido para enviar o e-mail.", {
      code: "EMAIL_SUBJECT_REQUIRED",
    });
  }

  if (!html && !text) {
    throw new HttpError(400, "Informe o conteudo do e-mail em html ou text.", {
      code: "EMAIL_CONTENT_REQUIRED",
    });
  }

  const resend = getResendClient(config.apiKey);
  const payload = {
    from: config.emailFrom,
    to: recipients,
    subject,
    html: html || undefined,
    text: text || undefined,
    replyTo,
    tags: Array.isArray(normalizedMessage.tags)
      ? normalizedMessage.tags
          .filter((tag) => isRecord(tag))
          .map((tag) => ({
            name: normalizeString(tag.name),
            value: normalizeString(tag.value),
          }))
          .filter((tag) => tag.name && tag.value)
      : undefined,
  };

  let result;

  try {
    result = await resend.emails.send(payload);
  } catch (error) {
    throw new HttpError(502, "Nao foi possivel concluir a comunicacao com o Resend.", {
      code: "RESEND_COMMUNICATION_FAILED",
      details: {
        message: error instanceof Error ? error.message : "Unknown resend error",
      },
    });
  }

  if (result.error) {
    throw new HttpError(502, "O Resend rejeitou o envio do e-mail.", {
      code: "RESEND_SEND_FAILED",
      details: {
        message: normalizeString(result.error.message) || "Resend send error",
        name: normalizeString(result.error.name) || null,
      },
    });
  }

  return {
    provider: "resend",
    emailId: normalizeString(result.data?.id) || null,
    from: config.emailFrom,
    to: recipients,
    subject,
  };
}

export async function sendConsultationEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const content = renderConsultationEmailContent(normalizedInput);

  return sendEmail(
    {
      to: normalizedInput.to,
      subject: normalizeString(normalizedInput.subject) || "Atualizacao de consulta no Psivinculo",
      html: content.html,
      text: content.text,
      tags: [
        { name: "category", value: "consulta" },
        {
          name: "event",
          value: normalizeString(normalizedInput.event) || "manual_test",
        },
      ],
    },
    options,
  );
}

export async function sendConsultationTestEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const config = resolveEmailServerConfig(options.env);
  const requestedRecipient = normalizeRecipientList(normalizedInput.to);
  const recipients = requestedRecipient.length > 0 ? requestedRecipient : ["delivered@resend.dev"];
  const patientName = normalizeString(normalizedInput.patientName) || "Paciente Teste";
  const psychologistName = normalizeString(normalizedInput.psychologistName) || "Psicologo Teste";
  const scheduledFor = normalizeString(normalizedInput.scheduledFor) || "22/04/2026 as 14:00";
  const baseUrl =
    normalizeString(normalizedInput.ctaUrl) ||
    `${normalizeString(options.baseUrl) || "http://localhost:8080"}/paciente/agendamentos`;
  const recipientDescription =
    recipients[0] === "delivered@resend.dev"
      ? "destinatario oficial de teste do Resend"
      : recipients.join(", ");

  return sendConsultationEmail(
    {
      to: recipients,
      event: "consulta_test",
      subject: normalizeString(normalizedInput.subject) || "Teste de e-mail do Psivinculo",
      title: "Integracao de e-mail pronta para consultas",
      intro:
        normalizeString(normalizedInput.message) ||
        `Este e-mail confirma que o backend do Psivinculo conseguiu enviar uma mensagem real pelo Resend para ${recipientDescription}.`,
      details: [
        { label: "Paciente", value: patientName },
        { label: "Psicologo", value: psychologistName },
        { label: "Horario", value: scheduledFor },
        { label: "Remetente", value: config.emailFrom },
      ],
      ctaLabel: "Abrir area de agendamentos",
      ctaUrl: baseUrl,
      footerNote:
        "A base ja esta pronta para os fluxos de confirmacao, reagendamento e lembretes de consulta.",
    },
    options,
  );
}

export async function sendManualPatientRegistrationEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const patientName = normalizeString(normalizedInput.patientName) || "Paciente";
  const psychologistName = normalizeString(normalizedInput.psychologistName) || "seu psicologo";
  const inviteUrl =
    normalizeString(normalizedInput.inviteUrl) ||
    `${normalizeString(options.baseUrl) || "http://localhost:8080"}${DEFAULT_PATIENT_REGISTRATION_AREA_PATH}`;

  return sendConsultationEmail(
    {
      to: normalizedInput.to,
      event: "paciente_cadastro_manual",
      subject:
        normalizeString(normalizedInput.subject) ||
        "Seu psicologo cadastrou voce no Psivinculo",
      title: "Seu cadastro foi iniciado",
      intro:
        normalizeString(normalizedInput.intro) ||
        `${patientName}, ${psychologistName} cadastrou seus dados no Psivinculo. Para criar seu acesso de paciente, abra o link abaixo e conclua o cadastro.`,
      details: [
        { label: "Paciente", value: patientName },
        { label: "Profissional", value: psychologistName },
      ],
      ctaLabel: "Criar acesso do paciente",
      ctaUrl: inviteUrl,
      footerNote:
        normalizeString(normalizedInput.footerNote) ||
        "Se voce nao esperava este e-mail, entre em contato diretamente com o profissional responsavel antes de criar seu acesso.",
    },
    options,
  );
}

export async function sendPatientConsultationConfirmationEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const appointmentDateTime = formatConsultationDateTime(normalizedInput.appointmentDateTime);
  const patientName = normalizeString(normalizedInput.patientName) || "Paciente";
  const psychologistName = normalizeString(normalizedInput.psychologistName) || "Seu psicologo";

  return sendConsultationEmail(
    {
      to: normalizedInput.to,
      event: "consulta_confirmada",
      subject:
        normalizeString(normalizedInput.subject) || "Sua consulta foi confirmada no Psivinculo",
      title: "Consulta confirmada",
      intro:
        normalizeString(normalizedInput.intro) ||
        `${patientName}, sua consulta com ${psychologistName} foi confirmada para ${appointmentDateTime.fullLabel}.`,
      details: buildConsultationEmailDetails(normalizedInput),
      ctaLabel: "Abrir agendamento",
      ctaUrl: resolveConsultationCtaUrl(normalizedInput, options),
      footerNote:
        normalizeString(normalizedInput.footerNote) ||
        "Em caso de duvidas sobre a consulta, entre em contato diretamente com o seu psicologo.",
    },
    options,
  );
}

export async function sendPatientConsultationRescheduleEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const normalizedStatus = normalizeString(normalizedInput.status).toLowerCase();
  const appointmentDateTime = formatConsultationDateTime(normalizedInput.appointmentDateTime);
  const patientName = normalizeString(normalizedInput.patientName) || "Paciente";
  const psychologistName = normalizeString(normalizedInput.psychologistName) || "Seu psicologo";
  const isCounterproposal = normalizedStatus === "contraproposta";

  return sendConsultationEmail(
    {
      to: normalizedInput.to,
      event: isCounterproposal ? "consulta_contraproposta" : "consulta_reagendada",
      subject:
        normalizeString(normalizedInput.subject) ||
        (isCounterproposal
          ? "Seu psicologo sugeriu um novo horario no Psivinculo"
          : "Sua consulta foi reagendada no Psivinculo"),
      title: isCounterproposal ? "Novo horario sugerido" : "Consulta reagendada",
      intro:
        normalizeString(normalizedInput.intro) ||
        (isCounterproposal
          ? `${patientName}, ${psychologistName} sugeriu um novo horario para sua consulta: ${appointmentDateTime.fullLabel}.`
          : `${patientName}, sua consulta com ${psychologistName} foi atualizada para ${appointmentDateTime.fullLabel}.`),
      details: buildConsultationEmailDetails(normalizedInput, {
        includePreviousDateTime: true,
      }),
      ctaLabel: isCounterproposal ? "Responder horario" : "Ver agendamento",
      ctaUrl: resolveConsultationCtaUrl(normalizedInput, options),
      footerNote:
        normalizeString(normalizedInput.footerNote) ||
        (isCounterproposal
          ? "Abra sua area de agendamentos para aceitar ou recusar esse novo horario."
          : "Confira sua area de agendamentos para acompanhar os detalhes atualizados da consulta."),
    },
    options,
  );
}

export async function sendPatientConsultation12HourReminderEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const appointmentDateTime = formatConsultationDateTime(normalizedInput.appointmentDateTime);
  const patientName = normalizeString(normalizedInput.patientName) || "Paciente";
  const psychologistName = normalizeString(normalizedInput.psychologistName) || "Seu psicologo";

  return sendConsultationEmail(
    {
      to: normalizedInput.to,
      event: "consulta_lembrete_12h_paciente",
      subject:
        normalizeString(normalizedInput.subject) ||
        "Lembrete: sua consulta acontece em cerca de 12 horas",
      title: "Sua consulta esta chegando",
      intro:
        normalizeString(normalizedInput.intro) ||
        `${patientName}, este e um lembrete de que sua consulta com ${psychologistName} acontece em ${appointmentDateTime.fullLabel}.`,
      details: buildConsultationEmailDetails(normalizedInput),
      ctaLabel: "Abrir agendamentos",
      ctaUrl: resolveConsultationCtaUrl(normalizedInput, options),
      footerNote:
        normalizeString(normalizedInput.footerNote) ||
        "Se precisar revisar os detalhes, acesse sua area de agendamentos no Psivinculo.",
    },
    options,
  );
}

export async function sendPatientConsultation1HourReminderEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const appointmentDateTime = formatConsultationDateTime(normalizedInput.appointmentDateTime);
  const patientName = normalizeString(normalizedInput.patientName) || "Paciente";
  const psychologistName = normalizeString(normalizedInput.psychologistName) || "Seu psicologo";
  const roomLink = normalizeString(normalizedInput.roomLink);
  const hasRoomLink = isOnlineConsultation(normalizedInput.appointmentModality) && roomLink;
  const appointmentsUrl = resolveConsultationCtaUrl(normalizedInput, options);

  return sendConsultationEmail(
    {
      to: normalizedInput.to,
      event: "consulta_lembrete_1h_paciente",
      subject:
        normalizeString(normalizedInput.subject) ||
        "Lembrete: sua consulta comeca em cerca de 1 hora",
      title: "Falta 1 hora para sua consulta",
      intro:
        normalizeString(normalizedInput.intro) ||
        `${patientName}, sua consulta com ${psychologistName} comeca em ${appointmentDateTime.fullLabel}.`,
      details: buildOneHourReminderDetails(normalizedInput),
      ctaLabel: hasRoomLink ? "Abrir sala da consulta" : "Abrir agendamentos",
      ctaUrl: hasRoomLink ? roomLink : appointmentsUrl,
      secondaryCtaLabel: hasRoomLink ? "Abrir agendamentos" : "",
      secondaryCtaUrl: hasRoomLink ? appointmentsUrl : "",
      footerNote:
        normalizeString(normalizedInput.footerNote) ||
        (hasRoomLink
          ? "Se precisar revisar os demais detalhes, a consulta tambem continua disponivel na sua area de agendamentos."
          : "Caso o link da sala ainda nao esteja disponivel, acompanhe sua area de agendamentos no Psivinculo."),
    },
    options,
  );
}

export async function sendPsychologistConsultation1HourReminderEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const appointmentDateTime = formatConsultationDateTime(normalizedInput.appointmentDateTime);
  const patientName = normalizeString(normalizedInput.patientName) || "Paciente";
  const psychologistName = normalizeString(normalizedInput.psychologistName) || "Psicologo";
  const roomLink = normalizeString(normalizedInput.roomLink);
  const hasRoomLink = isOnlineConsultation(normalizedInput.appointmentModality) && roomLink;
  const appointmentsUrl = resolveConsultationCtaUrl(normalizedInput, {
    ...options,
    areaPath: DEFAULT_PSYCHOLOGIST_CONSULTATION_AREA_PATH,
  });

  return sendConsultationEmail(
    {
      to: normalizedInput.to,
      event: "consulta_lembrete_1h_psicologo",
      subject:
        normalizeString(normalizedInput.subject) ||
        `Lembrete: consulta com ${patientName} em cerca de 1 hora`,
      title: "Sua proxima consulta comeca em 1 hora",
      intro:
        normalizeString(normalizedInput.intro) ||
        `${psychologistName}, sua consulta com ${patientName} esta marcada para ${appointmentDateTime.fullLabel}.`,
      details: buildOneHourReminderDetails(normalizedInput),
      ctaLabel: hasRoomLink ? "Abrir sala da consulta" : "Abrir agenda",
      ctaUrl: hasRoomLink ? roomLink : appointmentsUrl,
      secondaryCtaLabel: hasRoomLink ? "Abrir agenda" : "",
      secondaryCtaUrl: hasRoomLink ? appointmentsUrl : "",
      footerNote:
        normalizeString(normalizedInput.footerNote) ||
        (hasRoomLink
          ? "Se precisar revisar os demais detalhes, a consulta segue disponivel na sua agenda do Psivinculo."
          : "Se o link da sala ainda nao estiver definido, acompanhe a consulta pela agenda do Psivinculo."),
    },
    options,
  );
}

export async function sendPatientConsultationPaymentPendingEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const appointmentDateTime = formatConsultationDateTime(normalizedInput.appointmentDateTime);
  const patientName = normalizeString(normalizedInput.patientName) || "Paciente";
  const psychologistName = normalizeString(normalizedInput.psychologistName) || "Seu psicologo";
  const paymentLink = normalizeString(normalizedInput.paymentLink);
  const bankSlipUrl = normalizeString(normalizedInput.bankSlipUrl);

  return sendConsultationEmail(
    {
      to: normalizedInput.to,
      event: "pagamento_pendente_paciente",
      subject: normalizeString(normalizedInput.subject) || "Pagamento pendente da sua consulta",
      title: "Pagamento pendente",
      intro:
        normalizeString(normalizedInput.intro) ||
        `${patientName}, a cobranca da sua consulta com ${psychologistName} em ${appointmentDateTime.fullLabel} foi gerada.`,
      details: buildConsultationPaymentEmailDetails(normalizedInput),
      ctaLabel: paymentLink ? "Abrir pagamento" : "Abrir agendamentos",
      ctaUrl: paymentLink || resolveConsultationCtaUrl(normalizedInput, options),
      secondaryCtaLabel: bankSlipUrl && bankSlipUrl !== paymentLink ? "Abrir boleto" : "",
      secondaryCtaUrl: bankSlipUrl && bankSlipUrl !== paymentLink ? bankSlipUrl : "",
      footerNote:
        normalizeString(normalizedInput.footerNote) ||
        "Se ja realizou o pagamento, aguarde a confirmacao automatica pelo Asaas.",
    },
    options,
  );
}

export async function sendPatientConsultationPaymentConfirmedEmail(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const appointmentDateTime = formatConsultationDateTime(normalizedInput.appointmentDateTime);
  const patientName = normalizeString(normalizedInput.patientName) || "Paciente";
  const psychologistName = normalizeString(normalizedInput.psychologistName) || "Seu psicologo";

  return sendConsultationEmail(
    {
      to: normalizedInput.to,
      event: "pagamento_confirmado_paciente",
      subject: normalizeString(normalizedInput.subject) || "Pagamento confirmado no Psivinculo",
      title: "Pagamento confirmado",
      intro:
        normalizeString(normalizedInput.intro) ||
        `${patientName}, o pagamento da sua consulta com ${psychologistName} foi confirmado.`,
      details: buildConsultationPaymentEmailDetails({
        ...normalizedInput,
        paymentLink: "",
        bankSlipUrl: "",
      }),
      ctaLabel: "Abrir agendamento",
      ctaUrl: resolveConsultationCtaUrl(normalizedInput, options),
      footerNote:
        normalizeString(normalizedInput.footerNote) ||
        `Sua consulta segue registrada para ${appointmentDateTime.fullLabel}.`,
    },
    options,
  );
}
