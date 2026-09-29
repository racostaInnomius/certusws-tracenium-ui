import { describe, it, expect } from "vitest";
import { hasJobResult } from "./jobResult";

describe("hasJobResult — the several ways 'nothing' arrives", () => {
  it("is false for every empty shape", () => {
    // A running or never-answered job. Rendering a block for any of these
    // would read as 'the job returned nothing' when it simply hasn't yet.
    for (const empty of [null, undefined, "", "   ", "null", "{}", {}]) {
      expect(hasJobResult(empty), JSON.stringify(empty)).toBe(false);
    }
  });

  it("is true once the agent actually returned something", () => {
    expect(hasJobResult({ message: "ok" })).toBe(true);
    expect(hasJobResult("success; cached=1")).toBe(true);
    expect(hasJobResult({ installed: ["KB5034"] })).toBe(true);
  });
});
