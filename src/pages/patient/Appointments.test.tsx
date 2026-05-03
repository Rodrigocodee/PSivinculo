import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PatientAppointments from "@/pages/patient/Appointments";

const fetchPatientAppointmentsDataMock = vi.fn();

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/services/psychologistConsultationSettings", () => ({
  getConsultationModalityLabel: (value: string | null) =>
    value === "online" ? "Online" : value === "presencial" ? "Presencial" : "Nao definida",
}));

vi.mock("@/services/patientAppointments", () => ({
  patientAppointmentsQueryKey: ["patient-appointments"],
  fetchPatientAppointmentsData: (...args: unknown[]) => fetchPatientAppointmentsDataMock(...args),
  respondPatientCounterproposal: vi.fn(),
  requestPatientAppointment: vi.fn(),
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

function renderPage(initialEntry: string) {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <PatientAppointments />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return queryClient;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PatientAppointments", () => {
  it("abre a contraproposta com dados atualizados quando a pagina chega com consultaId", async () => {
    fetchPatientAppointmentsDataMock
      .mockResolvedValueOnce({
        patient: {
          fullName: "Bala doida",
        },
        appointments: [
          {
            id: "consulta-1",
            dateTime: "2026-04-23T08:00:00",
            requestedDateTimeOriginal: "2026-04-23T08:00:00",
            respondedAt: null,
            lastResponseBy: null,
            status: "solicitada",
            sessionType: "presencial",
            psychologistName: "Rodrigo Ferreira de Melo",
            notes: null,
            consultationPrice: null,
            consultationDurationMinutes: 50,
            presentialLocation: null,
            isUpcoming: true,
          },
        ],
        hasLinkedPatientRecord: true,
        canRequestAppointment: true,
        consultationSettings: null,
      })
      .mockResolvedValueOnce({
        patient: {
          fullName: "Bala doida",
        },
        appointments: [
          {
            id: "consulta-1",
            dateTime: "2026-04-24T08:00:00",
            requestedDateTimeOriginal: "2026-04-23T08:00:00",
            respondedAt: "2026-04-22T01:56:21.229Z",
            lastResponseBy: "psicologo",
            status: "contraproposta",
            sessionType: "presencial",
            psychologistName: "Rodrigo Ferreira de Melo",
            notes: null,
            consultationPrice: null,
            consultationDurationMinutes: 50,
            presentialLocation: null,
            isUpcoming: true,
          },
        ],
        hasLinkedPatientRecord: true,
        canRequestAppointment: true,
        consultationSettings: null,
      });

    renderPage("/paciente/agendamentos?consultaId=consulta-1");

    await waitFor(() => {
      expect(fetchPatientAppointmentsDataMock).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("Detalhes do agendamento")).toBeInTheDocument();
    expect(screen.getAllByText("Contraproposta").length).toBeGreaterThan(0);
    expect(screen.getAllByText("24/04/2026").length).toBeGreaterThan(0);
    expect(screen.getByText("Horario solicitado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceitar contraproposta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recusar contraproposta" })).toBeInTheDocument();
  });

  it("exibe acoes para o paciente responder um reagendamento pendente", async () => {
    fetchPatientAppointmentsDataMock
      .mockResolvedValueOnce({
        patient: {
          fullName: "Bala doida",
        },
        appointments: [
          {
            id: "consulta-2",
            dateTime: "2026-04-27T08:00:00",
            requestedDateTimeOriginal: "2026-04-23T08:00:00",
            respondedAt: "2026-04-22T02:00:00.000Z",
            lastResponseBy: "psicologo",
            status: "reagendada",
            sessionType: "presencial",
            psychologistName: "Rodrigo Ferreira de Melo",
            notes: null,
            consultationPrice: null,
            consultationDurationMinutes: 50,
            presentialLocation: null,
            isUpcoming: true,
          },
        ],
        hasLinkedPatientRecord: true,
        canRequestAppointment: true,
        consultationSettings: null,
      })
      .mockResolvedValueOnce({
        patient: {
          fullName: "Bala doida",
        },
        appointments: [
          {
            id: "consulta-2",
            dateTime: "2026-04-27T08:00:00",
            requestedDateTimeOriginal: "2026-04-23T08:00:00",
            respondedAt: "2026-04-22T02:00:00.000Z",
            lastResponseBy: "psicologo",
            status: "reagendada",
            sessionType: "presencial",
            psychologistName: "Rodrigo Ferreira de Melo",
            notes: null,
            consultationPrice: null,
            consultationDurationMinutes: 50,
            presentialLocation: null,
            isUpcoming: true,
          },
        ],
        hasLinkedPatientRecord: true,
        canRequestAppointment: true,
        consultationSettings: null,
      });

    renderPage("/paciente/agendamentos?consultaId=consulta-2");

    await waitFor(() => {
      expect(fetchPatientAppointmentsDataMock).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("Detalhes do agendamento")).toBeInTheDocument();
    expect(screen.getByText("Horario anterior")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar reagendamento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recusar reagendamento" })).toBeInTheDocument();
    expect(screen.getByText("Responder reagendamento")).toBeInTheDocument();
  });

  it("exibe o botao de pagamento quando a consulta tem cobranca pendente", async () => {
    fetchPatientAppointmentsDataMock.mockResolvedValue({
      patient: {
        fullName: "Bala doida",
      },
      appointments: [
        {
          id: "consulta-3",
          dateTime: "2026-05-01T10:00:00",
          requestedDateTimeOriginal: "2026-05-01T10:00:00",
          respondedAt: null,
          lastResponseBy: "psicologo",
          status: "confirmada",
          sessionType: "online",
          psychologistName: "Rodrigo Ferreira de Melo",
          notes: "Consulta confirmada",
          consultationPrice: 180,
          consultationDurationMinutes: 50,
          presentialLocation: null,
          paymentStatus: "aguardando_pagamento",
          paymentUrl: "https://sandbox.asaas.com/i/consulta-3",
          asaasPaymentId: "pay_123",
          isUpcoming: true,
        },
      ],
      hasLinkedPatientRecord: true,
      canRequestAppointment: true,
      consultationSettings: null,
    });

    renderPage("/paciente/agendamentos");

    expect(await screen.findByText("Detalhes")).toBeInTheDocument();
    expect(screen.getByText("Pagamento pendente")).toBeInTheDocument();
    expect(screen.getByText("Valor: R$ 180,00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pagar consulta" })).toHaveAttribute(
      "href",
      "https://sandbox.asaas.com/i/consulta-3",
    );
    screen.getByRole("button", { name: "Detalhes" }).click();

    expect((await screen.findAllByRole("link", { name: "Pagar consulta" })).length).toBeGreaterThan(0);
  });
});
