import { getCurrentPsychologistContext } from "@/services/currentPsychologist";

export type PsychologistServiceScope = {
  userId: string;
  psychologistId: string;
  clinicId: string | null;
};

export async function getPsychologistServiceScope(): Promise<PsychologistServiceScope> {
  const context = await getCurrentPsychologistContext();

  if (!context.user) {
    throw new Error("Nao foi possivel localizar uma sessao autenticada do psicologo.");
  }

  const psychologistId = context.psychologistId.trim();
  if (!psychologistId) {
    throw new Error("Nao foi possivel determinar o psicologo autenticado.");
  }

  const clinicId = context.clinicId.trim() || null;

  return {
    userId: context.user.id,
    psychologistId,
    clinicId,
  };
}
