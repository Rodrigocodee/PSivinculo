export type PublicPlanCheckoutKey =
  | "essencial"
  | "profissional"
  | "clinica-duo"
  | "clinica-expansao";

export type PublicPlanSlug =
  | "essencial"
  | "profissional"
  | "clinica_duo"
  | "clinica_expansao";

export type PublicCheckoutPlan = {
  routeKey: PublicPlanCheckoutKey;
  slug: PublicPlanSlug;
  name: string;
  value: number;
  priceLabel: string;
  description: string;
};

const publicCheckoutPlanByKey: Record<PublicPlanCheckoutKey, PublicCheckoutPlan> = {
  essencial: {
    routeKey: "essencial",
    slug: "essencial",
    name: "Essencial",
    value: 39.99,
    priceLabel: "R$ 39,99",
    description: "Assinatura mensal do plano Essencial do Psivinculo.",
  },
  profissional: {
    routeKey: "profissional",
    slug: "profissional",
    name: "Profissional",
    value: 59.99,
    priceLabel: "R$ 59,99",
    description: "Assinatura mensal do plano Profissional do Psivinculo.",
  },
  "clinica-duo": {
    routeKey: "clinica-duo",
    slug: "clinica_duo",
    name: "Clinica Duo",
    value: 99.99,
    priceLabel: "R$ 99,99",
    description: "Assinatura mensal do plano Clinica Duo do Psivinculo.",
  },
  "clinica-expansao": {
    routeKey: "clinica-expansao",
    slug: "clinica_expansao",
    name: "Clinica Expansao",
    value: 99.99,
    priceLabel: "R$ 99,99",
    description: "Assinatura mensal do plano Clinica Expansao do Psivinculo.",
  },
};

export function isPublicPlanCheckoutKey(value: string): value is PublicPlanCheckoutKey {
  return value in publicCheckoutPlanByKey;
}

export function getPublicCheckoutPlanByKey(planKey: PublicPlanCheckoutKey) {
  return publicCheckoutPlanByKey[planKey];
}

export function listPublicCheckoutPlans() {
  return Object.values(publicCheckoutPlanByKey);
}

export function buildPublicPlanCheckoutRoute(planKey: PublicPlanCheckoutKey) {
  return `/checkout/${planKey}`;
}

export function buildPublicPlanCheckoutFallbackRoute(planKey: PublicPlanCheckoutKey) {
  return `/cadastro?plano=${encodeURIComponent(planKey)}`;
}
