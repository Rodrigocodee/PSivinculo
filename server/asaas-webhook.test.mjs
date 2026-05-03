// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const billingStoreMocks = vi.hoisted(() => ({
  registerAsaasWebhookEvent: vi.fn(),
  finalizeAsaasWebhookEvent: vi.fn(),
  persistAsaasSubscriptionState: vi.fn(),
  propagateWebhookSubscriptionToUserOwner: vi.fn(),
  resolveBillingOwnerContext: vi.fn(),
}));

vi.mock("./billing-store.mjs", () => ({
  registerAsaasWebhookEvent: billingStoreMocks.registerAsaasWebhookEvent,
  finalizeAsaasWebhookEvent: billingStoreMocks.finalizeAsaasWebhookEvent,
  persistAsaasSubscriptionState: billingStoreMocks.persistAsaasSubscriptionState,
  propagateWebhookSubscriptionToUserOwner: billingStoreMocks.propagateWebhookSubscriptionToUserOwner,
  resolveBillingOwnerContext: billingStoreMocks.resolveBillingOwnerContext,
}));

import { createSubscriptionOnAsaas, getAsaasConfig, handleAsaasWebhook } from "./asaas.mjs";

describe("handleAsaasWebhook", () => {
  let consoleInfoSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    billingStoreMocks.registerAsaasWebhookEvent.mockReset();
    billingStoreMocks.finalizeAsaasWebhookEvent.mockReset();
    billingStoreMocks.persistAsaasSubscriptionState.mockReset();
    billingStoreMocks.propagateWebhookSubscriptionToUserOwner.mockReset();
    billingStoreMocks.registerAsaasWebhookEvent.mockResolvedValue({
      duplicate: false,
      event: null,
    });
    billingStoreMocks.finalizeAsaasWebhookEvent.mockResolvedValue(undefined);
    billingStoreMocks.persistAsaasSubscriptionState.mockResolvedValue({});
    billingStoreMocks.propagateWebhookSubscriptionToUserOwner.mockResolvedValue(undefined);
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = vi.fn();
  });

  it("accepts ASAAS_API_URL as an alias for ASAAS_BASE_URL", () => {
    expect(
      getAsaasConfig({
        ASAAS_API_KEY: "asaas-key",
        ASAAS_API_URL: "https://api.asaas.com/v3/",
      }),
    ).toEqual({
      apiKey: "asaas-key",
      baseUrl: "https://api.asaas.com/v3",
    });
  });

  it("rejects localhost payment return callbacks in production", async () => {
    await expect(
      createSubscriptionOnAsaas(
        {
          planKey: "profissional",
          name: "Rodrigo Ferreira",
          email: "rodrigo@example.com",
          cpfCnpj: "12345678909",
          callback: {
            successUrl: "http://localhost:8080/psi/pagamento/retorno",
            autoRedirect: true,
          },
        },
        {
          env: {
            NODE_ENV: "production",
            ASAAS_API_KEY: "asaas-key",
            ASAAS_API_URL: "https://api.asaas.com/v3",
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
          },
        },
      ),
    ).rejects.toMatchObject({
      code: "ASAAS_CALLBACK_URL_INVALID",
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("processes a valid subscription webhook even when Asaas enrichment fails", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ errors: [{ description: "invalid api key" }] }),
    });

    const result = await handleAsaasWebhook(
      {
        id: "evt-subscription-payment",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_123",
          subscription: "sub_123",
          customer: "cus_123",
          status: "RECEIVED",
          billingType: "BOLETO",
          dueDate: "2026-05-20",
        },
      },
      {
        env: {
          ASAAS_API_KEY: "invalid-key",
          ASAAS_BASE_URL: "https://sandbox.asaas.com/api/v3",
          ASAAS_WEBHOOK_TOKEN: "webhook-token",
        },
        requestHeaders: {
          "asaas-access-token": "webhook-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: false,
        eventId: "evt-subscription-payment",
        eventType: "PAYMENT_RECEIVED",
        asaasSubscriptionId: "sub_123",
      }),
    );
    expect(billingStoreMocks.persistAsaasSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({
        asaasCustomerId: "cus_123",
        asaasSubscriptionId: "sub_123",
        asaasPaymentId: "pay_123",
        paymentStatus: "RECEIVED",
        paymentMethod: "BOLETO",
        nextDueDate: "2026-05-20",
      }),
      expect.any(Object),
    );
    expect(billingStoreMocks.finalizeAsaasWebhookEvent).toHaveBeenCalledWith(
      {
        eventId: "evt-subscription-payment",
        status: "processed",
      },
      expect.any(Object),
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[Psivinculo][asaas][webhook_subscription_fetch_failed_non_blocking]",
      expect.objectContaining({
        eventId: "evt-subscription-payment",
        asaasSubscriptionId: "sub_123",
        code: "ASAAS_AUTH_ERROR",
      }),
    );
  });

  it("keeps duplicate webhook events idempotent", async () => {
    billingStoreMocks.registerAsaasWebhookEvent.mockResolvedValue({
      duplicate: true,
      event: { event_id: "evt-duplicate" },
    });

    const result = await handleAsaasWebhook(
      {
        id: "evt-duplicate",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_123",
          subscription: "sub_123",
        },
      },
      {
        env: {
          ASAAS_API_KEY: "asaas-key",
          ASAAS_BASE_URL: "https://sandbox.asaas.com/api/v3",
          ASAAS_WEBHOOK_TOKEN: "webhook-token",
        },
        requestHeaders: {
          "asaas-access-token": "webhook-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: true,
        eventId: "evt-duplicate",
      }),
    );
    expect(billingStoreMocks.persistAsaasSubscriptionState).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("acknowledges ignored webhook events without persisting subscription state", async () => {
    const result = await handleAsaasWebhook(
      {
        id: "evt-consultation-payment",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_consulta_123",
          customer: "cus_123",
        },
      },
      {
        env: {
          ASAAS_API_KEY: "asaas-key",
          ASAAS_BASE_URL: "https://sandbox.asaas.com/api/v3",
          ASAAS_WEBHOOK_TOKEN: "webhook-token",
        },
        requestHeaders: {
          "asaas-access-token": "webhook-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: false,
        ignored: true,
        eventId: "evt-consultation-payment",
        eventType: "PAYMENT_RECEIVED",
      }),
    );
    expect(billingStoreMocks.persistAsaasSubscriptionState).not.toHaveBeenCalled();
    expect(billingStoreMocks.finalizeAsaasWebhookEvent).toHaveBeenCalledWith(
      {
        eventId: "evt-consultation-payment",
        status: "processed",
      },
      expect.any(Object),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("acknowledges old subscription events when the local plan cannot be resolved", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "sub_unknown",
        customer: "cus_unknown",
        status: "ACTIVE",
        billingType: "BOLETO",
        nextDueDate: "2026-05-20",
      }),
    });
    billingStoreMocks.persistAsaasSubscriptionState.mockRejectedValueOnce(
      Object.assign(
        new Error("Nao foi possivel identificar o plano da assinatura para persistir no banco local."),
        {
          status: 500,
          code: "SUBSCRIPTION_PLAN_RESOLUTION_ERROR",
        },
      ),
    );

    const result = await handleAsaasWebhook(
      {
        id: "evt-old-subscription-payment",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_old_subscription",
          subscription: "sub_unknown",
          customer: "cus_unknown",
          status: "RECEIVED",
          billingType: "BOLETO",
          dueDate: "2026-05-20",
          description: "Assinatura mensal do plano Profissional do Psivinculo.",
          value: 59.99,
        },
      },
      {
        env: {
          ASAAS_API_KEY: "asaas-key",
          ASAAS_BASE_URL: "https://sandbox.asaas.com/api/v3",
          ASAAS_WEBHOOK_TOKEN: "webhook-token",
        },
        requestHeaders: {
          "asaas-access-token": "webhook-token",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        duplicate: false,
        ignored: true,
        unresolved: true,
        code: "SUBSCRIPTION_PLAN_UNRESOLVED",
        eventId: "evt-old-subscription-payment",
        eventType: "PAYMENT_RECEIVED",
        asaasSubscriptionId: "sub_unknown",
      }),
    );
    expect(billingStoreMocks.propagateWebhookSubscriptionToUserOwner).not.toHaveBeenCalled();
    expect(billingStoreMocks.finalizeAsaasWebhookEvent).toHaveBeenCalledWith(
      {
        eventId: "evt-old-subscription-payment",
        status: "processed",
      },
      expect.any(Object),
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[Psivinculo][asaas][webhook_subscription_plan_unresolved_ignored]",
      expect.objectContaining({
        code: "SUBSCRIPTION_PLAN_UNRESOLVED",
        eventId: "evt-old-subscription-payment",
        asaasSubscriptionId: "sub_unknown",
      }),
    );
  });
});
