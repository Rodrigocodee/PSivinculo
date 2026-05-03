// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const servicePath = resolve(process.cwd(), "src/services/psychologistSubscription.ts");
const settingsPath = resolve(process.cwd(), "src/pages/psychologist/Settings.tsx");
const asaasPath = resolve(process.cwd(), "server/asaas.mjs");
const serverPath = resolve(process.cwd(), "server/index.mjs");

describe("psychologist subscription management", () => {
  it("scopes profile subscription API calls to the authenticated user owner", () => {
    const serviceSource = readFileSync(servicePath, "utf8");
    const asaasSource = readFileSync(asaasPath, "utf8");
    const serverSource = readFileSync(serverPath, "utf8");

    expect(serviceSource).toContain('ownerType: "user"');
    expect(serviceSource).toContain("PsychologistSubscriptionConflict");
    expect(serviceSource).toContain('"/api/asaas/current-plan"');
    expect(serviceSource).toContain('"/api/asaas/cancel-plan"');
    expect(asaasSource).toContain("selectBillingContextForPayload");
    expect(asaasSource).toContain("MULTIPLE_ACTIVE_USER_SUBSCRIPTIONS");
    expect(asaasSource).toContain('"Esta assinatura nao pertence ao psicologo autenticado."');
    expect(serverSource).toContain('pathname === "/api/asaas/current-plan"');
  });

  it("renders a safe subscription card with confirmation before cancellation", () => {
    const settingsSource = readFileSync(settingsPath, "utf8");

    expect(settingsSource).toContain(">Assinatura<");
    expect(settingsSource).toContain("Sem assinatura ativa vinculada ao seu usuario profissional.");
    expect(settingsSource).toContain("Mais de uma assinatura ativa encontrada.");
    expect(settingsSource).toContain("O cancelamento automatico foi bloqueado");
    expect(settingsSource).toContain("Cancelar assinatura");
    expect(settingsSource).toContain("Tem certeza que deseja cancelar sua assinatura?");
    expect(settingsSource).toContain("cancelSubscriptionMutation.mutate()");
  });
});
