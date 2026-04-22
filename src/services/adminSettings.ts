import { supabase } from "@/lib/supabase";
import {
  getCurrentAdminContext,
  type CurrentAdminContext,
} from "@/services/currentAdmin";

type ClinicRow = Record<string, unknown>;

type AdminClinicSettingsAvailability = {
  reminderNotification: boolean;
  bookingConfirmationNotification: boolean;
  cancellationNotification: boolean;
  weeklyReportNotification: boolean;
  confirmationMessageTemplate: boolean;
  reminderMessageTemplate: boolean;
  minimumCancellationHours: boolean;
  lateCancellationFeePercent: boolean;
  defaultSessionDurationMinutes: boolean;
};

type NotificationSettings = {
  reminderNotification: boolean;
  bookingConfirmationNotification: boolean;
  cancellationNotification: boolean;
  weeklyReportNotification: boolean;
};

export type AdminClinicSettingsData = {
  context: CurrentAdminContext;
  row: ClinicRow | null;
  clinicId: string;
  clinicName: string;
  adminName: string;
  notifications: NotificationSettings;
  confirmationMessageTemplate: string;
  reminderMessageTemplate: string;
  minimumCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  defaultSessionDurationMinutes: number | null;
  hasClinicScope: boolean;
  hasClinicRecord: boolean;
  availableFields: AdminClinicSettingsAvailability;
  editableFieldsCount: number;
};

export type SaveAdminClinicSettingsInput = {
  notifications: NotificationSettings;
  confirmationMessageTemplate: string;
  reminderMessageTemplate: string;
  minimumCancellationHours: string;
  lateCancellationFeePercent: string;
  defaultSessionDurationMinutes: string;
};

export const adminClinicSettingsQueryKey = ["admin-clinic-settings"];

const REMINDER_NOTIFICATION_COLUMNS = [
  "notificacao_lembrete_consulta",
  "notificacao_lembrete",
  "notification_appointment_reminder",
  "appointment_reminder_notification",
] as const;
const BOOKING_CONFIRMATION_NOTIFICATION_COLUMNS = [
  "notificacao_confirmacao_agendamento",
  "confirmacao_agendamento",
  "notification_booking_confirmation",
  "booking_confirmation_notification",
] as const;
const CANCELLATION_NOTIFICATION_COLUMNS = [
  "notificacao_cancelamento",
  "notification_cancellation",
  "cancellation_notification",
] as const;
const WEEKLY_REPORT_NOTIFICATION_COLUMNS = [
  "notificacao_relatorio_semanal",
  "relatorio_semanal",
  "notification_weekly_report",
  "weekly_report_notification",
] as const;
const CONFIRMATION_MESSAGE_TEMPLATE_COLUMNS = [
  "template_mensagem_confirmacao",
  "confirmation_message_template",
  "template_confirmacao",
  "mensagem_confirmacao_template",
] as const;
const REMINDER_MESSAGE_TEMPLATE_COLUMNS = [
  "template_mensagem_lembrete",
  "reminder_message_template",
  "template_lembrete",
  "mensagem_lembrete_template",
] as const;
const MINIMUM_CANCELLATION_HOURS_COLUMNS = [
  "prazo_minimo_cancelamento_horas",
  "minimum_cancellation_hours",
  "cancelamento_minimo_horas",
  "cancellation_deadline_hours",
] as const;
const LATE_CANCELLATION_FEE_PERCENT_COLUMNS = [
  "percentual_cobranca_cancelamento",
  "late_cancellation_fee_percent",
  "cancellation_fee_percent",
  "percentual_cancelamento_tardio",
] as const;
const DEFAULT_SESSION_DURATION_COLUMNS = [
  "duracao_padrao_sessao_min",
  "duracao_sessao_padrao",
  "session_duration",
  "duracao_padrao_sessao",
  "duracao_sessao",
  "default_session_duration",
  "tempo_padrao_sessao",
] as const;

function pickString(source: ClinicRow | null | undefined, keys: readonly string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function pickNumber(source: ClinicRow | null | undefined, keys: readonly string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const normalizedValue = value.trim().replace(",", ".");
      const parsedValue = Number(normalizedValue);

      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  return null;
}

function pickBoolean(source: ClinicRow | null | undefined, keys: readonly string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;

    if (typeof value === "string") {
      const normalizedValue = value.trim().toLowerCase();

      if (["true", "1", "yes", "sim"].includes(normalizedValue)) return true;
      if (["false", "0", "no", "nao"].includes(normalizedValue)) return false;
    }
  }

  return null;
}

