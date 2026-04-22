import { supabase } from "@/lib/supabase";
import { getCurrentPaciente } from "@/services/currentPatient";

type NotificationRow = Record<string, unknown> & {
  id?: string;
  tipo?: string;
  titulo?: string;
  mensagem?: string;
  rota_destino?: string;
  entidade_tipo?: string;
  entidade_id?: string;
  lida?: boolean;
  created_at?: string;
};

export type PatientNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  routeDestination: string | null;
  entityType: string | null;
  entityId: string | null;
  time: string;
  read: boolean;
  timestamp: number;
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeTime(date: Date) {
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const diffHours = Math.round(diffMs / 3_600_000);
  const diffDays = Math.round(diffMs / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour");
  return formatter.format(diffDays, "day");
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

export async function listPatientNotifications(): Promise<PatientNotification[]> {
  const patient = await getCurrentPaciente();
  const destinationUserId = patient.user?.id?.trim() || "";

  if (!destinationUserId) {
    return [];
  }

  const { data, error } = await supabase
    .from("notificacoes")
    .select(
      "id, usuario_id_destino, tipo, titulo, mensagem, rota_destino, entidade_tipo, entidade_id, lida, created_at",
    )
    .eq("usuario_id_destino", destinationUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  return ((data ?? []) as NotificationRow[]).map((notification) => {
    const timestamp = parseDate(notification.created_at)?.getTime() || Date.now();

    return {
      id: pickString(notification, ["id"]) || crypto.randomUUID(),
      type: pickString(notification, ["tipo"]),
      title: pickString(notification, ["titulo"]) || "Notificacao",
      message: pickString(notification, ["mensagem"]),
      routeDestination: pickString(notification, ["rota_destino"]) || null,
      entityType: pickString(notification, ["entidade_tipo"]) || null,
      entityId: pickString(notification, ["entidade_id"]) || null,
      time: formatRelativeTime(new Date(timestamp)),
      read: typeof notification.lida === "boolean" ? notification.lida : false,
      timestamp,
    } satisfies PatientNotification;
  });
}

export async function markPatientNotificationsAsRead(notificationIds: string[]) {
  const normalizedIds = notificationIds
    .map((id) => id.trim())
    .filter(Boolean);

  if (normalizedIds.length === 0) return;

  const { error } = await supabase.rpc("mark_my_notifications_as_read", {
    notification_ids_input: normalizedIds,
  });

  if (error) throw error;
}
