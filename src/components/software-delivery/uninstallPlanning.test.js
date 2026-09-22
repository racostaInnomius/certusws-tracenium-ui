// src/components/software-delivery/uninstallPlanning.test.js
//
// Cómo se explica un equipo bloqueado y en cuántos despliegues se parte el
// envío de una desinstalación. Las dos cosas se equivocan sin dar error.

import { describe, expect, it } from "vitest";

import { batchesByTarget, describeBlocked, perUserCount, uninstallRequestBody } from "./uninstallPlanning";

const blocked = (reason) => ({ ok: false, reason, detail: "detalle en español del backend" });

describe("describeBlocked", () => {
  it("el agente protegido dice que el equipo se quedaría sin agente", () => {
    expect(describeBlocked(blocked("protected"), { name: "Tracenium Agent", source: "win32-registry" })).toMatch(
      /without an agent/
    );
  });

  // ⚠️ Antes TODO protegido decía «sin agente». Desde el 21-sep también se
  // protegen apps de Apple y openssh-server, y decir eso de ellos es falso.
  it("⭐ una app de Apple no se explica como si fuera el agente", () => {
    const text = describeBlocked(blocked("protected"), {
      name: "Safari",
      source: "macos-app-bundle",
      packageFamilyName: "com.apple.Safari",
    });
    expect(text).toMatch(/Apple app/);
    expect(text).not.toMatch(/agent/);
  });

  it("⭐ openssh-server se explica por la administración remota", () => {
    expect(
      describeBlocked(blocked("protected"), { name: "openssh-server", source: "dpkg", packageFamilyName: "openssh-server" })
    ).toMatch(/remote administration/);
  });

  it("el agente en Linux sigue siendo el agente, aunque venga de dpkg", () => {
    expect(
      describeBlocked(blocked("protected"), { name: "Tracenium Agent", source: "dpkg", packageFamilyName: "tracenium-agent" })
    ).toMatch(/without an agent/);
  });

  // El servidor lo protege por nombre O identidad; la frase tiene que seguir
  // la misma regla, o diría «administración remota» del agente.
  it("el agente reconocido sólo por su NOMBRE también se explica como el agente", () => {
    expect(
      describeBlocked(blocked("protected"), { name: "Tracenium Agent", source: "dpkg", packageFamilyName: "endpoint-agent" })
    ).toMatch(/without an agent/);
  });

  it("cada origen sin soporte dice su propio porqué", () => {
    const texts = ["pkgutil", "homebrew", "snap", "flatpak", "ms-store"].map((source) =>
      describeBlocked(blocked("unsupported_source"), { name: "x", source })
    );
    expect(new Set(texts).size).toBe(5);
    expect(texts.join(" ")).not.toMatch(/Windows registry/); // la frase vieja de F1
  });

  it("una app de Mac fuera de /Applications lo dice", () => {
    expect(describeBlocked(blocked("unsupported_location"), { source: "macos-app-bundle" })).toMatch(/\/Applications/);
  });

  it("sin identidad, la frase depende de qué identidad faltaba", () => {
    expect(describeBlocked(blocked("no_identity"), { source: "macos-app-bundle" })).toMatch(/bundle id/);
    expect(describeBlocked(blocked("no_identity"), { source: "dpkg" })).toMatch(/package name/);
    expect(describeBlocked(blocked("no_identity"), { source: "win32-registry" })).toMatch(/uninstall command/);
  });

  it("un motivo que no conocemos se enseña crudo, no escondido", () => {
    expect(describeBlocked({ ok: false, reason: "algo_nuevo", detail: "lo que dijo el servidor" }, {})).toBe(
      "lo que dijo el servidor"
    );
  });

  it("un plan accionable no tiene motivo", () => {
    expect(describeBlocked({ ok: true }, {})).toBe("");
  });
});

describe("batchesByTarget", () => {
  const row = (deviceId, target) => ({ deviceId, plan: { ok: true, ...(target ? { target } : {}) } });

  it("⭐ un envío por tipo de equipo, en orden estable", () => {
    expect(
      batchesByTarget([row("m1", "macos"), row("w1", "windows"), row("w2", "windows"), row("l1", "rpm")])
    ).toEqual([
      { target: "windows", deviceIds: ["w1", "w2"] },
      { target: "macos", deviceIds: ["m1"] },
      { target: "rpm", deviceIds: ["l1"] },
    ]);
  });

  // ⚠️ Un backend anterior al 21-sep no manda `target`: sólo sabía Windows. Se
  // manda como antes, sin inventarle un tipo en la UI.
  it("sin `target` (backend viejo) va en un único envío sin tipo", () => {
    expect(batchesByTarget([row("d1"), row("d2")])).toEqual([{ target: null, deviceIds: ["d1", "d2"] }]);
  });

  it("vacío es ningún envío", () => {
    expect(batchesByTarget([])).toEqual([]);
    expect(batchesByTarget(undefined)).toEqual([]);
  });
});

describe("uninstallRequestBody", () => {
  it("con tipo lo manda", () => {
    expect(uninstallRequestBody("Zoom", { target: "macos", deviceIds: ["m1"] })).toEqual({
      appName: "Zoom",
      deviceIds: ["m1"],
      target: "macos",
    });
  });

  it("sin tipo, exactamente el cuerpo de siempre", () => {
    expect(uninstallRequestBody("Dropbox", { target: null, deviceIds: ["d1"] })).toEqual({
      appName: "Dropbox",
      deviceIds: ["d1"],
    });
  });
});

describe("Windows por usuario", () => {
  it("un agente viejo se explica como «actualiza el agente»", () => {
    expect(describeBlocked(blocked("agent_too_old"), { source: "win32-registry" })).toMatch(/update the agent/);
  });

  it("sin desinstalador silencioso dice por qué no se lanza", () => {
    expect(describeBlocked(blocked("no_silent_uninstall"), { source: "win32-registry" })).toMatch(/pop a window/);
  });

  // El mismo motivo significa cosas distintas en cada plataforma.
  it("per_user_install: en Windows es «no habilitado», en Mac es la carpeta del usuario", () => {
    expect(describeBlocked(blocked("per_user_install"), { source: "win32-registry" })).toMatch(/not enabled/);
    expect(describeBlocked(blocked("per_user_install"), { source: "macos-app-bundle" })).toMatch(/Applications folder/);
  });

  it("de máquina y por usuario van en envíos distintos, máquina primero", () => {
    const row = (deviceId, target) => ({ deviceId, plan: { ok: true, target } });
    expect(batchesByTarget([row("u1", "windows_user"), row("m1", "windows")])).toEqual([
      { target: "windows", deviceIds: ["m1"] },
      { target: "windows_user", deviceIds: ["u1"] },
    ]);
  });

  it("perUserCount cuenta sólo los accionables por usuario", () => {
    expect(
      perUserCount([
        { deviceId: "a", plan: { ok: true, target: "windows_user" } },
        { deviceId: "b", plan: { ok: true, target: "windows" } },
      ])
    ).toBe(1);
    expect(perUserCount(undefined)).toBe(0);
  });
});
