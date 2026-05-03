import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PatientDocuments from "@/pages/patient/Documents";

const fetchPatientDocumentsDataMock = vi.fn();

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/services/patientDocuments", () => ({
  patientDocumentsQueryKey: ["patient-documents"],
  fetchPatientDocumentsData: (...args: unknown[]) => fetchPatientDocumentsDataMock(...args),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderPage() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <PatientDocuments />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PatientDocuments", () => {
  it("lista apenas recibos pagos com link para abrir a cobranca", async () => {
    fetchPatientDocumentsDataMock.mockResolvedValue({
      patient: {
        fullName: "Paciente Teste",
      },
      documents: [
        {
          id: "consulta-1",
          psychologistName: "Dra. Camila",
          date: "2026-05-04T10:00:00",
          amount: 180,
          amountLabel: "R$ 180,00",
          status: "pago",
          statusLabel: "Pago",
          downloadUrl: "https://sandbox.asaas.com/i/consulta-1",
          availabilityLabel: null,
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("Dra. Camila")).toBeInTheDocument();
    expect(screen.getByText("Pago")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir cobranca" })).toHaveAttribute(
      "href",
      "https://sandbox.asaas.com/i/consulta-1",
    );
  });

  it("mostra estado vazio quando nao ha consultas pagas", async () => {
    fetchPatientDocumentsDataMock.mockResolvedValue({
      patient: {
        fullName: "Paciente Teste",
      },
      documents: [],
    });

    renderPage();

    expect(
      await screen.findByText("Nenhum recibo ou documento disponivel."),
    ).toBeInTheDocument();
  });
});
