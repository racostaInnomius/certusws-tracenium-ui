// src/components/AgentSettings/fileIntegrityModel.test.js
//
// ADR-0027 F4 — el bloque de integridad de ficheros en el formulario.
//
// El caso que importa es el primero: antes de esto, guardar la sección de
// Security Compliance reconstruía `compliance` sólo con el intervalo y
// borraba en silencio los conjuntos vigilados.

import { describe, expect, it } from "vitest";
import { formToPolicy, readFormFromPolicy } from "../Policies/policyTransforms";
import {
  FIM_LIMITS,
  SUGGESTED_SETS,
  fileIntegrityProblems,
  fileIntegrityToPolicy,
  pathProblem,
  readFileIntegrityForm,
  slugify,
} from "./fileIntegrityModel";

const CATALOG = [{ key: "amp", required: true }, { key: "scp" }];
const FIM = {
  enabled: true,
  sets: [
    { id: "windows-hosts", label: "Hosts file", platform: "windows", purpose: "system", path: "C:\\Windows\\System32\\drivers\\etc", recursive: false },
    { id: "event-logs", platform: "windows", purpose: "audit_logs", path: "C:\\Windows\\System32\\winevt\\Logs", recursive: true, maxDepth: 2 },
  ],
  maxFilesPerDevice: 3000,
  maxFileBytes: 16 * 1024 * 1024,
};
const policy = (compliance) => ({ plugins: { enabled: ["amp", "scp"] }, modules: { compliance: true }, compliance });

describe("el bloque sobrevive al formulario", () => {
  it("⭐ leer y volver a escribir la política conserva los conjuntos vigilados", () => {
    const form = readFormFromPolicy(policy({ intervalSeconds: 28800, fileIntegrity: FIM }), CATALOG);
    const out = formToPolicy(form, CATALOG);
    expect(out.compliance.intervalSeconds).toBe(28800);
    expect(out.compliance.fileIntegrity).toEqual(FIM);
  });

  it("⭐ cambiar SÓLO el intervalo no borra los conjuntos (era lo que pasaba)", () => {
    const form = readFormFromPolicy(policy({ intervalSeconds: 28800, fileIntegrity: FIM }), CATALOG);
    const edited = { ...form, compliance: { ...form.compliance, intervalSeconds: 3600 } };
    const out = formToPolicy(edited, CATALOG);
    expect(out.compliance).toEqual({ intervalSeconds: 3600, fileIntegrity: FIM });
  });

  it("sin bloque declarado no se inventa uno", () => {
    const form = readFormFromPolicy(policy({ intervalSeconds: 28800 }), CATALOG);
    expect(form.compliance.fileIntegrity).toBeNull();
    expect(formToPolicy(form, CATALOG).compliance).toEqual({ intervalSeconds: 28800 });
  });
});

describe("readFileIntegrityForm / fileIntegrityToPolicy", () => {
  it("el formulario habla en MB y la política en bytes", () => {
    const f = readFileIntegrityForm(FIM);
    expect(f.maxFileMb).toBe(16);
    expect(fileIntegrityToPolicy(f).maxFileBytes).toBe(16 * 1024 * 1024);
  });

  it("lo que el operador no puso no se escribe: el servidor aplica sus valores", () => {
    const out = fileIntegrityToPolicy({ enabled: true, sets: [{ id: "x", path: "/etc", platform: "linux", purpose: "system", recursive: false, maxDepth: 4 }], maxFilesPerDevice: null, maxFileMb: "" });
    expect(out).toEqual({ enabled: true, sets: [{ id: "x", path: "/etc", platform: "linux", purpose: "system", recursive: false }] });
  });
});

describe("validación, igual que el servidor", () => {
  it("⭐ rutas: absolutas, sin comodines ni `..`", () => {
    expect(pathProblem("C:\\Windows\\System32")).toBeNull();
    expect(pathProblem("/etc/ssh")).toBeNull();
    expect(pathProblem("C:\\*")).toMatch(/No wildcards/);
    expect(pathProblem("/etc/../root")).toMatch(/not allowed/);
    expect(pathProblem("etc/hosts")).toMatch(/absolute/);
    expect(pathProblem("")).toBe("Required.");
  });

  it("nombres repetidos, profundidad y topes, con el campo que marca la UI", () => {
    const problems = fileIntegrityProblems({
      sets: [
        { id: "a", path: "/etc", recursive: true, maxDepth: 99 },
        { id: "a", path: "/var" },
      ],
      maxFilesPerDevice: FIM_LIMITS.maxFilesPerDeviceCeiling + 1,
      maxFileMb: 0,
    }).map((p) => p.field);
    expect(problems).toEqual(["sets[0].maxDepth", "sets[1].id", "maxFilesPerDevice", "maxFileMb"]);
  });

  it("los conjuntos sugeridos pasan la misma validación", () => {
    expect(fileIntegrityProblems({ sets: SUGGESTED_SETS.map((s) => ({ maxDepth: 4, ...s })) })).toEqual([]);
  });

  it("slugify da un id estable y no repite", () => {
    expect(slugify("Event logs")).toBe("event-logs");
    expect(slugify("Registros de auditoría")).toBe("registros-de-auditoria");
    expect(slugify("Event logs", new Set(["event-logs"]))).toBe("event-logs-2");
    expect(slugify("")).toBe("set");
  });
});
