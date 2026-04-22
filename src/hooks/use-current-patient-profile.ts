import { useQuery } from "@tanstack/react-query";
import {
  fetchCurrentPatientProfile,
  patientProfileQueryKey,
} from "@/services/patientProfile";

export function useCurrentPatientProfile(enabled = true) {
  return useQuery({
    queryKey: patientProfileQueryKey,
    queryFn: fetchCurrentPatientProfile,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
