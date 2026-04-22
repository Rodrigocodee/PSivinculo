function normalizePlanIdentifier(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const PLANOS = Object.freeze({
  essencial: {
    slug: "essencial",
    routeKey: "essencial",
    name: "Essencial",
    value: 39.99,
    description: "Assinatura mensal do plano Essencial do Psivinculo.",
    aliases: ["essencial"],
  },
  profissional: {
    slug: "profissional",
    routeKey: "profissional",
    name: "Profissional",
    value: 59.99,
    description: "Assinatura mensal do plano Profissional do Psivinculo.",
    aliases: ["profissional"],
  },
  clinica_duo: {
    slug: "clinica_duo",
    routeKey: "clinica-duo",
    name: "Clinica Duo",
    value: 99.99,
    description: "Assinatura mensal do plano Clinica Duo do Psivinculo.",
    aliases: ["clinica_duo", "clinica-duo", "clinica duo", "duo"],
  },
  clinica_expansao: {
    slug: "clinica_expansao",
    routeKey: "clinica-expansao",
    name: "Clinica Expansao",
    value: 99.99,
    description: "Assinatura mensal do plano Clinica Expansao do Psivinculo.",
    aliases: ["clinica_expansao", "clinica-expansao", "clinica expansao", "expansao"],
  },
});

const planByAlias = new Map(
  Object.entries(PLANOS).flatMap(([planKey, plan]) =>
    [planKey, ...plan.aliases].map((alias) => [normalizePlanIdentifier(alias), { planKey, plan }]),
  ),
);

export function listSubscriptionPlans() {
  return Object.values(PLANOS).map(({ aliases, ...plan }) => ({ ...plan }));
}

export function resolveSubscriptionPlanByKey(value) {
  const normalizedValue = normalizePlanIdentifier(value);
  if (!normalizedValue) return null;

  const planEntry = Object.entries(PLANOS).find(([planKey]) => planKey === normalizedValue);
  if (!planEntry) return null;

  const [, plan] = planEntry;
  const { aliases, ...safePlan } = plan;
  return { ...safePlan };
}

export function resolveSubscriptionPlan(value) {
  const normalizedValue = normalizePlanIdentifier(value);
  if (!normalizedValue) return null;

  const planEntry = planByAlias.get(normalizedValue);
  if (!planEntry) return null;

  const { plan } = planEntry;
  const { aliases, ...safePlan } = plan;
  return { ...safePlan };
}
