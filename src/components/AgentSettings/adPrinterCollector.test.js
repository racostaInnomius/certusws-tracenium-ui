// src/components/AgentSettings/adPrinterCollector.test.js
//
// ADR-0023 F2 — las derivaciones del panel del colector.

import { describe, expect, it } from "vitest";
import { apiErrorMessage, candidateLabel, describeRunError, lastReadSummary, shouldPoll } from "./adPrinterCollector";

describe("candidateLabel", () => {
  it("dice lo que impide correr: versión de agente y offline", () => {
    expect(candidateLabel({ deviceId: "a", hostname: "MSIG-WSUS", supported: true, online: true }, "1.1.73")).toBe("MSIG-WSUS");
    expect(candidateLabel({ deviceId: "b", hostname: "MsigPrint", agentVersion: "1.1.72", supported: false, online: false }, "1.1.73"))
      .toBe("MsigPrint · agent 1.1.72, needs 1.1.73 · offline");
    expect(candidateLabel({ deviceId: "c", supported: false, online: true }, "1.1.73")).toBe("c · agent version unknown, needs 1.1.73");
  });
});

describe("describeRunError", () => {
  it("⚠️ fuera de dominio no se lee como cero impresoras", () => {
    expect(describeRunError("not_domain_joined")).toMatch(/not joined to a domain/);
  });
  it("traduce los motivos conocidos y conserva los desconocidos", () => {
    expect(describeRunError("collector_unavailable")).toBe("No collector device was online.");
    expect(describeRunError("requires_agent:1.1.73")).toBe("The collector's agent is older than 1.1.73.");
    expect(describeRunError("collector: script_untrusted")).toMatch(/signature/);
    expect(describeRunError("System.Runtime.InteropServices.COMException: The server is not operational")).toMatch(/not operational/);
    expect(describeRunError(null)).toBeNull();
  });
});

describe("apiErrorMessage", () => {
  it("usa el código del backend y cae al mensaje si no lo conoce", () => {
    expect(apiErrorMessage({ body: { error: "AD_PRINTERS_COLLECTOR_UNAVAILABLE" } })).toMatch(/recorded as missed/);
    expect(apiErrorMessage({ message: "boom" })).toBe("boom");
    expect(apiErrorMessage({}, "fallback")).toBe("fallback");
  });
});

describe("lastReadSummary / shouldPoll", () => {
  const runs = [
    { runId: "3", status: "failed", error: "not_domain_joined" },
    { runId: "2", status: "complete", domain: "mountainside-investment.com", queuesCount: 21, finishedAt: "2026-09-15T10:00:00Z" },
  ];
  it("resume la última COMPLETA aunque la más reciente haya fallado", () => {
    expect(lastReadSummary({ runs })).toMatchObject({ queues: 21, text: "21 print queues published in mountainside-investment.com" });
    expect(lastReadSummary({ runs: [{ status: "missed" }] })).toBeNull();
  });
  it("sólo se pregunta de nuevo con una corrida en curso", () => {
    expect(shouldPoll({ runs: [{ status: "running" }, ...runs] })).toBe(true);
    expect(shouldPoll({ runs })).toBe(false);
    expect(shouldPoll(null)).toBe(false);
  });
});
