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
  publicName?: string;
  value: number;
  priceLabel: string;
  pricingNote?: string;
  description: string;
  publicDescription: string;
  audience: "individual" | "clinic";
  audienceLabel: string;
  features: string[];
  featured?: boolean;
};

const publicCheckoutPlanByKey: Record<PublicPlanCheckoutKey, PublicCheckoutPlan> = {
  essencial: {
    routeKey: "essencial",
    slug: "essencial",
    name: "Essencial",
    value: 39.99,
    priceLabel: "R$ 39,99",
    description: "Assinatura mensal do plano Essencial do Psivinculo.",
    publicDescription: "Para psicologos que querem organizar agenda, pacientes e financeiro desde o inicio.",
    audience: "individual",
    audienceLabel: "Individual",
    features: ["1 psicologo", "Ate 50 pacientes", "Agenda e prontuario", "Financeiro", "Suporte por e-mail"],
  },
  profissional: {
    routeKey: "profissional",
    slug: "profissional",
    name: "Profissional",
    value: 59.99,
    priceLabel: "R$ 59,99",
    description: "Assinatura mensal do plano Profissional do Psivinculo.",
    publicDescription: "Mais controle para consultorios em crescimento e rotina intensa.",
    audience: "individual",
    audienceLabel: "Individual",
    features: [
      "1 psicologo",
      "Pacientes ilimitados",
      "Agenda e prontuario completos",
      "Relatorios completos",
      "Financeiro",
      "Suporte por e-mail",
    ],
    featured: true,
  },
  "clinica-duo": {
    routeKey: "clinica-duo",
    slug: "clinica_duo",
    name: "Clinica Duo",
    publicName: "Clínica Duo",
    value: 99.99,
    priceLabel: "R$ 99,99",
    description: "Assinatura mensal do plano Clinica Duo do Psivinculo.",
    publicDescription: "Ideal para clinicas com ate 2 profissionais.",
    audience: "clinic",
    audienceLabel: "Clínica",
    features: [
      "2 psicologos",
      "Pacientes ilimitados",
      "Agenda compartilhada",
      "Gestão administrativa",
      "Relatorios consolidados",
      "Suporte prioritario",
    ],
  },
  "clinica-expansao": {
    routeKey: "clinica-expansao",
    slug: "clinica_expansao",
    name: "Clinica Expansao",
    publicName: "Clínica Expansão",
    value: 99.99,
    priceLabel: "R$ 99,99",
    pricingNote: "+ R$ 39,99 por psicologo",
    description: "Assinatura mensal do plano Clinica Expansao do Psivinculo.",
    publicDescription: "Base para expansao da equipe com cobranca adicional por psicologo.",
    audience: "clinic",
    audienceLabel: "Clínica",
    features: [
      "Base para expansao da equipe",
      "Pacientes ilimitados",
      "Gestão administrativa",
      "Permissoes avancadas",
      "Relatorios consolidados",
      "Suporte prioritario",
    ],
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
