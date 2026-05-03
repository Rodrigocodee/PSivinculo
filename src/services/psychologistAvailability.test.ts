import { describe, expect, it } from "vitest";

import {
  buildAvailableTimeSlots,
  getDefaultWorkingHours,
  validateAppointmentAvailability,
} from "@/services/psychologistAvailability";

describe("psychologistAvailability", () => {
  it("builds valid slots for an active monday from 08:00 to 18:00", () => {
    const slots = buildAvailableTimeSlots({
      dateKey: "2026-04-27",
      schedule: getDefaultWorkingHours(),
      consultationDurationMinutes: 50,
    });

    expect(slots[0]).toBe("08:00");
    expect(slots).toContain("08:50");
    expect(slots).toContain("17:10");
    expect(slots).not.toContain("18:00");
  });

  it("does not allow scheduling on an inactive sunday", () => {
    const validation = validateAppointmentAvailability({
      dateKey: "2026-04-26",
      time: "09:00",
      schedule: getDefaultWorkingHours(),
      consultationDurationMinutes: 50,
    });

    expect(validation).toEqual({
      ok: false,
      code: "inactive_day",
      message: "Dia sem atendimento configurado.",
    });
  });

  it("blocks slots that would exceed the configured end time", () => {
    const validation = validateAppointmentAvailability({
      dateKey: "2026-04-27",
      time: "17:20",
      schedule: getDefaultWorkingHours(),
      consultationDurationMinutes: 50,
    });

    expect(validation).toEqual({
      ok: false,
      code: "outside_hours",
      message: "Este horario esta fora da sua disponibilidade configurada.",
    });
  });

  it("blocks conflicts with an existing consultation", () => {
    const validation = validateAppointmentAvailability({
      dateKey: "2026-04-27",
      time: "09:00",
      schedule: getDefaultWorkingHours(),
      consultationDurationMinutes: 50,
      existingAppointments: [
        {
          id: "consulta-1",
          dateTime: "2026-04-27T09:00:00",
          durationMinutes: 50,
          status: "confirmada",
        },
      ],
    });

    expect(validation).toEqual({
      ok: false,
      code: "conflict",
      message: "Ja existe outra consulta neste horario.",
    });
  });
});
