// src/pages/AssetGroups.askGroup.test.jsx
//
// ADR-0029 F3 — «Ask this group» en el cajón de un grupo: lleva a Live Query
// con el grupo como objetivo, y sólo existe si quien mira tiene el permiso
// (Assets pasa el atajo o no).

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api/jobs", () => ({
  listJobTypes: vi.fn().mockResolvedValue({ items: [] }),
  listKnownDevices: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("../api/assetGroups", () => ({
  listAssetGroups: vi.fn().mockResolvedValue({ items: [] }),
  createAssetGroup: vi.fn(),
  updateAssetGroup: vi.fn(),
  deleteAssetGroup: vi.fn(),
  listAssetGroupMembers: vi.fn().mockResolvedValue({ items: [{ deviceId: "d1", hostname: "SRV-01" }], total: 1 }),
  addAssetGroupMembers: vi.fn(),
  removeAssetGroupMember: vi.fn(),
  getCriteriaCatalog: vi.fn().mockResolvedValue({ fields: [] }),
  getAssetGroupCoverage: vi.fn().mockResolvedValue({}),
  previewAssetGroupCriteria: vi.fn(),
  dispatchAssetGroupJob: vi.fn(),
}));

import { GroupDetailDrawer } from "./AssetGroups";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const wrap = (ui) => render(<ConfirmProvider>{ui}</ConfirmProvider>);

afterEach(cleanup);

const GROUP = { id: 4, name: "Servers", kind: "static", memberCount: 1 };

describe("GroupDetailDrawer — Ask this group", () => {
  it("⭐ con el atajo, pregunta al grupo y cierra el cajón", async () => {
    const onAskGroup = vi.fn();
    const onClose = vi.fn();
    wrap(<GroupDetailDrawer open group={GROUP} onClose={onClose} devices={[]} canManage={false} notify={() => {}} onMembersChanged={() => {}} onAskGroup={onAskGroup} />);
    const btn = await screen.findByRole("button", { name: /Ask this group/ });
    await vi.waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);
    expect(onAskGroup).toHaveBeenCalledWith(GROUP);
    expect(onClose).toHaveBeenCalled();
  });

  it("sin el permiso no hay botón", async () => {
    wrap(<GroupDetailDrawer open group={GROUP} onClose={() => {}} devices={[]} canManage={false} notify={() => {}} onMembersChanged={() => {}} />);
    await screen.findByText(/Members/);
    expect(screen.queryByRole("button", { name: /Ask this group/ })).toBeNull();
  });
});
