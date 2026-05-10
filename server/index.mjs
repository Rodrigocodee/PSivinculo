import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cancelSubscriptionPlanOnAsaas,
  changeSubscriptionPlanOnAsaas,
  createSubscriptionOnAsaas,
  createSubscriptionPaymentLink,
  getCurrentSubscriptionPlanOnAsaas,
  handleAsaasWebhook,
} from "./asaas.mjs";
import { executeAdminMasterAction, getAdminMasterOverview } from "./admin-master.mjs";
import { linkPendingAsaasSubscriptions } from "./billing-store.mjs";
import { handleConsultationAsaasWebhook } from "./consultation-payment-webhook.mjs";
import { createConsultationPayment } from "./consultation-payments.mjs";
import { processConsultationReminders } from "./consultation-reminders.mjs";
import {
  respondConsultaCounterproposalAndNotify,
  respondConsultaRequestAndNotify,
  updateConsultaAndNotify,
} from "./consultations.mjs";
import { sendConsultationTestEmail } from "./email.mjs";
import { HttpError } from "./errors.mjs";
import { sendManualPatientRegistrationEmailForPatient } from "./patient-registration-email.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const INDEX_FILE = path.join(DIST_DIR, "index.html");
const JSON_BODY_LIMIT_BYTES = 64 * 1024;
const PORT = Number.parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST?.trim() || "0.0.0.0";
const ALLOWED_CORS_ORIGINS = new Set([
  "https://www.psivinculo.com.br",
  "https://psivinculo.com.br",
  "https://p-sivinculo.vercel.app",
]);
const CORS_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "asaas-access-token",
  "x-asaas-access-token",
  "x-webhook-token",
].join(", ");

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getHeaderValue(headers, headerName) {
  if (!headers || typeof headers !== "object") return "";

  const value = headers[headerName];

  if (Array.isArray(value)) {
    return normalizeString(value[0]);
  }

  return normalizeString(value);
}

function buildUrl(request) {
  return new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
}

function applyCorsHeaders(request, response) {
  const origin = getHeaderValue(request.headers, "origin") || getHeaderValue(request.headers, "Origin");

  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
  response.setHeader("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
  response.setHeader("Access-Control-Max-Age", "86400");

  if (ALLOWED_CORS_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }
}

function handleCorsPreflight(request, response, pathname) {
  if (request.method !== "OPTIONS" || !pathname.startsWith("/api/")) {
    return false;
  }

  response.writeHead(204);
  response.end();
  return true;
}

function areSecretsEqual(left, right) {
  const normalizedLeft = normalizeString(left);
  const normalizedRight = normalizeString(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  const leftBuffer = Buffer.from(normalizedLeft);
  const rightBuffer = Buffer.from(normalizedRight);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function extractInternalSecret(headers) {
  const authorizationHeader =
    getHeaderValue(headers, "authorization") || getHeaderValue(headers, "Authorization");
  const authorizationMatch = authorizationHeader.match(/^Bearer\s+(.+)$/i);

  return (
    normalizeString(authorizationMatch?.[1]) ||
    getHeaderValue(headers, "x-cron-secret") ||
    getHeaderValue(headers, "X-Cron-Secret")
  );
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendFile(response, statusCode, contentType, body) {
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(body);
}

function buildErrorPayload(error) {
  if (error instanceof HttpError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  return {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Nao foi possivel concluir a operacao no servidor.",
      details:
        error instanceof Error && error.message.trim()
          ? { message: error.message.trim() }
          : null,
    },
  };
}

function resolveLoggableErrorDetails(error) {
  if (error instanceof HttpError) {
    return error.details ?? null;
  }

  if (error instanceof Error && error.stack) {
    return { stack: error.stack };
  }

  return null;
}

function logRequestError(scope, pathname, request, error) {
  const statusCode = error instanceof HttpError ? error.status : 500;
  console.error(`[Psivinculo][server][${scope}]`, {
    path: pathname,
    method: request.method,
    statusCode,
    code: error instanceof HttpError ? error.code : "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Unknown server error",
    details: resolveLoggableErrorDetails(error),
  });

  return statusCode;
}

function sendJsonSafely(response, statusCode, payload) {
  if (response.destroyed || response.writableEnded) {
    return false;
  }

  if (response.headersSent) {
    response.end();
    return false;
  }

  sendJson(response, statusCode, payload);
  return true;
}

function sendErrorJson(response, pathname, request, error, scope = "request_failed") {
  const statusCode = logRequestError(scope, pathname, request, error);
  sendJsonSafely(response, statusCode, buildErrorPayload(error));
}

function isLoopbackAddress(value) {
  const normalizedValue = normalizeString(value).toLowerCase();

  if (!normalizedValue) return false;

  return (
    normalizedValue === "localhost" ||
    normalizedValue === "::1" ||
    normalizedValue === "::ffff:127.0.0.1" ||
    normalizedValue === "127.0.0.1" ||
    normalizedValue.startsWith("127.")
  );
}

function isLocalRequest(request) {
  const requestUrl = buildUrl(request);
  const forwardedFor = getHeaderValue(request.headers, "x-forwarded-for").split(",")[0] || "";
  const remoteAddress = normalizeString(request.socket?.remoteAddress);

  return [requestUrl.hostname, forwardedFor, remoteAddress].some(isLoopbackAddress);
}

async function readJsonBody(request) {
  const chunks = [];
  let totalSize = 0;

  for await (const chunk of request) {
    totalSize += chunk.length;

    if (totalSize > JSON_BODY_LIMIT_BYTES) {
      throw new HttpError(413, "O corpo da requisicao excede o limite de 64 KB.", {
        code: "REQUEST_BODY_TOO_LARGE",
      });
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf-8").trim();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "Corpo JSON invalido.", {
      code: "INVALID_JSON",
    });
  }
}

async function resolveStaticFile(pathname) {
  const decodedPathname = decodeURIComponent(pathname);
  const requestedPath = decodedPathname === "/" ? INDEX_FILE : path.resolve(DIST_DIR, `.${decodedPathname}`);

  if (!requestedPath.startsWith(DIST_DIR)) {
    return null;
  }

  const hasExtension = path.extname(requestedPath).length > 0;

  try {
    const file = await readFile(requestedPath);

    return {
      file,
      contentType: MIME_TYPES.get(path.extname(requestedPath)) || "application/octet-stream",
    };
  } catch {
    if (hasExtension) {
      return null;
    }
  }

  try {
    const file = await readFile(INDEX_FILE);

    return {
      file,
      contentType: MIME_TYPES.get(".html"),
    };
  } catch {
    return null;
  }
}

async function handleCreateSubscriptionApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await createSubscriptionOnAsaas(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "create_subscription_failed");
  }

  return true;
}

async function handleLinkPendingSubscriptionsApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await linkPendingAsaasSubscriptions(
      {
        ...payload,
        requestHeaders: request.headers,
      },
      process.env,
    );

    sendJsonSafely(response, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "link_pending_subscriptions_failed");
  }

  return true;
}

