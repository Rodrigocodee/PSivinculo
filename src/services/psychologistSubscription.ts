import {
  buildAuthenticatedJsonRequestHeaders,
  readServerJsonResponse,
} from "@/services/serverApi";

export type PsychologistSubscriptionPlan = {
  slug: string | null;
  name: string | null;
  status: string | null;
  monthlyPrice: number | null;
  nextDueDate: string | null;
  startedAt: string | null;
  paymentMethod: string | null;
  subscriptionActive: boolean;
  subscriptionId: string | null;
  customerId: string | null;
  paymentUrl: string | null;
  source: "assinaturas_asaas" | "usuarios" | null;
};

export type PsychologistSubscriptionConflict = {
  code: "MULTIPLE_ACTIVE_USER_SUBSCRIPTIONS";
  message: string;
  activeCount: number;
  subscriptions: Array<{
    subscriptionId: string | null;
    planSlug: string | null;
    status: string | null;
    monthlyPrice: number | null;
    nextDueDate: string | null;
    paymentMethod: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
};

export type PsychologistSubscriptionData = {
  success: true;
  ownerType: "user" | null;
  hasSubscription: boolean;
  currentPlan: PsychologistSubscriptionPlan | null;
  canCancel: boolean;
  conflict: PsychologistSubscriptionConflict | null;
};

export type PsychologistSubscriptionCancellation = {
  success: true;
  action: "cancelled_subscription";
  cancellationMode: "end_of_cycle" | "immediate";
  accessUntil: string | null;
  subscriptionId: string;
  warning: string | null;
  persistedRecord: {
    asaas_subscription_id: string | null;
    plano_slug: string | null;
    status_assinatura: string | null;
    assinatura_ativa: boolean;
    proximo_vencimento: string | null;
  };
};

async function callPsychologistSubscriptionApi<T>(
  path: string,
  body: Record<string, unknown>,
  fallbackMessage: string,
) {
  const response = await fetch(path, {
    method: "POST",
    headers: await buildAuthenticatedJsonRequestHeaders(),
    body: JSON.stringify({
      ownerType: "user",
      ...body,
    }),
  });

  return readServerJsonResponse<T>(response, fallbackMessage);
}

export const psychologistSubscriptionQueryKey = ["psychologist-subscription"];

export async function fetchPsychologistSubscription() {
  return callPsychologistSubscriptionApi<PsychologistSubscriptionData>(
    "/api/asaas/current-plan",
    {},
    "Nao foi possivel carregar a assinatura agora.",
  );
}

export async function cancelPsychologistSubscription(subscriptionId?: string | null) {
  return callPsychologistSubscriptionApi<PsychologistSubscriptionCancellation>(
    "/api/asaas/cancel-plan",
    subscriptionId ? { asaasSubscriptionId: subscriptionId } : {},
    "Nao foi possivel cancelar a assinatura agora.",
  );
}
