import { beforeEach, describe, expect, it, vi } from "vitest";

type MutableRecord = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  let notificationRows: MutableRecord[] = [];

  const limit = vi.fn(async () => ({
    data: notificationRows,
    error: null,
  }));
  const order = vi.fn(() => ({
    limit,
  }));
  const eq = vi.fn(() => ({
    order,
  }));
  const select = vi.fn(() => ({
    eq,
  }));
  const from = vi.fn((table: string) => {
    if (table !== "notificacoes") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select,
    };
  });
  const rpc = vi.fn(async () => ({
    data: null,
    error: null,
  }));
  const getCurrentPaciente = vi.fn(async () => ({
    user: {
      id: "patient-auth-1",
      email: "patient@example.com",
      user_metadata: {},
    },
    patientId: "patient-1",
  }));

  return {
    eq,
    from,
    getCurrentPaciente,
    limit,
    order,
    rpc,
    select,
    reset() {
      notificationRows = [];
      eq.mockClear();
      from.mockClear();
      getCurrentPaciente.mockClear();
      limit.mockClear();
      order.mockClear();
      rpc.mockClear();
      select.mockClear();
    },
    setNotificationRows(rows: MutableRecord[]) {
      notificationRows = rows;
    },
  };
});

vi.mock("@/services/currentPatient", () => ({
  getCurrentPaciente: mocks.getCurrentPaciente,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import {
  listPatientNotifications,
  markPatientNotificationsAsRead,
} from "@/services/patientNotifications";

describe("patientNotifications", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("lists persisted patient notifications from the database", async () => {
    mocks.setNotificationRows([
      {
        id: "notif-1",
        usuario_id_destino: "patient-auth-1",
        tipo: "consulta_contraproposta",
        titulo: "Novo horario sugerido",
        mensagem: "Seu psicologo sugeriu 02/05/2099 as 14:30 no lugar de 01/05/2099 as 10:00.",
        rota_destino: "/paciente/agendamentos?consultaId=consulta-1",
        entidade_tipo: "consulta",
        entidade_id: "consulta-1",
        lida: false,
        created_at: "2026-04-21T12:00:00Z",
      },
    ]);

    const notifications = await listPatientNotifications();

    expect(mocks.from).toHaveBeenCalledWith("notificacoes");
    expect(mocks.eq).toHaveBeenCalledWith("usuario_id_destino", "patient-auth-1");
    expect(notifications).toEqual([
      expect.objectContaining({
        id: "notif-1",
        type: "consulta_contraproposta",
        title: "Novo horario sugerido",
        message: "Seu psicologo sugeriu 02/05/2099 as 14:30 no lugar de 01/05/2099 as 10:00.",
        routeDestination: "/paciente/agendamentos?consultaId=consulta-1",
        entityType: "consulta",
        entityId: "consulta-1",
        read: false,
      }),
    ]);
    expect(notifications[0]?.time).toBeTruthy();
  });

  it("marks patient notifications as read through the backend rpc", async () => {
    await markPatientNotificationsAsRead([" notif-1 ", "", "notif-2"]);

    expect(mocks.rpc).toHaveBeenCalledWith("mark_my_notifications_as_read", {
      notification_ids_input: ["notif-1", "notif-2"],
    });
  });

  it("does not call the rpc when there are no notification ids", async () => {
    await markPatientNotificationsAsRead([" ", ""]);

    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
