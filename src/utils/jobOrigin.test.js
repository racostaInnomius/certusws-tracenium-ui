import { describe, it, expect } from "vitest";
import { describeJobOrigin, jobOriginText } from "./jobOrigin";

describe("describeJobOrigin", () => {
  it("⭐ los reset_baseline del sistema se leen como recuperación automática", () => {
    expect(describeJobOrigin({ created_by: "system:browser-extension-recovery" })).toMatchObject({
      label: "Automatic recovery", detail: "Browser extensions re-sync", automatic: true, recovery: true,
    });
    expect(jobOriginText({ created_by: "system:cold-projection-recovery" })).toBe(
      "Automatic recovery · Software inventory re-sync"
    );
  });

  it("otros jobs del sistema son automáticos, no recuperación", () => {
    expect(describeJobOrigin({ created_by: "system:patch-gate" })).toMatchObject({ label: "Automatic", recovery: false });
  });

  it("un motivo desconocido se humaniza, no se pierde", () => {
    expect(describeJobOrigin({ created_by: "system:new-thing" })).toMatchObject({
      label: "Automatic", detail: "New thing", raw: "system:new-thing",
    });
  });

  it("una persona sigue siendo su email o su sujeto", () => {
    expect(jobOriginText({ created_by: "35", created_by_email: "ops@x.com" })).toBe("ops@x.com");
    expect(describeJobOrigin({ created_by: "auth0|abc" })).toMatchObject({ label: "auth0|abc", automatic: false });
  });

  it("sin creador: automático", () => {
    expect(jobOriginText({})).toBe("Automatic · System");
  });
});
