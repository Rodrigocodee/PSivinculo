import { beforeEach, describe, expect, it, vi } from "vitest";

type MutableRecord = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  let currentRow: MutableRecord = {};
  let updatedPayload: MutableRecord | null = null;
  let updatedMatch: { column: string; value: string } | null = null;

  const getCurrentPsychologistContext = vi.fn(async () => ({
    user: {
      id: "auth-psi-1",
      email: "camila@example.com",
      user_metadata: {},
    },
    record: {
      table: "usuarios",
      row: currentRow,
      matchColumn: "auth_id",
      matchValue: "auth-psi-1",
    },
    usuariosRecord: {
      table: "usuarios",
      row: currentRow,
      matchColumn: "auth_id",
      matchValue: "auth-psi-1",
    },
    psychologistId: "auth-psi-1",
    clinicId: "clinic-1",
  }));

  const from = vi.fn((table: string) => {
    if (table !== "usuarios") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      update(payload: MutableRecord) {
        updatedPayload = payload;

        return {
          eq(column: string, value: string) {
            updatedMatch = { column, value };

            return {
              select() {
                return {
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      ...currentRow,
                      ...payload,
                    },
                    error: null,
                  })),
                };
              },
            };
          },
        };
      },
      upsert(payload: MutableRecord) {
        currentRow = {
          ...currentRow,
          ...payload,
        };

        return {
          select() {
            return {
              maybeSingle: vi.fn(async () => ({
                data: currentRow,
                error: null,
              })),
            };
          },
        };
      },
    };
  });

  return {
    getCurrentPsychologistContext,
    from,
    reset() {
      currentRow = {
        id: "user-1",
        auth_id: "auth-psi-1",
        tipo_usuario: "psicologo",
        tipo_recebimento: "externo",
        asaas_wallet_id: null,
        plano_slug: "profissional",
        status_assinatura: "PENDING",
        assinatura_ativa: false,
        professional_access_status: "preview",
        professional_access_granted: false,
      };
      updatedPayload = null;
      updatedMatch = null;
      getCurrentPsychologistContext.mockClear();
      from.mockClear();
    },
    setCurrentRow(row: MutableRecord) {
      currentRow = row;
    },
    getUpdatedPayload() {
      return updatedPayload;
    },
    getUpdatedMatch() {
      return updatedMatch;
    },
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
  },
}));

vi.mock("@/services/currentPsychologist", () => ({
  CURRENT_PSYCHOLOGIST_NAME: "Dra. Camila",
  getCurrentPsychologistContext: mocks.getCurrentPsychologistContext,
}));

import {
  PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE,
  saveCurrentPsychologistPaymentSettings,
} from "@/services/psychologistPaymentSettings";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";

describe("saveCurrentPsychologistPaymentSettings", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("blocks preview users from enabling critical receivables settings", async () => {
    await expect(
      saveCurrentPsychologistPaymentSettings({
        receivablesEnabled: true,
        asaasWalletId: "wallet-preview",
      }),
    ).rejects.toThrow(PREVIEW_FEATURE_LOCK_MESSAGE);

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.getUpdatedPayload()).toBeNull();
  });

  it("allows active psychologists to enable Asaas split receivables", async () => {
    mocks.setCurrentRow({
      id: "user-1",
      auth_id: "auth-psi-1",
      tipo_usuario: "psicologo",
      tipo_recebimento: "externo",
      plano_slug: "profissional",
      status_assinatura: "ACTIVE",
      assinatura_ativa: true,
      professional_access_status: "active",
      professional_access_granted: true,
    });

    const result = await saveCurrentPsychologistPaymentSettings({
      receivablesEnabled: true,
      asaasWalletId: " wallet-active ",
    });

    expect(mocks.getUpdatedPayload()).toEqual({
      tipo_recebimento: "asaas_split",
      asaas_wallet_id: "wallet-active",
      percentual_repasse: PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE,
    });
    expect(mocks.getUpdatedMatch()).toEqual({
      column: "auth_id",
      value: "auth-psi-1",
    });
    expect(result).toEqual(
      expect.objectContaining({
        receivablesEnabled: true,
        paymentType: "asaas_split",
        asaasWalletId: "wallet-active",
      }),
    );
  });
});
