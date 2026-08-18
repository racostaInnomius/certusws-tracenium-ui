// src/api/locationSites.test.js
//
// Contract tests for the CIDR → site map client. The one that matters is the
// last: the create call used to destructure a fixed list of fields and drop
// everything else, so an operator filling in coordinates would have watched
// them vanish with no error at all.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import { createLocationSite, updateLocationSite } from "./locationSites";

const BASE = "/api/v1/dashboard/location-sites";

describe("createLocationSite", () => {
  it("envía los campos base", async () => {
    const calls = respond("post", BASE, { ok: true });
    await createLocationSite({ cidr: "10.20.30.0/24", siteName: "Oficina CDMX", description: "" });
    expect(calls[0].body).toMatchObject({ cidr: "10.20.30.0/24", siteName: "Oficina CDMX" });
  });

  it("NO descarta city, lat ni lon", async () => {
    // Regresión: destructurar {cidr, siteName, description} tiraba el resto en
    // silencio — la misma clase de bug que el allowlist del wire de AMP.
    const calls = respond("post", BASE, { ok: true });
    await createLocationSite({
      cidr: "10.20.30.0/24",
      siteName: "Oficina CDMX",
      description: "",
      city: "Ciudad de México",
      lat: 19.432608,
      lon: -99.133209,
    });
    expect(calls[0].body).toMatchObject({
      city: "Ciudad de México",
      lat: 19.432608,
      lon: -99.133209,
    });
  });

  it("reenviaría también un campo que este build no conoce", async () => {
    // El formulario y el validador del backend evolucionan; el cliente no debe
    // ser el eslabón que decide qué llega.
    const calls = respond("post", BASE, { ok: true });
    await createLocationSite({ cidr: "10.0.0.0/8", siteName: "X", futuro: "sí" });
    expect(calls[0].body.futuro).toBe("sí");
  });
});

describe("updateLocationSite", () => {
  it("manda el patch tal cual y codifica el id", async () => {
    const calls = respond("patch", `${BASE}/:id`, { ok: true });
    await updateLocationSite(7, { city: "Guadalajara", lat: 20.6736, lon: -103.3436 });
    expect(calls[0].pathname).toBe(`${BASE}/7`);
    expect(calls[0].body).toMatchObject({ city: "Guadalajara", lat: 20.6736 });
  });
});
