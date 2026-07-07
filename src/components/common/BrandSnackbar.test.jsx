// src/components/common/BrandSnackbar.test.jsx
//
// Sprint 2 — brand snackbar (custom filled Snackbar replacement).
// Pure presentational: no network. We verify severity → visual/role
// contract and the aria wiring the component deliberately preserves.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BrandSnackbar from "./BrandSnackbar";

afterEach(cleanup);

describe("BrandSnackbar", () => {
  it("renders the message with role=alert when open", () => {
    render(<BrandSnackbar open message="Deployed" severity="success" onClose={() => {}} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Deployed");
  });

  it("does not render content when closed", () => {
    render(<BrandSnackbar open={false} message="Hidden" onClose={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("error severity → aria-live=assertive (urgent announcement)", () => {
    render(<BrandSnackbar open message="Failed" severity="error" onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it.each(["success", "warning", "info"])(
    "%s severity → aria-live=polite",
    (severity) => {
      render(<BrandSnackbar open message="msg" severity={severity} onClose={() => {}} />);
      expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "polite");
      cleanup();
    }
  );

  it("unknown severity falls back to info styling (still polite)", () => {
    render(<BrandSnackbar open message="msg" severity="bogus" onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "polite");
  });

  it("renders a dismiss button only when onClose is provided, and it fires", async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    render(<BrandSnackbar open message="msg" severity="info" onClose={onClose} />);

    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    await user.click(dismiss);
    expect(onClose).toHaveBeenCalled();
  });

  it("omits the dismiss button when onClose is not provided", () => {
    render(<BrandSnackbar open message="msg" severity="info" onClose={undefined} />);
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });
});
