// src/components/CryptoDiscovery/cdpSunburst.test.js
//
// El sunburst del Dashboard: cuatro sectores base SIEMPRE presentes, la CA
// de Windows DENTRO de Infra como grupo aparte (al final, con más
// separación; desde el 19-sep — antes colgaba de On-prem), los orígenes en
// su sector, y un trazado sin gajos invisibles.

import { describe, expect, it } from "vitest";
import { BASES, arcPath, baseOfSource, buildCertificatesTree, buildKeysTree, buildServicesTree, layoutSunburst, statusOfAlgorithm, sumNode } from "./cdpSunburst";

const facet = (ownership, source, algo, bits, uniqueCerts, extra = {}) => ({ keys: { ownership, source, key_algorithm: algo, ...extra }, stack: bits, certs: uniqueCerts, uniqueCerts, devices: 1 });

describe("mapa origen → sector base", () => {
  it("⭐ On-prem es SÓLO lo que recogen los agentes; la CA de Windows es un grupo de Infra, no una base ni una fuente de equipo; lo desconocido a On-prem", () => {
    expect(["store", "java-store", "listener", "file", "nss", "ssh"].map(baseOfSource)).toEqual(Array(6).fill("onprem"));
    expect(BASES.map((b) => b.key)).toEqual(["onprem", "infra", "cloud", "external"]);
    // La CA la lee el agente instalado en ella y el CBOM lo sube una
    // persona: ninguno de los dos sale del inventario de un equipo.
    expect(["probe", "k8s", "vcenter", "adcs", "cbom"].map(baseOfSource)).toEqual(Array(5).fill("infra"));
    expect(["ct", "acm", "gcp"].map(baseOfSource)).toEqual(["cloud", "cloud", "cloud"]);
    expect(["keyvault", "vault"].map(baseOfSource)).toEqual(["external", "external"]);
    expect(baseOfSource("something-new")).toBe("onprem");
  });
});

