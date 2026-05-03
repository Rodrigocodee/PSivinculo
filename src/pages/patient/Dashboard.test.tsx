import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PatientDashboard from "@/pages/patient/Dashboard";

const fetchPatientDashboardDataMock = vi.fn();

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/services/patientDashboard", () => ({
  fetchPatientDashboardData: (...args: unknown[]) => fetchPatientDashboardDataMock(...args),
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
      <MemoryRouter>
        <PatientDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PatientDashboard", () => {
  it("exibe consultas com pagamento pendente no card financeiro", async () => {
    fetchPatientDashboardDataMock.mockResolvedValue({
      patient: {
        fullName: "Paciente Teste",
      },
      nextAppointment: null,
      pendingPayments: [
        {
          id: "consulta-1",
          dateTime: "2026-05-02T14:00:00",
          psychologistName: "Dra. Camila",
          amount: 180,
          status: "aguardando_pagamento",
          paymentUrl: "https://sandbox.asaas.com/i/consulta-1",
        },
      ],
      recentHistory: [],
      hasLinkedPatientRecord: true,
    });

    renderPage();

    expect(await screen.findByText("Dra. Camila")).toBeInTheDocument();
    expect(screen.getByText("Aguardando pagamento")).toBeInTheDocument();
    expect(screen.getByText("R$ 180,00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pagar consulta" })).toHaveAttribute(
      "href",
      "https://sandbox.asaas.com/i/consulta-1",
    );
  });

  it("mantem a mensagem vazia quando nao ha pagamentos pendentes", async () => {
    fetchPatientDashboardDataMock.mockResolvedValue({
      patient: {
        fullName: "Paciente Teste",
      },
      nextAppointment: null,
      pendingPayments: [],
      recentHistory: [],
      hasLinkedPatientRecord: true,
    });

    renderPage();

    expect(await screen.findByText("Nenhum pagamento pendente")).toBeInTheDocument();
  });
});
