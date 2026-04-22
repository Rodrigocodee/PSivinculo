import { useQuery } from "@tanstack/react-query";
import { getCurrentPsychologistProfile } from "@/services/currentPsychologist";

export const currentPsychologistProfileQueryKey = ["current-psychologist-profile"];

export function useCurrentPsychologistProfile(enabled = true) {
  return useQuery({
    queryKey: currentPsychologistProfileQueryKey,
    queryFn: getCurrentPsychologistProfile,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
