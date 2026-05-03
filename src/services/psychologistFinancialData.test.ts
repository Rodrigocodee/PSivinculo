import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let consultations: Array<Record<string, unknown>> = [];
  let lastPsychologistIds: string[] = [];

  const getCurrentPsychologistContext = vi.fn(async () => ({
    user: { id: "psi-auth-1" },
    record: {
      table: "usuarios",
      row: {
        id: "psi-row-1",
        auth_id: "psi-auth-1",
      },
    },
    usuariosRecord: {
      table: "usuarios",
      row: {
        id: "psi-row-1",
        auth_id: "psi-auth-1",
      },
    },
    psychologistId: "psi-auth-1",
    clinicId: "",
  }));

  const from = vi.fn((table: string) => {
    if (table !== "consultas") {
      throw new Error(`Unexpected table: ${table}`);
    }

    const state: {
      inColumn?: string;
      inValues?: string[];
      gteColumn?: string;
      gteValue?: string;
      lteColumn?: string;
      lteValue?: string;
    } = {};

    const query = {
      in(column: string, values: string[]) {
        state.inColumn = column;
        state.inValues = values;
        lastPsychologistIds = [...values];
        return query;
      },
      gte(column: string, value: string) {
        state.gteColumn = column;
        state.gteValue = value;
        return query;
      },
      lte(column: string, value: string) {
        state.lteColumn = column;
        state.lteValue = value;
        return query;
      },
      order() {
        return query;
      },
      then(
        resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        let data = consultations.slice();

        if (state.inColumn && state.inValues) {
          data = data.filter((row) =>
            state.inValues?.includes(String(row[state.inColumn!] || "")),
          );
        }

        if (state.gteColumn && state.gteValue) {
          data = data.filter(
            (row) => String(row[state.gteColumn!] || "") >= state.gteValue!,
          );
        }

        if (state.lteColumn && state.lteValue) {
          data = data.filter(
            (row) => String(row[state.lteColumn!] || "") <= state.lteValue!,
          );
        }

        data.sort((left, right) =>
          String(left.data_consulta || "").localeCompare(
            String(right.data_consulta || ""),
          ),
        );

        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };

    return {
      select: vi.fn(() => query),
    };
  });

  return {
    from,
    getCurrentPsychologistContext,
    reset() {
      consultations = [];
      lastPsychologistIds = [];
      from.mockClear();
      getCurrentPsychologistContext.mockClear();
    },
    setConsultations(nextConsultations: Array<Record<string, unknown>>) {
      consultations = nextConsultations;
    },
    getLastPsychologistIds() {
      return lastPsychologistIds;
    },
  };
});

vi.mock("@/services/currentPsychologist", () => ({
  getCurrentPsychologistContext: mocks.getCurrentPsychologistContext,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
  },
}));

import {
  getPsychologistAgendaData,
  getPsychologistFinancialSummary,
  getPsychologistReceivables,
  getPsychologistReports,
} from "@/services/psychologistFinancialData";

