// DeploymentsTab.uninstall.test.jsx
//
// ADR-0019 F1 dejó despliegues SIN paquete: `package_id` es NULL y la identidad
// vive en el snapshot. La columna «Package» estaba escrita dando por hecho que
// siempre hay uno, y leía `pkg.version`, `pkg.platform`, `pkg.arch` y
// `pkg.format` a pelo.
//
// El snapshot sintético trae `platform` y `format` sólo de relleno y NO trae
// `arch`, así que la celda pintaba «Dropbox vunknown · windows/undefined/EXE»:
// medio inventado y medio roto, presentando como paquete algo que nadie
// publicó.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DeploymentsTab from "./DeploymentsTab";
import * as sdpApi from "../../api/softwareDelivery";

vi.mock("../../api/softwareDelivery");

// Tal cual lo construye `createDeployment` para el camino de desinstalación.
const UNINSTALL_DEPLOYMENT = {
  id: 31,
  status: "queued",
  targetKind: "devices",
  deviceIds: ["d1"],
  createdAt: "2026-09-09T10:00:00.000Z",
  counts: {},
  packageSnapshot: {
    id: null,
    name: "Dropbox",
    version: "unknown",
    platform: "windows",
    format: "exe",
    uninstallIdentity: { displayNameLike: "Dropbox" },
    uninstallVia: "displayName",
  },
};

const CATALOG_DEPLOYMENT = {
  id: 30,
  status: "completed",
  targetKind: "devices",
  deviceIds: ["d9"],
  createdAt: "2026-09-08T10:00:00.000Z",
  counts: {},
  packageSnapshot: {
    id: 7,
    name: "7-Zip",
    version: "23.01",
    platform: "windows",
    arch: "x64",
    format: "msi",
  },
};

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

function show(items) {
  sdpApi.listDeployments.mockResolvedValue({ items });
  render(<DeploymentsTab canManage notify={() => {}} />);
}

describe("un despliegue de desinstalación no es un paquete", () => {
  it("⚠️ no pinta ni «vunknown» ni «undefined» en la celda", async () => {
    show([UNINSTALL_DEPLOYMENT]);
    expect(await screen.findByText("Dropbox")).toBeTruthy();

    // Lo que la fila NO debe decir. `arch` no existe en este snapshot, y la
    // versión del primer equipo no es la versión «del despliegue» cuando los
    // equipos tienen dos distintas.
    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(screen.queryByText(/vunknown/)).toBeNull();
  });

  it("enseña la identidad con la que se quita, que es lo único cierto aquí", async () => {
    show([UNINSTALL_DEPLOYMENT]);
    expect(await screen.findByText(/Detected · Dropbox/)).toBeTruthy();
  });

  it("y no rompe la fila de un despliegue normal del catálogo", async () => {
    // La rama nueva no puede tragarse la vieja: 30 despliegues existentes
    // siguen siendo de paquete.
    show([CATALOG_DEPLOYMENT]);
    expect(await screen.findByText(/7-Zip/)).toBeTruthy();
    expect(screen.getByText("windows/x64/MSI")).toBeTruthy();
  });
});
