import { describe, it, expect } from "vitest";
import { hasJobResult, formatJobResult } from "./jobResult";

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

describe("formatJobResult — the flat ack reads as its message", () => {
  it("shows only the message, dropping the agent_ack plumbing", () => {
    // The common case: { source, message }. The operator wants the
    // outcome line, not the JSON wrapper around it.
    expect(
      formatJobResult({ source: "agent_ack", message: "software_dp_prefetch:success;cached=1" })
    ).toBe("software_dp_prefetch:success;cached=1");
  });

  it("shows a bare message object as its message", () => {
    expect(formatJobResult({ message: "done" })).toBe("done");
  });
});

describe("formatJobResult — richer results are pretty-printed", () => {
  it("pretty-prints a structured object", () => {
    const out = formatJobResult({ installed: ["KB5034"], rebootRequired: true });
    expect(out).toContain('"installed"');
    expect(out).toContain("KB5034");
    expect(out).toContain("\n"); // indented, not a single line
  });

  it("keeps a message object that ALSO has other keys as full JSON", () => {
    // message + source collapses to the line; message + anything else does
    // not, because the extra keys carry information the line would drop.
    const out = formatJobResult({ message: "partial", failed: 2 });
    expect(out).toContain('"failed"');
    expect(out).toContain('"message"');
  });
});

describe("formatJobResult — double-encoded JSON", () => {
  it("parses a stringified object and formats it like a real one", () => {
    // Some agents double-encode. Without the parse this showed as an
    // escaped blob with \" everywhere.
    const encoded = JSON.stringify({ source: "agent_ack", message: "ok" });
    expect(formatJobResult(encoded)).toBe("ok");
  });

  it("leaves a plain string that merely looks bracey alone", () => {
    // Not valid JSON — must not throw, must show verbatim.
    expect(formatJobResult("{not json}")).toBe("{not json}");
  });

  it("shows a normal string verbatim", () => {
    expect(formatJobResult("scan complete")).toBe("scan complete");
  });
});
