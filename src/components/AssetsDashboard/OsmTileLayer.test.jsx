// src/components/AssetsDashboard/OsmTileLayer.test.jsx
//
// 2026-09-15: sin Referer, tile.openstreetmap.org sirve una imagen de «Access
// blocked» en cada baldosa, y el portal manda `Referrer-Policy: same-origin`
// (Azure Static Web Apps), que lo quita. Estos tests fijan lo que lo arregla,
// sobre el <img> real que pinta Leaflet.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MapContainer } from "react-leaflet";
import OsmTileLayer, { OSM_TILE_REFERRER_POLICY, OSM_TILE_URL } from "./OsmTileLayer";

afterEach(cleanup);

describe("OsmTileLayer", () => {
  it("⚠️ las baldosas mandan el origen como Referer, aunque la página lo prohíba", () => {
    // `strict-origin-when-cross-origin` manda sólo el origen (sin ruta ni query)
    // a un host distinto: justo lo que pide OSM y nada más.
    expect(OSM_TILE_REFERRER_POLICY).toBe("strict-origin-when-cross-origin");
    const { container } = render(
      <div style={{ width: 256, height: 256 }}>
        <MapContainer center={[40.73, -74.17]} zoom={5} style={{ width: 256, height: 256 }}>
          <OsmTileLayer />
        </MapContainer>
      </div>
    );
    const tiles = container.querySelectorAll("img.leaflet-tile");
    expect(tiles.length).toBeGreaterThan(0);
    for (const img of tiles) {
      // Leaflet lo asigna como PROPIEDAD (`tile.referrerPolicy = …`); un navegador
      // la refleja en el atributo, jsdom no.
      expect(img.referrerPolicy).toBe("strict-origin-when-cross-origin");
      expect(img.getAttribute("src")).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
    }
  });

  it("host único, sin los subdominios a./b./c. que OSM retiró", () => {
    expect(OSM_TILE_URL).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(OSM_TILE_URL).not.toContain("{s}");
  });
});
