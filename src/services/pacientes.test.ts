import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MutableRecord = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  let updatedPayload: MutableRecord | null = null;
  let insertedPayload: MutableRecord[] | null = null;
  let insertedResponse: MutableRecord[] | null = null;
  let updateFilters: Array<{ column: string; value: string | null }> = [];
  let scope = {
    userId: "auth-psi-1",
    psychologistId: "psi-1",
    psychologistIds: ["psi-1", "auth-psi-1"],
    clinicId: "clinic-1",
    hasProfessionalAccess: true,
  };
  let returnedRow: MutableRecord = {
    id: "paciente-1",
    nome: "Ana",
    email: "ana@example.com",
    telefone: null,
    endereco: null,
    contato_emergencia: null,
    cpf: null,
    data_nascimento: null,
    observacoes: null,
    ativo: true,
    link_sessao_online: null,
    link_sessao_online_paciente: null,
    link_sessao_online_psicologo: null,
    link_sessao_online_atualizado_em: null,
  };

  const getPsychologistServiceScope = vi.fn(async () => scope);
  const getSession = vi.fn(async () => ({
    data: {
      session: {
        access_token: "token-psi-1",
      },
    },
  }));

  const from = vi.fn((table: string) => {
    if (table !== "pacientes") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      insert: vi.fn((payload: MutableRecord[]) => {
        insertedPayload = payload;
        insertedResponse = payload.map((row, index) => ({
          id: `paciente-criado-${index + 1}`,
          ...row,
        }));

        return {
          select: vi.fn(async () => ({
            data: insertedResponse,
            error: null,
          })),
        };
      }),
      update: vi.fn((payload: MutableRecord) => {
        updatedPayload = payload;
        updateFilters = [];

        const chain = {
          eq: vi.fn((column: string, value: string | null) => {
            updateFilters.push({ column, value });
            return chain;
          }),
          in: vi.fn((column: string, value: string[] | null) => {
            updateFilters.push({ column, value: Array.isArray(value) ? value.join(",") : null });
            return chain;
          }),
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                ...returnedRow,
                ...payload,
              },
              error: null,
            })),
          })),
        };

        return chain;
      }),
    };
  });

  return {
    from,
    getPsychologistServiceScope,
    reset() {
      updatedPayload = null;
      insertedPayload = null;
      insertedResponse = null;
      updateFilters = [];
      scope = {
        userId: "auth-psi-1",
        psychologistId: "psi-1",
        psychologistIds: ["psi-1", "auth-psi-1"],
        clinicId: "clinic-1",
        hasProfessionalAccess: true,
      };
      returnedRow = {
        id: "paciente-1",
        nome: "Ana",
        email: "ana@example.com",
        telefone: null,
        endereco: null,
        contato_emergencia: null,
        cpf: null,
        data_nascimento: null,
        observacoes: null,
        ativo: true,
        link_sessao_online: null,
        link_sessao_online_paciente: null,
        link_sessao_online_psicologo: null,
        link_sessao_online_atualizado_em: null,
      };
      from.mockClear();
      getPsychologistServiceScope.mockClear();
      getSession.mockClear();
    },
    getUpdatedPayload() {
      return updatedPayload;
    },
    getInsertedPayload() {
      return insertedPayload;
    },
    getSession,
    getUpdateFilters() {
      return updateFilters;
    },
    setScope(overrides: Partial<typeof scope>) {
      scope = {
        ...scope,
        ...overrides,
      };
    },
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
    from: mocks.from,
  },
}));

vi.mock("@/services/psychologistScope", () => ({
  getPsychologistServiceScope: mocks.getPsychologistServiceScope,
}));

import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import { cadastrarPaciente, salvarLinksSalaOnlinePaciente } from "@/services/pacientes";

