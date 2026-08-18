// DistributionTab.reachability.test.jsx
//
// The reachability banner is the whole point of the backend coverage check: a
// warning nobody sees is the same as no warning.
//
// Background: a site declares "these subnets reach this DP over the LAN".
// Nothing verified that claim, and on 2026-08-17 site CASTICO declared both
// 10.130.130.0/24 and 10.10.17.0/24 with its DP on 10.130.130.5. A target on
// 10.10.17.204 was handed that DP, the firewall dropped the connection, and
// the install hung for half an hour with no error anywhere. Everything needed
// to predict it was already in the control plane — nobody was told.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import DistributionTab from "./DistributionTab";
import * as api from "../../api/softwareDelivery";

vi.mock("../../api/softwareDelivery");

const SITE = {
  id: 1,
  name: "CASTICO",
  matchSubnets: ["10.130.130.0/24", "10.10.17.0/24"],
  matchTag: null,
  isActive: true,
};
const DP = {
  id: 1,
  siteId: 1,
  agentId: "dp-wsus",
  lanUrl: null,
  status: "active",
  lastSeenAt: new Date().toISOString(),
};

// No global auto-cleanup in this suite's setup: without this the first
// render's banner survives into the next test and every "should not appear"
// assertion passes or fails for the wrong reason.
afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.resetAllMocks();
  api.listSites.mockResolvedValue({ items: [SITE] });
  api.listDistributionPoints.mockResolvedValue({ items: [DP] });
});

describe("DistributionTab reachability warning", () => {
  it("shows the warning naming the unreachable subnet", async () => {
    api.getDistributionReachability.mockResolvedValue({
      items: [
        {
          siteId: 1,
          siteName: "CASTICO",
          dpAgentId: "dp-wsus",
          dpIp: "10.130.130.5",
          uncoveredSubnets: ["10.10.17.0/24"],
          code: "dp_outside_site_subnets",
          message:
            'Distribution point dp-wsus (10.130.130.5) is outside 10.10.17.0/24 in site "CASTICO". ' +
            "Devices on that subnet must cross network boundaries to reach it — confirm the DP port " +
            "is open, or give those subnets their own distribution point.",
        },
      ],
    });

    render(<DistributionTab canManage notify={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/may be unreachable/i)).toBeInTheDocument();
    });
    // Anchor on THIS banner: the subnet and DP id also render in the tables
    // below, and the tab has other alerts of its own, so neither a bare text
    // match nor getByRole("alert") would prove anything about this warning.
    const alert = screen.getByText(/may be unreachable/i).closest('[role="alert"]');
    expect(alert).toHaveTextContent("10.10.17.0/24");
    expect(alert).toHaveTextContent("dp-wsus");
    expect(alert).toHaveTextContent(/confirm the DP port is open/i);
  });

  it("stays out of the way when every DP covers its site", async () => {
    api.getDistributionReachability.mockResolvedValue({ items: [] });
    render(<DistributionTab canManage notify={() => {}} />);
    await waitFor(() => expect(screen.getAllByText("CASTICO").length).toBeGreaterThan(0));
    expect(screen.queryByText(/may be unreachable/i)).not.toBeInTheDocument();
  });

  it("renders the tab even if the reachability call fails", async () => {
    // Advisory data must never be able to break the page it decorates.
    api.getDistributionReachability.mockRejectedValue(new Error("boom"));
    render(<DistributionTab canManage notify={() => {}} />);
    await waitFor(() => expect(screen.getAllByText("CASTICO").length).toBeGreaterThan(0));
    expect(screen.queryByText(/may be unreachable/i)).not.toBeInTheDocument();
  });
});
