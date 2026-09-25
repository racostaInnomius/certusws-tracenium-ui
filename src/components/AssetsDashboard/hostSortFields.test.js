// Cada cabecera que la tabla de equipos pinta como ordenable tiene que estar
// en HOST_SORT_FIELDS, o el clic muere en silencio.
//
// ⚠️ Pasó con «Last boot» (prod, 24-sep): la cabecera tenía su flecha, el
// backend sabía ordenar por lastBootUtc, y onSortChange lo descartaba porque
// el campo no estaba en la lista.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { HOST_SORT_FIELDS } from "./hostHelpers";

const tabla = fs.readFileSync(path.join(__dirname, "../Charts/HostsTable.jsx"), "utf8");
const ordenables = [...tabla.matchAll(/<SortableHeadCell[\s\S]*?field="([a-zA-Z]+)"/g)].map((m) => m[1]);

describe("HOST_SORT_FIELDS", () => {
  it("la tabla tiene cabeceras ordenables (la lectura del fuente funciona)", () => {
    expect(ordenables.length).toBeGreaterThan(3);
  });

  it("⭐ toda cabecera ordenable está admitida — incluida «Last boot»", () => {
    expect(ordenables).toContain("lastBootUtc");
    for (const f of ordenables) expect(HOST_SORT_FIELDS.has(f), f).toBe(true);
  });
});