describe("psychologistFinancialData", () => {
  beforeEach(() => {
    mocks.reset();
    mocks.setConsultations([
      {
        id: "consulta-week-1",
        paciente_id: "paciente-1",
        psicologo_id: "psi-row-1",
        data_consulta: "2026-04-07T09:00:00",
        status: "confirmada",
        modalidade_consulta: "online",
        valor_consulta: 180,
        duracao_consulta_min: 50,
        status_pagamento: "pago",
        asaas_payment_id: "pay-1",
        asaas_invoice_url: "https://sandbox.asaas.com/i/pay-1",
        pacientes: {
          id: "paciente-1",
          nome: "Ana",
        },
      },
      {
        id: "consulta-day",
        paciente_id: "paciente-2",
        psicologo_id: "psi-auth-1",
        data_consulta: "2026-04-09T14:30:00",
        status: "confirmada",
        modalidade_consulta: "presencial",
        local_presencial: "Sala 2",
        valor_consulta: 200,
        duracao_consulta_min: 60,
        status_pagamento: "aguardando_pagamento",
        asaas_payment_id: "pay-2",
        asaas_invoice_url: "https://sandbox.asaas.com/i/pay-2",
        pacientes: {
          id: "paciente-2",
          nome: "Bruno",
        },
      },
      {
        id: "consulta-missed",
        paciente_id: "paciente-3",
        psicologo_id: "psi-row-1",
        data_consulta: "2026-04-10T10:00:00",
        status: "faltou",
        modalidade_consulta: "online",
        valor_consulta: 120,
        duracao_consulta_min: 50,
        status_pagamento: "nao_gerado",
        pacientes: {
          id: "paciente-3",
          nome: "Clara",
        },
      },
      {
        id: "consulta-cancelada",
        paciente_id: "paciente-4",
        psicologo_id: "psi-auth-1",
        data_consulta: "2026-04-15T11:00:00",
        status: "confirmada",
        modalidade_consulta: "online",
        valor_consulta: 90,
        duracao_consulta_min: 45,
        status_pagamento: "cancelado",
        asaas_payment_id: "pay-3",
        pacientes: {
          id: "paciente-4",
          nome: "Daniela",
        },
      },
      {
        id: "consulta-vencida",
        paciente_id: "paciente-5",
        psicologo_id: "psi-row-1",
        data_consulta: "2026-04-22T16:00:00",
        status: "pendente",
        modalidade_consulta: "online",
        valor_consulta: 140,
        duracao_consulta_min: 50,
        status_pagamento: "vencido",
        asaas_payment_id: "pay-4",
        asaas_invoice_url: "https://sandbox.asaas.com/i/pay-4",
        pacientes: {
          id: "paciente-5",
          nome: "Eduarda",
        },
      },
      {
        id: "consulta-mes-seguinte",
        paciente_id: "paciente-6",
        psicologo_id: "psi-auth-1",
        data_consulta: "2026-05-02T08:00:00",
        status: "realizada",
        modalidade_consulta: "online",
        valor_consulta: 300,
        duracao_consulta_min: 50,
        status_pagamento: "pago",
        asaas_payment_id: "pay-5",
        pacientes: {
          id: "paciente-6",
          nome: "Fabio",
        },
      },
      {
        id: "consulta-outro-psi",
        paciente_id: "paciente-7",
        psicologo_id: "outro-psicologo",
        data_consulta: "2026-04-09T09:00:00",
        status: "confirmada",
        modalidade_consulta: "online",
        valor_consulta: 999,
        duracao_consulta_min: 50,
        status_pagamento: "pago",
        pacientes: {
          id: "paciente-7",
          nome: "Ignorado",
        },
      },
    ]);
  });

  it("returns agenda data for day, week and month with fallback psychologist ids", async () => {
    const day = await getPsychologistAgendaData({
      mode: "day",
      referenceDate: "2026-04-09",
    });
    const week = await getPsychologistAgendaData({
      mode: "week",
      referenceDate: "2026-04-09",
    });
    const month = await getPsychologistAgendaData({
      mode: "month",
      referenceDate: "2026-04-09",
    });

    expect(day.consultations.map((consultation) => consultation.id)).toEqual([
      "consulta-day",
    ]);
    expect(week.consultations.map((consultation) => consultation.id)).toEqual([
      "consulta-week-1",
      "consulta-day",
      "consulta-missed",
    ]);
    expect(month.consultations.map((consultation) => consultation.id)).toEqual([
      "consulta-week-1",
      "consulta-day",
      "consulta-missed",
      "consulta-cancelada",
      "consulta-vencida",
    ]);
    expect(mocks.getLastPsychologistIds()).toEqual(
      expect.arrayContaining(["psi-row-1", "psi-auth-1"]),
    );
  });

  it("sums paid and pending consultations from public.consultas for the financial screen", async () => {
    const result = await getPsychologistFinancialSummary({
      monthKey: "2026-04",
      paymentStatus: "all",
    });

    expect(result.summary).toEqual({
      receivedAmount: 180,
      pendingAmount: 200,
      paidCount: 1,
      billedCount: 4,
    });
    expect(result.consultations).toHaveLength(5);

    const onlyPaid = await getPsychologistFinancialSummary({
      monthKey: "2026-04",
      paymentStatus: "pago",
    });

    expect(onlyPaid.consultations.map((consultation) => consultation.id)).toEqual([
      "consulta-week-1",
    ]);
  });

  it("lists receivables with real charges and keeps pending, overdue and cancelled rows", async () => {
    const result = await getPsychologistReceivables({
      monthKey: "2026-04",
    });

    expect(result.totalReceivedAmount).toBe(180);
    expect(result.receivables.map((consultation) => consultation.id)).toEqual([
      "consulta-vencida",
      "consulta-cancelada",
      "consulta-day",
      "consulta-week-1",
    ]);
    expect(result.receivables.every((consultation) => consultation.hasGeneratedCharge)).toBe(true);
  });

  it("builds reports from real consultations using payment status fallbacks", async () => {
    const result = await getPsychologistReports({
      monthKey: "2026-04",
    });

    expect(result.summary).toEqual({
      totalAppointments: 5,
      completedAppointments: 1,
      cancelledAppointments: 1,
      missedAppointments: 1,
      activePatients: 5,
    });
    expect(result.charts.revenue[result.charts.revenue.length - 1]).toEqual({
      month: expect.any(String),
      value: 180,
    });
    expect(result.charts.appointments[result.charts.appointments.length - 1]).toEqual({
      month: expect.any(String),
      total: 5,
    });
    expect(result.charts.results).toEqual([
      expect.objectContaining({ name: "Realizadas", value: 1 }),
      expect.objectContaining({ name: "Canceladas", value: 1 }),
      expect.objectContaining({ name: "Faltas", value: 1 }),
    ]);
  });
});
