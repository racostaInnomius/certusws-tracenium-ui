import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LicenseUsageCard from "./LicenseUsageCard";

const bundle = (license) => ({ status: "fulfilled", value: { license } });

// This project does not run vitest with `globals: true`, so RTL's
// auto-cleanup never registers and rendered trees pile up in document.body
// between tests. Explicit teardown keeps screen queries honest.
afterEach(cleanup);

describe("LicenseUsageCard — when it stays silent", () => {
  it("renders nothing for a tenant the license rule doesn't apply to", () => {
    // MSP containers and the vendor root aggregate other tenants'
    // devices; a zeroed bar would imply they're at 0 of 0 licenses.
    const { container } = render(
      <LicenseUsageCard result={bundle({ exempt: true, used: 0, maxDevices: null })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing against a backend that predates the license block", () => {
    const { container } = render(
      <LicenseUsageCard result={{ status: "fulfilled", value: { totalHosts: 12 } }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the summary endpoint failed", () => {
    const { container } = render(
      <LicenseUsageCard result={{ status: "rejected", reason: new Error("boom") }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LicenseUsageCard — normal usage", () => {
  it("shows used over purchased without nagging", () => {
    // ADR-0005: 49 of 50 is a fine place to be. State the numbers,
    // don't push an upsell.
    render(
      <LicenseUsageCard
        result={bundle({ used: 17, maxDevices: 50, upperLimit: 55, status: "NORMAL" })}
      />
    );
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("/ 50")).toBeInTheDocument();
    expect(screen.getByText(/33 of 50 licenses available/i)).toBeInTheDocument();
  });
});

describe("LicenseUsageCard — the states that cost money", () => {
  it("counts down remaining licenses when approaching the cap", () => {
    render(
      <LicenseUsageCard
        result={bundle({ used: 48, maxDevices: 50, upperLimit: 55, status: "APPROACHING_LIMIT" })}
      />
    );
    expect(screen.getByText(/2 licenses left/i)).toBeInTheDocument();
  });

  it("says how far over and when it gets reconciled", () => {
    render(
      <LicenseUsageCard
        result={bundle({ used: 53, maxDevices: 50, upperLimit: 55, status: "OVER_LIMIT" })}
      />
    );
    expect(screen.getByText(/3 over your plan/i)).toBeInTheDocument();
    expect(screen.getByText(/anniversary/i)).toBeInTheDocument();
  });

  it("states plainly that enrollment has stopped once grace is gone", () => {
    render(
      <LicenseUsageCard
        result={bundle({ used: 55, maxDevices: 50, upperLimit: 55, status: "GRACE_EXHAUSTED" })}
      />
    );
    expect(screen.getByText(/5-device grace margin is used up/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot enroll/i)).toBeInTheDocument();
  });

  it("names an unconfigured cap instead of showing it as zero licenses", () => {
    render(
      <LicenseUsageCard
        result={bundle({ used: 12, maxDevices: null, upperLimit: null, status: "NOT_CONFIGURED" })}
      />
    );
    expect(screen.getByText(/no licensed device count is recorded/i)).toBeInTheDocument();
  });
});

describe("LicenseUsageCard — drilldown", () => {
  it("takes the operator to enrollment tokens, where the limit bites", () => {
    const onNavigate = vi.fn();
    render(
      <LicenseUsageCard
        result={bundle({ used: 55, maxDevices: 50, upperLimit: 55, status: "GRACE_EXHAUSTED" })}
        onNavigate={onNavigate}
      />
    );
    return userEvent.click(screen.getByRole("button")).then(() => {
      expect(onNavigate).toHaveBeenCalledWith("tokens");
    });
  });

  it("is not clickable when no navigation handler is wired", () => {
    const { container } = render(
      <LicenseUsageCard
        result={bundle({ used: 17, maxDevices: 50, upperLimit: 55, status: "NORMAL" })}
      />
    );
    expect(within(container).queryByRole("button")).toBeNull();
  });
});
