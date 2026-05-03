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
  const getPsychologistServiceScope = vi.fn(async () => ({
    userId: "psi-auth-1",
    psychologistId: "psi-auth-1",
    psychologistIds: ["psi-auth-1"],
    clinicId: null,
  }));

  return {
    eq,
    from,
    getPsychologistServiceScope,
    limit,
    order,
    rpc,
    select,
    reset() {
      notificationRows = [];
      eq.mockClear();
      from.mockClear();
      getPsychologistServiceScope.mockClear();
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

vi.mock("@/services/psychologistScope", () => ({
  getPsychologistServiceScope: mocks.getPsychologistServiceScope,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import {
  clearPsychologistNotifications,
  listPsychologistNotifications,
  markAllPsychologistNotificationsAsRead,
  markPsychologistNotificationsAsRead,
} from "@/services/psychologistNotifications";

describe("psychologistNotifications", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("lists persisted psychologist notifications from the database", async () => {
    mocks.setNotificationRows([
      {
        id: "notif-1",
        usuario_id_destino: "psi-auth-1",
        tipo: "consulta_solicitada",
        titulo: "Nova solicitacao de consulta",
        mensagem: "Paulo solicitou horario para 29/04/2026 as 11:00.",
        rota_destino: "/psi/agenda?consultaId=consulta-1&data=2026-04-29",
        entidade_tipo: "consulta",
        entidade_id: "consulta-1",
        lida: false,
        created_at: "2026-04-21T10:00:00Z",
      },
      {
        id: "notif-2",
        usuario_id_destino: "psi-auth-1",
        tipo: "consulta_contraproposta_recusada",
        titulo: "Contraproposta recusada",
        mensagem: "Paulo recusou a contraproposta para 29/04/2026 as 11:00.",
        rota_destino: "/psi/agenda?consultaId=consulta-2&data=2026-04-29",
        entidade_tipo: "consulta",
        entidade_id: "consulta-2",
        lida: false,
        created_at: "2026-04-21T11:00:00Z",
      },
    ]);

    const notifications = await listPsychologistNotifications();

    expect(mocks.from).toHaveBeenCalledWith("notificacoes");
    expect(mocks.eq).toHaveBeenCalledWith("usuario_id_destino", "psi-auth-1");
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "notif-1",
          type: "consulta_solicitada",
          title: "Nova solicitacao de consulta",
          message: "Paulo solicitou horario para 29/04/2026 as 11:00.",
          routeDestination: "/psi/agenda?consultaId=consulta-1&data=2026-04-29",
          entityType: "consulta",
          entityId: "consulta-1",
          read: false,
        }),
        expect.objectContaining({
          id: "notif-2",
          type: "consulta_contraproposta_recusada",
          title: "Contraproposta recusada",
          message: "Paulo recusou a contraproposta para 29/04/2026 as 11:00.",
          routeDestination: "/psi/agenda?consultaId=consulta-2&data=2026-04-29",
          entityType: "consulta",
          entityId: "consulta-2",
          read: false,
        }),
      ]),
    );
    expect(notifications[0]?.time).toBeTruthy();
  });

  it("marks psychologist notifications as read through the backend rpc", async () => {
    await markPsychologistNotificationsAsRead([" notif-1 ", "", "notif-2"]);

    expect(mocks.rpc).toHaveBeenCalledWith("mark_my_notifications_as_read", {
      notification_ids_input: ["notif-1", "notif-2"],
    });
  });

  it("does not call the rpc when there are no notification ids", async () => {
    await markPsychologistNotificationsAsRead([" ", ""]);

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("marks all psychologist notifications as read through the backend rpc", async () => {
    await markAllPsychologistNotificationsAsRead();

    expect(mocks.rpc).toHaveBeenCalledWith("mark_all_my_notifications_as_read");
  });

  it("clears psychologist notifications through the backend rpc", async () => {
    await clearPsychologistNotifications();

    expect(mocks.rpc).toHaveBeenCalledWith("clear_my_notifications");
  });
});
