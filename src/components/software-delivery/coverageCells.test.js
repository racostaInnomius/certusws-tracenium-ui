// src/components/software-delivery/coverageCells.test.js
//
// Lo que se fija aquí es a qué celdas se les ofrece un botón de desplegar. Es
// la única parte del cajón que puede causar daño: sobre «ahead» un despliegue
// DEGRADA el navegador de toda la casa, y el botón parecería de mantenimiento.

import { describe, expect, it } from "vitest";

import { cellCopy, deployGroups, hostnamesOf } from "./coverageCells";

const device = (over = {}) => ({
  agentId: "a",
  hostname: "PC-ANA",
  platform: "windows",
  installedVersion: "151.0.0.1",
  packageId: 9,
  catalogVersion: "152.0.7977.83",
  state: "behind",
  ...over,
});

describe("cellCopy", () => {
  it("⭐ se despliega sobre lo que falta, lo atrasado y lo no comparable", () => {
    expect(cellCopy("behind").deployable).toBe(true);
    expect(cellCopy("missing").deployable).toBe(true);
    expect(cellCopy("unknown").deployable).toBe(true);
  });

  it("🔴 sobre «ahead» NO, porque sería degradar la flota", () => {
    // Chrome y Edge se auto-actualizan: que la flota vaya por delante es lo
    // normal, no una avería. El botón mandaría la versión vieja del catálogo.
    const copy = cellCopy("ahead");
    expect(copy.deployable).toBe(false);
    expect(copy.help).toMatch(/downgrade/i);
  });

  it("sobre «current» tampoco: no instalaría nada", () => {
    expect(cellCopy("current").deployable).toBe(false);
  });

  it("un estado que no conocemos no estrena un botón", () => {
    // Si el servidor añadiera un estado, lo seguro es enseñar la lista sin
    // acción, no suponer que se puede desplegar sobre él.
    expect(cellCopy("lo-que-sea").deployable).toBe(false);
  });
});

describe("deployGroups", () => {
  it("⭐ agrupa por el paquete que se mandaría: un despliegue es de UN paquete", () => {
    // Una celda puede mezclar plataformas —los Windows y los Mac atrasados
    // están en la misma barra— y mandarlos juntos no existe como operación.
    const grupos = deployGroups([
      device({ agentId: "w1", packageId: 9, platform: "windows" }),
      device({ agentId: "w2", packageId: 9, platform: "windows" }),
      device({ agentId: "m1", packageId: 22, platform: "macos", catalogVersion: "152.0" }),
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({ packageId: 9, platform: "windows" });
    expect(grupos[0].devices).toHaveLength(2);
    expect(grupos[1]).toMatchObject({ packageId: 22, catalogVersion: "152.0" });
  });

  it("el grupo más grande primero: es el envío que se viene a hacer", () => {
    const grupos = deployGroups([
      device({ agentId: "m1", packageId: 22 }),
      device({ agentId: "w1", packageId: 9 }),
      device({ agentId: "w2", packageId: 9 }),
    ]);
    expect(grupos.map((g) => g.packageId)).toEqual([9, 22]);
  });

  it("una fila sin paquete no inventa un grupo", () => {
    // Sin paquete no hay nada que desplegar; colarla haría un botón que no
    // sabe qué manda.
    expect(deployGroups([device({ packageId: null })])).toEqual([]);
    expect(deployGroups(null)).toEqual([]);
  });
});

describe("hostnamesOf", () => {
  it("mapea id → nombre para que la revisión no enseñe UUIDs", () => {
    expect(hostnamesOf([device({ agentId: "a", hostname: "PC-ANA" })])).toEqual({ a: "PC-ANA" });
  });

  it("un equipo sin nombre no entra con una cadena vacía", () => {
    expect(hostnamesOf([device({ agentId: "a", hostname: null })])).toEqual({});
  });
});
