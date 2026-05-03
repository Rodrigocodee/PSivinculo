import { beforeEach, describe, expect, it, vi } from "vitest";

type MutableRecord = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  let updatedPayload: MutableRecord | null = null;
  let insertedPayload: MutableRecord[] | null = null;
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

  const from = vi.fn((table: string) => {
    if (table !== "pacientes") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      insert: vi.fn((payload: MutableRecord[]) => {
        insertedPayload = payload;

        return {
          select: vi.fn(async () => ({
            data: payload,
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
    },
    getUpdatedPayload() {
      return updatedPayload;
    },
    getInsertedPayload() {
      return insertedPayload;
    },
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
    from: mocks.from,
  },
}));

vi.mock("@/services/psychologistScope", () => ({
  getPsychologistServiceScope: mocks.getPsychologistServiceScope,
}));

import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import { cadastrarPaciente, salvarLinksSalaOnlinePaciente } from "@/services/pacientes";

describe("pacientes.salvarLinksSalaOnlinePaciente", () => {
  beforeEach(() => {
    mocks.reset();
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
