import { beforeEach, describe, expect, it, vi } from "vitest";

type MutableRecord = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  let updatedPayload: MutableRecord | null = null;
  let updatedMatch: { column: string; value: string } | null = null;
  let returnedRow: MutableRecord = {
    id: "user-1",
    auth_id: "auth-user-1",
    clinica_id: "clinic-1",
    valor_consulta: 180,
    duracao_consulta_min: 50,
    modalidade_consulta: "online",
    local_presencial: null,
    link_sessao_online: "https://meet.example.com/original-room",
    mensagem_lembrete_sessao: null,
    plano_slug: "profissional",
    status_assinatura: "ACTIVE",
    assinatura_ativa: true,
  };

  const getUser = vi.fn(async () => ({
    data: {
      user: {
        id: "auth-user-1",
        email: "camila@example.com",
        user_metadata: {},
      },
    },
    error: null,
  }));

  const getCurrentPsychologistContext = vi.fn(async () => ({
    user: {
      id: "auth-user-1",
      email: "camila@example.com",
      user_metadata: {},
    },
    record: {
      table: "usuarios",
      row: returnedRow,
      matchColumn: "auth_id",
      matchValue: "auth-user-1",
    },
    usuariosRecord: {
      table: "usuarios",
      row: returnedRow,
      matchColumn: "auth_id",
      matchValue: "auth-user-1",
    },
    psychologistId: "auth-user-1",
    clinicId: "clinic-1",
  }));

  const findCurrentPsychologistRecord = vi.fn(async () => ({
    table: "usuarios",
    row: returnedRow,
    matchColumn: "auth_id",
    matchValue: "auth-user-1",
  }));

  const from = vi.fn((table: string) => {
    if (table !== "usuarios") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      update: vi.fn((payload: MutableRecord) => {
        updatedPayload = payload;

        return {
          eq: vi.fn((column: string, value: string) => {
            updatedMatch = { column, value };

            return {
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
          }),
        };
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: returnedRow,
              error: null,
            })),
          })),
        })),
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: returnedRow,
            error: null,
          })),
        })),
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: returnedRow,
            error: null,
          })),
        })),
      })),
    };
  });

  return {
    getUser,
    from,
    getCurrentPsychologistContext,
    findCurrentPsychologistRecord,
    reset() {
      updatedPayload = null;
      updatedMatch = null;
      returnedRow = {
        id: "user-1",
        auth_id: "auth-user-1",
        clinica_id: "clinic-1",
        valor_consulta: 180,
        duracao_consulta_min: 50,
        modalidade_consulta: "online",
        local_presencial: null,
        link_sessao_online: "https://meet.example.com/original-room",
        mensagem_lembrete_sessao: null,
        plano_slug: "profissional",
        status_assinatura: "ACTIVE",
        assinatura_ativa: true,
      };
      getUser.mockClear();
      from.mockClear();
      getCurrentPsychologistContext.mockClear();
      findCurrentPsychologistRecord.mockClear();
    },
    getUpdatedPayload() {
      return updatedPayload;
    },
    getUpdatedMatch() {
      return updatedMatch;
    },
    setReturnedRow(row: MutableRecord) {
      returnedRow = row;
    },
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
  },
}));

vi.mock("@/services/currentPsychologist", () => ({
  CURRENT_PSYCHOLOGIST_NAME: "Dra. Camila",
  findCurrentPsychologistRecord: mocks.findCurrentPsychologistRecord,
  getCurrentPsychologistContext: mocks.getCurrentPsychologistContext,
}));

import {
  getAvailableModalities,
  resolvePsychologistConsultationSettingsSnapshot,
  saveCurrentPsychologistConsultationSettings,
  saveCurrentPsychologistOnlineSessionLink,
} from "@/services/psychologistConsultationSettings";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";

describe("psychologistConsultationSettings.saveCurrentPsychologistOnlineSessionLink", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("saves the fixed online room link in usuarios.link_sessao_online", async () => {
    const result = await saveCurrentPsychologistOnlineSessionLink(
      "https://meet.example.com/fixed-room",
    );

    expect(mocks.getUpdatedPayload()).toEqual({
      link_sessao_online: "https://meet.example.com/fixed-room",
    });
    expect(mocks.getUpdatedMatch()).toEqual({
      column: "auth_id",
      value: "auth-user-1",
    });
    expect(result.onlineSessionLink).toBe("https://meet.example.com/fixed-room");
  });

  it("rejects links without http/https before trying to persist them", async () => {
    await expect(
      saveCurrentPsychologistOnlineSessionLink("meet.google.com/without-protocol"),
    ).rejects.toThrow("Informe um link valido com http:// ou https://.");

    expect(mocks.getUpdatedPayload()).toBeNull();
  });

  it("persists the consultation modality as hibrido", async () => {
    const result = await saveCurrentPsychologistConsultationSettings({
      consultationPrice: "180,00",
      consultationDurationMinutes: "50",
      consultationModality: "hibrido",
      presentialLocation: "Sala 3",
      sessionReminderMessage: "Lembrete",
    });

    expect(mocks.getUpdatedPayload()).toEqual({
      valor_consulta: 180,
      duracao_consulta_min: 50,
      modalidade_consulta: "hibrido",
      local_presencial: "Sala 3",
      mensagem_lembrete_sessao: "Lembrete",
    });
    expect(result.consultationModality).toBe("hibrido");
  });

  it("blocks preview users from saving consultation settings before updating usuarios", async () => {
    mocks.setReturnedRow({
      id: "user-1",
      auth_id: "auth-user-1",
      clinica_id: "clinic-1",
      valor_consulta: 180,
      duracao_consulta_min: 50,
      modalidade_consulta: "online",
      local_presencial: null,
      link_sessao_online: "https://meet.example.com/original-room",
      mensagem_lembrete_sessao: null,
      tipo_usuario: "psicologo",
      plano_slug: "profissional",
      status_assinatura: "PENDING",
      assinatura_ativa: false,
    });

    await expect(
      saveCurrentPsychologistConsultationSettings({
        consultationPrice: "180,00",
        consultationDurationMinutes: "50",
        consultationModality: "hibrido",
        presentialLocation: "Sala 3",
        sessionReminderMessage: "Lembrete",
      }),
    ).rejects.toThrow(PREVIEW_FEATURE_LOCK_MESSAGE);

    expect(mocks.getUpdatedPayload()).toBeNull();
  });

  it("maps legacy ambos values to hibrido when loading snapshots", () => {
    const snapshot = resolvePsychologistConsultationSettingsSnapshot({
      psychologistId: "auth-user-1",
      sourceTable: "usuarios",
      record: {
        id: "user-1",
        auth_id: "auth-user-1",
        modalidade_consulta: "ambos",
        valor_consulta: 180,
        duracao_consulta_min: 50,
      },
    });

    expect(snapshot.consultationModality).toBe("hibrido");
    expect(snapshot.attendsPresential).toBe(true);
    expect(snapshot.attendsOnline).toBe(true);
  });

  it("resolves available patient modalities from saved consultation modality variations", () => {
    expect(getAvailableModalities("online")).toEqual(["online"]);
    expect(getAvailableModalities("presencial")).toEqual(["presencial"]);
    expect(getAvailableModalities("presencial_online")).toEqual(["presencial", "online"]);
    expect(getAvailableModalities("presencial_e_online")).toEqual(["presencial", "online"]);
    expect(getAvailableModalities("Presencial e online")).toEqual(["presencial", "online"]);
    expect(getAvailableModalities("ambos")).toEqual(["presencial", "online"]);
  });
});
