import {
  listPublicCheckoutPlans,
  type PublicPlanCheckoutKey,
} from "@/config/publicCheckout";
import { createAsaasSubscriptionForPlan, type AsaasCheckoutResponse } from "@/services/asaasCheckout";
import {
  buildAuthenticatedJsonRequestHeaders,
  readServerJsonResponse,
} from "@/services/serverApi";

export type PsychologistPlanSelectionPlan = {
  routeKey: PublicPlanCheckoutKey;
  slug: string;
  name: string;
  value: number;
  priceLabel: string;
  description: string;
  recommended: boolean;
  features: string[];
};

export type PsychologistSubscriptionPaymentLinkResponse = {
  success: true;
  subscriptionId: string;
  billingType: string;
  paymentUrl: string;
  payment: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
};

const INDIVIDUAL_PLAN_KEYS = new Set<PublicPlanCheckoutKey>(["essencial", "profissional"]);

const PLAN_FEATURES: Record<string, string[]> = {
  essencial: [
    "Agenda profissional",
    "Cadastro de pacientes",
    "Prontuario e historico",
    "Financeiro essencial",
    "Suporte por e-mail",
  ],
  profissional: [
    "Pacientes ilimitados",
    "Agenda e prontuario completos",
    "Relatorios completos",
    "Financeiro e recibos",
    "Suporte por e-mail",
  ],
};

export const psychologistPlansRoute = "/psi/planos";
export const psychologistPlanSelectionQueryKey = ["psychologist-plan-selection"];

export function listPsychologistIndividualPlans(): PsychologistPlanSelectionPlan[] {
  return listPublicCheckoutPlans()
    .filter((plan) => INDIVIDUAL_PLAN_KEYS.has(plan.routeKey))
    .map((plan) => ({
      ...plan,
      features: PLAN_FEATURES[plan.slug] || [],
      recommended: plan.slug === "profissional",
    }));
}

export async function createPsychologistPlanSubscription(input: {
  planKey: PublicPlanCheckoutKey;
  customer: {
    name: string;
    email: string;
    cpfCnpj: string;
  };
}) {
  return createAsaasSubscriptionForPlan(input) as Promise<AsaasCheckoutResponse>;
}

export async function createPsychologistSubscriptionPaymentLink(subscriptionId?: string | null) {
  const response = await fetch("/api/asaas/subscription-payment-link", {
    method: "POST",
    headers: await buildAuthenticatedJsonRequestHeaders(),
    body: JSON.stringify({
      ownerType: "user",
      ...(subscriptionId ? { asaasSubscriptionId: subscriptionId } : {}),
    }),
  });

  return readServerJsonResponse<PsychologistSubscriptionPaymentLinkResponse>(
    response,
    "Nao foi possivel abrir a cobranca pendente agora.",
  );
}