function hasAnyColumn(row: ClinicRow | null | undefined, keys: readonly string[]) {
  if (!row) return false;

  return keys.some((key) => Object.prototype.hasOwnProperty.call(row, key));
}

function buildAvailability(row: ClinicRow | null): AdminClinicSettingsAvailability {
  return {
    reminderNotification: hasAnyColumn(row, REMINDER_NOTIFICATION_COLUMNS),
    bookingConfirmationNotification: hasAnyColumn(row, BOOKING_CONFIRMATION_NOTIFICATION_COLUMNS),
    cancellationNotification: hasAnyColumn(row, CANCELLATION_NOTIFICATION_COLUMNS),
    weeklyReportNotification: hasAnyColumn(row, WEEKLY_REPORT_NOTIFICATION_COLUMNS),
    confirmationMessageTemplate: hasAnyColumn(row, CONFIRMATION_MESSAGE_TEMPLATE_COLUMNS),
    reminderMessageTemplate: hasAnyColumn(row, REMINDER_MESSAGE_TEMPLATE_COLUMNS),
    minimumCancellationHours: hasAnyColumn(row, MINIMUM_CANCELLATION_HOURS_COLUMNS),
    lateCancellationFeePercent: hasAnyColumn(row, LATE_CANCELLATION_FEE_PERCENT_COLUMNS),
    defaultSessionDurationMinutes: hasAnyColumn(row, DEFAULT_SESSION_DURATION_COLUMNS),
  };
}

function countEditableFields(availableFields: AdminClinicSettingsAvailability) {
  return Object.values(availableFields).filter(Boolean).length;
}

function mapAdminClinicSettings(
  context: CurrentAdminContext,
  row: ClinicRow | null,
): AdminClinicSettingsData {
  const availability = buildAvailability(row);

  return {
    context,
    row,
    clinicId: context.clinicId,
    clinicName: context.clinicName,
    adminName: context.adminName,
    notifications: {
      reminderNotification: pickBoolean(row, REMINDER_NOTIFICATION_COLUMNS) ?? true,
      bookingConfirmationNotification:
        pickBoolean(row, BOOKING_CONFIRMATION_NOTIFICATION_COLUMNS) ?? true,
      cancellationNotification: pickBoolean(row, CANCELLATION_NOTIFICATION_COLUMNS) ?? true,
      weeklyReportNotification: pickBoolean(row, WEEKLY_REPORT_NOTIFICATION_COLUMNS) ?? false,
    },
    confirmationMessageTemplate: pickString(row, CONFIRMATION_MESSAGE_TEMPLATE_COLUMNS),
    reminderMessageTemplate: pickString(row, REMINDER_MESSAGE_TEMPLATE_COLUMNS),
    minimumCancellationHours: pickNumber(row, MINIMUM_CANCELLATION_HOURS_COLUMNS),
    lateCancellationFeePercent: pickNumber(row, LATE_CANCELLATION_FEE_PERCENT_COLUMNS),
    defaultSessionDurationMinutes: pickNumber(row, DEFAULT_SESSION_DURATION_COLUMNS),
    hasClinicScope: Boolean(context.clinicId),
    hasClinicRecord: Boolean(row),
    availableFields: availability,
    editableFieldsCount: countEditableFields(availability),
  };
}

function parseNullableInteger(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedValue = Number(trimmedValue);

  if (!Number.isInteger(parsedValue)) {
    throw new Error("Informe um numero inteiro valido.");
  }

  return parsedValue;
}

function parseNullableDecimal(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedValue = Number(trimmedValue.replace(",", "."));

  if (!Number.isFinite(parsedValue)) {
    throw new Error("Informe um numero valido.");
  }

  return parsedValue;
}

