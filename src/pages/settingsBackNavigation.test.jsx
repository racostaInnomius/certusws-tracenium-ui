// src/pages/settingsBackNavigation.test.jsx
//
// La invariante: TODA tarjeta de Settings › Tenant Settings abre una página
// que ofrece la vuelta, arriba y visible.
//
// Había cuatro salidas distintas para lo mismo — `← Settings` en la esquina
// de acciones (Retention, Location sites), `Back to Settings` con flecha bajo
// la cabecera (Session security), y nada en Roles ni en PKI. Quien entraba a
// cuatro tarjetas seguidas aprendía cuatro salidas, o se quedaba con el botón
// del navegador, que es la señal de que la página no le ofreció una.
//
// Se comprueba sobre el CÓDIGO y no renderizando las seis páginas a propósito:
// lo que se quiere fijar es que ninguna tarjeta nueva se cuele sin salida, y
// eso es una propiedad del cableado. El comportamiento del botón (a dónde va y
// en qué pestaña deja Settings) se prueba de verdad más abajo, montándolo.

import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import BackToSettings from "../components/common/BackToSettings";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const leer = (rel) => fs.readFileSync(path.join(DIR, rel), "utf8");

// Destino de cada tarjeta → fichero de la página que abre. Si alguien añade
// una tarjeta y no la apunta aquí, el primer test falla: no se puede añadir
// una puerta sin poner la salida.
const PAGINA_POR_DESTINO = {
  "tenant-members": "TenantsAdministrator.jsx",
  roles: "RolesAdministrator.jsx",
  "session-settings": "SessionSettings.jsx",
  "location-sites": "LocationSites.jsx",
  retention: "Retention.jsx",
  pki: "PKI.jsx",
};

function destinosDeLasTarjetas() {
  const src = leer("Configurations.jsx");
  // Las tarjetas navegan con onNavigate?.("clave"). La tarjeta de Partner es
  // la excepción declarada: no abre una página, abre un diálogo en la propia
  // pantalla, así que no tiene de dónde volver.
  return [...src.matchAll(/onNavigate\?\.\("([a-z-]+)"\)/g)].map((m) => m[1]);
}

describe("Settings › Tenant Settings — toda tarjeta tiene vuelta", () => {
  afterEach(cleanup);

  it("cada destino está registrado con su página", () => {
    const destinos = new Set(destinosDeLasTarjetas());
    expect(destinos.size).toBeGreaterThan(0);
    for (const destino of destinos) {
      expect(
        Object.keys(PAGINA_POR_DESTINO),
        `La tarjeta que abre "${destino}" no está en PAGINA_POR_DESTINO: añádela y comprueba que esa página vuelve a Settings.`
      ).toContain(destino);
    }
  });

  it.each(Object.entries(PAGINA_POR_DESTINO))(
    "%s → %s monta el botón de vuelta en la cabecera",
    (_destino, fichero) => {
      const src = leer(fichero);
      // En el slot `back` de PageHeader, que lo pinta arriba a la izquierda,
      // en el mismo píxel en todas las páginas. En `actions` cambiaría de
      // sitio según cuántos botones tenga cada una.
      expect(src).toMatch(/back=\{[^}]*BackToSettings/);
      expect(src).toContain('from "../components/common/BackToSettings"');
    }
  );

  it("todas usan el MISMO control, no una copia local", () => {
    // Tres tratamientos distintos fue exactamente lo que pasó cuando cada
    // página se escribió su propio botón.
    for (const fichero of Object.values(PAGINA_POR_DESTINO)) {
      const src = leer(fichero);
      expect(src).not.toMatch(/←\s*Settings/);
      expect(src).not.toMatch(/Back to Settings/);
    }
  });
});

describe("BackToSettings", () => {
  afterEach(cleanup);

  it("vuelve a Settings y deja la pestaña Tenant Settings abierta", () => {
    // Sin fijar la pestaña, volver de una tarjeta de tenant aterrizaba en
    // Agent Settings si el `settingsTab` de la URL había quedado en "agent"
    // (por ejemplo entrando por el enlace profundo de Patch Management).
    window.history.replaceState({}, "", "/?page=pki&settingsTab=agent");
    const onNavigate = vi.fn();

    render(<BackToSettings onNavigate={onNavigate} />);
    screen.getByRole("button", { name: /tenant settings/i }).click();

    expect(onNavigate).toHaveBeenCalledWith("configurations");
    expect(new URL(window.location.href).searchParams.get("settingsTab")).toBe("tenant");
  });

  it("sin onNavigate no pinta un botón muerto", () => {
    render(<BackToSettings />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
