import { describe, expect, it } from "vitest";
import {
  getPublicCheckoutPlanByKey,
  isPublicPlanCheckoutKey,
  listPublicCheckoutPlans,
} from "@/config/publicCheckout";
import { buildPendingSubscriptionDraft } from "@/services/subscriptionPersistence";
import type { AsaasCheckoutResponse } from "@/services/asaasCheckout";
import { listSubscriptionPlans } from "../../server/plans.mjs";

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

  it("lists every public checkout plan for the landing page", () => {
    expect(listPublicCheckoutPlans().map((plan) => plan.routeKey)).toEqual([
      "essencial",
      "profissional",
      "clinica-duo",
      "clinica-expansao",
    ]);
    expect(getPublicCheckoutPlanByKey("clinica-expansao")).toMatchObject({
      value: 99.99,
      priceLabel: "R$ 99,99",
      pricingNote: "+ R$ 39,99 por psicologo",
      audience: "clinic",
    });
  });

  it("keeps public checkout plans aligned with server subscription plans", () => {
    const publicPlans = listPublicCheckoutPlans().map((plan) => ({
      routeKey: plan.routeKey,
      slug: plan.slug,
      name: plan.name,
      value: plan.value,
      description: plan.description,
    }));
    const serverPlans = listSubscriptionPlans().map((plan) => ({
      routeKey: plan.routeKey,
      slug: plan.slug,
      name: plan.name,
      value: plan.value,
      description: plan.description,
    }));

    expect(publicPlans).toEqual(serverPlans);
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
