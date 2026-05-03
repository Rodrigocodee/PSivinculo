import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearPatientNotifications,
  listPatientNotifications,
  markAllPatientNotificationsAsRead,
  markPatientNotificationsAsRead,
} from "@/services/patientNotifications";

export const patientNotificationsQueryKey = ["patient-notifications"];

export function usePatientNotifications(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: patientNotificationsQueryKey,
    queryFn: listPatientNotifications,
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    refetchOnWindowFocus: false,
  });

  async function markAsRead(notificationIds: string[]) {
    if (notificationIds.length === 0) return;

    await markPatientNotificationsAsRead(notificationIds);
    queryClient.setQueryData(
      patientNotificationsQueryKey,
      (currentNotifications: Awaited<ReturnType<typeof listPatientNotifications>> | undefined) =>
        (currentNotifications ?? []).map((notification) =>
          notificationIds.includes(notification.id)
            ? { ...notification, read: true }
            : notification,
        ),
    );
  }

  async function markAllAsRead() {
    await markAllPatientNotificationsAsRead();
    queryClient.setQueryData(
      patientNotificationsQueryKey,
      (currentNotifications: Awaited<ReturnType<typeof listPatientNotifications>> | undefined) =>
        (currentNotifications ?? []).map((notification) => ({ ...notification, read: true })),
    );
  }

  async function clearAll() {
    await clearPatientNotifications();
    queryClient.setQueryData(patientNotificationsQueryKey, []);
  }

  return {
    ...query,
    clearAll,
    markAllAsRead,
    markAsRead,
  };
}
