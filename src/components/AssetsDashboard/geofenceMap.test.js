import { describe, expect, it } from "vitest";
import { estiloSitio, limitesSitios, sitiosConPin } from "./geofenceMap";

describe("geofenceMap", () => {
  it("un sitio sin coordenadas no entra en el mapa", () => {
    const sitios = [{ id: 1, lat: 19.3, lon: -99.2 }, { id: 2, lat: null, lon: null }, { id: 3 }];
    expect(sitiosConPin(sitios).map((s) => s.id)).toEqual([1]);
  });

  it("⚠️ sólo se dibuja el radio GUARDADO, nunca el sugerido", () => {
    expect(estiloSitio({ radiusM: null, suggestedRadiusM: 400 }).radiusM).toBeNull();
    expect(estiloSitio({ radiusM: 0 }).radiusM).toBeNull();
    expect(estiloSitio({ radiusM: 250, geofenceStatus: "monitoring" })).toEqual({
      monitoring: true,
      radiusM: 250,
    });
  });

  it("el encuadre incluye el círculo entero, no sólo el pin", () => {
    const [sw, ne] = limitesSitios([{ lat: 0, lon: 0, radiusM: 1113.2 }]);
    expect(sw[0]).toBeCloseTo(-0.01, 4);
    expect(ne[1]).toBeCloseTo(0.01, 4);
  });

  it("sin pines no hay encuadre", () => {
    expect(limitesSitios([{ lat: null, lon: null }])).toBeNull();
  });
});
