import { describe, expect, it } from "vitest";
import { fechaLocal, inicioDiaLocal, rangoDiaLocal } from "../lib/fechas";

describe("fechas por zona horaria", () => {
  it("calcula el día local en Santo Domingo (UTC-4 todo el año)", () => {
    const ahora = new Date("2026-11-12T02:30:00Z"); // 22:30 del 11 en RD
    expect(fechaLocal("America/Santo_Domingo", ahora)).toBe("2026-11-11");
    expect(inicioDiaLocal("America/Santo_Domingo", ahora).toISOString()).toBe("2026-11-11T04:00:00.000Z");
    const r = rangoDiaLocal("America/Santo_Domingo", ahora);
    expect(r.hasta.getTime() - r.desde.getTime()).toBe(24 * 3600 * 1000);
  });

  it("respeta el cambio de horario en Nueva York", () => {
    // 1 de noviembre de 2026: se atrasa la hora, el día dura 25 horas.
    const r = rangoDiaLocal("America/New_York", new Date("2026-11-01T15:00:00Z"));
    expect(r.desde.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});
