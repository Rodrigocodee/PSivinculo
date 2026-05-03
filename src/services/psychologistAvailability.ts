import { supabase } from "@/lib/supabase";
import { getCurrentPsychologistContext } from "@/services/currentPsychologist";

export type ScheduleDayKey =
  | "segunda"
  | "terca"
  | "quarta"
  | "quinta"
  | "sexta"
  | "sabado"
  | "domingo";

export type ScheduleDay = {
  key: ScheduleDayKey;
  label: string;
  dayOfWeek: number;
  enabled: boolean;
  start: string;
  end: string;
};

export type PersistedScheduleDay = {
  dia_semana: ScheduleDayKey;
  ativo: boolean;
  hora_inicio: string;
  hora_fim: string;
  key: ScheduleDayKey;
  label: string;
  enabled: boolean;
  start: string;
  end: string;
};

export type PsychologistAvailabilitySettings = {
  psychologistId: string;
  consultationDurationMinutes: number;
  schedule: ScheduleDay[];
  sourceTable: "usuarios" | null;
};

export type AvailabilityValidationCode =
  | "invalid_datetime"
  | "inactive_day"
  | "outside_hours"
  | "conflict";

export type AvailabilityValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: AvailabilityValidationCode;
      message: string;
    };

export type AvailabilityAppointmentLike = {
  id?: string | null;
  dateTime?: string | null;
  data_consulta?: string | null;
  durationMinutes?: number | null;
  duracao_consulta_min?: number | null;
  status?: string | null;
};

const DEFAULT_CONSULTATION_DURATION_MINUTES = 50;
const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME = "18:00";
const DEFAULT_WEEKEND_END_TIME = "12:00";
const DAY_KEYS_BY_INDEX: ScheduleDayKey[] = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
];

const DAY_LABELS: Record<ScheduleDayKey, string> = {
  segunda: "Segunda",
  terca: "Terca",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "Sabado",
  domingo: "Domingo",
};

