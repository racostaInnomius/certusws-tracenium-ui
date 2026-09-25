// src/components/software-delivery/InstallTab.test.jsx
//
// Qué se ofrece para instalar. La parte que puede mentir sin dar error es la
// lista: ofrecer algo que el servidor va a rechazar deja el fallo a tres pasos
// de distancia del clic.

import { describe, expect, it } from "vitest";

import { installablePackages } from "./InstallTab";

const pkg = (over = {}) => ({
  id: 1,
  name: "Google Chrome",
  version: "154.0.8037.58",
  platform: "windows",
  arch: "x64",
  format: "msi",
  isActive: true,
  ...over,
});

describe("installablePackages", () => {
  it("⚠️ un paquete RETIRADO no se ofrece", () => {
    // Sigue en el catálogo a propósito —para leer su historia— pero desplegarlo
    // lo rechaza el servidor.
    const rows = installablePackages([pkg(), pkg({ id: 2, version: "152.0", isActive: false })]);
    expect(rows.map((p) => p.id)).toEqual([1]);
  });

  it("busca por nombre, versión, plataforma, arquitectura y formato", () => {
    const all = [
      pkg({ id: 1, name: "Google Chrome", platform: "windows" }),
      pkg({ id: 2, name: "Mozilla Firefox", version: "155.0.1.0", platform: "macos", format: "pkg" }),
    ];
    expect(installablePackages(all, "firefox").map((p) => p.id)).toEqual([2]);
    expect(installablePackages(all, "macos").map((p) => p.id)).toEqual([2]);
    expect(installablePackages(all, "PKG").map((p) => p.id)).toEqual([2]);
    expect(installablePackages(all, "155.0").map((p) => p.id)).toEqual([2]);
  });

  it("sin búsqueda salen todos los desplegables, por nombre", () => {
    const rows = installablePackages([
      pkg({ id: 2, name: "Winrar" }),
      pkg({ id: 1, name: "Google Chrome" }),
    ]);
    expect(rows.map((p) => p.name)).toEqual(["Google Chrome", "Winrar"]);
  });

  it("⚠️ dos variantes del mismo título salen las DOS, ordenadas por plataforma", () => {
    // Son paquetes distintos con destinos distintos: fundirlos aquí obligaría
    // a elegir plataforma dentro del asistente, que es donde ya se eligió.
    const rows = installablePackages([
      pkg({ id: 22, platform: "macos", format: "pkg" }),
      pkg({ id: 14, platform: "windows" }),
    ]);
    expect(rows.map((p) => p.platform)).toEqual(["macos", "windows"]);
  });

  it("una lista vacía o ausente no revienta", () => {
    expect(installablePackages(null, "chrome")).toEqual([]);
    expect(installablePackages([])).toEqual([]);
  });
});
