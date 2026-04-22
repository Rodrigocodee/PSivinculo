import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
  },
}));

vi.mock("@/lib/subscriptionAccess", () => ({
  resolveSubscriptionAccessFromSource: vi.fn(() => null),
}));

import { findPsychologistByInviteCode } from "@/services/psychologistInvite";

describe("findPsychologistByInviteCode", () => {
  it("falls back to the legacy RPC parameter name when the schema still exposes invite_code", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "Could not find the function public.lookup_public_psychologist_invite(invite_code_input) in the schema cache",
          code: "PGRST202",
          details: "Searched for the function with parameter invite_code_input.",
          hint: "Perhaps you meant to call the function public.lookup_public_psychologist_invite(invite_code)",
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            usuario_id: "psi-legacy-1",
            clinica_id: null,
            nome: "Dra. Camila",
            email: "camila@psivinculo.com",
            codigo_convite: "PSI-2ULK4B",
          },
        ],
        error: null,
      });

    const lookup = await findPsychologistByInviteCode("PSI-2ULK4B");

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "lookup_public_psychologist_invite", {
      invite_code_input: "PSI-2ULK4B",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "lookup_public_psychologist_invite", {
      invite_code: "PSI-2ULK4B",
    });
    expect(lookup?.psychologistId).toBe("psi-legacy-1");
  });

  it("surfaces RPC failures instead of masking them as invite-not-found", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "permission denied for function lookup_public_psychologist_invite",
        code: "42501",
        details: null,
        hint: null,
      },
    });

    await expect(findPsychologistByInviteCode("PSI-ABC123")).rejects.toThrow(
      "Nao foi possivel validar o codigo do psicologo agora.",
    );
  });

  it("returns null clinicId when the invite row has no validated clinic", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "psi-1",
          clinica_id: "clinic-invalida",
          nome: "Dra. Camila",
          email: "camila@psivinculo.com",
          codigo_convite: "PSI-ABC123",
          nome_clinica: null,
          assinatura_ativa: true,
          status_assinatura: "active",
        },
      ],
      error: null,
    });

    const lookup = await findPsychologistByInviteCode("PSI-ABC123");

    expect(lookup?.psychologistId).toBe("psi-1");
    expect(lookup?.clinicId).toBeNull();
  });

  it("keeps clinicId when the invite row is linked to an existing clinic", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "psi-1",
          clinica_id: "clinic-1",
          nome: "Dra. Camila",
          email: "camila@psivinculo.com",
          codigo_convite: "PSI-ABC123",
          nome_clinica: "Clinica Aurora",
          assinatura_ativa: true,
          status_assinatura: "active",
        },
      ],
      error: null,
    });

    const lookup = await findPsychologistByInviteCode("PSI-ABC123");

    expect(lookup?.clinicId).toBe("clinic-1");
    expect(lookup?.clinicName).toBe("Clinica Aurora");
  });

  it("accepts the live RPC shape that returns usuario_id instead of id", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          usuario_id: "psi-live-1",
          clinica_id: "clinic-1",
          nome: "Dra. Camila",
          email: "camila@psivinculo.com",
        },
      ],
      error: null,
    });

    const lookup = await findPsychologistByInviteCode("PSI-LIVE01");

    expect(lookup?.psychologistId).toBe("psi-live-1");
    expect(lookup?.clinicId).toBeNull();
  });
});
