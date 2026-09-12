// src/api/knownDevices.pagination.test.js
//
// Censo: nadie construye el catálogo de equipos con una sola página.
//
// ── El fallo ─────────────────────────────────────────────────────────
//
// `/orchestrator/known-devices` pagina, con **25 por defecto y un tope
// duro de 100** en el backend (`jobs.controller.ts`). Una llamada pelada
// —`listKnownDevices()`— devuelve 25 equipos, y toda página que con eso
// arme un mapa `deviceId → hostname` rotula el resto de sus filas con el
// UUID crudo. Pasó desapercibido durante meses porque el tenant que se
// miraba tenía 21 equipos y cabía en una página; T111 tiene 55, y la
// página de PKI enseñaba 30 identificadores donde debía haber nombres.
//
// Ya se pagó una vez en Jobs —donde además truncaba el DESPLIEGUE a la
// flota entera— y volvió a aparecer en PKI, Audit y Device Management.
// Este test lo fija en el sitio donde se repetiría: el código fuente.
//
// ── Por qué se lee el fuente y no se monta la página ─────────────────
//
// La propiedad no es de una página: es de TODAS, incluidas las que no
// existen todavía. Un test por página se olvida en la siguiente.
//
// `pageSize > 100` también falla: el backend lo recorta en silencio, así
// que pedir 500 no es "traérmelos todos", es mentirse con más números.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..");
const TOPE_BACKEND = 100; // jobs.controller.ts: Math.min(..., 100)

function fuentes(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fuentes(p));
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

/** Cada llamada a `listKnownDevices(...)` del árbol, con su argumento. */
function llamadas() {
  const encontradas = [];
  for (const file of fuentes(RAIZ)) {
    if (file.endsWith(path.join("api", "jobs.js"))) continue; // el wrapper y su helper
    // Sin comentarios: un comentario que NOMBRA la función no es una
    // llamada. El primer censo se delató a sí mismo con el comentario
    // que explicaba el arreglo.
    const src = fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const re = /listKnownDevices\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      encontradas.push({
        file: path.relative(RAIZ, file),
        arg: m[1].trim(),
        linea: src.slice(0, m.index).split("\n").length
      });
    }
  }
  return encontradas;
}

describe("catálogo de equipos: una página no es la flota", () => {
  it("⭐ nadie llama a listKnownDevices() sin argumentos", () => {
    const peladas = llamadas().filter((c) => c.arg === "");
    expect(
      peladas.map((c) => `${c.file}:${c.linea}`),
      "una llamada pelada devuelve 25 equipos; usa listAllKnownDevices()"
    ).toEqual([]);
  });

  it("⭐ nadie pide un pageSize mayor que el tope del backend", () => {
    const mentirosas = llamadas().filter((c) => {
      const m = /pageSize\s*:\s*(\d+)/.exec(c.arg);
      return m && Number(m[1]) > TOPE_BACKEND;
    });
    expect(
      mentirosas.map((c) => `${c.file}:${c.linea}`),
      `el backend recorta pageSize a ${TOPE_BACKEND} en silencio: pedir más no trae más`
    ).toEqual([]);
  });

  it("quien la llama con argumentos, pagina de verdad (pasa `page`)", () => {
    const sinPagina = llamadas().filter((c) => c.arg !== "" && !/\bpage\s*:/.test(c.arg));
    expect(
      sinPagina.map((c) => `${c.file}:${c.linea}`),
      "sin `page` sólo se ve la primera tanda"
    ).toEqual([]);
  });

  it("el censo mira de verdad el árbol: encuentra las llamadas que sabemos que existen", () => {
    // Un censo que no encuentra nada pasa los tres tests de arriba por
    // vacío. Esto es lo que impide que un regex roto los vuelva verdes.
    const todas = llamadas();
    expect(todas.length).toBeGreaterThan(0);
    expect(todas.some((c) => c.file.includes("KnownDevicesPicker"))).toBe(true);
  });
});
