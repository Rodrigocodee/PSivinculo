import { processConsultationReminders } from "../consultation-reminders.mjs";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function printUsage() {
  console.info(`Uso:
  node --env-file=.env server/jobs/consultation-reminders-local.mjs [opcoes]

Opcoes:
  --dry-run
  --reference-time=2026-04-29T02:00:00.000Z
  --window-minutes=10
  --consultation-id=UUID_DA_CONSULTA
  --help
`);
}

function createCliError(message) {
  const error = new Error(message);
  error.name = "CliArgumentError";
  return error;
}

function parseArgs(argv) {
  const payload = {
    consultationIds: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const currentArg = normalizeString(argv[index]);

    if (!currentArg) {
      continue;
    }

    if (currentArg === "--help") {
      payload.help = true;
      continue;
    }

    if (currentArg === "--dry-run") {
      payload.dryRun = true;
      continue;
    }

    if (currentArg.startsWith("--reference-time=")) {
      payload.referenceTime = normalizeString(currentArg.slice("--reference-time=".length));
      continue;
    }

    if (currentArg === "--reference-time") {
      const nextArg = normalizeString(argv[index + 1]);

      if (!nextArg) {
        throw createCliError("Informe um valor para --reference-time.");
      }

      payload.referenceTime = nextArg;
      index += 1;
      continue;
    }

    if (currentArg.startsWith("--window-minutes=")) {
      payload.windowMinutes = normalizeString(currentArg.slice("--window-minutes=".length));
      continue;
    }

    if (currentArg === "--window-minutes") {
      const nextArg = normalizeString(argv[index + 1]);

      if (!nextArg) {
        throw createCliError("Informe um valor para --window-minutes.");
      }

      payload.windowMinutes = nextArg;
      index += 1;
      continue;
    }

    if (currentArg.startsWith("--consultation-id=")) {
      const consultationId = normalizeString(currentArg.slice("--consultation-id=".length));

      if (!consultationId) {
        throw createCliError("Informe um UUID valido para --consultation-id.");
      }

      payload.consultationIds.push(consultationId);
      continue;
    }

    if (currentArg === "--consultation-id") {
      const nextArg = normalizeString(argv[index + 1]);

      if (!nextArg) {
        throw createCliError("Informe um UUID valido para --consultation-id.");
      }

      payload.consultationIds.push(nextArg);
      index += 1;
      continue;
    }

    throw createCliError(`Argumento nao suportado: ${currentArg}`);
  }

  const normalizedConsultationIds = payload.consultationIds.filter(Boolean);

  return {
    help: payload.help === true,
    reminderPayload: {
      dryRun: payload.dryRun === true,
      referenceTime: normalizeString(payload.referenceTime) || undefined,
      windowMinutes: normalizeString(payload.windowMinutes) || undefined,
      consultationIds: normalizedConsultationIds,
    },
  };
}

function logExecutionStart(reminderPayload) {
  console.info("[Psivinculo][consultation-reminders-local] starting", {
    dryRun: reminderPayload.dryRun,
    referenceTime: reminderPayload.referenceTime || "(current time)",
    windowMinutes: reminderPayload.windowMinutes || "(default)",
    consultationIds: reminderPayload.consultationIds,
  });
}

function logExecutionSummary(result) {
  console.info("[Psivinculo][consultation-reminders-local] summary", {
    processedAt: result.processedAt,
    referenceTime: result.referenceTime,
    dryRun: result.dryRun,
    windowMinutes: result.windowMinutes,
    consultationsFound: result.counts.consultationsMatched,
    eventsConsidered: result.counts.eventsConsidered,
    sent: result.counts.eventsSent,
    skipped: result.counts.eventsSkipped,
    duplicatesPrevented: result.counts.duplicatesPrevented,
    failures: result.counts.eventsFailed,
    windows: result.windows,
    eventResults: Array.isArray(result.events)
      ? result.events.map((event) => ({
          consultationId: event.consultationId,
          eventType: event.eventType,
          recipientType: event.recipientType,
          status: event.status,
          reason: event.reason,
          roomLinkStatus: event.roomLinkStatus,
          roomLinkSource: event.roomLinkSource || null,
        }))
      : [],
  });
}

async function main() {
  const { help, reminderPayload } = parseArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  logExecutionStart(reminderPayload);

  const result = await processConsultationReminders(reminderPayload, {
    env: process.env,
    logger: console,
  });

  logExecutionSummary(result);
}

try {
  await main();
} catch (error) {
  if (error?.name === "CliArgumentError") {
    console.error("[Psivinculo][consultation-reminders-local][invalid_args]", {
      message: error.message,
    });
    printUsage();
    process.exitCode = 1;
  } else {
    console.error("[Psivinculo][consultation-reminders-local][failed]", {
      message: error instanceof Error ? error.message : "Unknown local reminder error",
      code: typeof error?.code === "string" ? error.code : null,
      stack: error instanceof Error ? error.stack : null,
    });
    process.exitCode = 1;
  }
}
