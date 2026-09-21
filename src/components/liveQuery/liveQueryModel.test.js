// src/components/liveQuery/liveQueryModel.test.js
import { describe, expect, it } from "vitest";
import { answerKeyLabel, answerSummary, paramsForRequest, paramsProblem, questionSummary, STATUS_LABEL, targetSummary } from "./liveQueryModel";

describe("liveQueryModel", () => {
  it("comprobación de cortesía antes de mandar (el servidor decide)", () => {
    expect(paramsProblem("process", { name: "" })).toMatch(/required/);
    expect(paramsProblem("process", { name: "C:\\x\\a.exe" })).toMatch(/name, not a path/);
    expect(paramsProblem("file", { path: "hosts" })).toMatch(/absolute/);
    expect(paramsProblem("port", { port: "99999" })).toMatch(/1 to 65535/);
    expect(paramsProblem("registry", { key: "HKLM\\SOFTWARE\\Acme", value: "" })).toBeNull();
    expect(paramsProblem("logged_on_users", {})).toBeNull();
    expect(paramsForRequest("port", { port: " 3389 " })).toEqual({ port: 3389 });
  });

  it("la pregunta y el objetivo, en una línea", () => {
    expect(questionSummary("registry", { key: "HKLM\\SOFTWARE\\Acme", value: "" })).toBe("Registry value: HKLM\\SOFTWARE\\Acme (default)");
    expect(questionSummary("port", { port: 3389 })).toBe("Listening port: TCP 3389");
    expect(targetSummary({ scope: "group", groupId: 4 }, [{ id: 4, name: "Servers" }])).toBe("Group: Servers");
    expect(targetSummary({ scope: "devices", deviceIds: ["a"] })).toBe("1 device");
  });

  it("⭐ las respuestas se leen como frases, y un apagado nunca se llama «no»", () => {
    expect(answerKeyLabel("file", `sha256:${"a".repeat(64)}`)).toBe("Present · SHA-256 aaaaaaaaaaaa…");
    expect(answerKeyLabel("process", "not running")).toBe("Not running");
    expect(answerSummary("process", { running: true, count: 2, instances: [{ pid: 1, user: "ACME\\ana" }] })).toBe("Running · 2 instances · ACME\\ana");
    expect(answerSummary("service", { exists: true, state: "running", startMode: "auto (delayed)" })).toBe("Running · start: auto (delayed)");
    expect(answerSummary("port", { listening: true, process: "svchost.exe", address: "0.0.0.0" })).toBe("Listening · svchost.exe · on 0.0.0.0");
    expect(STATUS_LABEL.offline).toBe("Offline — not asked");
    expect(STATUS_LABEL.error).toBe("Could not check");
  });
});
