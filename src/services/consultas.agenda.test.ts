import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let selectedColumns = "";

  const getPsychologistServiceScope = vi.fn(async () => ({
    userId: "psi-auth-1",
    psychologistId: "psi-1",
    psychologistIds: ["psi-1", "psi-auth-1"],
    clinicId: "clinic-1",
  }));

  const from = vi.fn((table: string) => {
    if (table !== "consultas") {
      throw new Error(`Unexpected table: ${table}`);
    }

    const query = {
      eq() {
        return query;
      },
      in() {
        return query;
      },
      gte() {
        return query;
      },
      lte() {
        return query;
      },
      order() {
        return query;
      },
      then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve({
          data: [
            {
              id: "consulta-1",
              paciente_id: "paciente-1",
              data_consulta: "2099-05-10T14:00:00",
              status: "confirmada",
              valor_consulta: 180,
              status_pagamento: "aguardando_pagamento",
              asaas_invoice_url: "https://sandbox.asaas.com/i/pay_1",
              asaas_bank_slip_url: null,
              pacientes: {
                id: "paciente-1",
                nome: "Ana",
              },
            },
          ],
          error: null,
        }).then(resolve, reject);
      },
    };

    return {
      select: vi.fn((columns: string) => {
        selectedColumns = columns;
        return query;
      }),
    };
  });

  return {
    from,
    getPsychologistServiceScope,
    reset() {
      selectedColumns = "";
      from.mockClear();
      getPsychologistServiceScope.mockClear();
    },
    getSelectedColumns() {
      return selectedColumns;
    },
  };
});

vi.mock("@/services/psychologistScope", () => ({
  getPsychologistServiceScope: mocks.getPsychologistServiceScope,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
  },
}));

import { listarConsultasDoDia } from "@/services/consultas";

describe("listarConsultasDoDia", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("requests the financial fields required by the psychologist agenda", async () => {
    const result = await listarConsultasDoDia("2099-05-10", {
      syncStatuses: false,
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "consulta-1",
        valor_consulta: 180,
        status_pagamento: "aguardando_pagamento",
        asaas_invoice_url: "https://sandbox.asaas.com/i/pay_1",
      }),
    ]);
    expect(mocks.getSelectedColumns()).toEqual(expect.stringContaining("valor_consulta"));
    expect(mocks.getSelectedColumns()).toEqual(expect.stringContaining("status_pagamento"));
    expect(mocks.getSelectedColumns()).toEqual(expect.stringContaining("asaas_invoice_url"));
    expect(mocks.getSelectedColumns()).toEqual(expect.stringContaining("asaas_bank_slip_url"));
  });
});
