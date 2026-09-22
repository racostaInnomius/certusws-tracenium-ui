// src/components/CryptoDiscovery/SshUserKeysPanel.test.jsx
//
// Ola 1.4 — la pestaña de claves SSH de usuario, montada de verdad.
//
// `sshUserKeys.test.js` fija la semántica; esto fija que la vista la
// RESPETE, que es donde se rompería. Lo que defiende:
//
//   · ⭐ con el modo por defecto (`public-only`) la palabra «Not encrypted»
//     no aparece EN NINGUNA PARTE del DOM: `encrypted: null` es «no se
//     miró», y pintarlo como hallazgo sería inventarse una clave sin
//     passphrase que nadie comprobó;
//   · ⭐ un fallo de cualquiera de las dos llamadas se dice, y jamás se
//     pinta como «no hay nada»;
//   · ⭐ si la API contesta filas SIN `detail` —que es lo que hace hoy,
//     porque `GET /cdp/assets` no selecciona la columna— se dice eso, y no
//     «no hay claves».

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

const listCdpSharedAuthorizedKeys = vi.fn();
const listCryptoAssets = vi.fn();

vi.mock("../../api/cdp", () => ({
  listCdpSharedAuthorizedKeys: (...a) => listCdpSharedAuthorizedKeys(...a),
  listCryptoAssets: (...a) => listCryptoAssets(...a)
}));

import SshUserKeysPanel from "./SshUserKeysPanel";

const SHARED = {
  fingerprintSha256: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  devices: 14,
  grants: 21,
  users: ["root", "deploy"],
  comments: ["jenkins@ci"],
  keyType: "ssh-rsa",
  bits: 2048,
  anyUnrestricted: true,
  legacyReason: "rsa_below_3072",
  lastSeen: "2026-09-20T10:00:00.000Z"
};

const assetRow = (detail, extra = {}) => ({ assetId: detail.path, detail, ...extra });