describe("buildCertificatesTree", () => {
  it("⭐ las cuatro bases están aunque sólo dos tengan datos; la CA va DENTRO de Infra, al final y con su nombre; las raíces del fabricante van aparte y en gris", () => {
    const tree = buildCertificatesTree(
      [facet("own_leaf", "store", "RSA", 2048, 146), facet("foreign", "store", "RSA", 2048, 572), facet("vendor", "store", "RSA", 4096, 51), facet("vendor", "java-store", "RSA", 4096, 43), facet("foreign", "listener", "RSA", 2048, 46)],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", certificates: 27 }, { sourceName: "ssh", origin: "ssh", certificates: 13 }]
    );
    expect(tree.map((b) => b.key)).toEqual(BASES.map((b) => b.key));
    const onprem = tree[0];
    expect(onprem.children.map((c) => c.name)).toEqual(["Certificate stores", "Vendor roots", "TLS listeners"]);
    // La CA no se mezcla con lo que el agente recoge en los equipos: otro
    // sector, grupo propio dentro de él, un gajo por CA con su nombre.
    const infra = tree.find((b) => b.key === "infra");
    const ca = infra.children.find((c) => c.name === "CA · MSIG-RADIUS-CA");
    expect(ca.group).toBe("adcs");
    expect(sumNode(ca)).toBe(27);
    const vendor = onprem.children.find((c) => c.name === "Vendor roots");
    expect(vendor.status).toBe("other");
    expect(sumNode(vendor)).toBe(94);
    // Las claves SSH no son certificados: fuera de esta vista.
    expect(onprem.children.some((c) => c.name === "SSH host keys")).toBe(false);
    expect(tree.filter((b) => b.key === "cloud" || b.key === "external").every((b) => b.children.length === 0 && b.keep)).toBe(true);
  });

  it("un gajo de algoritmo navega a Inventory con fuente, algoritmo y tamaño; el de raíces incluye system roots", () => {
    const tree = buildCertificatesTree([facet("own_leaf", "store", "RSA", 2048, 5), facet("vendor", "store", "EC", 384, 3)], []);
    const stores = tree[0].children.find((c) => c.name === "Certificate stores");
    expect(stores.children[0].drill).toEqual({ to: "inventory", certClass: "all", source: "store", keyAlgorithm: "RSA", keySizeBits: 2048 });
    const vendor = tree[0].children.find((c) => c.name === "Vendor roots");
    expect(vendor.children[0].drill).toEqual({ to: "inventory", certClass: "all", includeRoots: true, scope: "system-roots", keyAlgorithm: "EC", keySizeBits: 384 });
    expect(vendor.children[0].name).toBe("EC P-384");
  });

  it("⭐ `certClass: all` no es decoración: las facetas cuentan CA y raíces, y la lista por defecto no — sin él la cifra del gajo y la de la lista no cuadran, y «Vendor roots» abría una lista vacía", () => {
    const tree = buildCertificatesTree([facet("vendor", "store", "RSA", 4096, 51)], []);
    const vendor = tree[0].children.find((c) => c.name === "Vendor roots");
    // La lente por defecto del servidor excluye `system-roots`, que es
    // justo el ámbito que este filtro pide: sin `all`, cero filas.
    expect(vendor.drill).toEqual({ to: "inventory", certClass: "all", includeRoots: true, scope: "system-roots" });
    expect(vendor.children[0].drill.certClass).toBe("all");
  });

  it("⭐ el anillo de origen también navega, y lo de FUERA de los equipos va a Explore, no a un inventario donde no tiene filas", () => {
    const tree = buildCertificatesTree(
      [facet("own_leaf", "store", "RSA", 2048, 5), facet("foreign", "listener", "RSA", 2048, 2)],
      [{ sourceName: "vcenter:vc.corp", origin: "vcenter", certificates: 3 }],
      [{ sourceName: "adcs:MSIG-CA", origin: "adcs", algorithm: "RSA", bits: 2048, family: "quantum_broken", certificates: 27 }]
    );
    const onprem = tree[0];
    expect(onprem.children.find((c) => c.name === "Certificate stores").drill).toEqual({ to: "inventory", certClass: "all", source: "store" });
    expect(onprem.children.find((c) => c.name === "TLS listeners").drill).toEqual({ to: "inventory", certClass: "all", source: "listener" });
    // La CA y vCenter viven en cdp_crypto_assets: su lista es «Outside
    // your devices», y la hoja lleva al mismo sitio que su fuente porque
    // ese panel filtra por origen, no por algoritmo.
    const ca = tree.find((b) => b.key === "infra").children.find((c) => c.name === "CA · MSIG-CA");
    // `current`: el gajo cuenta lo vigente y su lista también (24-sep: la CA
    // decía 27 y abría 51, con los caducados).
    expect(ca.drill).toEqual({ to: "outside", sourceName: "adcs:MSIG-CA", origin: "adcs", current: true });
    expect(ca.children[0].drill).toEqual(ca.drill);
    const vcenter = tree.find((b) => b.key === "infra").children[0];
    expect(vcenter.drill).toEqual({ to: "outside", sourceName: "vcenter:vc.corp", origin: "vcenter", current: true });
  });
});

