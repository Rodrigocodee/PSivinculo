import {
  asaasRequest,
  calculateNextDueDate,
  findOrCreateCustomer,
  getAsaasConfig,
  logAsaasEvent,
} from "./asaas.mjs";
import { notifyConsultationPaymentPending } from "./consultation-payment-notifications.mjs";
import { HttpError } from "./errors.mjs";
import { assertProfessionalAccessForAuthenticatedUser } from "./professional-access.mjs";
import {
  extractBearerToken,
  getRequestSupabaseClient,
  getServerSupabaseClient,
  resolveSupabaseAuthUser,
} from "./supabase.mjs";

const CONSULTATION_PAYMENT_BILLING_TYPE = "UNDEFINED";
const PSYCHOLOGIST_SPLIT_PERCENTUAL_VALUE = 95;
const PAYMENT_STATUS_EXTERNAL = "nao_gerado";
const PAYMENT_STATUS_PENDING = "aguardando_pagamento";
const PAYMENT_STATUS_ERROR = "erro";
const CONSULTATION_VALUE_REQUIRED_MESSAGE =
  "Configure o valor da consulta em Consulta antes de usar pagamentos online.";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeDigits(value) {
  return normalizeString(value).replace(/\D/g, "");
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
      const normalizedValue = value.trim();
      let parsed = Number(normalizedValue);

      if (!Number.isFinite(parsed) && /^\d{1,3}(\.\d{3})*,\d+$/.test(normalizedValue)) {
        parsed = Number(normalizedValue.replace(/\./g, "").replace(",", "."));
      }

      if (!Number.isFinite(parsed) && /^\d+,\d+$/.test(normalizedValue)) {
        parsed = Number(normalizedValue.replace(",", "."));
      }

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function pickRawValue(source, keys) {
  if (!isRecord(source)) return null;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key] ?? null;
    }
  }

  return null;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
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

function maskWalletIdForLogs(value) {
  const normalizedValue = normalizeString(value);

  if (!normalizedValue) return null;
  if (normalizedValue.length <= 10) {
    return `${normalizedValue.slice(0, 4)}***`;
  }

  return `${normalizedValue.slice(0, 6)}***${normalizedValue.slice(-4)}`;
}

function logConsultationValueResolution(payload) {
  console.info("[Psivinculo][valor-consulta]", payload);
  logAsaasEvent("consultation_payment_value_resolution", payload);
}