beforeEach(() => {
  listCdpSharedAuthorizedKeys.mockResolvedValue({ ok: true, items: [] });
  listCryptoAssets.mockResolvedValue({ ok: true, items: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("⭐ public-only never renders as unencrypted", () => {
  it("a private key collected with the default mode says «Not evaluated», and the words «Not encrypted» are nowhere on the page", async () => {
    listCryptoAssets.mockResolvedValue({
      ok: true,
      items: [
        assetRow({
          kind: "private",
          user: "deploy",
          path: "/home/deploy/.ssh/id_rsa",
          mode: "public-only",
          encrypted: null,
          filePermissions: "0600",
          sizeBytes: 2610
        })
      ]
    });
    render(<SshUserKeysPanel refreshNonce={0} />);

    expect(await screen.findByText("Not evaluated")).toBeInTheDocument();
    // El fallo que este test existe para cazar: la afirmación que nadie
    // hizo, en cualquier rincón del DOM (etiqueta, tooltip renderizado,
    // texto de ayuda). Si alguien «simplifica» a `encrypted ? … : …`, esto
    // se pone rojo.
    expect(screen.queryByText("Not encrypted")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bunencrypted\b/i);
  });

  it("under full collection a key with no passphrase IS shown as the finding", async () => {
    listCryptoAssets.mockResolvedValue({
      ok: true,
      items: [assetRow({ kind: "private", user: "deploy", path: "/home/deploy/.ssh/id_rsa", mode: "full", encrypted: false })]
    });
    render(<SshUserKeysPanel refreshNonce={0} />);
    expect(await screen.findByText("Not encrypted")).toBeInTheDocument();
    expect(screen.queryByText("Not evaluated")).not.toBeInTheDocument();
  });

  it("and one with a passphrase reads as encrypted, distinct from both", async () => {
    listCryptoAssets.mockResolvedValue({
      ok: true,
      items: [assetRow({ kind: "private", user: "deploy", path: "/home/deploy/.ssh/id_ed25519", mode: "full", encrypted: true })]
    });
    render(<SshUserKeysPanel refreshNonce={0} />);
    expect(await screen.findByText("Encrypted")).toBeInTheDocument();
    expect(screen.queryByText("Not evaluated")).not.toBeInTheDocument();
    expect(screen.queryByText("Not encrypted")).not.toBeInTheDocument();
  });
});

describe("one key, several machines", () => {
  it("leads with the device count, the grants and the accounts it opens", async () => {
    listCdpSharedAuthorizedKeys.mockResolvedValue({ ok: true, items: [SHARED] });
    render(<SshUserKeysPanel refreshNonce={0} />);

    const table = await screen.findByRole("table", { name: /authorised on several devices/i });
    expect(within(table).getByText("14")).toBeInTheDocument();
    expect(within(table).getByText("21")).toBeInTheDocument();
    expect(within(table).getByText("root, deploy")).toBeInTheDocument();
    // «Sin restringir en algún sitio» es el dato que convierte el recuento
    // en una decisión: la clave no sólo está en 14 equipos, en al menos uno
    // abre la cuenta entera.
    expect(within(table).getByText(/unrestricted somewhere/i)).toBeInTheDocument();
    expect(within(table).getByText(/legacy key type/i)).toBeInTheDocument();
  });

  it("asks the server for keys on two or more devices", async () => {
    render(<SshUserKeysPanel refreshNonce={0} />);
    await waitFor(() => expect(listCdpSharedAuthorizedKeys).toHaveBeenCalled());
    expect(listCdpSharedAuthorizedKeys.mock.calls[0][0]).toMatchObject({ minDevices: 2 });
  });

  it("the empty state answers about what was collected, not about the fleet", async () => {
    render(<SshUserKeysPanel refreshNonce={0} />);
    const empty = await screen.findByText(/No public key is authorised on two or more devices/i);
    expect(empty.textContent).toMatch(/says nothing about accounts on machines with no agent/i);
  });
});

describe("⭐ honest states", () => {
  it("a failure on the shared-key query is said, not painted as «none shared»", async () => {
    listCdpSharedAuthorizedKeys.mockRejectedValue(new Error("upstream said no"));
    render(<SshUserKeysPanel refreshNonce={0} />);
    expect(await screen.findByText(/could not be read: upstream said no/i)).toBeInTheDocument();
    expect(screen.queryByText(/No public key is authorised on two or more devices/i)).not.toBeInTheDocument();
  });

  it("a failure on the inventory query is said, not painted as «no keys collected»", async () => {
    listCryptoAssets.mockRejectedValue(new Error("assets exploded"));
    render(<SshUserKeysPanel refreshNonce={0} />);
    expect(await screen.findByText(/user SSH keys could not be read: assets exploded/i)).toBeInTheDocument();
    expect(screen.queryByText(/No user SSH key has been collected/i)).not.toBeInTheDocument();
  });

  it("⭐ rows without per-key detail are not listed and not counted as «no keys»", async () => {
    // Lo que devuelve el backend HOY: `origin=ssh-user` no está en su lista
    // blanca (se ignora en silencio) y `GET /cdp/assets` no selecciona la
    // columna `detail`. Enseñar esas filas aquí sería inventarse el
    // inventario; decir «no hay claves» sería mentir al revés.
    listCryptoAssets.mockResolvedValue({
      ok: true,
      items: [{ assetId: "c1", name: "some certificate" }, { assetId: "c2", name: "another one" }]
    });
    render(<SshUserKeysPanel refreshNonce={0} />);
    const notice = await screen.findByText(/none of the 2 rows it returned carries the per-key/i);
    expect(notice).toBeInTheDocument();
    expect(screen.queryByText(/No user SSH key has been collected/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /^User SSH keys$/i })).not.toBeInTheDocument();
  });

  it("an empty answer is «nothing collected yet», with what turns it on", async () => {
    render(<SshUserKeysPanel refreshNonce={0} />);
    const empty = await screen.findByText(/No user SSH key has been collected/i);
    expect(empty.textContent).toMatch(/SSH keys in user home directories/i);
  });
});

describe("the list", () => {
  const rows = [
    assetRow(
      {
        kind: "authorized",
        user: "root",
        path: "/root/.ssh/authorized_keys",
        keyType: "ssh-rsa",
        fingerprintSha256: "SHA256:ROOTKEY",
        comment: "old-admin@laptop",
        options: [],
        unrestricted: true,
        legacyReason: "rsa_below_3072"
      },
      { keySizeBits: 2048 }
    ),
    assetRow({
      kind: "authorized",
      user: "deploy",
      path: "/home/deploy/.ssh/authorized_keys",
      keyType: "ssh-ed25519",
      fingerprintSha256: "SHA256:DEPLOYKEY",
      options: ['command="/usr/bin/rsync"', "from=10.0.0.1"],
      unrestricted: false
    }),
    assetRow({
      kind: "public",
      user: "deploy",
      path: "/home/deploy/.ssh/id_ed25519.pub",
      keyType: "ssh-ed25519",
      fingerprintSha256: "SHA256:PUBKEY"
    })
  ];

  it("shows each grant with its account, its path and whether it is restricted", async () => {
    listCryptoAssets.mockResolvedValue({ ok: true, items: rows });
    render(<SshUserKeysPanel refreshNonce={0} />);

    const table = await screen.findByRole("table", { name: /^User SSH keys$/i });
    expect(within(table).getByText("/root/.ssh/authorized_keys")).toBeInTheDocument();
    expect(within(table).getByText("unrestricted")).toBeInTheDocument();
    // Las opciones se cuentan; su contenido va en el tooltip, porque una
    // línea de `authorized_keys` no cabe en una celda.
    expect(within(table).getByText("2 options")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 keys")).toBeInTheDocument();
  });

  it("⭐ «unrestricted» belongs to the grant, never to a public key where the field does not apply", async () => {
    listCryptoAssets.mockResolvedValue({ ok: true, items: rows });
    render(<SshUserKeysPanel refreshNonce={0} />);
    const table = await screen.findByRole("table", { name: /^User SSH keys$/i });
    // Una sola vez en toda la tabla: la concesión de root. La pública y la
    // concesión restringida traen `unrestricted` en null/false y no lo son.
    expect(within(table).getAllByText("unrestricted")).toHaveLength(1);
  });

  it("only the accounts actually present can be filtered on", async () => {
    listCryptoAssets.mockResolvedValue({ ok: true, items: rows });
    render(<SshUserKeysPanel refreshNonce={0} />);
    await screen.findByRole("table", { name: /^User SSH keys$/i });
    expect(listCryptoAssets.mock.calls[0][0]).toMatchObject({ origin: "ssh-user" });
  });
});