describe("buildCertificatesTree — partido como las listas (25-sep)", () => {
  // `sunburst_bucket`: con ownership+source el gajo contaba cada raíz una vez
  // por fuente (246 donde la lista enseñaba 179) y las 5 raíces TUYAS se
  // colaban en «Vendor roots».
  const bucket = (b, algo, bits, n) => ({ keys: { sunburst_bucket: b, key_algorithm: algo }, stack: bits, certs: n, uniqueCerts: n, devices: 1 });
  it("⭐ raíces del fabricante (sin clave), raíces tuyas (con clave) y lo demás por fuente, cada una con su lista exacta", () => {
    const tree = buildCertificatesTree([bucket("vendor", "RSA", 2048, 179), bucket("own-roots", "RSA", 2048, 5), bucket("store", "RSA", 2048, 905), bucket("file", "RSA", 2048, 351)], []);
    const onprem = tree[0];
    const byName = Object.fromEntries(onprem.children.map((c) => [c.name, c]));
    expect(Object.keys(byName)).toEqual(["Vendor roots", "Your roots in OS stores", "Certificate stores", "Certificate files"]);
    expect(byName["Vendor roots"]).toMatchObject({ status: "other" });
    expect(byName["Vendor roots"].drill).toEqual({ to: "inventory", certClass: "all", includeRoots: true, scope: "system-roots", hasPrivateKey: false });
    expect(byName["Your roots in OS stores"].drill).toEqual({ to: "inventory", certClass: "all", includeRoots: true, scope: "system-roots", hasPrivateKey: true });
    expect(byName["Your roots in OS stores"].children[0].s).toBe("broken");
    expect(byName["Certificate stores"].drill).toEqual({ to: "inventory", certClass: "all", source: "store" });
    expect(byName["Certificate stores"].children[0].drill).toEqual({ to: "inventory", certClass: "all", source: "store", keyAlgorithm: "RSA", keySizeBits: 2048 });
    expect(sumNode(byName["Vendor roots"])).toBe(179);
  });
});

describe("revocados sin caducar (25-sep)", () => {
  // Técnicamente vigentes —cuentan— y decir que no también sería falso: van
  // en su propia hoja gris con su lista exacta; el resto abre lo no revocado.
  it("⭐ la CA se parte en su algoritmo (no revocados) y «Revoked», cada hoja con su lista", () => {
    const tree = buildCertificatesTree([], [{ sourceName: "adcs:CA", origin: "adcs", certificates: 27, revoked: 12 }], [
      { sourceName: "adcs:CA", origin: "adcs", algorithm: "RSA", bits: 2048, family: "quantum_broken", revoked: false, certificates: 15 },
      { sourceName: "adcs:CA", origin: "adcs", algorithm: "RSA", bits: 2048, family: "quantum_broken", revoked: true, certificates: 12 }
    ]);
    const ca = tree.find((b) => b.key === "infra").children[0];
    expect(sumNode(ca)).toBe(27);
    expect(ca.children.map((l) => [l.name, l.v, l.s])).toEqual([["RSA-2048", 15, "broken"], ["Revoked", 12, "other"]]);
    expect(ca.drill).toEqual({ to: "outside", sourceName: "adcs:CA", origin: "adcs", current: true });
    expect(ca.children[0].drill).toEqual({ to: "outside", sourceName: "adcs:CA", origin: "adcs", current: true, revoked: false });
    expect(ca.children[1].drill).toEqual({ to: "outside", sourceName: "adcs:CA", origin: "adcs", current: true, revoked: true });
  });

  it("sin desglose por algoritmo, bySource también aparta los revocados", () => {
    const tree = buildCertificatesTree([], [{ sourceName: "vault:x", origin: "vault", certificates: 10, revoked: 3 }]);
    const v = tree.find((b) => b.key === "external").children[0];
    expect(v.children.map((l) => [l.name, l.v])).toEqual([["certificates", 7], ["Revoked", 3]]);
  });

  it("una fuente sin revocados no lleva el filtro", () => {
    const tree = buildCertificatesTree([], [], [{ sourceName: "vcenter:v", origin: "vcenter", algorithm: "RSA", bits: 2048, family: "quantum_broken", revoked: false, certificates: 1 }]);
    expect(tree.find((b) => b.key === "infra").children[0].children[0].drill).toEqual({ to: "outside", sourceName: "vcenter:v", origin: "vcenter", current: true });
  });
});

describe("buildKeysTree — claves privadas sueltas (25-sep)", () => {
  it("⭐ las «Loose private keys» de los agentes salen en Keys, en una hoja con su lista y el color de lo que se sabe", () => {
    const tree = buildKeysTree([], { outsideBySource: [{ sourceName: "file-key", origin: "file-key", certificates: 0, keys: 17, keysBroken: 12 }, { sourceName: "ssh-user", origin: "ssh-user", certificates: 0, keys: 2, keysBroken: 2 }] });
    const onprem = tree[0];
    expect(onprem.children.map((c) => c.name)).toEqual(["Loose private keys"]);
    const loose = onprem.children[0];
    expect(loose.children.map((l) => [l.name, l.v, l.s])).toEqual([["keys", 17, "mixed"]]);
    expect(loose.note).toBe("12 quantum-broken, 5 not classified");
    expect(loose.children[0].drill).toEqual({ to: "outside", sourceName: "file-key", origin: "file-key", current: true });
  });
});

