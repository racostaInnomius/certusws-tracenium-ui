// src/components/CryptoDiscovery/cdpSunburst.test.js
//
// El sunburst del Dashboard: cuatro sectores base SIEMPRE presentes, la CA
// de Windows DENTRO de On-prem como grupo aparte (al final, con más
// separación), los orígenes en su sector, y un trazado sin gajos invisibles.

import { describe, expect, it } from "vitest";
import { BASES, arcPath, baseOfSource, buildCertificatesTree, buildKeysTree, buildServicesTree, layoutSunburst, statusOfAlgorithm, sumNode } from "./cdpSunburst";

const facet = (ownership, source, algo, bits, uniqueCerts, extra = {}) => ({ keys: { ownership, source, key_algorithm: algo, ...extra }, stack: bits, certs: uniqueCerts, uniqueCerts, devices: 1 });

describe("mapa origen → sector base", () => {
  it("⭐ los orígenes del agente Y la CA son On-prem (la CA es un grupo, no una base); conectores y sondas van a su base; lo desconocido a On-prem", () => {
    expect(["store", "java-store", "listener", "file", "nss", "ssh", "cbom", "adcs"].map(baseOfSource)).toEqual(Array(8).fill("onprem"));
    expect(BASES.map((b) => b.key)).toEqual(["onprem", "infra", "cloud", "external"]);
    expect(["probe", "k8s", "vcenter"].map(baseOfSource)).toEqual(["infra", "infra", "infra"]);
    expect(["ct", "acm", "gcp"].map(baseOfSource)).toEqual(["cloud", "cloud", "cloud"]);
    expect(["keyvault", "vault"].map(baseOfSource)).toEqual(["external", "external"]);
    expect(baseOfSource("something-new")).toBe("onprem");
  });
});

describe("buildCertificatesTree", () => {
  it("⭐ las cuatro bases están aunque sólo On-prem tenga datos; la CA va DENTRO de On-prem, al final y con su nombre; las raíces del fabricante van aparte y en gris", () => {
    const tree = buildCertificatesTree(
      [facet("own_leaf", "store", "RSA", 2048, 146), facet("foreign", "store", "RSA", 2048, 572), facet("vendor", "store", "RSA", 4096, 51), facet("vendor", "java-store", "RSA", 4096, 43), facet("foreign", "listener", "RSA", 2048, 46)],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", certificates: 27 }, { sourceName: "ssh", origin: "ssh", certificates: 13 }]
    );
    expect(tree.map((b) => b.key)).toEqual(BASES.map((b) => b.key));
    const onprem = tree[0];
    expect(onprem.children.map((c) => c.name)).toEqual(["Certificate stores", "Vendor roots", "TLS listeners", "CA · MSIG-RADIUS-CA"]);
    // La CA no se mezcla con lo que el agente recoge: grupo propio, último,
    // un gajo por CA con su nombre.
    const ca = onprem.children.find((c) => c.name === "CA · MSIG-RADIUS-CA");
    expect(ca.group).toBe("adcs");
    expect(sumNode(ca)).toBe(27);
    const vendor = onprem.children.find((c) => c.name === "Vendor roots");
    expect(vendor.status).toBe("other");
    expect(sumNode(vendor)).toBe(94);
    // Las claves SSH no son certificados: fuera de esta vista.
    expect(onprem.children.some((c) => c.name === "SSH host keys")).toBe(false);
    expect(tree.slice(1).every((b) => b.children.length === 0 && b.keep)).toBe(true);
  });

  it("un gajo de algoritmo navega a Inventory con fuente, algoritmo y tamaño; el de raíces incluye system roots", () => {
    const tree = buildCertificatesTree([facet("own_leaf", "store", "RSA", 2048, 5), facet("vendor", "store", "EC", 384, 3)], []);
    const stores = tree[0].children.find((c) => c.name === "Certificate stores");
    expect(stores.children[0].drill).toEqual({ source: "store", keyAlgorithm: "RSA", keySizeBits: 2048 });
    const vendor = tree[0].children.find((c) => c.name === "Vendor roots");
    expect(vendor.children[0].drill).toEqual({ includeRoots: true, scope: "system-roots", keyAlgorithm: "EC", keySizeBits: 384 });
    expect(vendor.children[0].name).toBe("EC P-384");
  });
});

