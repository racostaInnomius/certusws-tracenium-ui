// src/components/Compliance/ComplianceCatalogDialog.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";

vi.mock("../../api/compliance", () => ({
  getComplianceCatalog: vi.fn(),
}));
import { getComplianceCatalog } from "../../api/compliance";
import ComplianceCatalogDialog from "./ComplianceCatalogDialog";

const CHECKS = {
  ok: true,
  count: 3,
  checks: [
    {
      checkId: "linux.ssh.strong_ciphers_only",
      title: "SSH should offer only strong ciphers",
      description: "The effective ciphers list must exclude CBC.",
      category: "crypto",
      platform: "linux",
      severity: "high",
      remediationType: "manual",
      remediationSummary: "Restrict SSH ciphers.",
      remediationDetails: { steps: ["Edit sshd_config", "Reload sshd"] },
      collectorPlugin: "scp",
      collectorVersionMin: "1.1.0",
      frameworks: [
        { framework: "nist_800_53_rev5", controlId: "SC-13", controlTitle: "Cryptographic Protection", controlLevel: "baseline", referenceUrl: "https://example/sc-13" },
        { framework: "stig_ubuntu_22", controlId: "V-260000", controlTitle: "SSH ciphers", controlLevel: "CAT II", referenceUrl: null },
      ],
    },
    {
      checkId: "macos.ssh.strong_ciphers_only",
      title: "SSH should offer only strong ciphers",
      category: "crypto",
      platform: "macos",
      severity: "high",
      frameworks: [],
    },
    {
      checkId: "linux.mounts.tmp_noexec",
      title: "/tmp should be mounted with noexec",
      category: "filesystem_hardening",
      platform: "linux",
      severity: "medium",
      frameworks: [],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ComplianceCatalogDialog", () => {
  it("loads and lists catalog checks with a total count", async () => {
    getComplianceCatalog.mockResolvedValue(CHECKS);
    render(<ComplianceCatalogDialog open onClose={() => {}} />);

    expect(await screen.findByText("linux.ssh.strong_ciphers_only")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 checks")).toBeInTheDocument();
    // Framework chips rendered from the mappings — incl. STIG (family + CAT level).
    expect(screen.getByText(/NIST SC-13/)).toBeInTheDocument();
    expect(screen.getByText(/STIG V-260000 · CAT II/)).toBeInTheDocument();
  });

  it("filters by platform", async () => {
    getComplianceCatalog.mockResolvedValue(CHECKS);
    render(<ComplianceCatalogDialog open onClose={() => {}} />);
    await screen.findByText("linux.ssh.strong_ciphers_only");

    // Open the Platform select and pick macOS.
    fireEvent.mouseDown(screen.getByLabelText("Platform"));
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("macOS"));

    await waitFor(() => expect(screen.getByText("1 of 3 checks")).toBeInTheDocument());
    expect(screen.getByText("macos.ssh.strong_ciphers_only")).toBeInTheDocument();
    expect(screen.queryByText("linux.mounts.tmp_noexec")).toBeNull();
  });

  it("searches by check id / title", async () => {
    getComplianceCatalog.mockResolvedValue(CHECKS);
    render(<ComplianceCatalogDialog open onClose={() => {}} />);
    await screen.findByText("linux.ssh.strong_ciphers_only");

    fireEvent.change(screen.getByPlaceholderText("Search check id / title"), { target: { value: "mounts" } });

    await waitFor(() => expect(screen.getByText("1 of 3 checks")).toBeInTheDocument());
    expect(screen.getByText("linux.mounts.tmp_noexec")).toBeInTheDocument();
  });

  it("does not fetch until opened", () => {
    getComplianceCatalog.mockResolvedValue(CHECKS);
    render(<ComplianceCatalogDialog open={false} onClose={() => {}} />);
    expect(getComplianceCatalog).not.toHaveBeenCalled();
  });
});