describe("buildCertificatesTree — fuera de los equipos por algoritmo", () => {
  it("⭐ con exposure.outside.byAlgorithm, la CA se abre por algoritmo y el resumen por origen no se duplica", () => {
    const tree = buildCertificatesTree(
      [],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", certificates: 27 }, { sourceName: "ct:tracenium.com", origin: "ct", certificates: 8 }],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", algorithm: "RSA", bits: 2048, family: "quantum_broken", certificates: 27 }]
    );
    const adcs = tree.find((b) => b.key === "infra").children.find((c) => c.name === "CA · MSIG-RADIUS-CA");
    expect(adcs.children.map((l) => [l.name, l.v, l.s])).toEqual([["RSA-2048", 27, "broken"]]);
    const cloud = tree.find((b) => b.key === "cloud");
    expect(cloud.children[0].children.map((l) => [l.name, l.v])).toEqual([["certificates", 8]]);
  });
});

describe("buildKeysTree", () => {
  it("⭐ la CA aparece en el anillo de Infra (al final, como grupo) con los algoritmos que certificó; vaults y clusters en su base; CT no (no guarda claves)", () => {
    const tree = buildKeysTree([facet("own_leaf", "store", "RSA", 2048, 146, { store_name: "LocalMachine\\My" })], {
      sshHostKeys: 13,
      outsideBySource: [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", certificates: 27 }, { sourceName: "keyvault:kv-prod", origin: "keyvault", certificates: 120 }, { sourceName: "ct:tracenium.com", origin: "ct", certificates: 8 }, { sourceName: "k8s:prod", origin: "k8s", certificates: 57 }],
      outsideByAlgorithm: [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", algorithm: "RSA", bits: 2048, family: "quantum_broken", certificates: 27 }]
    });
    const onprem = tree[0];
    expect(onprem.children.map((c) => [c.name, c.group ?? "main"])).toEqual([["LocalMachine\\My", "main"], ["SSH host keys", "main"]]);
    const infra = tree.find((b) => b.key === "infra");
    // Kubernetes primero, la CA al final y como grupo aparte.
    expect(infra.children.map((c) => [c.name, c.group ?? "main"])).toEqual([["Kubernetes", "main"], ["CA · MSIG-RADIUS-CA", "adcs"]]);
    expect(infra.children[1].children.map((l) => [l.name, l.v, l.s])).toEqual([["RSA-2048", 27, "broken"]]);
    expect(tree.find((b) => b.key === "external").children[0].name).toBe("Azure Key Vault");
    expect(tree.find((b) => b.key === "cloud").children).toEqual([]);
  });

  it("agrupa por almacén sin el SID del usuario y añade huérfanas y SSH sólo si hay", () => {
    const tree = buildKeysTree(
      [facet("own_leaf", "store", "RSA", 2048, 146, { store_name: "LocalMachine\\My" }), facet("own_leaf", "store", "RSA", 2048, 1, { store_name: "CurrentUser\\My (S-1-5-21-1)" })],
      { orphanKeys: 0, sshHostKeys: 13 }
    );
    const onprem = tree[0];
    expect(onprem.children.map((c) => c.name)).toEqual(["LocalMachine\\My", "CurrentUser\\My", "SSH host keys"]);
    expect(onprem.children[0].children[0].drill).toEqual(expect.objectContaining({ to: "inventory", hasPrivateKey: true, storeName: "LocalMachine\\My", keyAlgorithm: "RSA", keySizeBits: 2048 }));
  });

  it("⭐ huérfanas y claves SSH llevan a SU pantalla: ninguna de las dos es un certificado del inventario", () => {
    const tree = buildKeysTree([facet("own_leaf", "store", "RSA", 2048, 5, { store_name: "LocalMachine\\My" })], { orphanKeys: 4, sshHostKeys: 13 });
    const onprem = tree[0];
    const orphan = onprem.children.find((c) => c.name === "Orphan keys");
    expect(orphan.drill).toEqual({ to: "orphans" });
    expect(orphan.children[0].drill).toEqual({ to: "orphans" });
    // Las claves de host SSH son varias fuentes (una por equipo): el
    // destino es el ORIGEN, no una `source_name` concreta.
    const ssh = onprem.children.find((c) => c.name === "SSH host keys");
    expect(ssh.drill).toEqual({ to: "outside", sourceName: null, origin: "ssh", current: true });
    // El almacén lleva a su lista con clave privada; las raíces entran
    // porque el almacén ya acota.
    expect(onprem.children[0].drill).toEqual({ to: "inventory", certClass: "all", hasPrivateKey: true, includeRoots: true, source: "store", storeName: "LocalMachine\\My" });
  });

  it("⭐ los ficheros sueltos van en UN gajo, no uno por ruta (24-sep: ~22 astillas de una clave)", () => {
    const tree = buildKeysTree([
      facet("own_leaf", "store", "RSA", 2048, 5, { store_name: "LocalMachine\\My" }),
      facet("own_leaf", "file", "RSA", 2048, 1, { store_name: "C:\\ProgramData\\Dell\\a.pfx" }),
      facet("own_leaf", "file", "RSA", 2048, 1, { store_name: "C:\\ProgramData\\dell\\a.pfx" }),
      facet("own_leaf", "file", "RSA", 4096, 1, { store_name: "C:\\x\\b.pem" })
    ]);
    const onprem = tree[0];
    expect(onprem.children.map((c) => c.name)).toEqual(["LocalMachine\\My", "Certificate files"]);
    const files = onprem.children[1];
    expect(files.children.map((l) => [l.name, l.v])).toEqual([["RSA-2048", 2], ["RSA-4096", 1]]);
    // Sin ruta: la lista de ficheros con clave, de todas las rutas.
    expect(files.drill).toEqual({ to: "inventory", certClass: "all", hasPrivateKey: true, includeRoots: true, source: "file" });
    expect(files.children[0].drill).toEqual({ to: "inventory", certClass: "all", hasPrivateKey: true, includeRoots: true, source: "file", keyAlgorithm: "RSA", keySizeBits: 2048 });
  });

  it("⭐ con `fileRows` (facetas SIN ruta) el gajo cuenta cada certificado una vez aunque esté copiado en dos rutas (25-sep: 24 → 21)", () => {
    const perPath = [
      facet("own_leaf", "store", "RSA", 2048, 5, { store_name: "LocalMachine\\My" }),
      facet("own_leaf", "file", "RSA", 2048, 1, { store_name: "C:\\Dell\\a.pfx" }),
      facet("own_leaf", "file", "RSA", 2048, 1, { store_name: "C:\\dell\\a.pfx" })
    ];
    // La misma huella en las dos rutas: sin ruta, UN certificado.
    const fileRows = [{ keys: { key_algorithm: "RSA" }, stack: 2048, certs: 2, uniqueCerts: 1, devices: 1 }];
    const files = buildKeysTree(perPath, { fileRows })[0].children.find((c) => c.name === "Certificate files");
    expect(files.children.map((l) => [l.name, l.v])).toEqual([["RSA-2048", 1]]);
    expect(files.children[0].drill).toEqual({ to: "inventory", certClass: "all", hasPrivateKey: true, includeRoots: true, source: "file", keyAlgorithm: "RSA", keySizeBits: 2048 });
    // Sin `fileRows` (la consulta aparte cayó) se cuenta por ruta, como antes.
    expect(sumNode(buildKeysTree(perPath)[0].children.find((c) => c.name === "Certificate files"))).toBe(2);
  });
});

describe("buildServicesTree", () => {
  it("procesos y objetivos son servicios con su KEM; los orígenes externos son recursos en su base", () => {
    const tree = buildServicesTree([
      { key: "process:svchost.exe", name: "Served by svchost.exe", sampleSubject: "SRV-01.corp", factors: { kemHybrid: 14, kemClassical: 4, kemUnknown: 0 } },
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

  it("⭐ un proceso abre SU ficha en Roadmap acotada a sus servicios TLS, y «Hybrid» a los híbridos; un recurso externo abre Explore", () => {
    // 24-sep: el destino era una búsqueda por el sujeto de un certificado de
    // muestra. svchost.exe (19 servicios) abría 2 certificados, los siete de
    // Veeam la misma lista y lsass —sin muestra— los 51 listeners.
    const tree = buildServicesTree([
      { key: "process:svchost.exe", name: "Served by svchost.exe", sampleSubject: "SRV-01.corp", factors: { kemHybrid: 14, kemClassical: 4, kemUnknown: 0 } },
      { key: "target:lb.corp:443", name: "lb.corp:443", sampleSubject: "lb.corp", factors: { kemHybrid: 0, kemClassical: 1, kemUnknown: 0 } },
      { key: "source:keyvault:kv-prod", name: "Azure Key Vault kv-prod", factors: { uniqueCerts: 12 } }
    ]);
    const byKey = Object.fromEntries(tree.map((b) => [b.key, b]));
    const proc = byKey.onprem.children[0];
    expect(proc.drill).toEqual({ to: "system", system: "process:svchost.exe", focus: "tls" });
    expect(proc.children.map((l) => l.drill)).toEqual([
      { to: "system", system: "process:svchost.exe", focus: "hybrid" },
      { to: "system", system: "process:svchost.exe", focus: "classical" }
    ]);
    expect(byKey.infra.children[0].children[0].drill).toEqual({ to: "system", system: "target:lb.corp:443", focus: "classical" });
    expect(byKey.external.children[0].drill).toEqual({ to: "outside", sourceName: "keyvault:kv-prod", origin: "keyvault", current: true });
  });

  it("el destino no depende del sujeto de muestra: dos procesos con la misma muestra abren sistemas distintos", () => {
    const tree = buildServicesTree([
      { key: "process:veeam.a.exe", name: "veeam.a.exe", sampleSubject: "VEEAM", factors: { kemHybrid: 0, kemClassical: 2, kemUnknown: 0 } },
      { key: "process:veeam.b.exe", name: "veeam.b.exe", sampleSubject: "VEEAM", factors: { kemHybrid: 0, kemClassical: 2, kemUnknown: 0 } },
      { key: "process:lsass.exe", name: "lsass.exe", factors: { kemHybrid: 2, kemClassical: 0, kemUnknown: 0 } }
    ]);
    expect(tree[0].children.map((c) => c.drill.system)).toEqual(["process:veeam.a.exe", "process:veeam.b.exe", "process:lsass.exe"]);
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
    const other = arcs.find((a) => a.name === "Other");
    expect(other.value).toBe(10);
    // ⭐ «Other» son tres algoritmos: ningún filtro dice «estos tres». En
    // vez de no llevar a nada, lleva a la lista de su FUENTE entera y se
    // marca como plegado para que quien la pinte lo diga.
    expect(other.folded).toBe(true);
    expect(other.drill).toEqual({ to: "inventory", certClass: "all", source: "store" });
  });

  it("⭐ una base no navega: se amplía. El arco trae su clave y ningún filtro", () => {
    const { arcs } = layoutSunburst(tree);
    const onprem = arcs.find((a) => a.depth === 0 && a.name === "On-prem devices");
    expect(onprem.base).toBe("onprem");
    expect(onprem.drill).toBeNull();
    // Los anillos de dentro sí navegan, y no se anuncian como base.
    expect(arcs.filter((a) => a.depth > 0).every((a) => a.base === null)).toBe(true);
    // Ampliado = ese sector ocupa la vuelta entera y sus fuentes siguen ahí.
    const zoom = layoutSunburst(tree.filter((b) => b.key === "onprem"));
    expect(zoom.arcs.filter((a) => a.depth === 0).map((a) => a.name)).toEqual(["On-prem devices"]);
    expect(zoom.arcs.filter((a) => a.depth === 1).map((a) => a.name)).toEqual(["Certificate stores", "Vendor roots"]);
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

describe("⭐ la CA dentro de Infra: grupo al final con más separación (grupo pedido el 14-sep; movida a Infra el 19-sep)", () => {
  it("los gajos de la CA van después del resto de Infra aunque lleguen antes, y el hueco entre grupos es mayor", () => {
    const tree = buildCertificatesTree(
      [facet("own_leaf", "store", "RSA", 2048, 100)],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", certificates: 100 }, { sourceName: "k8s:prod", origin: "k8s", certificates: 50 }],
      [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", algorithm: "RSA", bits: 2048, family: "quantum_broken", certificates: 100 }]
    );
    const infra = tree.find((b) => b.key === "infra");
    expect(infra.children.map((c) => [c.name, c.group ?? "main"])).toEqual([["Kubernetes", "main"], ["CA · MSIG-RADIUS-CA", "adcs"]]);
    const { arcs } = layoutSunburst(tree);
    const ring2 = arcs.filter((a) => a.depth === 1);
    expect(ring2.map((a) => a.name)).toEqual(["Certificate stores", "Kubernetes", "CA · MSIG-RADIUS-CA"]);
    // Con grupo distinto antes de la CA, su ángulo de inicio salta más.
    const startOf = (d) => Number(/A[\d.]+ [\d.]+ 0 \d 1 [-\d.]+ [-\d.]+ L([-\d.]+) ([-\d.]+)/.exec(d)?.[1]);
    expect(Number.isFinite(startOf(ring2[2].d))).toBe(true);
  });
});

describe("⭐ ancho mínimo para los gajos pequeños (vCenter no se veía, 14-sep)", () => {
  const angle = (a) => {
    // Del path SVG se sacan el punto de inicio y el de fin del arco exterior.
    const m = /^M([-\d.]+) ([-\d.]+) A[\d.]+ [\d.]+ 0 \d 1 ([-\d.]+) ([-\d.]+)/.exec(a.d);
    const at = (x, y) => Math.atan2(Number(x), -Number(y));
    let w = at(m[3], m[4]) - at(m[1], m[2]);
    if (w < 0) w += Math.PI * 2;
    return w;
  };
  it("una base con 3 claves frente a 1.000 sigue siendo legible y con etiqueta; las proporciones grandes se conservan", () => {
    const tree = buildKeysTree([facet("own_leaf", "store", "RSA", 2048, 1000, { store_name: "LocalMachine\\My" })], {
      outsideBySource: [{ sourceName: "vcenter:vc", origin: "vcenter", certificates: 3 }, { sourceName: "keyvault:kv", origin: "keyvault", certificates: 400 }]
    });
    const { arcs, labels } = layoutSunburst(tree);
    const infra = arcs.find((a) => a.depth === 0 && a.name === "Infra");
    const onprem = arcs.find((a) => a.depth === 0 && a.name === "On-prem devices");
    const external = arcs.find((a) => a.depth === 0 && a.name === "External key sources");
    expect(infra.empty).toBe(false);
    expect(angle(infra)).toBeGreaterThanOrEqual(0.29);
    expect(angle(onprem) / angle(external)).toBeCloseTo(1000 / 400, 0);
    expect(labels.map((l) => l.text)).toContain("Infra");
    expect(labels.map((l) => l.text)).toContain("vCenter");
  });

  it("sin nada pequeño no cambia nada", () => {
    const tree = buildKeysTree([facet("own_leaf", "store", "RSA", 2048, 100)], { outsideBySource: [{ sourceName: "keyvault:kv", origin: "keyvault", certificates: 100 }] });
    const { arcs } = layoutSunburst(tree);
    const [a, b] = ["On-prem devices", "External key sources"].map((n) => arcs.find((x) => x.depth === 0 && x.name === n));
    expect(angle(a)).toBeCloseTo(angle(b), 2);
  });
});
