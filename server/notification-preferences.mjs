const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  appointment_reminder: true,
  patient_confirmation: true,
  payments: true,
  weekly_reports: false,
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickBoolean(source, key, fallback) {
  return isRecord(source) && typeof source[key] === "boolean" ? source[key] : fallback;
}

export function normalizeNotificationPreferences(source) {
  return {
    appointment_reminder: pickBoolean(
      source,
      "appointment_reminder",
      DEFAULT_NOTIFICATION_PREFERENCES.appointment_reminder,
    ),
    patient_confirmation: pickBoolean(
      source,
      "patient_confirmation",
      DEFAULT_NOTIFICATION_PREFERENCES.patient_confirmation,
    ),
    payments: pickBoolean(source, "payments", DEFAULT_NOTIFICATION_PREFERENCES.payments),
    weekly_reports: pickBoolean(
      source,
      "weekly_reports",
      DEFAULT_NOTIFICATION_PREFERENCES.weekly_reports,
    ),
  };
}

export async function loadPsychologistNotificationPreferences(
  client,
  psychologistId,
  logger = console,
  logContext = {},
) {
  const normalizedPsychologistId = normalizeString(psychologistId);

  if (!normalizedPsychologistId) {
    const preferences = normalizeNotificationPreferences(null);
    logger.info?.("[Psivinculo][notifications][notification_preferences_loaded]", {
      ...logContext,
      psychologistId: null,
      source: "defaults_missing_psychologist_id",
      preferences,
    });
    return preferences;
  }

  try {
    const { data, error } = await client
      .from("usuarios")
      .select("id, notification_preferences")
      .eq("id", normalizedPsychologistId)
      .limit(1)
      .maybeSingle();

    if (error || !isRecord(data)) {
      const preferences = normalizeNotificationPreferences(null);
      logger.info?.("[Psivinculo][notifications][notification_preferences_loaded]", {
        ...logContext,
        psychologistId: normalizedPsychologistId,
        source: error ? "defaults_lookup_error" : "defaults_missing_usuario",
        errorCode: normalizeString(error?.code) || null,
        errorMessage: normalizeString(error?.message) || null,
        preferences,
      });
      return preferences;
    }

    const preferences = normalizeNotificationPreferences(data.notification_preferences);
    logger.info?.("[Psivinculo][notifications][notification_preferences_loaded]", {
      ...logContext,
      psychologistId: normalizedPsychologistId,
      source: isRecord(data.notification_preferences) ? "public.usuarios" : "defaults_empty_preferences",
      preferences,
    });
    return preferences;
  } catch (error) {
    const preferences = normalizeNotificationPreferences(null);
    logger.info?.("[Psivinculo][notifications][notification_preferences_loaded]", {
      ...logContext,
      psychologistId: normalizedPsychologistId,
      source: "defaults_exception",
      errorMessage: error instanceof Error ? error.message : "Unknown preferences lookup error",
      preferences,
    });
    return preferences;
  }
}
