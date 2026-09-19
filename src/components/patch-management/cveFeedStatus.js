// src/components/patch-management/cveFeedStatus.js
//
// Las dos líneas de estado de los feeds del catálogo CVE — NVD y CISA KEV.
// PURO: sin React.
//
// ⚠️ POR QUÉ SE REESCRIBIERON (18-sep). La línea decía «Last NVD sync 2h ago ·
// 41 CVEs from 12 products», y ese 41 se lee como «NVD nos dio 41 CVEs». No lo
// es. En una corrida hay TRES números distintos, y el que se enseñaba era el
// último:
//
//   devueltos por NVD  → lo que contestó la búsqueda del producto
//   mapeados           → de ésos, los que nombran NUESTRO producto como
//                        vulnerable (`cvesMapped`)
//   escritos           → de ésos, los que cambiaron algo en el catálogo
//                        (`cvesUpserted`)
//
// La confusión no es teórica: ya costó una conclusión equivocada —«NVD devolvió
// 0 para crowdstrike windows sensor», cuando devolvía 4— porque `cve_count`
// guarda los MAPEADOS. Un número sin su nombre miente aunque sea correcto.
//
// El mismo defecto en KEV: «1.204 entries» eran las filas ESCRITAS, y se leía
// como el tamaño del catálogo de CISA. Ahora se dice cuántas trae el feed, y
// cuántas se escribieron y se retiraron va en el detalle — que una entrada
// salga del KEV es noticia: CISA la ha des-listado.
//
// Cada función devuelve `{ text, detail, tone }`: `text` es la frase de la
// línea, `detail` el desglose para el tooltip (null si no hay nada que añadir)
// y `tone` colorea — un fallo y una corrida cortada a medias no se ven igual
// que una completa.

/** «2h ago». Vacío si la fecha no es utilizable. */
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function plural(n, one, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Estado de la sincronización con NVD. */
export function nvdStatusLine(s, now = Date.now()) {
  if (!s || s.status === "idle") {
    return { text: "Never synced from NVD.", detail: null, tone: "normal" };
  }
  if (s.status === "running") {
    return { text: "NVD sync running…", detail: null, tone: "normal" };
  }
  if (s.status === "failed") {
    return {
      text: `Last NVD sync failed ${timeAgo(s.finishedAt, now)}`,
      detail: s.error || null,
      tone: "error",
    };
  }

  const c = s.summary || {};
  const queried = Number(c.productsQueried) || 0;
  const mapped = Number.isFinite(Number(c.cvesMapped)) ? Number(c.cvesMapped) : null;
  const upserted = Number(c.cvesUpserted) || 0;

  // ⚠️ `cvesMapped` no existía antes del 18-sep: las corridas guardadas hasta
  // entonces sólo tienen los escritos. Con una de ésas se dice «stored», que es
  // verdad, en vez de llamar «matched» a un número que no lo es.
  const counted =
    mapped === null
      ? `${plural(upserted, "CVE")} stored`
      : `${plural(mapped, "CVE")} matched our software`;

  const cut = c.aborted ? " — cut short" : "";
  const text = `Last NVD sync ${timeAgo(s.finishedAt, now)}${cut} · ${plural(queried, "product")} checked · ${counted}`;

  const detail = [];
  if (c.aborted) detail.push(`Run stopped early: ${c.aborted}.`);
  if (mapped !== null) {
    detail.push(
      upserted === mapped
        ? `All ${plural(upserted, "entry", "entries")} written to the catalog.`
        : `${plural(upserted, "entry", "entries")} written; the rest were already up to date.`
    );
  }
  const awaiting = Number(c.cvesAwaitingAnalysis) || 0;
  if (awaiting > 0) {
    detail.push(
      `${plural(awaiting, "CVE")} stored with no affected-version range yet — NVD has published them but not analysed them, so detection cannot evaluate a version against them.`
    );
  }
  const errors = Number(c.errors) || 0;
  if (errors > 0) detail.push(`${plural(errors, "product")} failed to query.`);
  const refused = Number(c.productsRefused) || 0;
  if (refused > 0) detail.push(`${plural(refused, "product")} refused by NVD and not retried.`);
  if (c.productsTruncated) {
    detail.push(
      `Capped at ${queried.toLocaleString()} of ${(Number(c.productsInFleet) || 0).toLocaleString()} products in the fleet; the rest rotate into the next run.`
    );
  }

  return {
    text,
    detail: detail.length ? detail.join(" ") : null,
    tone: c.aborted ? "warning" : "normal",
  };
}

/** Estado del refresco del catálogo CISA KEV. */
export function kevStatusLine(s, now = Date.now()) {
  if (!s || s.status === "idle") {
    return { text: "KEV catalog not synced yet.", detail: null, tone: "normal" };
  }
  if (s.status === "running") {
    return { text: "Refreshing CISA KEV catalog…", detail: null, tone: "normal" };
  }
  if (s.status === "failed") {
    return {
      text: `Last KEV refresh failed ${timeAgo(s.finishedAt, now)}`,
      detail: s.error || null,
      tone: "error",
    };
  }

  const c = s.summary || {};
  const fetched = Number.isFinite(Number(c.fetched)) ? Number(c.fetched) : null;
  const upserted = Number(c.upserted) || 0;
  const removed = Number(c.removed) || 0;
  const ver = c.catalogVersion ? ` (catalog ${c.catalogVersion})` : "";

  // Igual que arriba: las corridas viejas sólo guardaron las escritas, y
  // «entries in the CISA feed» sería inventarse el tamaño del catálogo.
  const counted =
    fetched === null
      ? `${plural(upserted, "entry", "entries")} written`
      : `${plural(fetched, "entry", "entries")} in the CISA feed`;

  const detail = [];
  if (fetched !== null) detail.push(`${plural(upserted, "entry", "entries")} written.`);
  if (removed > 0) {
    // Una entrada que sale del feed es noticia, no ruido: CISA la ha retirado
    // de la lista de explotadas activamente.
    detail.push(`${plural(removed, "entry", "entries")} dropped out of the CISA catalog and were removed.`);
  }

  return {
    text: `KEV catalog refreshed ${timeAgo(s.finishedAt, now)} · ${counted}${ver}`,
    detail: detail.length ? detail.join(" ") : null,
    tone: "normal",
  };
}
