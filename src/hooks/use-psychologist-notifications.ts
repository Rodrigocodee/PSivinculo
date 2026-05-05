import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearPsychologistNotifications,
  listPsychologistNotifications,
  markAllPsychologistNotificationsAsRead,
  markPsychologistNotificationsAsRead,
} from "@/services/psychologistNotifications";

export const psychologistNotificationsQueryKey = ["psychologist-notifications"];

export function usePsychologistNotifications(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: psychologistNotificationsQueryKey,
    queryFn: listPsychologistNotifications,
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    refetchOnWindowFocus: false,
  });

  async function markAsRead(notificationIds: string[]) {
    if (notificationIds.length === 0) return;

    await markPsychologistNotificationsAsRead(notificationIds);
    queryClient.setQueryData(
      psychologistNotificationsQueryKey,
      (currentNotifications: Awaited<ReturnType<typeof listPsychologistNotifications>> | undefined) =>
        (currentNotifications ?? []).map((notification) =>
          notificationIds.includes(notification.id)
            ? { ...notification, read: true }
            : notification,
        ),
    );
  }

  async function markAllAsRead() {
    await markAllPsychologistNotificationsAsRead();
    queryClient.setQueryData(
      psychologistNotificationsQueryKey,
      (currentNotifications: Awaited<ReturnType<typeof listPsychologistNotifications>> | undefined) =>
        (currentNotifications ?? []).map((notification) => ({ ...notification, read: true })),
    );
  }

  async function clearAll() {
    await clearPsychologistNotifications();
    queryClient.setQueryData(psychologistNotificationsQueryKey, []);
  }

  return {
    ...query,
    clearAll,
    markAllAsRead,
    markAsRead,
  };
}