const DEFAULT_SCHEDULE: ScheduleDay[] = [
  { key: "segunda", label: "Segunda", dayOfWeek: 1, enabled: true, start: DEFAULT_START_TIME, end: DEFAULT_END_TIME },
  { key: "terca", label: "Terca", dayOfWeek: 2, enabled: true, start: DEFAULT_START_TIME, end: DEFAULT_END_TIME },
  { key: "quarta", label: "Quarta", dayOfWeek: 3, enabled: true, start: DEFAULT_START_TIME, end: DEFAULT_END_TIME },
  { key: "quinta", label: "Quinta", dayOfWeek: 4, enabled: true, start: DEFAULT_START_TIME, end: DEFAULT_END_TIME },
  { key: "sexta", label: "Sexta", dayOfWeek: 5, enabled: true, start: DEFAULT_START_TIME, end: DEFAULT_END_TIME },
  { key: "sabado", label: "Sabado", dayOfWeek: 6, enabled: false, start: DEFAULT_START_TIME, end: DEFAULT_WEEKEND_END_TIME },
  { key: "domingo", label: "Domingo", dayOfWeek: 0, enabled: false, start: DEFAULT_START_TIME, end: DEFAULT_WEEKEND_END_TIME },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function pickBoolean(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function pickNumber(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeScheduleDayKey(value: unknown): ScheduleDayKey | null {
  const normalizedValue = normalizeString(value).toLowerCase();
  if (!normalizedValue) return null;

  if (
    normalizedValue === "segunda" ||
    normalizedValue === "terca" ||
    normalizedValue === "quarta" ||
    normalizedValue === "quinta" ||
    normalizedValue === "sexta" ||
    normalizedValue === "sabado" ||
    normalizedValue === "domingo"
  ) {
    return normalizedValue;
  }

  return null;
}

export function normalizeTimeLabel(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "";
  if (hours < 0 || hours > 23) return "";
  if (minutes < 0 || minutes > 59) return "";

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  const normalizedValue = normalizeTimeLabel(value);
  if (!normalizedValue) return null;

  const [hours, minutes] = normalizedValue.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTimeLabel(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes)) return "";

  const normalizedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getDefaultScheduleByKey(dayKey: ScheduleDayKey) {
  return DEFAULT_SCHEDULE.find((day) => day.key === dayKey) || DEFAULT_SCHEDULE[0];
}

function normalizeScheduleItem(value: unknown): ScheduleDay | null {
  if (!isRecord(value)) return null;

  const dayKey =
    normalizeScheduleDayKey(value.dia_semana) ||
    normalizeScheduleDayKey(value.key);

  if (!dayKey) return null;

  const fallback = getDefaultScheduleByKey(dayKey);
  const start = normalizeTimeLabel(
    pickString(value, ["hora_inicio", "start"]) || fallback.start,
  );
  const end = normalizeTimeLabel(
    pickString(value, ["hora_fim", "end"]) || fallback.end,
  );
  const enabled =
    pickBoolean(value, ["ativo", "enabled"]) ?? fallback.enabled;

  return {
    key: dayKey,
    label: pickString(value, ["label"]) || DAY_LABELS[dayKey],
    dayOfWeek: fallback.dayOfWeek,
    enabled,
    start: start || fallback.start,
    end: end || fallback.end,
  };
}

export function getDefaultWorkingHours() {
  return DEFAULT_SCHEDULE.map((day) => ({ ...day }));
}

export function mergeWorkingHoursSchedule(value?: unknown) {
  const overrides = Array.isArray(value)
    ? value.map(normalizeScheduleItem).filter(Boolean) as ScheduleDay[]
    : [];
  const overrideMap = new Map(overrides.map((item) => [item.key, item]));

  return DEFAULT_SCHEDULE.map((day) => ({
    ...day,
    ...(overrideMap.get(day.key) || {}),
  }));
}

export function serializeWorkingHoursSchedule(schedule: ScheduleDay[]): PersistedScheduleDay[] {
  return mergeWorkingHoursSchedule(schedule).map((day) => ({
    dia_semana: day.key,
    ativo: day.enabled,
    hora_inicio: day.start,
    hora_fim: day.end,
    key: day.key,
    label: day.label,
    enabled: day.enabled,
    start: day.start,
    end: day.end,
  }));
}

export function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const parsedDate = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function buildDateTime(dateKey: string, time: string) {
  const normalizedTime = normalizeTimeLabel(time);
  if (!normalizedTime) return null;

  const value = new Date(`${dateKey}T${normalizedTime}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function doesStatusOccupySlot(value: string | null | undefined) {
  const status = normalizeStatus(value);
  return !["cancelada", "cancelled", "recusada", "refused"].includes(status);
}

export function getScheduleDayByDate(
  schedule: ScheduleDay[],
  dateKeyOrDate: string | Date,
) {
  const date =
    typeof dateKeyOrDate === "string"
      ? parseDateKey(dateKeyOrDate)
      : new Date(dateKeyOrDate);

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  const dayKey = DAY_KEYS_BY_INDEX[date.getDay()];
  return mergeWorkingHoursSchedule(schedule).find((day) => day.key === dayKey) || null;
}

function resolveAppointmentDurationMinutes(
  appointment: AvailabilityAppointmentLike,
  fallbackDurationMinutes: number,
) {
  const explicitDuration =
    appointment.durationMinutes ?? appointment.duracao_consulta_min ?? null;

  if (typeof explicitDuration === "number" && Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return Math.round(explicitDuration);
  }

  return fallbackDurationMinutes;
}

function resolveAppointmentDateTime(appointment: AvailabilityAppointmentLike) {
  return normalizeString(appointment.dateTime) || normalizeString(appointment.data_consulta);
}

function buildAvailabilityMessage(code: AvailabilityValidationCode) {
  if (code === "inactive_day") {
    return "Dia sem atendimento configurado.";
  }

  if (code === "conflict") {
    return "Ja existe outra consulta neste horario.";
  }

  return "Este horario esta fora da sua disponibilidade configurada.";
}

export function validateAppointmentAvailability(input: {
  dateKey: string;
  time: string;
  schedule: ScheduleDay[];
  consultationDurationMinutes: number;
  existingAppointments?: AvailabilityAppointmentLike[];
  ignoreAppointmentId?: string | null;
}) : AvailabilityValidationResult {
  const selectedDay = getScheduleDayByDate(input.schedule, input.dateKey);
  const selectedDateTime = buildDateTime(input.dateKey, input.time);

  if (!selectedDay || !selectedDateTime) {
    return {
      ok: false,
      code: "invalid_datetime",
      message: buildAvailabilityMessage("outside_hours"),
    };
  }

  if (!selectedDay.enabled) {
    return {
      ok: false,
      code: "inactive_day",
      message: buildAvailabilityMessage("inactive_day"),
    };
  }

  const startMinutes = timeToMinutes(input.time);
  const dayStartMinutes = timeToMinutes(selectedDay.start);
  const dayEndMinutes = timeToMinutes(selectedDay.end);
  const durationMinutes = Math.max(1, Math.round(input.consultationDurationMinutes || DEFAULT_CONSULTATION_DURATION_MINUTES));

  if (
    startMinutes === null ||
    dayStartMinutes === null ||
    dayEndMinutes === null
  ) {
    return {
      ok: false,
      code: "outside_hours",
      message: buildAvailabilityMessage("outside_hours"),
    };
  }

  const endMinutes = startMinutes + durationMinutes;

  if (startMinutes < dayStartMinutes || endMinutes > dayEndMinutes) {
    return {
      ok: false,
      code: "outside_hours",
      message: buildAvailabilityMessage("outside_hours"),
    };
  }

  const selectedStartAt = selectedDateTime.getTime();
  const selectedEndAt = selectedStartAt + durationMinutes * 60_000;

  for (const appointment of input.existingAppointments || []) {
    if (!doesStatusOccupySlot(appointment.status)) continue;

    const appointmentId = normalizeString(appointment.id);
    if (appointmentId && appointmentId === normalizeString(input.ignoreAppointmentId)) {
      continue;
    }

    const appointmentDateTime = resolveAppointmentDateTime(appointment);
    if (!appointmentDateTime) continue;

    const appointmentStart = new Date(appointmentDateTime);
    if (Number.isNaN(appointmentStart.getTime())) continue;

    const appointmentDurationMinutes = resolveAppointmentDurationMinutes(
      appointment,
      durationMinutes,
    );
    const appointmentStartAt = appointmentStart.getTime();
    const appointmentEndAt = appointmentStartAt + appointmentDurationMinutes * 60_000;

    if (appointmentStartAt < selectedEndAt && appointmentEndAt > selectedStartAt) {
      return {
        ok: false,
        code: "conflict",
        message: buildAvailabilityMessage("conflict"),
      };
    }
  }

  return { ok: true };
}

export function buildAvailableTimeSlots(input: {
  dateKey: string;
  schedule: ScheduleDay[];
  consultationDurationMinutes: number;
  existingAppointments?: AvailabilityAppointmentLike[];
  ignoreAppointmentId?: string | null;
  includeTime?: string | null;
}) {
  const selectedDay = getScheduleDayByDate(input.schedule, input.dateKey);

  if (!selectedDay || !selectedDay.enabled) {
    return [] as string[];
  }

  const dayStartMinutes = timeToMinutes(selectedDay.start);
  const dayEndMinutes = timeToMinutes(selectedDay.end);
  const durationMinutes = Math.max(
    1,
    Math.round(input.consultationDurationMinutes || DEFAULT_CONSULTATION_DURATION_MINUTES),
  );

  if (dayStartMinutes === null || dayEndMinutes === null) {
    return [];
  }

  const options = new Set<string>();

  for (
    let currentMinutes = dayStartMinutes;
    currentMinutes + durationMinutes <= dayEndMinutes;
    currentMinutes += durationMinutes
  ) {
    const currentTime = minutesToTimeLabel(currentMinutes);
    const validation = validateAppointmentAvailability({
      dateKey: input.dateKey,
      time: currentTime,
      schedule: input.schedule,
      consultationDurationMinutes: durationMinutes,
      existingAppointments: input.existingAppointments,
      ignoreAppointmentId: input.ignoreAppointmentId,
    });

    if (validation.ok) {
      options.add(currentTime);
    }
  }

  const includedTime = normalizeTimeLabel(input.includeTime || "");
  if (includedTime) {
    options.add(includedTime);
  }

  return Array.from(options).sort((left, right) => left.localeCompare(right));
}

export function buildAgendaHourRows(input: {
  dateKey: string;
  schedule: ScheduleDay[];
  appointmentTimes?: string[];
}) {
  const selectedDay = getScheduleDayByDate(input.schedule, input.dateKey);
  const appointmentHours = new Set<number>();

  for (const appointmentTime of input.appointmentTimes || []) {
    const normalizedTime = normalizeTimeLabel(appointmentTime);
    if (!normalizedTime) continue;
    appointmentHours.add(Number(normalizedTime.slice(0, 2)));
  }

  if (!selectedDay || !selectedDay.enabled) {
    return Array.from(appointmentHours)
      .sort((left, right) => left - right)
      .map((hour) => `${String(hour).padStart(2, "0")}:00`);
  }

  const dayStartMinutes = timeToMinutes(selectedDay.start);
  const dayEndMinutes = timeToMinutes(selectedDay.end);

  if (dayStartMinutes === null || dayEndMinutes === null) {
    return [];
  }

  const startHour = Math.floor(dayStartMinutes / 60);
  const endHour = Math.max(startHour, Math.ceil(dayEndMinutes / 60) - 1);

  const rows = new Set<string>();
  for (let hour = startHour; hour <= endHour; hour += 1) {
    rows.add(`${String(hour).padStart(2, "0")}:00`);
  }

  for (const appointmentHour of appointmentHours) {
    rows.add(`${String(appointmentHour).padStart(2, "0")}:00`);
  }

  return Array.from(rows).sort((left, right) => left.localeCompare(right));
}

export function getNextActiveDate(
  schedule: ScheduleDay[],
  startDate = new Date(),
  searchWindowDays = 60,
) {
  for (let offset = 0; offset < searchWindowDays; offset += 1) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + offset);
    const selectedDay = getScheduleDayByDate(schedule, currentDate);

    if (selectedDay?.enabled) {
      return currentDate;
    }
  }

  return new Date(startDate);
}

async function findAvailabilityRowByPsychologistId(psychologistId: string) {
  const normalizedPsychologistId = normalizeString(psychologistId);
  if (!normalizedPsychologistId) return null;

  for (const column of ["auth_id", "id"] as const) {
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, auth_id, working_hours, duracao_consulta_min")
      .eq(column, normalizedPsychologistId)
      .limit(1)
      .maybeSingle();

    if (!error && isRecord(data)) {
      return data;
    }
  }

  return null;
}

function buildAvailabilitySettingsFromRow(
  row: Record<string, unknown> | null | undefined,
  psychologistId: string,
): PsychologistAvailabilitySettings {
  const rawSchedule = row?.working_hours || row?.horarios_atendimento;

  return {
    psychologistId:
      normalizeString(pickString(row, ["auth_id", "id"])) || normalizeString(psychologistId),
    consultationDurationMinutes: Math.max(
      1,
      Math.round(
        pickNumber(row, ["duracao_consulta_min"]) ?? DEFAULT_CONSULTATION_DURATION_MINUTES,
      ),
    ),
    schedule: mergeWorkingHoursSchedule(rawSchedule),
    sourceTable: row ? "usuarios" : null,
  };
}

export async function getCurrentPsychologistAvailability() {
  const context = await getCurrentPsychologistContext();
  const row = context.usuariosRecord?.row || context.record?.row || null;

  if (
    row &&
    (
      Array.isArray((row as Record<string, unknown>).working_hours) ||
      Array.isArray((row as Record<string, unknown>).horarios_atendimento)
    )
  ) {
    return buildAvailabilitySettingsFromRow(row, context.psychologistId);
  }

  const reloadedRow = await findAvailabilityRowByPsychologistId(context.psychologistId);
  return buildAvailabilitySettingsFromRow(reloadedRow || row, context.psychologistId);
}

export async function getPsychologistAvailabilityById(psychologistId: string) {
  const row = await findAvailabilityRowByPsychologistId(psychologistId);
  return buildAvailabilitySettingsFromRow(row, psychologistId);
}
