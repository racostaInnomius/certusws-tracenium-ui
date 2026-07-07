// src/components/patch-management/CatalogDialog.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CatalogDialog from "./CatalogDialog";

afterEach(cleanup);

const textbox = (name) => screen.getByRole("textbox", { name });
const spin = (name) => screen.getByRole("spinbutton", { name }); // type=number inputs
const setup = () => userEvent.setup({ delay: null });

function renderDialog(props = {}) {
  const onSubmit = vi.fn();
  render(<CatalogDialog open mode="create" entry={null} submitting={false} onClose={() => {}} onSubmit={onSubmit} {...props} />);
  return { onSubmit };
}

describe("CatalogDialog", () => {
  it("requires a title and latest version", async () => {
    const user = setup();
    const { onSubmit } = renderDialog();
    await user.click(screen.getByRole("button", { name: /Create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Title is required/i)).toBeInTheDocument();
  });

  it("submits a normalized payload (blank optionals → null, packageId → number)", async () => {
    const user = setup();
    const { onSubmit } = renderDialog();
    await user.type(textbox(/^Title/), "7-Zip");
    await user.type(textbox(/^Latest version/), "23.01");
    fireEvent.change(spin(/Remediation package ID/), { target: { value: "42" } });
    await user.click(screen.getByRole("button", { name: /Create/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: "7-Zip",
      publisher: null,
      platform: "windows",
      matchName: null,
      matchPublisher: null,
      latestVersion: "23.01",
      packageId: 42,
      isActive: true,
    });
  });

  it("rejects a non-positive packageId", async () => {
    const user = setup();
    const { onSubmit } = renderDialog();
    await user.type(textbox(/^Title/), "X");
    await user.type(textbox(/^Latest version/), "1.0");
    fireEvent.change(spin(/Remediation package ID/), { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: /Create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Package ID must be a positive integer/i)).toBeInTheDocument();
  });
});
