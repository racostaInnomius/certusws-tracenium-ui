// src/components/software-delivery/coverageCells.test.js
//
// Lo que se fija aquí es a qué celdas se les ofrece un botón de desplegar. Es
// la única parte del cajón que puede causar daño: sobre «ahead» un despliegue
// DEGRADA el navegador de toda la casa, y el botón parecería de mantenimiento.

import { describe, expect, it } from "vitest";

import {
  cellCopy,
  deliveryStatus,
  deployGroups,
  hostnamesOf,
  inventoryAgeHours,
  splitCell,
} from "./coverageCells";

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

describe("deliveryStatus", () => {
  // 🔴 El caso de campo: #52 mandó el paquete, 2 equipos se quedaron en
  // `pending`, y 20 h después la pantalla invitaba a mandarlo otra vez.
  const abierto = { deploymentId: 52, version: "153.0.4234.48", outcome: "pending", createdAt: "2026-09-24T01:28:00Z" };

  it("🔴 un job del mismo título sin terminar saca al equipo de la acción", () => {
    const s = deliveryStatus(device({ openDeployment: abierto }));
    expect(s.kind).toBe("on_the_way");
    expect(s.deployment.deploymentId).toBe(52);
  });

  it("⭐ un install que TERMINÓ DESPUÉS de la última lectura la deja obsoleta", () => {
    // No es una corazonada: es comparar dos fechas. Si el install acabó a las
    // 02:00 y el inventario se leyó a la 01:00, esa lectura no puede reflejarlo.
    const s = deliveryStatus(
      device({
        lastInstall: { deploymentId: 52, outcome: "success", finishedAt: "2026-09-24T02:00:00Z", reportedVersion: "153.0.4234.48" },
        inventoryLastSeen: "2026-09-24T01:00:00Z",
      })
    );
    expect(s.kind).toBe("unconfirmed");
  });

  it("⚠️ si el inventario se leyó DESPUÉS del install, el «behind» es real", () => {
    // El equipo se actualizó, se volvió a leer, y sigue atrás: hay que actuar.
    const s = deliveryStatus(
      device({
        lastInstall: { deploymentId: 52, outcome: "success", finishedAt: "2026-09-24T02:00:00Z" },
        inventoryLastSeen: "2026-09-24T09:00:00Z",
      })
    );
    expect(s.kind).toBe("actionable");
  });

  it("⚠️ un install FALLIDO no deja obsoleta ninguna lectura", () => {
    // Falló: el equipo no tiene la versión. Sacarlo de la acción por eso sería
    // justo esconder el que más la necesita.
    const s = deliveryStatus(
      device({
        lastInstall: { deploymentId: 52, outcome: "failed", finishedAt: "2026-09-24T02:00:00Z" },
        inventoryLastSeen: "2026-09-24T01:00:00Z",
      })
    );
    expect(s.kind).toBe("actionable");
  });

  it("⚠️ sin alguna de las dos fechas no se concluye nada", () => {
    expect(
      deliveryStatus(device({ lastInstall: { outcome: "success", finishedAt: null }, inventoryLastSeen: "2026-09-24T01:00:00Z" })).kind
    ).toBe("actionable");
    expect(
      deliveryStatus(device({ lastInstall: { outcome: "success", finishedAt: "2026-09-24T02:00:00Z" }, inventoryLastSeen: null })).kind
    ).toBe("actionable");
  });

  it("un equipo sin historia es accionable, que es lo que el operador esperaba", () => {
    expect(deliveryStatus(device()).kind).toBe("actionable");
  });

  it("lo que va en camino manda sobre lo ya instalado", () => {
    // Si hay algo en vuelo, eso es lo que hay que decir: es lo accionable.
    const s = deliveryStatus(
      device({
        openDeployment: abierto,
        lastInstall: { deploymentId: 40, outcome: "success", finishedAt: "2026-09-24T02:00:00Z" },
        inventoryLastSeen: "2026-09-24T01:00:00Z",
      })
    );
    expect(s.kind).toBe("on_the_way");
  });
});

describe("splitCell", () => {
  it("⭐ parte la celda en tres y NO pierde equipos", () => {
    // Un objetivo que desaparece en silencio es cómo se cree que apuntaste a 29
    // cuando apuntaste a 27.
    const devices = [
      device({ agentId: "libre" }),
      device({ agentId: "camino", openDeployment: { deploymentId: 52, outcome: "pending" } }),
      device({
        agentId: "dudoso",
        lastInstall: { outcome: "success", finishedAt: "2026-09-24T02:00:00Z" },
        inventoryLastSeen: "2026-09-24T01:00:00Z",
      }),
    ];
    const { actionable, onTheWay, unconfirmed } = splitCell(devices);

    expect(actionable.map((d) => d.agentId)).toEqual(["libre"]);
    expect(onTheWay.map((d) => d.agentId)).toEqual(["camino"]);
    expect(unconfirmed.map((d) => d.agentId)).toEqual(["dudoso"]);
    expect(actionable.length + onTheWay.length + unconfirmed.length).toBe(devices.length);
  });

  it("sin equipos no revienta", () => {
    expect(splitCell(null)).toEqual({ actionable: [], onTheWay: [], unconfirmed: [] });
  });
});

describe("inventoryAgeHours", () => {
  it("⭐ dice cuántas horas lleva el equipo sin reportar", () => {
    // Los dos equipos del caso llevaban 220 h y 151 h callados, y se veían
    // igual que el que reportó hace diez minutos.
    const now = new Date("2026-09-24T12:00:00Z").getTime();
    expect(inventoryAgeHours(device({ inventoryLastSeen: "2026-09-15T08:00:00Z" }), now)).toBeCloseTo(220, 0);
  });

  it("sin lectura no inventa una edad", () => {
    expect(inventoryAgeHours(device({ inventoryLastSeen: null }))).toBeNull();
    expect(inventoryAgeHours(device({ inventoryLastSeen: "no-es-fecha" }))).toBeNull();
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