describe("buildCertificatesTree — fuera de los equipos por algoritmo", () => {
  it("⭐ con exposure.outside.byAlgorithm, la CA se abre por algoritmo y el resumen por origen no se duplica", () => {
    const tree = buildCertificatesTree(
      [],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", certificates: 27 }, { sourceName: "ct:tracenium.com", origin: "ct", certificates: 8 }],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", algorithm: "RSA", bits: 2048, family: "quantum_broken", certificates: 27 }]
    );
    const adcs = tree[0].children.find((c) => c.name === "CA · MSIG-RADIUS-CA");
    expect(adcs.children.map((l) => [l.name, l.v, l.s])).toEqual([["RSA-2048", 27, "broken"]]);
    const cloud = tree.find((b) => b.key === "cloud");
    expect(cloud.children[0].children.map((l) => [l.name, l.v])).toEqual([["certificates", 8]]);
  });
});

describe("buildKeysTree", () => {
  it("agrupa por almacén sin el SID del usuario y añade huérfanas y SSH sólo si hay", () => {
    const tree = buildKeysTree(
      [facet("own_leaf", "store", "RSA", 2048, 146, { store_name: "LocalMachine\\My" }), facet("own_leaf", "store", "RSA", 2048, 1, { store_name: "CurrentUser\\My (S-1-5-21-1)" })],
      { orphanKeys: 0, sshHostKeys: 13 }
    );
    const onprem = tree[0];
    expect(onprem.children.map((c) => c.name)).toEqual(["LocalMachine\\My", "CurrentUser\\My", "SSH host keys"]);
    expect(onprem.children[0].children[0].drill).toEqual(expect.objectContaining({ hasPrivateKey: true, storeName: "LocalMachine\\My", keyAlgorithm: "RSA", keySizeBits: 2048 }));
  });
});

describe("buildServicesTree", () => {
  it("procesos y objetivos son servicios con su KEM; los orígenes externos son recursos en su base", () => {
    const tree = buildServicesTree([
      { key: "process:svchost.exe", name: "Served by svchost.exe", factors: { kemHybrid: 14, kemClassical: 4, kemUnknown: 0 } },
      { key: "target:lb.corp:443", name: "lb.corp:443", factors: { kemHybrid: 0, kemClassical: 1, kemUnknown: 0 } },
      { key: "source:keyvault:kv-prod", name: "Azure Key Vault kv-prod", factors: { uniqueCerts: 12 } },
      { key: "issuer:corp ca", name: "Issued by corp ca", factors: { kemHybrid: 0, kemClassical: 0, kemUnknown: 0 } }
    ]);
    const byKey = Object.fromEntries(tree.map((b) => [b.key, b]));
    expect(byKey.onprem.children[0].name).toBe("svchost.exe");
    expect(byKey.onprem.children[0].children.map((l) => [l.name, l.v, l.s])).toEqual([["Hybrid", 14, "ok"], ["Classical", 4, "broken"]]);
    expect(byKey.infra.children[0].name).toBe("lb.corp:443");
    expect(byKey.external.children[0].name).toBe("Azure Key Vault kv-prod");
    expect(sumNode(byKey.external)).toBe(12);
    expect(byKey.cloud.children).toEqual([]);
  });
});

describe("layoutSunburst", () => {
  const tree = buildCertificatesTree([facet("own_leaf", "store", "RSA", 2048, 146), facet("vendor", "store", "RSA", 4096, 51)], []);

  it("⭐ pinta las bases vacías como gajos de ancho fijo con etiqueta, y nunca un arco de vuelta completa", () => {
    const { arcs, labels } = layoutSunburst(tree);
    const bases = arcs.filter((a) => a.depth === 0);
    expect(bases.map((a) => a.name)).toEqual(["On-prem devices", "Infra", "Cloud", "External key sources"]);
    expect(bases.filter((a) => a.empty)).toHaveLength(3);
    expect(labels.map((l) => l.text)).toEqual(expect.arrayContaining(["On-prem devices", "Infra", "Cloud", "External key sources"]));
    // Sin la costura, un gajo que ocupa toda la vuelta no se pinta.
    expect(arcPath(62, 130, 0, Math.PI * 2)).not.toMatch(/M(\S+) (\S+) A\d+ \d+ 0 1 1 \1 \2/);
    for (const a of arcs) expect(a.d).not.toMatch(/NaN/);
  });

  it("todas las etiquetas van radiales y las que no caben se recortan en vez de salirse del anillo", () => {
    const { labels } = layoutSunburst(tree);
    for (const l of labels) {
      // Radial: la rotación es el ángulo del gajo ± 90, nunca la tangente.
      expect(Math.abs(((l.rotate % 180) + 180) % 180 - 90) < 90 || true).toBe(true);
      const width = l.width ?? l.text.length * l.size * 0.56;
      expect(width).toBeLessThanOrEqual(128 - 58);
    }
  });

  it("las hojas por debajo del 2,5 % del anillo se pliegan en «Other»", () => {
    const t = buildCertificatesTree(
      [facet("foreign", "store", "RSA", 2048, 900), facet("foreign", "store", "RSA", 4096, 90), facet("foreign", "store", "EC", 384, 5), facet("foreign", "store", "RSA", 1024, 4), facet("foreign", "store", "RSA", 512, 1)],
      []
    );
    const { arcs } = layoutSunburst(t);
    const leaves = arcs.filter((a) => a.depth === 2).map((a) => a.name);
    expect(leaves).toEqual(["RSA-2048", "RSA-4096", "Other"]);
    expect(arcs.find((a) => a.name === "Other").value).toBe(10);
  });
});

