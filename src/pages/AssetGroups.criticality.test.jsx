// src/pages/AssetGroups.criticality.test.jsx
//
// La criticidad de negocio de un grupo. Lo que se fija:
//   · se puede poner y se puede QUITAR — «Normal» manda null, no "" ni se
//     omite la clave (omitirla dejaría la criticidad vieja puesta);
//   · el diálogo arranca con la que el grupo ya tiene;
//   · sin criticidad no se pinta chip: «normal» no es una etiqueta más.

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within, waitFor } from "@testing-library/react";

vi.mock("../api/jobs", () => ({
  listJobTypes: vi.fn().mockResolvedValue({ items: [] }),
  listKnownDevices: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("../api/assetGroups", () => ({
  listAssetGroups: vi.fn().mockResolvedValue({ items: [] }),
  createAssetGroup: vi.fn(),
  updateAssetGroup: vi.fn(),
  deleteAssetGroup: vi.fn(),
  listAssetGroupMembers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  addAssetGroupMembers: vi.fn(),
  removeAssetGroupMember: vi.fn(),
  getCriteriaCatalog: vi.fn().mockResolvedValue({ fields: [] }),
  getAssetGroupCoverage: vi.fn().mockResolvedValue({}),
  previewAssetGroupCriteria: vi.fn(),
  dispatchAssetGroupJob: vi.fn(),
}));

import { updateAssetGroup } from "../api/assetGroups";
import { RenameGroupDialog } from "./AssetGroups";
import { CriticalityChip } from "../components/AssetGroups/criticality";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function pick(label) {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /Business criticality/ }));
  fireEvent.click(within(screen.getByRole("listbox")).getByText(label));
}

describe("editar la criticidad de un grupo", () => {
  it("arranca con la que ya tiene", () => {
    render(<RenameGroupDialog open group={{ id: 1, name: "DCs", criticality: "critical" }} onClose={() => {}} onUpdated={() => {}} />);
    expect(screen.getByRole("combobox", { name: /Business criticality/ })).toHaveTextContent("Critical");
  });

  it("la pone", async () => {
    updateAssetGroup.mockResolvedValue({ group: { id: 1, criticality: "high" } });
    const onUpdated = vi.fn();
    render(<RenameGroupDialog open group={{ id: 1, name: "Servers", criticality: null }} onClose={() => {}} onUpdated={onUpdated} />);
    pick("High");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateAssetGroup).toHaveBeenCalled());
    expect(updateAssetGroup.mock.calls[0][1]).toMatchObject({ name: "Servers", criticality: "high" });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ id: 1, criticality: "high" }));
  });

  it("⭐ «Normal» la QUITA: manda null, no omite la clave", async () => {
    updateAssetGroup.mockResolvedValue({ group: { id: 1, criticality: null } });
    render(<RenameGroupDialog open group={{ id: 1, name: "DCs", criticality: "critical" }} onClose={() => {}} onUpdated={() => {}} />);
    pick("Normal (not set)");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateAssetGroup).toHaveBeenCalled());
    const payload = updateAssetGroup.mock.calls[0][1];
    expect(payload).toHaveProperty("criticality", null);
  });

  it("dice lo que NO hace: no cambia severidades ni scores", () => {
    render(<RenameGroupDialog open group={{ id: 1, name: "DCs", criticality: null }} onClose={() => {}} onUpdated={() => {}} />);
    expect(screen.getByText(/never changes a finding's severity or a CVE's score/)).toBeInTheDocument();
  });
});

describe("el chip", () => {
  it("sin criticidad no pinta nada (salvo el guion de la rejilla)", () => {
    const { container, rerender } = render(<CriticalityChip value={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CriticalityChip value={null} emptyAsDash />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("un valor fuera de la lista se trata como sin declarar", () => {
    const { container } = render(<CriticalityChip value="bogus" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pinta la etiqueta", () => {
    render(<CriticalityChip value="critical" />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });
});
