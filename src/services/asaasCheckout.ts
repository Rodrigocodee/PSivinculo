import {
  getPublicCheckoutPlanByKey,
  type PublicPlanCheckoutKey,
  type PublicPlanSlug,
} from "@/config/publicCheckout";
import { supabase } from "@/lib/supabase";

export type AsaasCheckoutCustomerInput = {
  name: string;
  email: string;
  cpfCnpj: string;
};

export type AsaasCheckoutPersistenceDraft = {
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  plano_slug: PublicPlanSlug;
  status_assinatura: string | null;
};

export type AsaasCheckoutResponse = {
  success: true;
  nextDueDate: string;
  plan: {
    id: string | null;
    slug: PublicPlanSlug;
    routeKey: PublicPlanCheckoutKey;
    name: string | null;
    value: number;
    billingType: string;
    cycle: string;
    description: string;
  };
  customerSource: "existing" | "created";
  customer: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  firstPayment: Record<string, unknown> | null;
  paymentUrl: string | null;
  pixQrCode: {
    encodedImage?: string;
    payload?: string;
    expirationDate?: string;
  } | null;
  persistenceDraft: AsaasCheckoutPersistenceDraft;
};

type AsaasCheckoutErrorResponse = {
  success?: false;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

function extractErrorMessage(payload: AsaasCheckoutErrorResponse | null, fallbackMessage: string) {
  return payload?.error?.message?.trim() || fallbackMessage;
}

async function buildCheckoutRequestHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = session?.access_token?.trim();

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  } catch {
    // Keep the checkout flow working even when auth context is unavailable.
  }

  return headers;
}

export async function createAsaasSubscriptionForPlan(input: {
  planKey: PublicPlanCheckoutKey;
  customer: AsaasCheckoutCustomerInput;
  billingType?: "UNDEFINED" | "BOLETO" | "PIX";
  timeoutMs?: number;
}) {
  const plan = getPublicCheckoutPlanByKey(input.planKey);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), input.timeoutMs ?? 25_000);

  try {
    const response = await fetch("/api/asaas/create-subscription", {
      method: "POST",
      headers: await buildCheckoutRequestHeaders(),
      body: JSON.stringify({
        planKey: plan.slug,
        name: input.customer.name.trim(),
        email: input.customer.email.trim().toLowerCase(),
        cpfCnpj: input.customer.cpfCnpj.trim(),
        billingType: input.billingType || "UNDEFINED",
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | AsaasCheckoutResponse
      | AsaasCheckoutErrorResponse
      | null;

    if (!response.ok || !payload || !("success" in payload) || payload.success !== true) {
      throw new Error(
        extractErrorMessage(
          payload as AsaasCheckoutErrorResponse | null,
          "Nao foi possivel iniciar a assinatura agora.",
        ),
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("A comunicacao com o pagamento demorou mais que o esperado. Tente novamente.");
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Nao foi possivel iniciar a assinatura agora.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}