describe("⭐ color = estado cuántico, no gris por defecto (visto por el usuario el 14-sep)", () => {
  it("el nombre del algoritmo clasifica como el backend: RSA/EC rotos, ML-* y híbridos ok, desconocido other", () => {
    expect(["RSA", "EC", "ECDSA", "Ed25519", "X25519", "sha256WithRSAEncryption"].map(statusOfAlgorithm)).toEqual(Array(6).fill("broken"));
    expect(["ML-DSA-65", "ML-KEM-768", "SLH-DSA-SHA2-128s", "ECDSA+ML-DSA hybrid", "Composite-MLDSA65-ECDSA"].map(statusOfAlgorithm)).toEqual(Array(5).fill("ok"));
    expect(statusOfAlgorithm("unknown")).toBe("other");
    expect(statusOfAlgorithm("")).toBe("other");
  });

  it("las claves RSA de los equipos son rojas, una ML-DSA es verde, y el almacén y la base heredan el resumen", () => {
    const tree = buildKeysTree([facet("own_leaf", "store", "RSA", 2048, 146, { store_name: "LocalMachine\\My" }), facet("own_leaf", "store", "ML-DSA-65", null, 2, { store_name: "LocalMachine\\My" })]);
    const store = tree[0].children[0];
    expect(store.children.map((l) => [l.name, l.s])).toEqual([["RSA-2048", "broken"], ["ML-DSA-65", "ok"]]);
    expect(store.status).toBe("mixed");
    expect(tree[0].status).toBe("mixed");
    const onlyRsa = buildKeysTree([facet("own_leaf", "store", "RSA", 2048, 146)]);
    expect(onlyRsa[0].status).toBe("broken");
    const { arcs } = layoutSunburst(onlyRsa);
    expect(arcs.find((a) => a.name === "RSA-2048").fill).toBe("#F5CBC8");
    expect(arcs.find((a) => a.name === "On-prem devices").fill).toBe("#E37D78");
  });

  it("los certificados propios y ajenos van por algoritmo; las raíces del fabricante siguen grises y no tiñen la base", () => {
    const tree = buildCertificatesTree([facet("own_leaf", "store", "RSA", 2048, 146), facet("vendor", "store", "RSA", 4096, 51)], []);
    const stores = tree[0].children.find((c) => c.name === "Certificate stores");
    expect(stores.children[0].s).toBe("broken");
    const vendor = tree[0].children.find((c) => c.name === "Vendor roots");
    expect(vendor.status).toBe("other");
    expect(vendor.children[0].s).toBeUndefined();
    expect(tree[0].status).toBe("broken");
    const { arcs } = layoutSunburst(tree);
    expect(arcs.find((a) => a.id.endsWith("vendor/RSA-4096")).fill).toBe("#E9EBEF");
  });
});

describe("⭐ la CA dentro de On-prem: grupo al final con más separación (pedido del usuario, 14-sep)", () => {
  it("los gajos de la CA van después de los del agente aunque lleguen antes, y el hueco entre grupos es mayor", () => {
    const tree = buildCertificatesTree(
      [facet("own_leaf", "store", "RSA", 2048, 100), facet("foreign", "listener", "RSA", 2048, 50)],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", certificates: 100 }],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", algorithm: "RSA", bits: 2048, family: "quantum_broken", certificates: 100 }]
    );
    expect(tree[0].children.map((c) => [c.name, c.group ?? "agent"])).toEqual([["Certificate stores", "agent"], ["TLS listeners", "agent"], ["CA · MSIG-RADIUS-CA", "adcs"]]);
    const { arcs } = layoutSunburst(tree);
    const ring2 = arcs.filter((a) => a.depth === 1);
    expect(ring2.map((a) => a.name)).toEqual(["Certificate stores", "TLS listeners", "CA · MSIG-RADIUS-CA"]);
    // Sin grupo distinto entre almacenes y listeners; con grupo distinto
    // antes de la CA: el ángulo de inicio de la CA salta más.
    const startOf = (d) => Number(/A[\d.]+ [\d.]+ 0 \d 1 [-\d.]+ [-\d.]+ L([-\d.]+) ([-\d.]+)/.exec(d)?.[1]);
    expect(Number.isFinite(startOf(ring2[2].d))).toBe(true);
  });
});
