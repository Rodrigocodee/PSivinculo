import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

type MutableRow = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  let consultasRows: MutableRow[] = [];
  let pacientesRows: MutableRow[] = [];

  function createQuery(rows: MutableRow[]) {
    const filters: Array<(row: MutableRow) => boolean> = [];

    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row?.[column] === value);
        return query;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => Array.isArray(values) && values.includes(row?.[column]));
        return query;
      },
      gte(column: string, value: string) {
        filters.push((row) => String(row?.[column] ?? "") >= value);
        return query;
      },
      lte(column: string, value: string) {
        filters.push((row) => String(row?.[column] ?? "") <= value);
        return query;
      },
      order() {
        return query;
      },
      then(resolve: (value: { data: MutableRow[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
        const filteredRows = rows.filter((row) => filters.every((filter) => filter(row)));

        return Promise.resolve({
          data: filteredRows,
          error: null,
        }).then(resolve, reject);
      },
    };

    return query;
  }

  const from = vi.fn((table: string) => {
    if (table === "consultas") {
      return createQuery(consultasRows);
    }

    if (table === "pacientes") {
      return createQuery(pacientesRows);
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const getPsychologistServiceScope = vi.fn(async () => ({
    userId: "auth-user-1",
    psychologistId: "psi-1",
    psychologistIds: ["psi-1", "auth-user-1"],
    clinicId: null,
  }));

  return {
    from,
    getPsychologistServiceScope,
    reset() {
      consultasRows = [
        {
          id: "consulta-paid-current",
          paciente_id: "paciente-1",
          psicologo_id: "psi-1",
          data_consulta: "2026-04-10T14:00:00",
          status: "realizada",
          status_pagamento: "pago",
          valor_consulta: 150,
          observacoes: null,
          pacientes: { id: "paciente-1", nome: "Ana" },
        },
        {
          id: "consulta-pending-current",
          paciente_id: "paciente-2",
          psicologo_id: "psi-1",
          data_consulta: "2026-04-15T10:00:00",
          status: "confirmada",
          status_pagamento: "aguardando_pagamento",
          valor_consulta: "200,50",
          observacoes: null,
          pacientes: { id: "paciente-2", nome: "Bruno" },
        },
        {
          id: "consulta-paid-previous-month",
          paciente_id: "paciente-3",
          psicologo_id: "psi-1",
          data_consulta: "2026-03-20T09:00:00",
          status: "realizada",
          status_pagamento: "pago",
          valor_consulta: 99,
          observacoes: null,
          pacientes: { id: "paciente-3", nome: "Carla" },
        },
      ];
      pacientesRows = [
        { id: "paciente-1", ativo: true, created_at: "2026-04-03T12:00:00" },
        { id: "paciente-2", ativo: true, created_at: "2026-03-10T12:00:00" },
      ];
      from.mockClear();
      getPsychologistServiceScope.mockClear();
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

import { buscarDashboardPsicologo } from "@/services/dashboard";

describe("buscarDashboardPsicologo", () => {
  beforeEach(() => {
    mocks.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates monthly paid and pending revenue from consultas without touching pagamentos", async () => {
    const dashboard = await buscarDashboardPsicologo();

    expect(mocks.from).not.toHaveBeenCalledWith("pagamentos");
    expect(dashboard.receitaMes).toBe(150);
    expect(dashboard.receitaPendente).toBe(200.5);
    expect(dashboard.charts.revenue[3]).toEqual({
      month: "Abr",
      value: 150,
    });
    expect(dashboard.charts.revenue[2]).toEqual({
      month: "Mar",
      value: 99,
    });
  });
});
