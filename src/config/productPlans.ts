type PlanRow = Record<string, unknown>;

export type ProductPlanDefinition = {
  id: string;
  slug: string | null;
  name: string;
  monthlyPrice: number | null;
  pricingNote: string | null;
  professionalLimit: number | null;
  patientLimit: number | null;
  description: string;
  subtitle: string | null;
  summary: string | null;
  features: string[];
  order: number | null;
  active: boolean;
};

type PlanPresentationPreset = {
  matchTokens: string[];
  subtitle: string;
  features: string[];
  pricingNote?: string;
};

const PLAN_PRESENTATION_PRESETS: PlanPresentationPreset[] = [
  {
    matchTokens: ["plano-essencial", "essencial", "essential"],
    subtitle: "Ideal para comecar com uma operacao leve e organizada.",
    features: [
      "1 psicologo",
      "Ate 50 pacientes",
      "Agenda e prontuario",
      "Financeiro",
      "Suporte por e-mail",
    ],
  },
  {
    matchTokens: ["plano-profissional", "profissional", "professional"],
    subtitle: "Mais controle para consultorios em crescimento e rotina intensa.",
    features: [
      "1 psicologo",
      "Pacientes ilimitados",
      "Agenda e prontuario",
      "Relatorios completos",
      "Financeiro",
      "Suporte por e-mail",
    ],
  },
  {
    matchTokens: ["clinica-duo", "duo"],
    subtitle: "Ideal para clinicas com ate 2 profissionais.",
    features: [
      "2 psicologos",
      "Pacientes ilimitados",
      "Agenda compartilhada",
      "Gestao administrativa",
      "Relatorios consolidados",
      "Suporte prioritario",
    ],
  },
  {
    matchTokens: ["clinica-expansao", "expansao", "expansion"],
    subtitle: "Base para expansao da equipe com cobranca adicional por psicologo.",
    pricingNote: "+ R$ 39,99 por psicologo",
    features: [
      "Base para expansao da equipe",
      "Pacientes ilimitados",
      "Gestao administrativa",
      "Permissoes avancadas",
      "Relatorios consolidados",
      "Suporte prioritario",
    ],
  },
];

function pickString(source: PlanRow | null | undefined, keys: readonly string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function pickNumber(source: PlanRow | null | undefined, keys: readonly string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const normalizedValue = value.trim().replace(",", ".");
      const parsedValue = Number(normalizedValue);

      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  return null;
}

function pickBoolean(source: PlanRow | null | undefined, keys: readonly string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
  }

  return null;
}

export function normalizePlanToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildLimitFeature(value: number, singularLabel: string, pluralLabel: string) {
  const label = value === 1 ? singularLabel : pluralLabel;
  return `Ate ${value} ${label}`;
}

function titleCaseFeature(value: string) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  if (!normalizedValue) return "";

  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

function cleanFeatureText(value: string) {
  return titleCaseFeature(
    value
      .replace(/^[\s*-]+/, "")
      .replace(/^(inclui|incluem|conta com|com|recursos:?|beneficios:?|beneficios inclusos:?)/i, "")
      .replace(/[;:,.\s]+$/g, "")
      .trim(),
  );
}

function findPlanPresentationPreset(name: string, slug: string | null) {
  const tokens = [slug || "", name]
    .map((value) => normalizePlanToken(value))
    .filter(Boolean);

  return (
    PLAN_PRESENTATION_PRESETS.find((preset) =>
      preset.matchTokens.some((matchToken) =>
        tokens.some((token) => token === matchToken || token.includes(matchToken)),
      ),
    ) || null
  );
}

function splitDescriptionIntoFeatures(description: string) {
  const normalizedDescription = description.replace(/\s+/g, " ").trim();
  if (!normalizedDescription) return [];

  const explicitSeparators = normalizedDescription
    .split(/(?:\r?\n|[|;\u2022])/g)
    .map(cleanFeatureText)
    .filter(Boolean);
  if (explicitSeparators.length > 1) return explicitSeparators;

  const sentenceSeparators = normalizedDescription
    .split(/(?<=[.!?])\s+/g)
    .map(cleanFeatureText)
    .filter(Boolean);
  if (sentenceSeparators.length > 1) return sentenceSeparators;

  const commaSeparators = normalizedDescription
    .split(/\s*,\s*/g)
    .map(cleanFeatureText)
    .filter(Boolean);
  if (commaSeparators.length > 1 && commaSeparators.length <= 8) return commaSeparators;

  const startsAsList = /^(inclui|incluem|conta com|com|recursos:?|beneficios:?)/i.test(
    normalizedDescription,
  );
  if (startsAsList) {
    const connectorSeparators = normalizedDescription
      .replace(/^(inclui|incluem|conta com|com|recursos:?|beneficios:?)/i, "")
      .split(/\s+(?:e|mais|alem de)\s+/i)
      .map(cleanFeatureText)
      .filter(Boolean);

    if (connectorSeparators.length > 1 && connectorSeparators.length <= 6) {
      return connectorSeparators;
    }
  }

  return [cleanFeatureText(normalizedDescription)].filter(Boolean);
}

