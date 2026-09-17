// src/components/Compliance/ExceptionRequestDialog.test.jsx
//
// P1-7 — the request dialog: nothing is sent without a 20-character
// justification, a risk owner who is an active member, and an expiry within
// 12 months; the payload is what the backend validates.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../hooks/useEffectiveTenantId", () => ({ useEffectiveTenantId: () => "1" }));
const listTenantMembers = vi.fn();
vi.mock("../../api/tenants", () => ({ listTenantMembers: (...a) => listTenantMembers(...a) }));

import ExceptionRequestDialog from "./ExceptionRequestDialog";
import { dateInputValue, expiryIsoFromDateInput } from "./complianceHelpers";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openDialog(props = {}) {
  listTenantMembers.mockResolvedValue({
    items: [
      { email: "Owner@CertusITM.com", isActive: true },
      { email: "gone@certusitm.com", isActive: false },
      { email: null, isActive: true },
    ],
  });
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<ExceptionRequestDialog open onSubmit={onSubmit} onCancel={() => {}} findingTitle="SMBv1 disabled" {...props} />);
  await waitFor(() => expect(listTenantMembers).toHaveBeenCalledWith("1"));
  return { onSubmit };
}

describe("ExceptionRequestDialog", () => {
  it("says a pending request changes nothing and who approves it", async () => {
    await openDialog();
    expect(screen.getByText(/keeps counting as failed/i)).toBeInTheDocument();
    expect(screen.getByText(/Another owner or administrator/i)).toBeInTheDocument();
  });

  it("stays disabled until justification, risk owner and expiry are valid, then sends the request", async () => {
    const { onSubmit } = await openDialog();
    const submit = screen.getByRole("button", { name: "Request approval" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Justification/), { target: { value: "too short" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Justification/), { target: { value: "  Legacy ERP needs SMBv1 until the Q4 migration  " } });
    expect(submit).toBeDisabled(); // no risk owner yet

    fireEvent.mouseDown(screen.getByLabelText(/Risk owner/));
    const listbox = await screen.findByRole("listbox");
    // Only active members with an email are offered.
    expect(within(listbox).getAllByRole("option")).toHaveLength(1);
    fireEvent.click(within(listbox).getByText("Owner@CertusITM.com"));
    expect(submit).toBeEnabled();

    fireEvent.click(screen.getByLabelText(/Won't fix/));
    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "wont_fix",
      justification: "Legacy ERP needs SMBv1 until the Q4 migration",
      riskOwner: "owner@certusitm.com",
      expiresAt: expiryIsoFromDateInput(dateInputValue(365)),
    });
  });

  it("an expiry beyond 12 months blocks the request", async () => {
    await openDialog();
    fireEvent.change(screen.getByLabelText(/Justification/), { target: { value: "Legacy ERP needs SMBv1 until the Q4 migration" } });
    fireEvent.mouseDown(screen.getByLabelText(/Risk owner/));
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("Owner@CertusITM.com"));
    fireEvent.change(screen.getByLabelText(/Expires on/), { target: { value: dateInputValue(400) } });
    expect(screen.getByRole("button", { name: "Request approval" })).toBeDisabled();
  });

  it("a bulk request names how many findings it covers", async () => {
    await openDialog({ count: 4, findingTitle: null });
    expect(screen.getByText(/4 selected findings/)).toBeInTheDocument();
    expect(screen.getByText(/Each finding gets its own request/)).toBeInTheDocument();
  });
});
