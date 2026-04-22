import { useQuery } from "@tanstack/react-query";
import {
  currentPsychologistConsultationSettingsQueryKey,
  getCurrentPsychologistConsultationSettings,
  type CurrentPsychologistConsultationSettings,
} from "@/services/psychologistConsultationSettings";

export function useCurrentPsychologistConsultationSettings(
  enabled = true,
  placeholderData?: CurrentPsychologistConsultationSettings,
) {
  return useQuery({
    queryKey: currentPsychologistConsultationSettingsQueryKey,
    queryFn: getCurrentPsychologistConsultationSettings,
    enabled,
    placeholderData,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
