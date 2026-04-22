import { describe, expect, it } from "vitest";
import { getPublicCheckoutPlanByKey, isPublicPlanCheckoutKey } from "@/config/publicCheckout";
import { buildPendingSubscriptionDraft } from "@/services/subscriptionPersistence";
import type { AsaasCheckoutResponse } from "@/services/asaasCheckout";

describe("public checkout plan mapping", () => {
  it("maps the essential plan with the expected monthly value", () => {
    expect(getPublicCheckoutPlanByKey("essencial")).toMatchObject({
      slug: "essencial",
      value: 39.99,
      description: "Assinatura mensal do plano Essencial do Psivinculo.",
    });
  });

  it("accepts the public route keys currently used by the pricing page", () => {
    expect(isPublicPlanCheckoutKey("profissional")).toBe(true);
    expect(isPublicPlanCheckoutKey("clinica-duo")).toBe(true);
    expect(isPublicPlanCheckoutKey("clinica-expansao")).toBe(true);
    expect(isPublicPlanCheckoutKey("clinica_duo")).toBe(false);
  });
});

describe("pending subscription persistence draft", () => {
  it("builds the local draft structure from the checkout response", () => {
    const response = {
      success: true,
      nextDueDate: "2026-04-19",
      customerSource: "created",
      plan: {
        id: "profissional",
        slug: "profissional",
        routeKey: "profissional",
        name: "Profissional",
        value: 59.99,
        billingType: "UNDEFINED",
        cycle: "MONTHLY",
        description: "Assinatura mensal do plano Profissional do Psivinculo.",
      },
      customer: { id: "cus_123" },
      subscription: { id: "sub_123", status: "ACTIVE" },
      firstPayment: { id: "pay_123", status: "PENDING" },
      paymentUrl: "https://asaas.example/payment",
      pixQrCode: null,
      persistenceDraft: {
        asaas_customer_id: "cus_123",
        asaas_subscription_id: "sub_123",
        plano_slug: "profissional",
        status_assinatura: "ACTIVE",
      },
    } satisfies AsaasCheckoutResponse;

    expect(buildPendingSubscriptionDraft(response)).toEqual({
      asaas_customer_id: "cus_123",
      asaas_subscription_id: "sub_123",
      plano_slug: "profissional",
      status_assinatura: "ACTIVE",
    });
  });
});