function toSupabaseHttpError(error, fallbackMessage, defaultStatus = 400) {
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

async function resolveAuthenticatedConsultationContext(consultationId, options = {}) {
  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
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

  const userClient = getRequestSupabaseClient(accessToken, env);
  const serviceClient = getServerSupabaseClient(env);
  const { data, error } = await userClient
    .from("consultas")
    .select("*")
    .eq("id", consultationId)
    .maybeSingle();

  if (error) {
    throw toSupabaseHttpError(error, "Nao foi possivel localizar a consulta informada.");
  }

  if (!isRecord(data)) {
    throw new HttpError(404, "Nao foi possivel localizar a consulta informada.", {
      code: "CONSULTATION_NOT_FOUND",
    });
  }

  return {
    env,
    requestHeaders,
    authenticatedUser,
    userClient,
    serviceClient,
    consultation: data,
  };
}

async function loadPsychologistFinancialSettings(client, psychologistId, authenticatedUserId = "") {
  const normalizedPsychologistId = normalizeString(psychologistId);
  const normalizedAuthenticatedUserId = normalizeString(authenticatedUserId);

  if (!normalizedPsychologistId && !normalizedAuthenticatedUserId) {
    throw new HttpError(409, "A consulta nao possui um psicologo responsavel vinculado.", {
      code: "CONSULTATION_PSYCHOLOGIST_ID_MISSING",
    });
  }

  const candidates = [
    normalizedPsychologistId,
    normalizedAuthenticatedUserId,
  ].filter((value, index, collection) => value && collection.indexOf(value) === index);
  let resolvedRow = null;

  for (const candidateValue of candidates) {
    for (const column of ["id", "auth_id"]) {
      const { data, error } = await client
        .from("usuarios")
        .select("id, auth_id, clinica_id, nome, email, tipo_recebimento, asaas_wallet_id, percentual_repasse, valor_consulta")
        .eq(column, candidateValue)
        .limit(1)
        .maybeSingle();

      if (error || !isRecord(data)) {
        continue;
      }

      if (!resolvedRow) {
        resolvedRow = data;
        continue;
      }

      const currentResolvedValue = pickNumber(resolvedRow, ["valor_consulta"]);
      const nextValue = pickNumber(data, ["valor_consulta"]);

      if (
        (currentResolvedValue == null || currentResolvedValue <= 0) &&
        nextValue != null &&
        nextValue > 0
      ) {
        resolvedRow = data;
      }
    }
  }

  if (resolvedRow) {
    return resolvedRow;
  }

  throw new HttpError(404, "Nao foi possivel localizar as configuracoes financeiras do psicologo.", {
    code: "PSYCHOLOGIST_FINANCIAL_SETTINGS_NOT_FOUND",
  });
}

async function loadPatientForBilling(client, patientId) {
  const normalizedPatientId = normalizeString(patientId);

  if (!normalizedPatientId) {
    throw new HttpError(409, "A consulta nao possui um paciente vinculado.", {
      code: "CONSULTATION_PATIENT_ID_MISSING",
    });
  }

  const { data, error } = await client
    .from("pacientes")
    .select("id, nome, email, telefone, cpf")
    .eq("id", normalizedPatientId)
    .maybeSingle();

  if (error) {
    throw toSupabaseHttpError(error, "Nao foi possivel localizar os dados do paciente.", 500);
  }

  if (!isRecord(data)) {
    throw new HttpError(404, "Nao foi possivel localizar o paciente vinculado a consulta.", {
      code: "PATIENT_NOT_FOUND",
    });
  }

  return data;
}

function resolveConsultationValue(consultation) {
  const consultationValue = pickNumber(consultation, ["valor_consulta"]);

  if (consultationValue == null || !Number.isFinite(consultationValue) || consultationValue <= 0) {
    throw new HttpError(409, CONSULTATION_VALUE_REQUIRED_MESSAGE, {
      code: "CONSULTATION_VALUE_REQUIRED",
    });
  }

  return Number(consultationValue.toFixed(2));
}

async function ensureConsultationValueBeforePayment(
  client,
  consultation,
  psychologistFinancialSettings,
  options = {},
) {
  const requireValue = options.requireValue === true;
  const consultationId = pickString(consultation, ["id"]);
  const psychologistId = pickString(consultation, ["psicologo_id"]);
  const consultationValueRaw = pickRawValue(consultation, ["valor_consulta"]);
  const userConsultationValueRaw = pickRawValue(psychologistFinancialSettings, ["valor_consulta"]);
  const existingConsultationValue = pickNumber(consultation, ["valor_consulta"]);

  if (
    existingConsultationValue != null &&
    Number.isFinite(existingConsultationValue) &&
    existingConsultationValue > 0
  ) {
    const finalValueUsed = Number(existingConsultationValue.toFixed(2));
    logConsultationValueResolution({
      origem: "pagamento",
      consultaId: consultationId || null,
      consultationId: consultationId || null,
      psicologoId: psychologistId || null,
      valorConsultaNaConsulta: consultationValueRaw,
      valorConsultaNoUsuario: userConsultationValueRaw,
      valorFinalUsado: finalValueUsed,
      "consulta.valor_consulta": consultationValueRaw,
      "usuario.valor_consulta": userConsultationValueRaw,
      updatedFromSettings: false,
    });

    return {
      consultation,
      consultationValue: finalValueUsed,
      updatedFromSettings: false,
    };
  }

  const configuredConsultationValue = pickNumber(psychologistFinancialSettings, ["valor_consulta"]);

  if (
    configuredConsultationValue != null &&
    Number.isFinite(configuredConsultationValue) &&
    configuredConsultationValue > 0
  ) {
    const normalizedConsultationValue = Number(configuredConsultationValue.toFixed(2));
    const updatedConsultation =
      (await updateConsultationPaymentSnapshot(client, consultationId, {
        valor_consulta: normalizedConsultationValue,
      })) || {
        ...consultation,
        valor_consulta: normalizedConsultationValue,
      };

    logConsultationValueResolution({
      origem: "pagamento",
      consultaId: consultationId || null,
      consultationId: consultationId || null,
      psicologoId: psychologistId || null,
      valorConsultaNaConsulta: consultationValueRaw,
      valorConsultaNoUsuario: userConsultationValueRaw,
      valorFinalUsado: normalizedConsultationValue,
      "consulta.valor_consulta": consultationValueRaw,
      "usuario.valor_consulta": userConsultationValueRaw,
      updatedFromSettings: true,
    });

    return {
      consultation: updatedConsultation,
      consultationValue: normalizedConsultationValue,
      updatedFromSettings: true,
    };
  }

  if (requireValue) {
    logConsultationValueResolution({
      origem: "pagamento",
      consultaId: consultationId || null,
      consultationId: consultationId || null,
      psicologoId: psychologistId || null,
      valorConsultaNaConsulta: consultationValueRaw,
      valorConsultaNoUsuario: userConsultationValueRaw,
      valorFinalUsado: null,
      "consulta.valor_consulta": consultationValueRaw,
      "usuario.valor_consulta": userConsultationValueRaw,
      updatedFromSettings: false,
    });

    throw new HttpError(409, CONSULTATION_VALUE_REQUIRED_MESSAGE, {
      code: "CONSULTATION_VALUE_REQUIRED",
      details: {
        consultationId: consultationId || null,
      },
    });
  }

  return {
    consultation,
    consultationValue: null,
    updatedFromSettings: false,
  };
}

function resolveConsultationDueDate(consultation) {
  const today = calculateNextDueDate();
  const consultationDateTime = normalizeString(consultation?.data_consulta);
  const consultationDate =
    /^\d{4}-\d{2}-\d{2}/.test(consultationDateTime)
      ? consultationDateTime.slice(0, 10)
      : "";

  if (!consultationDate) {
    return today;
  }

  return consultationDate >= today ? consultationDate : today;
}

function buildCustomerInput(patient) {
  const name =
    pickString(patient, ["nome", "name", "full_name"]) ||
    buildDisplayNameFromEmail(pickString(patient, ["email"]), "Paciente");
  const email = normalizeEmail(pickString(patient, ["email"]));
  const cpfCnpj = normalizeDigits(pickString(patient, ["cpf"]));
  const phone = normalizeDigits(pickString(patient, ["telefone", "phone", "celular"]));

  if (!name) {
    throw new HttpError(400, "Nao foi possivel identificar o nome do paciente para gerar a cobranca.", {
      code: "PATIENT_NAME_REQUIRED",
    });
  }

  if (!email || !isValidEmail(email)) {
    throw new HttpError(400, "O paciente precisa ter um e-mail valido para gerar a cobranca.", {
      code: "PATIENT_EMAIL_REQUIRED",
    });
  }

  if (![11, 14].includes(cpfCnpj.length)) {
    throw new HttpError(400, "O paciente precisa ter um CPF valido para gerar a cobranca no Asaas.", {
      code: "PATIENT_DOCUMENT_REQUIRED",
    });
  }

  if (phone && ![10, 11].includes(phone.length)) {
    throw new HttpError(400, "O telefone do paciente esta invalido para a cobranca.", {
      code: "PATIENT_PHONE_INVALID",
    });
  }

  return {
    name,
    email,
    cpfCnpj,
    phone: phone || undefined,
    externalReference: pickString(patient, ["id"]) || undefined,
  };
}

function buildConsultationPaymentLink(consultation) {
  return (
    pickString(consultation, ["asaas_invoice_url"]) ||
    pickString(consultation, ["asaas_bank_slip_url"]) ||
    null
  );
}

async function updateConsultationPaymentSnapshot(client, consultationId, payload) {
  const { data, error } = await client
    .from("consultas")
    .update(payload)
    .eq("id", consultationId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw toSupabaseHttpError(error, "Nao foi possivel salvar o estado de pagamento da consulta.", 500);
  }

  return isRecord(data) ? data : null;
}

async function markConsultationPaymentError(client, consultationId, message) {
  try {
    await client
      .from("consultas")
      .update({
        status_pagamento: PAYMENT_STATUS_ERROR,
      })
      .eq("id", consultationId);
  } catch (error) {
    logAsaasEvent("consultation_payment_error_persist_failed", {
      consultationId,
      message,
      persistMessage: error instanceof Error ? error.message : "Unknown persistence error",
    });
  }
}

function buildExternalPaymentResult(consultation) {
  return {
    consultationId: pickString(consultation, ["id"]),
    paymentMode: "external",
    paymentStatus: pickString(consultation, ["status_pagamento"]) || PAYMENT_STATUS_EXTERNAL,
    created: false,
    reusedExisting: false,
    success: true,
    asaasPaymentId: pickString(consultation, ["asaas_payment_id"]) || null,
    invoiceUrl: buildConsultationPaymentLink(consultation),
    bankSlipUrl: pickString(consultation, ["asaas_bank_slip_url"]) || null,
    billingType: null,
    externalReference: pickString(consultation, ["id"]) || null,
    splitSent: false,
    walletIdMasked: null,
    payoutPercentage: null,
    message: "Pagamento combinado diretamente entre paciente e psicologo.",
    errorCode: null,
  };
}

function buildExistingPaymentResult(consultation, psychologistFinancialSettings) {
  return {
    consultationId: pickString(consultation, ["id"]),
    paymentMode:
      pickString(psychologistFinancialSettings, ["tipo_recebimento"]) === "asaas_split"
        ? "asaas_split"
        : "external",
    paymentStatus: pickString(consultation, ["status_pagamento"]) || PAYMENT_STATUS_PENDING,
    created: false,
    reusedExisting: true,
    success: true,
    asaasPaymentId: pickString(consultation, ["asaas_payment_id"]) || null,
    invoiceUrl: buildConsultationPaymentLink(consultation),
    bankSlipUrl: pickString(consultation, ["asaas_bank_slip_url"]) || null,
    billingType: CONSULTATION_PAYMENT_BILLING_TYPE,
    externalReference: pickString(consultation, ["id"]) || null,
    splitSent: pickString(psychologistFinancialSettings, ["tipo_recebimento"]) === "asaas_split",
    walletIdMasked: maskWalletIdForLogs(pickString(psychologistFinancialSettings, ["asaas_wallet_id"])),
    payoutPercentage:
      pickString(psychologistFinancialSettings, ["tipo_recebimento"]) === "asaas_split"
        ? PSYCHOLOGIST_SPLIT_PERCENTUAL_VALUE
        : null,
    message: "A consulta ja possui uma cobranca Asaas vinculada.",
    errorCode: null,
  };
}

export async function createConsultationPayment(payload = {}, options = {}) {
  const consultationId = normalizeString(payload?.consultaId || payload?.consultationId);

  if (!consultationId) {
    throw new HttpError(400, "Informe o id da consulta para gerar a cobranca.", {
      code: "CONSULTATION_ID_REQUIRED",
    });
  }

  const context = await resolveAuthenticatedConsultationContext(consultationId, options);
  const { serviceClient, consultation } = context;
  await assertProfessionalAccessForAuthenticatedUser(
    serviceClient,
    context.authenticatedUser,
  );
  const currentStatus = normalizeString(consultation.status).toLowerCase();

  if (currentStatus !== "confirmada") {
    throw new HttpError(409, "A cobranca so pode ser gerada para consultas confirmadas.", {
      code: "CONSULTATION_NOT_CONFIRMED",
      details: {
        consultationId,
        status: currentStatus || null,
      },
    });
  }

  const psychologistFinancialSettings = await loadPsychologistFinancialSettings(
    serviceClient,
    pickString(consultation, ["psicologo_id"]),
    normalizeString(context.authenticatedUser?.id),
  );
  const existingAsaasPaymentId = pickString(consultation, ["asaas_payment_id"]);

  if (existingAsaasPaymentId) {
    logAsaasEvent("consultation_payment_reused_existing", {
      consultationId,
      paymentId: existingAsaasPaymentId,
      invoiceUrl: buildConsultationPaymentLink(consultation),
      splitSent: pickString(psychologistFinancialSettings, ["tipo_recebimento"]) === "asaas_split",
      walletIdMasked: maskWalletIdForLogs(
        pickString(psychologistFinancialSettings, ["asaas_wallet_id"]),
      ),
      percentualValue:
        pickString(psychologistFinancialSettings, ["tipo_recebimento"]) === "asaas_split"
          ? PSYCHOLOGIST_SPLIT_PERCENTUAL_VALUE
          : null,
    });

    return buildExistingPaymentResult(consultation, psychologistFinancialSettings);
  }

  const paymentMode = pickString(psychologistFinancialSettings, ["tipo_recebimento"]) === "asaas_split"
    ? "asaas_split"
    : "external";
  const consultationValueState = await ensureConsultationValueBeforePayment(
    serviceClient,
    consultation,
    psychologistFinancialSettings,
    {
      requireValue: paymentMode === "asaas_split",
    },
  );
  const resolvedConsultation = consultationValueState.consultation;

  if (paymentMode === "external") {
    const updatedConsultation =
      (await updateConsultationPaymentSnapshot(serviceClient, consultationId, {
        status_pagamento: PAYMENT_STATUS_EXTERNAL,
      })) || resolvedConsultation;

    logAsaasEvent("consultation_payment_skipped_external", {
      consultationId,
      paymentMode,
      message: "Pagamento combinado diretamente entre paciente e psicologo.",
    });

    return buildExternalPaymentResult(updatedConsultation);
  }

  const walletId = pickString(psychologistFinancialSettings, ["asaas_wallet_id"]);

  if (!walletId) {
    await markConsultationPaymentError(
      serviceClient,
      consultationId,
      "Wallet ID do psicologo ausente para split.",
    );
    throw new HttpError(400, "Ative um Wallet ID do Asaas nas configuracoes financeiras para gerar a cobranca com split.", {
      code: "PSYCHOLOGIST_WALLET_ID_REQUIRED",
      details: {
        consultationId,
      },
    });
  }

  const consultationValue =
    consultationValueState.consultationValue ?? resolveConsultationValue(resolvedConsultation);
  const patient = await loadPatientForBilling(
    serviceClient,
    pickString(resolvedConsultation, ["paciente_id"]),
  );
  const customerInput = buildCustomerInput(patient);
  const config = getAsaasConfig(context.env);

  try {
    const customerResult = await findOrCreateCustomer(config, customerInput);
    const paymentPayload = {
      customer: pickString(customerResult.customer, ["id"]),
      billingType: CONSULTATION_PAYMENT_BILLING_TYPE,
      value: consultationValue,
      dueDate: resolveConsultationDueDate(resolvedConsultation),
      description: "Consulta Psivinculo",
      externalReference: consultationId,
      split: [
        {
          walletId,
          percentualValue: PSYCHOLOGIST_SPLIT_PERCENTUAL_VALUE,
        },
      ],
    };

    if (!paymentPayload.customer) {
      throw new HttpError(502, "Nao foi possivel obter o customer do Asaas para a cobranca da consulta.", {
        code: "ASAAS_CUSTOMER_ID_MISSING",
      });
    }

    const payment = await asaasRequest(config, "/payments", {
      method: "POST",
      body: paymentPayload,
    });
    const paymentId = pickString(payment, ["id"]);
    const invoiceUrl = pickString(payment, ["invoiceUrl"]);
    const bankSlipUrl = pickString(payment, ["bankSlipUrl"]);

    if (!paymentId) {
      throw new HttpError(502, "O Asaas nao retornou o identificador da cobranca da consulta.", {
        code: "ASAAS_PAYMENT_ID_MISSING",
      });
    }

    const updatedConsultation =
      (await updateConsultationPaymentSnapshot(serviceClient, consultationId, {
        asaas_payment_id: paymentId,
        asaas_invoice_url: invoiceUrl || bankSlipUrl || null,
        asaas_bank_slip_url: bankSlipUrl || null,
        status_pagamento: PAYMENT_STATUS_PENDING,
        valor_consulta: consultationValue,
      })) || resolvedConsultation;

    logAsaasEvent("consultation_payment_created", {
      consultationId,
      paymentId,
      invoiceUrl: invoiceUrl || bankSlipUrl || null,
      splitSent: true,
      walletIdMasked: maskWalletIdForLogs(walletId),
      percentualValue: PSYCHOLOGIST_SPLIT_PERCENTUAL_VALUE,
    });
    let notifications = null;
    try {
      notifications = await notifyConsultationPaymentPending(
        serviceClient,
        updatedConsultation,
        {
          env: context.env,
          requestHeaders: context.requestHeaders,
        },
      );
    } catch (notificationError) {
      console.warn("[Psivinculo][notifications][payment_pending_notification_failed]", {
        consultationId,
        message: notificationError instanceof Error ? notificationError.message : "Unknown payment notification error",
      });
    }

    return {
      consultationId,
      paymentMode: "asaas_split",
      paymentStatus: pickString(updatedConsultation, ["status_pagamento"]) || PAYMENT_STATUS_PENDING,
      created: true,
      reusedExisting: false,
      success: true,
      asaasPaymentId: paymentId,
      invoiceUrl: invoiceUrl || bankSlipUrl || null,
      bankSlipUrl: bankSlipUrl || null,
      billingType: CONSULTATION_PAYMENT_BILLING_TYPE,
      externalReference: consultationId,
      splitSent: true,
      walletIdMasked: maskWalletIdForLogs(walletId),
      payoutPercentage: PSYCHOLOGIST_SPLIT_PERCENTUAL_VALUE,
      message: "Cobranca Asaas gerada com sucesso para a consulta.",
      errorCode: null,
      notifications,
    };
  } catch (error) {
    await markConsultationPaymentError(
      serviceClient,
      consultationId,
      error instanceof Error ? error.message : "Erro ao gerar cobranca da consulta.",
    );

    logAsaasEvent("consultation_payment_failed", {
      consultationId,
      splitSent: true,
      walletIdMasked: maskWalletIdForLogs(walletId),
      percentualValue: PSYCHOLOGIST_SPLIT_PERCENTUAL_VALUE,
      message: error instanceof Error ? error.message : "Unknown consultation payment error",
    });

    throw error instanceof HttpError
      ? error
      : new HttpError(502, "Nao foi possivel gerar a cobranca da consulta no Asaas.", {
          code: "CONSULTATION_PAYMENT_CREATE_FAILED",
        });
  }
}
