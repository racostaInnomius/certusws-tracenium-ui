// src/components/software-delivery/VerdictBadge.test.jsx

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import VerdictBadge from "./VerdictBadge";

afterEach(cleanup);

describe("VerdictBadge", () => {
  it("labels each known verdict", () => {
    render(<VerdictBadge verdict="verified" />);
    expect(screen.getByText("Verified")).toBeTruthy();
    cleanup();
    render(<VerdictBadge verdict="warn" />);
    expect(screen.getByText("Needs review")).toBeTruthy();
    cleanup();
    render(<VerdictBadge verdict="blocked" />);
    expect(screen.getByText("Blocked")).toBeTruthy();
  });

  it("falls back to the raw value for an unknown verdict", () => {
    render(<VerdictBadge verdict="mystery" />);
    expect(screen.getByText("mystery")).toBeTruthy();
  });
});
