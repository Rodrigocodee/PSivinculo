import { getCurrentPsychologistContext } from "@/services/currentPsychologist";
import { resolveProfessionalAccessFromCurrentPsychologistContext } from "@/services/professionalAccessGuard";

export type PsychologistServiceScope = {
  userId: string;
  psychologistId: string;
  psychologistIds: string[];
  clinicId: string | null;
  hasProfessionalAccess: boolean;
};

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

export async function getPsychologistServiceScope(): Promise<PsychologistServiceScope> {
  const context = await getCurrentPsychologistContext();

  if (!context.user) {
    throw new Error("Nao foi possivel localizar uma sessao autenticada do psicologo.");
  }

  const canonicalPsychologistId =
    pickString(context.usuariosRecord?.row || null, ["id"]) ||
    pickString(context.record?.row || null, ["id"]) ||
    context.psychologistId.trim() ||
    context.user.id.trim();
  const psychologistIds = Array.from(
    new Set(
      [
        canonicalPsychologistId,
        context.psychologistId.trim(),
        context.user.id.trim(),
        pickString(context.usuariosRecord?.row || null, ["auth_id"]),
        pickString(context.record?.row || null, ["auth_id"]),
        pickString(context.usuariosRecord?.row || null, ["id"]),
        pickString(context.record?.row || null, ["id"]),
      ].filter(Boolean),
    ),
  );
  const psychologistId = canonicalPsychologistId;

  if (!psychologistId) {
    throw new Error("Nao foi possivel determinar o psicologo autenticado.");
  }

  const clinicId = context.clinicId.trim() || null;

  return {
    userId: context.user.id,
    psychologistId,
    psychologistIds,
    clinicId,
    hasProfessionalAccess: resolveProfessionalAccessFromCurrentPsychologistContext(context),
  };
}