function dedupeFeatures(features: string[]) {
  const seen = new Set<string>();

  return features.filter((feature) => {
    const token = normalizePlanToken(feature);
    if (!token || seen.has(token)) return false;

    seen.add(token);
    return true;
  });
}

function buildPlanSummary(
  professionalLimit: number | null,
  patientLimit: number | null,
  description: string,
) {
  const summaryParts: string[] = [];

  if (professionalLimit != null) {
    summaryParts.push(buildLimitFeature(professionalLimit, "profissional", "profissionais"));
  }

  if (patientLimit != null) {
    summaryParts.push(buildLimitFeature(patientLimit, "paciente", "pacientes"));
  }

  if (summaryParts.length > 0) {
    return summaryParts.join(" | ");
  }

  return description || null;
}

function buildPlanSubtitle(
  professionalLimit: number | null,
  patientLimit: number | null,
  description: string,
  preset: PlanPresentationPreset | null,
) {
  if (preset?.subtitle) {
    return preset.subtitle;
  }

  if (professionalLimit != null && patientLimit != null) {
    return `Estrutura pensada para ate ${professionalLimit} profissionais e ${patientLimit} pacientes.`;
  }

  if (professionalLimit != null) {
    return `Ideal para equipes com ate ${professionalLimit} profissionais.`;
  }

  if (patientLimit != null) {
    return `Acompanhamento organizado para ate ${patientLimit} pacientes.`;
  }

  const descriptionFeatures = splitDescriptionIntoFeatures(description);
  if (descriptionFeatures.length > 0) {
    const firstFeature = descriptionFeatures[0];
    return firstFeature.length > 78 ? `${firstFeature.slice(0, 75).trimEnd()}...` : firstFeature;
  }

  return "Plano disponivel para contratacao.";
}

function buildPlanFeatures(
  professionalLimit: number | null,
  patientLimit: number | null,
  description: string,
  summary: string | null,
  preset: PlanPresentationPreset | null,
) {
  if (preset?.features?.length) {
    return preset.features;
  }

  const features: string[] = [];

  if (professionalLimit != null) {
    features.push(buildLimitFeature(professionalLimit, "profissional", "profissionais"));
  }

  if (patientLimit != null) {
    features.push(buildLimitFeature(patientLimit, "paciente", "pacientes"));
  }

  features.push(...splitDescriptionIntoFeatures(description));

  const normalizedFeatures = dedupeFeatures(features);

  if (normalizedFeatures.length > 0) {
    return normalizedFeatures;
  }

  return summary ? [summary] : [];
}

export function mapProductPlanRow(row: PlanRow): ProductPlanDefinition {
  const name = pickString(row, ["nome"]) || "Plano";
  const slug = pickString(row, ["slug"]) || null;
  const description = pickString(row, ["descricao"]);
  const professionalLimit = pickNumber(row, ["limite_psicologos"]);
  const patientLimit = pickNumber(row, ["limite_pacientes"]);
  const preset = findPlanPresentationPreset(name, slug);
  const summary = buildPlanSummary(professionalLimit, patientLimit, description);

  return {
    id: pickString(row, ["id"]) || slug || normalizePlanToken(name) || "plano",
    slug,
    name,
    monthlyPrice: pickNumber(row, ["preco_mensal"]),
    pricingNote: preset?.pricingNote || null,
    professionalLimit,
    patientLimit,
    description,
    subtitle: buildPlanSubtitle(professionalLimit, patientLimit, description, preset),
    summary,
    features: buildPlanFeatures(professionalLimit, patientLimit, description, summary, preset),
    order: pickNumber(row, ["ordem"]),
    active: pickBoolean(row, ["ativo"]) ?? true,
  };
}

export function findProductPlanByIdOrName(
  plans: ProductPlanDefinition[],
  value: string | null | undefined,
) {
  const normalizedValue = normalizePlanToken(value || "");
  if (!normalizedValue) return null;

  return (
    plans.find((plan) => normalizePlanToken(plan.id) === normalizedValue) ||
    plans.find((plan) => normalizePlanToken(plan.slug || "") === normalizedValue) ||
    plans.find((plan) => normalizePlanToken(plan.name) === normalizedValue) ||
    null
  );
}
