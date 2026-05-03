import { useQuery } from "@tanstack/react-query";
import {
  currentPsychologistPaymentSettingsQueryKey,
  getCurrentPsychologistPaymentSettings,
} from "@/services/psychologistPaymentSettings";

export function useCurrentPsychologistPaymentSettings(enabled = true) {
  return useQuery({
    queryKey: currentPsychologistPaymentSettingsQueryKey,
    queryFn: getCurrentPsychologistPaymentSettings,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
