// src/components/software-delivery/DeletePackageDialog.test.jsx
//
// The backend refuses to delete a package that any deployment still
// references (RESTRICT → 409). That refusal used to travel only in a snackbar
// while this dialog stayed open, which is why the delete button was reported
// as "doing nothing": the operator clicked, the dialog sat there, and the
// explanation was somewhere else on screen.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import DeletePackageDialog from "./DeletePackageDialog";

afterEach(cleanup);

const item = {
  id: 1,
  name: "Tracenium Agent",
  version: "1.1.45",
  platform: "windows",
  arch: "x64",
  format: "msi",
};

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <DeletePackageDialog
      open
      item={item}
      submitting={false}
      onClose={onClose}
      onConfirm={onConfirm}
      {...props}
    />
  );
  return { onClose, onConfirm };
}

describe("DeletePackageDialog", () => {
  it("names the package being deleted", () => {
    renderDialog();
    expect(screen.getByText("Tracenium Agent")).toBeTruthy();
  });

  it("confirms when there is nothing wrong", () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows a refusal inside the dialog, not only as a toast", () => {
    renderDialog({ error: "Cannot delete: still referenced by one or more deployments." });
    expect(screen.getByRole("alert").textContent).toMatch(/still referenced/i);
  });

  it("stops offering Delete once it has been refused", () => {
    // The package is referenced; that does not change between clicks, so an
    // enabled button would just invite the same 409 again.
    const { onConfirm } = renderDialog({ error: "Cannot delete: still referenced." });
    const button = screen.getByRole("button", { name: /^delete$/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("turns Cancel into Close once the action can no longer succeed", () => {
    renderDialog({ error: "Cannot delete: still referenced." });
    expect(screen.getByRole("button", { name: /close/i })).toBeTruthy();
  });

  it("disables both actions while the delete is in flight", () => {
    renderDialog({ submitting: true });
    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });
});
