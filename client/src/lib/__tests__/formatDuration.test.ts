import { describe, expect, it } from "vitest";
import { formatearDuracionMinutos } from "../formatDuration";

describe("formatearDuracionMinutos", () => {
  it("formats hours and minutes with a two-digit minute section", () => {
    expect(formatearDuracionMinutos(75)).toBe("1:15 minutos");
    expect(formatearDuracionMinutos(15)).toBe("0:15 minutos");
    expect(formatearDuracionMinutos(125)).toBe("2:05 minutos");
  });
});