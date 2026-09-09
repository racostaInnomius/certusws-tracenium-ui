// src/pages/AssetGroups.dispatch.test.jsx
//
// El diálogo «Dispatch job» de un grupo de assets.
//
// ⚠️ EXISTE POR UN BOTÓN QUE NO PODÍA FUNCIONAR NUNCA. El desplegable ofrecía
// «Software Install», pero su payload es `{ deploymentId, packageSnapshot }` —
// un snapshot que sólo existe DESPUÉS de que un despliegue lo haya producido,
// así que un formulario genérico no puede construirlo. El diálogo mandaba
// `payload: {}` y el backend contestaba `invalid_software_install_payload`.
//
// El catálogo del servidor ya lo decía: `creatable: false` con el motivo
// («Dispatched from Software Delivery, which supplies the package snapshot»).
// Jobs.jsx ya lo respetaba; esta pantalla no.
//
// Y no es sólo un botón roto: entre los no-creables hay tipos con régimen de
// aprobación de ADR-0009 —rotación de certificado, distrust de anclas—, cuyos
// comentarios en el backend advierten justo de esto: «un tipo privilegiado que
// se puede construir por otra puerta es una puerta sin gate».

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listJobTypes = vi.fn();
vi.mock("../api/jobs", () => ({
  listJobTypes: (...a) => listJobTypes(...a),
  listKnownDevices: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("../api/assetGroups", () => ({
  listAssetGroups: vi.fn().mockResolvedValue({ items: [] }),
  createAssetGroup: vi.fn(),
  updateAssetGroup: vi.fn(),
  deleteAssetGroup: vi.fn(),
  listAssetGroupMembers: vi.fn().mockResolvedValue({ items: [] }),
  addAssetGroupMembers: vi.fn(),
  removeAssetGroupMember: vi.fn(),
  getCriteriaCatalog: vi.fn().mockResolvedValue({ fields: [] }),
  getAssetGroupCoverage: vi.fn().mockResolvedValue({}),
  previewAssetGroupCriteria: vi.fn(),
  dispatchAssetGroupJob: vi.fn(),
}));

import { DispatchJobDialog } from "./AssetGroups";

// La forma real del catálogo: creables y no-creables mezclados, que es como
// llega. El servidor manda los 10 no-creables por su ETIQUETA, para que el
// historial pueda rotularlos — no para construirlos aquí.
const CATALOG = [
  { jobType: "facts_snapshot", label: "Facts Snapshot", creatable: true },
  { jobType: "patch_scan", label: "Patch Scan", creatable: true },
  {
    jobType: "software_install",
    label: "Software Install",
    creatable: false,
    reason: "Dispatched from Software Delivery, which supplies the package snapshot.",
  },
  {
    jobType: "cert_rotate",
    label: "Certificate Rotation",
    creatable: false,
    reason: "Se lanza desde el equipo, con expediente y vistobueno (ADR-0009).",
  },
];

function renderDialog(items = CATALOG) {
  listJobTypes.mockResolvedValue({ items });
  return render(
    <DispatchJobDialog
      open
      group={{ id: 1, name: "Edge behind", kind: "static" }}
      onClose={() => {}}
      onDispatched={() => {}}
      notify={() => {}}
    />
  );
}

describe("DispatchJobDialog — tipos ofrecidos", () => {
  // Sin esto el DOM se acumula: el Dialog de MUI vive en un portal colgado
  // de document.body, así que el diálogo de un test sigue ahí en el
  // siguiente y las consultas encuentran dos.
  afterEach(cleanup);

  beforeEach(() => {
    listJobTypes.mockReset();
  });

  it("no ofrece Software Install, que no se puede construir aquí", async () => {
    renderDialog();
    await waitFor(() => expect(listJobTypes).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("combobox", { name: /job type/i }));
    // El desplegable abierto: sólo los creables son opciones.
    const options = await screen.findAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Facts Snapshot");
    expect(labels).toContain("Patch Scan");
    expect(labels).not.toContain("Software Install");
    expect(labels).not.toContain("Certificate Rotation");
  });

  it("dice por qué faltan, en vez de hacerlos desaparecer sin más", async () => {
    // Quitarlos a secas cambia «lo ofrece y falla» por «¿dónde está?». El
    // motivo del catálogo apunta a dónde SÍ se hace.
    renderDialog();
    await waitFor(() => expect(listJobTypes).toHaveBeenCalled());

    expect(await screen.findByText(/not dispatchable from here/i)).toBeInTheDocument();
    expect(screen.getByText(/supplies the package snapshot/i)).toBeInTheDocument();
  });

  it("un catálogo sin la bandera se sigue ofreciendo entero", async () => {
    // Un backend anterior a `creatable` no manda la clave. Tratar «ausente»
    // como no-creable dejaría el desplegable vacío contra él, que es peor que
    // el bug que esto arregla.
    renderDialog([
      { jobType: "facts_snapshot", label: "Facts Snapshot" },
      { jobType: "patch_scan", label: "Patch Scan" },
    ]);
    await waitFor(() => expect(listJobTypes).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("combobox", { name: /job type/i }));
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(labels).toEqual(["Facts Snapshot", "Patch Scan"]);
    expect(screen.queryByText(/not dispatchable from here/i)).toBeNull();
  });
});
