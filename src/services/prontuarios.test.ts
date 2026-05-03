import { beforeEach, describe, expect, it, vi } from "vitest";

type MutableRecord = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  let insertedRows: MutableRecord[] | null = null;
  let scope = {
    userId: "auth-psi-1",
    psychologistId: "psi-1",
    psychologistIds: ["psi-1", "auth-psi-1"],
    clinicId: "clinic-1",
    hasProfessionalAccess: true,
  };

  const getPsychologistServiceScope = vi.fn(async () => scope);
  const from = vi.fn((table: string) => {
    if (table !== "prontuarios") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      insert: vi.fn((rows: MutableRecord[]) => {
        insertedRows = rows;

        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: "prontuario-1",
                ...rows[0],
              },
              error: null,
            })),
          })),
        };
      }),
    };
  });
  const storageFrom = vi.fn(() => ({
    upload: vi.fn(async () => ({ error: null })),
    createSignedUrl: vi.fn(async () => ({
      data: { signedUrl: "https://storage.example.com/prontuario.pdf" },
      error: null,
    })),
  }));

  return {
    from,
    getPsychologistServiceScope,
    storageFrom,
    reset() {
      insertedRows = null;
      scope = {
        userId: "auth-psi-1",
        psychologistId: "psi-1",
        psychologistIds: ["psi-1", "auth-psi-1"],
        clinicId: "clinic-1",
        hasProfessionalAccess: true,
      };
      from.mockClear();
      storageFrom.mockClear();
      getPsychologistServiceScope.mockClear();
    },
    getInsertedRows() {
      return insertedRows;
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
    storage: {
      from: mocks.storageFrom,
    },
  },
}));

vi.mock("@/services/psychologistScope", () => ({
  getPsychologistServiceScope: mocks.getPsychologistServiceScope,
}));

import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import { cadastrarProntuario } from "@/services/prontuarios";

describe("prontuarios service", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("creates a record for active psychologists", async () => {
    const result = await cadastrarProntuario({
      paciente_id: "paciente-1",
      data_sessao: "2099-05-10",
      numero_sessao: 1,
      anotacoes: "Evolucao da sessao.",
    });

    expect(mocks.getInsertedRows()).toEqual([
      expect.objectContaining({
        clinica_id: "clinic-1",
        psicologo_id: "psi-1",
        paciente_id: "paciente-1",
        anotacoes: "Evolucao da sessao.",
      }),
    ]);
    expect(result.id).toBe("prontuario-1");
  });

  it("blocks preview users from creating a record before persisting it", async () => {
    mocks.setScope({ hasProfessionalAccess: false });

    await expect(
      cadastrarProntuario({
        paciente_id: "paciente-1",
        data_sessao: "2099-05-10",
        anotacoes: "Evolucao em preview.",
      }),
    ).rejects.toThrow(PREVIEW_FEATURE_LOCK_MESSAGE);

    expect(mocks.getInsertedRows()).toBeNull();
  });
});
