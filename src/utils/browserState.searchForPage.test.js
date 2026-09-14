// src/utils/browserState.searchForPage.test.js

import { describe, expect, it } from "vitest";
import { searchForPage } from "./browserState";

const from = (qs) => new URLSearchParams(qs);

describe("searchForPage", () => {
  it("⭐ no arrastra los filtros de la página anterior", () => {
    const next = from(searchForPage("ad", {}, from("?page=jobs&status=failed,timeout&since=7d&versionBucket=older")));
    expect([...next.keys()]).toEqual(["page"]);
    expect(next.get("page")).toBe("ad");
  });

  it("conserva las preferencias de auto-refresco (son de quien navega, no de la vista)", () => {
    const next = from(searchForPage("jobs", {}, from("?page=overview&overviewAutoRefresh=300&jobsAutoRefresh=60&status=x")));
    expect(next.get("overviewAutoRefresh")).toBe("300");
    expect(next.get("jobsAutoRefresh")).toBe("60");
    expect(next.has("status")).toBe(false);
  });

  it("añade los parámetros del enlace y descarta los vacíos", () => {
    const next = from(searchForPage("jobs", { status: "failed", since: "", tab: null }, from("?page=overview")));
    expect(Object.fromEntries(next)).toEqual({ page: "jobs", status: "failed" });
  });
});

// Guardia: cambiar de página copiando la URL actual es lo que arrastraba los
// filtros. Estaba repetido en SEIS sitios (menú, campana, Overview, Security
// Compliance, Patch Management, Welcome); el séptimo que aparezca tiene que
// pasar por searchForPage.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

describe("nadie cambia de página copiando la URL actual", () => {
  it("⭐ ningún `.set(\"page\", …)` fuera de searchForPage (salvo la paginación de la API)", () => {
    // hostHelpers arma `?page=N` de la PAGINACIÓN de /dashboard/hosts, no una
    // navegación.
    const allowed = new Set(["src/utils/browserState.js", "src/components/AssetsDashboard/hostHelpers.js"]);
    const offenders = sourceFiles("src")
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => !allowed.has(p))
      .filter((p) => /\.set\(\s*["']page["']/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});
