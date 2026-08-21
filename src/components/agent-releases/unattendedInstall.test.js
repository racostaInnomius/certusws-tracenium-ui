// src/components/agent-releases/unattendedInstall.test.js
//
// Estos comandos se copian y se ejecutan con privilegios sin que nadie los
// revise, así que las rutas y los nombres de fichero se fijan contra lo que el
// empaquetado hace DE VERDAD (pkg-scripts/postinstall en macOS,
// packaging/linux/scripts/postinstall.sh, y resolveFileName en el backend), no
// contra lo que parezca razonable.

import { describe, it, expect } from "vitest";
import {
  TOKEN_PLACEHOLDER,
  agentFileName,
  unattendedInstallCommand,
  unattendedInstallNote,
} from "./unattendedInstall";

const win = { platform: "windows", arch: "x64", format: "msi", version: "1.1.47" };
const mac = { platform: "macos", arch: "arm64", format: "pkg", version: "1.1.47" };
const deb = { platform: "linux", arch: "x64", format: "deb", version: "1.1.47" };
const rpm = { platform: "linux", arch: "x64", format: "rpm", version: "1.1.47" };

describe("agentFileName", () => {
  // Los CUATRO formatos usan el mismo patrón, deb y rpm incluidos — no la
  // convención `tracenium-agent_1.1.47_amd64.deb` de un paquete Debian normal.
  it("usa el patrón del pipeline para todos los formatos", () => {
    expect(agentFileName(win)).toBe("Tracenium-Agent-1.1.47-x64.msi");
    expect(agentFileName(mac)).toBe("Tracenium-Agent-1.1.47-arm64.pkg");
    expect(agentFileName(deb)).toBe("Tracenium-Agent-1.1.47-x64.deb");
    expect(agentFileName(rpm)).toBe("Tracenium-Agent-1.1.47-x64.rpm");
  });
});

describe("unattendedInstallCommand — Windows", () => {
  it("pasa el token como propiedad del MSI", () => {
    const cmd = unattendedInstallCommand(win);
    expect(cmd).toContain("msiexec /i \"Tracenium-Agent-1.1.47-x64.msi\"");
    expect(cmd).toContain(`ENROLLMENT_TOKEN=${TOKEN_PLACEHOLDER}`);
  });

  // Sin /norestart un instalador que decida reiniciar se lleva el equipo por
  // delante y nadie ve el resultado.
  it("incluye /qn y /norestart", () => {
    const cmd = unattendedInstallCommand(win);
    expect(cmd).toContain("/qn");
    expect(cmd).toContain("/norestart");
  });
});

describe("unattendedInstallCommand — macOS y Linux", () => {
  // La ruta del temporal la lee el postinstall del paquete. Si no coincide, el
  // instalador no encuentra el token: en macOS pasa a PEDIRLO de forma
  // interactiva y la instalación deja de ser desatendida.
  it("deja el token en la ruta que lee cada postinstall", () => {
    expect(unattendedInstallCommand(mac)).toContain("/private/tmp/tracenium-enrollment.token");
    expect(unattendedInstallCommand(deb)).toContain("/tmp/tracenium-enrollment.token");
  });

  // El orden es el requisito: el postinstall recoge el fichero DURANTE la
  // instalación, así que escribirlo después no sirve de nada.
  it("escribe el token ANTES de instalar", () => {
    for (const row of [mac, deb, rpm]) {
      const lines = unattendedInstallCommand(row).split("\n");
      expect(lines[0]).toContain("tracenium-enrollment.token");
      expect(lines[1]).toMatch(/installer -pkg|dpkg -i|rpm -i/);
    }
  });

  it("usa el gestor correcto para deb y para rpm", () => {
    expect(unattendedInstallCommand(deb)).toContain('sudo dpkg -i "Tracenium-Agent-1.1.47-x64.deb"');
    expect(unattendedInstallCommand(rpm)).toContain('sudo rpm -i "Tracenium-Agent-1.1.47-x64.rpm"');
  });

  // printf %s y no echo: echo añade un salto de línea. El lector hace trim(),
  // así que hoy da igual — pero el comando no debería depender de eso.
  it("escribe el token sin salto de línea", () => {
    expect(unattendedInstallCommand(mac)).toContain("printf %s");
  });
});

describe("unattendedInstallCommand — lo que NO hace", () => {
  // Un comando inventado es peor que ninguno: se copia y se ejecuta con sudo.
  it("devuelve null para una combinación desconocida en vez de improvisar", () => {
    expect(unattendedInstallCommand({ ...win, format: "exe" })).toBeNull();
    expect(unattendedInstallCommand({ ...mac, format: "dmg" })).toBeNull();
    expect(unattendedInstallCommand({ platform: "solaris", arch: "x64", format: "pkg", version: "1" })).toBeNull();
  });

  it("devuelve null si a la fila le falta algún dato", () => {
    expect(unattendedInstallCommand(null)).toBeNull();
    expect(unattendedInstallCommand({ ...win, version: "" })).toBeNull();
    expect(unattendedInstallCommand({ ...win, arch: "" })).toBeNull();
  });

  // El token real nunca se inyecta desde la pantalla: un comando con la
  // credencial dentro acaba en capturas de pantalla y tickets de soporte.
  it("usa un marcador por defecto, no una credencial", () => {
    expect(unattendedInstallCommand(win)).toContain(TOKEN_PLACEHOLDER);
  });
});

describe("unattendedInstallNote", () => {
  it("avisa del orden en macOS y Linux", () => {
    expect(unattendedInstallNote(mac)).toMatch(/ANTES/);
    expect(unattendedInstallNote(deb)).toMatch(/ANTES/);
  });

  it("explica en Windows que 3010 y 1641 no son fallos", () => {
    const note = unattendedInstallNote(win);
    expect(note).toContain("3010");
    expect(note).toContain("1641");
  });
});
