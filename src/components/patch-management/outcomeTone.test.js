import { describe, it, expect } from "vitest";
import { outcomeTone, outcomeColors } from "./outcomeTone";
import { BRAND } from "../../theme/brand";

describe("outcomeTone — el color dice qué pasó", () => {
  it("⭐ aplicado se distingue de «ya cumplía» y de un fallo", () => {
    expect(outcomeTone("applied")).toBe("success");
    expect(outcomeTone("already_compliant")).toBe("info");
    expect(outcomeTone("failed")).toBe("error");
    expect(outcomeColors("applied").fg).toBe(BRAND.alert.successText);
    expect(outcomeColors("applied").fg).not.toBe(outcomeColors("already_compliant").fg);
  });
  it("aplicado a falta de reiniciar es ámbar; pendiente y desconocido, gris", () => {
    expect(outcomeTone("applied_reboot_required")).toBe("warning");
    expect(outcomeTone("pending")).toBe("neutral");
    expect(outcomeTone("something_new")).toBe("neutral");
    expect(outcomeTone(null)).toBe("neutral");
  });
});
