import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

vi.mock("@/services/psychologistConsultationSettings", () => ({
  getPsychologistConsultationSettingsById: vi.fn(),
  normalizeAppointmentModality: (value: string | null | undefined) => {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "presencial") return "presencial";
    if (normalized === "online") return "online";

    return null;
  },
}));

import {
  DEFAULT_MENSAGEM_LEMBRETE_CONSULTA_TEMPLATE,
  buildMensagemLembreteConsulta,
  resolveMensagemLembreteConsultaVariaveis,
} from "@/services/consultaReminder";

describe("consultaReminder", () => {
  it("resolve automatic variables for online appointments", () => {
    const variables = resolveMensagemLembreteConsultaVariaveis({
      consulta: {
        paciente: "Ana",
        dataConsulta: new Date(2026, 4, 10, 14, 30),
        modalidadeConsulta: "online",
        localPresencial: "Clinica Centro",
      },
      psicologo: {
        nome: "Dra. Camila",
        linkSessaoOnline: "https://meet.google.com/abc-defg-hij",
        localPresencial: "Rua A, 10",
      },
    });

    expect(variables["{paciente}"]).toBe("Ana");
    expect(variables["{psicologo}"]).toBe("Dra. Camila");
    expect(variables["{modalidade}"]).toBe("Online");
    expect(variables["{link_sessao}"]).toBe("https://meet.google.com/abc-defg-hij");
    expect(variables["{local_presencial}"]).toBe("");
  });

  it("removes empty online fragments and keeps the presential location", () => {
    const message = buildMensagemLembreteConsulta({
      consulta: {
        paciente: "Ana",
        dataConsulta: new Date(2026, 4, 10, 14, 30),
        modalidadeConsulta: "presencial",
        localPresencial: "Rua das Flores, 123",
      },
      psicologo: {
        nome: "Dra. Camila",
        mensagemLembreteSessao:
          "Ola, {paciente}!\nLink da sessao: {link_sessao}\nLocal: {local_presencial}",
      },
    });

    expect(message).toBe("Ola, Ana!\nLocal: Rua das Flores, 123");
  });

  it("uses the default template when the psychologist leaves the model blank", () => {
    const message = buildMensagemLembreteConsulta({
      consulta: {
        paciente: "Ana",
        dataConsulta: new Date(2026, 4, 10, 14, 30),
        modalidadeConsulta: "online",
      },
      psicologo: {
        nome: "Dra. Camila",
        linkSessaoOnline: "https://meet.google.com/abc-defg-hij",
        mensagemLembreteSessao: "   ",
      },
    });

    expect(message).toContain("Ana");
    expect(message).toContain("Dra. Camila");
    expect(message).toContain("Online");
    expect(message).toContain("https://meet.google.com/abc-defg-hij");
    expect(message).toBe(
      DEFAULT_MENSAGEM_LEMBRETE_CONSULTA_TEMPLATE
        .replace("{paciente}", "Ana")
        .replace("{psicologo}", "Dra. Camila")
        .replace("{modalidade}", "Online")
        .replace("{link_sessao}", "https://meet.google.com/abc-defg-hij")
        .replace("{data}", "10/05/2026")
        .replace("{hora}", "14:30"),
    );
  });
});
