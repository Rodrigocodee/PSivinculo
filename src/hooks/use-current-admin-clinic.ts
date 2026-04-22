import { useQuery } from "@tanstack/react-query";
import {
  currentAdminClinicQueryKey,
  fetchCurrentAdminClinic,
} from "@/services/adminClinic";

export { currentAdminClinicQueryKey };

export function useCurrentAdminClinic(enabled = true) {
  return useQuery({
    queryKey: currentAdminClinicQueryKey,
    queryFn: fetchCurrentAdminClinic,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
