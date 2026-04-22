import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getSession = vi.fn(async () => ({
    data: {
      session: {
        access_token: "psychologist-session-token",
      },
    },
  }));
  const getPsychologistServiceScope = vi.fn(async () => ({
    userId: "psi-auth-1",
    psychologistId: "psi-1",
    clinicId: "clinic-1",
  }));
  const from = vi.fn();
  const rpc = vi.fn();

  return {
    getSession,
    getPsychologistServiceScope,
    from,
    rpc,
    reset() {
      getSession.mockClear();
      getPsychologistServiceScope.mockClear();
      from.mockClear();
      rpc.mockClear();
    },
  };
});

vi.mock("@/services/psychologistScope", () => ({
  getPsychologistServiceScope: mocks.getPsychologistServiceScope,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import { atualizarConsulta, responderSolicitacaoConsulta } from "@/services/consultas";

describe("consultas service", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mocks.reset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("updates consultations through the backend route with the authenticated session", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        consultation: {
          id: "consulta-1",
          status: "reagendada",
          data_consulta: "2099-05-10T14:00:00",
        },
      }),
    });

    const result = await atualizarConsulta("consulta-1", {
      data_consulta: "2099-05-10T14:00:00",
      status: "reagendada",
      observacoes: "Horario alinhado com o paciente.",
      local_presencial: "Sala 2",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/consultas/update",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer psychologist-session-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          consultaId: "consulta-1",
          updates: {
            data_consulta: "2099-05-10T14:00:00",
            status: "reagendada",
            observacoes: "Horario alinhado com o paciente.",
            local_presencial: "Sala 2",
          },
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "consulta-1",
        status: "reagendada",
      }),
    );
  });

  it("translates missing consultation rpc routes into the migration guidance", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: "PGRST202",
          message: "Could not find the function public.respond_consulta_request",
        },
      }),
    });

    await expect(
      responderSolicitacaoConsulta({
        consultaId: "consulta-2",
        acao: "confirmar",
      }),
    ).rejects.toThrow(
      "O banco ainda nao foi atualizado com o novo fluxo de resposta de consultas. Aplique a migration mais recente e tente novamente.",
    );
  });
});