function buildUpdatePayload(row: ClinicRow, input: SaveAdminClinicSettingsInput) {
  const payload: Record<string, unknown> = {};
  const trimmedConfirmationMessage = input.confirmationMessageTemplate.trim();
  const trimmedReminderMessage = input.reminderMessageTemplate.trim();
  const minimumCancellationHours = parseNullableInteger(input.minimumCancellationHours);
  const lateCancellationFeePercent = parseNullableDecimal(input.lateCancellationFeePercent);
  const defaultSessionDurationMinutes = parseNullableInteger(input.defaultSessionDurationMinutes);

  for (const key of REMINDER_NOTIFICATION_COLUMNS) {
    if (key in row) payload[key] = input.notifications.reminderNotification;
  }

  for (const key of BOOKING_CONFIRMATION_NOTIFICATION_COLUMNS) {
    if (key in row) payload[key] = input.notifications.bookingConfirmationNotification;
  }

  for (const key of CANCELLATION_NOTIFICATION_COLUMNS) {
    if (key in row) payload[key] = input.notifications.cancellationNotification;
  }

  for (const key of WEEKLY_REPORT_NOTIFICATION_COLUMNS) {
    if (key in row) payload[key] = input.notifications.weeklyReportNotification;
  }

  for (const key of CONFIRMATION_MESSAGE_TEMPLATE_COLUMNS) {
    if (key in row) payload[key] = trimmedConfirmationMessage || null;
  }

  for (const key of REMINDER_MESSAGE_TEMPLATE_COLUMNS) {
    if (key in row) payload[key] = trimmedReminderMessage || null;
  }

  for (const key of MINIMUM_CANCELLATION_HOURS_COLUMNS) {
    if (key in row) payload[key] = minimumCancellationHours;
  }

  for (const key of LATE_CANCELLATION_FEE_PERCENT_COLUMNS) {
    if (key in row) payload[key] = lateCancellationFeePercent;
  }

  for (const key of DEFAULT_SESSION_DURATION_COLUMNS) {
    if (key in row) payload[key] = defaultSessionDurationMinutes;
  }

  return payload;
}

export async function fetchAdminClinicSettings(): Promise<AdminClinicSettingsData> {
  const context = await getCurrentAdminContext();
  return mapAdminClinicSettings(context, context.clinicRow);
}

export async function saveAdminClinicSettings(
  input: SaveAdminClinicSettingsInput,
): Promise<AdminClinicSettingsData> {
  const settings = await fetchAdminClinicSettings();

  if (!settings.context.user) {
    throw new Error("Nao foi possivel salvar as configuracoes sem uma sessao autenticada.");
  }

  if (!settings.clinicId || !settings.row) {
    throw new Error("Nao foi possivel localizar a clinica vinculada a este admin.");
  }

  if (settings.availableFields.minimumCancellationHours) {
    const minimumCancellationHours = parseNullableInteger(input.minimumCancellationHours);

    if (minimumCancellationHours != null && minimumCancellationHours < 0) {
      throw new Error("O prazo minimo para cancelamento nao pode ser negativo.");
    }
  }

  if (settings.availableFields.lateCancellationFeePercent) {
    const lateCancellationFeePercent = parseNullableDecimal(input.lateCancellationFeePercent);

    if (
      lateCancellationFeePercent != null &&
      (lateCancellationFeePercent < 0 || lateCancellationFeePercent > 100)
    ) {
      throw new Error("A cobranca por cancelamento tardio deve ficar entre 0% e 100%.");
    }
  }

  if (settings.availableFields.defaultSessionDurationMinutes) {
    const defaultSessionDurationMinutes = parseNullableInteger(input.defaultSessionDurationMinutes);

    if (
      defaultSessionDurationMinutes != null &&
      defaultSessionDurationMinutes <= 0
    ) {
      throw new Error("A duracao padrao da sessao deve ser maior que zero.");
    }
  }

  const payload = buildUpdatePayload(settings.row, input);

  if (Object.keys(payload).length === 0) {
    throw new Error(
      "O schema atual de public.clinicas ainda nao possui as colunas de configuracao. Aplique a migration desta entrega e tente novamente.",
    );
  }

  const { data, error } = await supabase
    .from("clinicas")
    .update(payload)
    .eq("id", settings.clinicId)
    .select("*")
    .maybeSingle();

  if (error) throw error;

  const nextRow = (data as ClinicRow | null) ?? settings.row;

  return mapAdminClinicSettings(
    {
      ...settings.context,
      clinicRow: nextRow,
    },
    nextRow,
  );
}
