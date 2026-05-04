import type { AsaasCheckoutPersistenceDraft, AsaasCheckoutResponse } from "@/services/asaasCheckout";
import type { PublicPlanSlug } from "@/config/publicCheckout";
import { supabase } from "@/lib/supabase";
import { buildServerApiUrl } from "@/services/serverApi";

const LOCAL_STORAGE_KEY = "psivinculo.pending_subscription";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildPendingSubscriptionDraft(result: AsaasCheckoutResponse): AsaasCheckoutPersistenceDraft {
  const persistedDraft = result.persistenceDraft;
  if (persistedDraft) {
    return persistedDraft;
  }

  return {
    asaas_customer_id: normalizeString(isRecord(result.customer) ? result.customer.id : null),
    asaas_subscription_id: normalizeString(isRecord(result.subscription) ? result.subscription.id : null),
    plano_slug: result.plan.slug,
    status_assinatura:
      normalizeString(isRecord(result.subscription) ? result.subscription.status : null) ||
      normalizeString(isRecord(result.firstPayment) ? result.firstPayment.status : null),
  };
}

export function savePendingSubscriptionDraft(draft: AsaasCheckoutPersistenceDraft) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(draft));
}

export function clearPendingSubscriptionDraft() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(LOCAL_STORAGE_KEY);
}

export function loadPendingSubscriptionDraft(): AsaasCheckoutPersistenceDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as unknown;
    if (!isRecord(parsed)) return null;

    const planSlug = normalizeString(parsed.plano_slug) as PublicPlanSlug | null;
    if (!planSlug) return null;

    return {
      asaas_customer_id: normalizeString(parsed.asaas_customer_id),
      asaas_subscription_id: normalizeString(parsed.asaas_subscription_id),
      plano_slug: planSlug,
      status_assinatura: normalizeString(parsed.status_assinatura),
    };
  } catch {
    return null;
  }
}

async function buildLinkRequestHeaders() {
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
    // Keep the deferred linking flow resilient even without auth context.
  }

  return headers;
}

export async function linkPendingSubscriptionAfterRegistration(input: {
  email?: string | null;
  cpfCnpj?: string | null;
  planSlug?: PublicPlanSlug | null;
}) {
  const draft = loadPendingSubscriptionDraft();
  const normalizedEmail = normalizeString(input.email);
  const normalizedDocument = normalizeString(input.cpfCnpj);
  const normalizedPlanSlug = (normalizeString(input.planSlug) as PublicPlanSlug | null) || draft?.plano_slug || null;
  const normalizedSubscriptionId = draft?.asaas_subscription_id || null;

  if (!normalizedEmail && !normalizedDocument && !normalizedSubscriptionId) {
    return null;
  }

  const response = await fetch(buildServerApiUrl("/api/asaas/link-pending-subscriptions"), {
    method: "POST",
    headers: await buildLinkRequestHeaders(),
    body: JSON.stringify({
      email: normalizedEmail,
      cpfCnpj: normalizedDocument,
      planSlug: normalizedPlanSlug,
      asaasSubscriptionId: normalizedSubscriptionId,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        success?: boolean;
        linkedCount?: number;
        linkedSubscriptions?: string[];
      }
    | {
        success?: false;
        error?: {
          message?: string;
        };
      }
    | null;

  if (!response.ok || !payload || payload.success !== true) {
    throw new Error(payload && "error" in payload ? payload.error?.message || "Falha ao vincular assinatura pendente." : "Falha ao vincular assinatura pendente.");
  }

  if ((payload.linkedCount || 0) > 0) {
    clearPendingSubscriptionDraft();
  }

  return payload;
}