async function handleChangePlanApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await changeSubscriptionPlanOnAsaas(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "change_plan_failed");
  }

  return true;
}

async function handleSubscriptionPaymentLinkApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await createSubscriptionPaymentLink(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "subscription_payment_link_failed");
  }

  return true;
}

async function handleCurrentPlanApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await getCurrentSubscriptionPlanOnAsaas(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "current_plan_failed");
  }

  return true;
}

async function handleCancelPlanApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await cancelSubscriptionPlanOnAsaas(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "cancel_plan_failed");
  }

  return true;
}

async function handleEmailTestApiRequest(request, response, pathname) {
  try {
    if (!isLocalRequest(request)) {
      throw new HttpError(403, "A rota de teste de e-mail so pode ser usada localmente.", {
        code: "EMAIL_TEST_ROUTE_FORBIDDEN",
      });
    }

    const payload = await readJsonBody(request);
    const result = await sendConsultationTestEmail(payload, {
      env: process.env,
      baseUrl: `http://${request.headers.host || `localhost:${PORT}`}`,
    });

    sendJsonSafely(response, 200, {
      success: true,
      email: result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "email_test_failed");
  }

  return true;
}

async function handlePatientManualRegistrationEmailApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await sendManualPatientRegistrationEmailForPatient(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      email: result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "patient_manual_registration_email_failed");
  }

  return true;
}

async function handleConsultaRespondRequestApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await respondConsultaRequestAndNotify(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      consultation: result.consultation,
      email: result.email,
      payment: result.payment ?? null,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "consulta_respond_request_failed");
  }

  return true;
}

async function handleConsultaUpdateApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await updateConsultaAndNotify(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      consultation: result.consultation,
      email: result.email,
      payment: result.payment ?? null,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "consulta_update_failed");
  }

  return true;
}

async function handleConsultaRespondCounterproposalApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await respondConsultaCounterproposalAndNotify(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      consultation: result.consultation,
      email: result.email,
      payment: result.payment ?? null,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "consulta_respond_counterproposal_failed");
  }

  return true;
}

async function handleConsultaCreatePaymentApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const payment = await createConsultationPayment(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      payment,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "consulta_create_payment_failed");
  }

  return true;
}

async function handleConsultaProcessRemindersApiRequest(request, response, pathname) {
  try {
    const configuredSecret = normalizeString(process.env.CRON_SECRET);

    if (!configuredSecret) {
      throw new HttpError(500, "CRON_SECRET nao foi configurado no servidor.", {
        code: "CRON_SECRET_MISSING",
      });
    }

    const receivedSecret = extractInternalSecret(request.headers);

    if (!areSecretsEqual(configuredSecret, receivedSecret)) {
      throw new HttpError(403, "A rota interna de lembretes exige um token valido.", {
        code: "CRON_SECRET_INVALID",
      });
    }

    const payload = await readJsonBody(request);
    const result = await processConsultationReminders(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "consulta_process_reminders_failed");
  }

  return true;
}

async function handleConsultaAsaasWebhookApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await handleConsultationAsaasWebhook(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "consulta_asaas_webhook_failed");
  }

  return true;
}

async function handleAdminMasterOverviewApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await getAdminMasterOverview(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "admin_master_overview_failed");
  }

  return true;
}

async function handleAdminMasterActionApiRequest(request, response, pathname) {
  try {
    const payload = await readJsonBody(request);
    const result = await executeAdminMasterAction(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJsonSafely(response, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    sendErrorJson(response, pathname, request, error, "admin_master_action_failed");
  }

  return true;
}

async function handleApiRequest(request, response, pathname) {
  if (pathname === "/api/admin-master/action") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para executar a acao Admin Master.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleAdminMasterActionApiRequest(request, response, pathname);
  }

  if (pathname === "/api/admin-master/overview") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para consultar o Admin Master.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleAdminMasterOverviewApiRequest(request, response, pathname);
  }

  if (pathname === "/api/email/test") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para enviar o e-mail de teste.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleEmailTestApiRequest(request, response, pathname);
  }

  if (pathname === "/api/pacientes/manual-registration-email") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para enviar o e-mail do cadastro manual.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handlePatientManualRegistrationEmailApiRequest(request, response, pathname);
  }

  if (pathname === "/api/consultas/respond-request") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para responder a solicitacao da consulta.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleConsultaRespondRequestApiRequest(request, response, pathname);
  }

  if (pathname === "/api/consultas/update") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para atualizar a consulta.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleConsultaUpdateApiRequest(request, response, pathname);
  }

  if (pathname === "/api/consultas/respond-counterproposal") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para responder a contraproposta da consulta.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleConsultaRespondCounterproposalApiRequest(request, response, pathname);
  }

  if (pathname === "/api/consultas/create-payment") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para gerar a cobranca da consulta.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleConsultaCreatePaymentApiRequest(request, response, pathname);
  }

  if (pathname === "/api/consultas/process-reminders") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para processar os lembretes de consulta.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleConsultaProcessRemindersApiRequest(request, response, pathname);
  }

  if (pathname === "/api/webhooks/asaas/consultas") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para receber o webhook de consultas do Asaas.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleConsultaAsaasWebhookApiRequest(request, response, pathname);
  }

  if (pathname === "/api/asaas/create-subscription") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para criar a assinatura no Asaas.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleCreateSubscriptionApiRequest(request, response, pathname);
  }

  if (pathname === "/api/asaas/change-plan") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para alterar o plano da assinatura.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleChangePlanApiRequest(request, response, pathname);
  }

  if (pathname === "/api/asaas/subscription-payment-link") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para gerar o link de pagamento da assinatura.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleSubscriptionPaymentLinkApiRequest(request, response, pathname);
  }

  if (pathname === "/api/asaas/current-plan") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para consultar a assinatura atual.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleCurrentPlanApiRequest(request, response, pathname);
  }

  if (pathname === "/api/asaas/cancel-plan") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para cancelar a assinatura atual.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleCancelPlanApiRequest(request, response, pathname);
  }

  if (pathname === "/api/asaas/link-pending-subscriptions") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para vincular assinaturas pendentes ao cadastro local.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    return handleLinkPendingSubscriptionsApiRequest(request, response, pathname);
  }

  if (pathname === "/api/asaas/webhook") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Use POST para receber o webhook do Asaas.", {
        code: "METHOD_NOT_ALLOWED",
      });
    }

    const payload = await readJsonBody(request);
    const result = await handleAsaasWebhook(payload, {
      env: process.env,
      requestHeaders: request.headers,
    });

    sendJson(response, 200, {
      success: true,
      ...result,
    });
    return true;
  }

  if (pathname.startsWith("/api/")) {
    throw new HttpError(404, "A rota de API solicitada nao existe.", {
      code: "API_ROUTE_NOT_FOUND",
    });
  }

  return false;
}

async function handleStaticRequest(request, response, pathname) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    throw new HttpError(405, "Metodo nao suportado para este recurso.", {
      code: "METHOD_NOT_ALLOWED",
    });
  }

  const staticFile = await resolveStaticFile(pathname);

  if (!staticFile) {
    throw new HttpError(404, "Recurso nao encontrado.", {
      code: "RESOURCE_NOT_FOUND",
    });
  }

  if (request.method === "HEAD") {
    response.writeHead(200, { "Content-Type": staticFile.contentType });
    response.end();
    return;
  }

  sendFile(response, 200, staticFile.contentType, staticFile.file);
}

const server = createServer(async (request, response) => {
  const url = buildUrl(request);

  try {
    applyCorsHeaders(request, response);

    if (handleCorsPreflight(request, response, url.pathname)) {
      return;
    }

    const handledApiRequest = await handleApiRequest(request, response, url.pathname);

    if (!handledApiRequest) {
      await handleStaticRequest(request, response, url.pathname);
    }
  } catch (error) {
    sendErrorJson(response, url.pathname, request, error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Psivinculo][server] listening on http://${HOST}:${PORT}`);
});