describe("pacientes.salvarLinksSalaOnlinePaciente", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.reset();
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        email: {
          attempted: true,
          sent: true,
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  it("saves the private room links in the specific patient record", async () => {
    const result = await salvarLinksSalaOnlinePaciente(
      "paciente-1",
      {
        patientLink: "https://meet.example.com/paciente-1",
        psychologistLink: "https://meet.example.com/host-paciente-1",
      },
    );

    expect(mocks.getUpdatedPayload()).toEqual({
      link_sessao_online_paciente: "https://meet.example.com/paciente-1",
      link_sessao_online_psicologo: "https://meet.example.com/host-paciente-1",
      link_sessao_online_atualizado_em: expect.any(String),
    });
    expect(mocks.getUpdateFilters()).toEqual([
      { column: "id", value: "paciente-1" },
      { column: "psicologo_id", value: "psi-1,auth-psi-1" },
      { column: "clinica_id", value: "clinic-1" },
    ]);
    expect(result.link_sessao_online_paciente).toBe("https://meet.example.com/paciente-1");
    expect(result.link_sessao_online_psicologo).toBe("https://meet.example.com/host-paciente-1");
  });

  it("blocks preview users from creating a patient before persisting it", async () => {
    mocks.setScope({ hasProfessionalAccess: false });

    await expect(
      cadastrarPaciente({
        nome: "Ana Preview",
        email: "ana.preview@example.com",
      }),
    ).rejects.toThrow(PREVIEW_FEATURE_LOCK_MESSAGE);

    expect(mocks.getInsertedPayload()).toBeNull();
  });

  it("creates a patient linked to the authenticated psychologist without requiring a clinic", async () => {
    mocks.setScope({
      psychologistId: "psi-2",
      psychologistIds: ["psi-2", "auth-psi-2"],
      clinicId: null,
    });

    await cadastrarPaciente({
      nome: "  Ana Individual  ",
      email: " ANA.INDIVIDUAL@EXAMPLE.COM ",
      telefone: "(11) 98765-4321",
      cpf: "123.456.789-01",
    });

    expect(mocks.getInsertedPayload()).toEqual([
      expect.objectContaining({
        clinica_id: null,
        psicologo_id: "psi-2",
        nome: "Ana Individual",
        email: "ana.individual@example.com",
        telefone: "11987654321",
        cpf: "12345678901",
        ativo: true,
      }),
    ]);
  });

  it("sends the manual registration email when the patient has a valid email", async () => {
    await cadastrarPaciente({
      nome: "Ana Email",
      email: "ana.email@example.com",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pacientes/manual-registration-email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-psi-1",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ patientId: "paciente-criado-1" }),
      }),
    );
  });

  it("does not try to send the manual registration email when the patient has no email", async () => {
    await cadastrarPaciente({
      nome: "Ana Sem Email",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the patient creation successful when the manual registration email fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Resend unavailable"));

    const result = await cadastrarPaciente({
      nome: "Ana Email Falha",
      email: "ana.falha@example.com",
    });

    expect(result?.[0]).toEqual(
      expect.objectContaining({
        id: "paciente-criado-1",
        nome: "Ana Email Falha",
        email: "ana.falha@example.com",
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Erro ao enviar e-mail do cadastro manual do paciente:",
      expect.any(Error),
    );
  });

  it("keeps the clinic link when the authenticated psychologist belongs to a clinic", async () => {
    await cadastrarPaciente({
      nome: "Ana Clinica",
      email: "ana.clinica@example.com",
    });

    expect(mocks.getInsertedPayload()).toEqual([
      expect.objectContaining({
        clinica_id: "clinic-1",
        psicologo_id: "psi-1",
        nome: "Ana Clinica",
        email: "ana.clinica@example.com",
        ativo: true,
      }),
    ]);
  });

  it("rejects explicit links to another psychologist", async () => {
    await expect(
      cadastrarPaciente(
        {
          nome: "Ana Outro Psi",
        },
        {
          psychologistId: "outro-psi",
        },
      ),
    ).rejects.toThrow("Nao foi possivel cadastrar paciente para outro psicologo.");

    expect(mocks.getInsertedPayload()).toBeNull();
  });

  it("allows clearing either private room link", async () => {
    const result = await salvarLinksSalaOnlinePaciente("paciente-1", {
      patientLink: "   ",
      psychologistLink: "",
    });

    expect(mocks.getUpdatedPayload()).toEqual({
      link_sessao_online_paciente: null,
      link_sessao_online_psicologo: null,
      link_sessao_online_atualizado_em: expect.any(String),
    });
    expect(result.link_sessao_online_paciente).toBeNull();
    expect(result.link_sessao_online_psicologo).toBeNull();
  });

  it("rejects a patient link without http/https before persisting it", async () => {
    await expect(
      salvarLinksSalaOnlinePaciente("paciente-1", {
        patientLink: "meet.google.com/sem-protocolo",
        psychologistLink: "",
      }),
    ).rejects.toThrow("Informe um link valido com http:// ou https://.");

    expect(mocks.getUpdatedPayload()).toBeNull();
  });

  it("rejects a psychologist link without http/https before persisting it", async () => {
    await expect(
      salvarLinksSalaOnlinePaciente("paciente-1", {
        patientLink: "",
        psychologistLink: "zoom.us/j/host-sem-protocolo",
      }),
    ).rejects.toThrow("Informe um link valido com http:// ou https://.");

    expect(mocks.getUpdatedPayload()).toBeNull();
  });
});
