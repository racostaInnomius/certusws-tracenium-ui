import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, respond } from "../../test/msw/server";
import ReportParamsDialog from "./ReportParamsDialog";
import { validateParams } from "./reportParams";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const PARAMS = [
  { name: "framework", label: "Framework", kind: "framework", required: true },
  { name: "from", label: "From month", kind: "month", required: true },
  { name: "to", label: "To month", kind: "month", required: true },
  { name: "assetGroupId", label: "Asset group", kind: "asset_group", required: false },
];
const TYPE = { key: "scp.evidence-pack", label: "Evidence Pack", formats: ["pdf", "json"], params: PARAMS };

describe("validateParams", () => {
  it("required, formato de mes y orden del periodo", () => {
    expect(validateParams(PARAMS, {})).toMatchObject({ framework: "Required", from: "Required", to: "Required" });
    expect(validateParams(PARAMS, { framework: "x", from: "2026-1", to: "2026-08" }).from).toBe("Use YYYY-MM");
    expect(validateParams(PARAMS, { framework: "x", from: "2026-08", to: "2026-01" }).to).toMatch(/before/);
    expect(validateParams(PARAMS, { framework: "x", from: "2026-01", to: "2026-08" })).toEqual({});
  });
});

describe("ReportParamsDialog", () => {
  it("carga frameworks y grupos, preselecciona SOC 2 y devuelve los valores", async () => {
    respond("get", "/api/v1/security/compliance/frameworks", {
      ok: true,
      frameworks: [
        { framework: "cis_windows_11_v5.1.0", shortName: "CIS Windows 11 v5.1.0" },
        { framework: "soc2_tsc_2017", shortName: "SOC 2 (TSC 2017)" },
      ],
    });
    respond("get", "/api/v1/asset-groups", { ok: true, items: [{ id: 12, name: "Crown jewels" }] });
    const onSubmit = vi.fn();
    render(<ReportParamsDialog open reportType={TYPE} format="pdf" onClose={() => {}} onSubmit={onSubmit} />);

    // El framework se preselecciona a SOC 2 en cuanto llega la lista.
    await waitFor(() => expect(screen.getByLabelText("Framework")).toHaveTextContent("SOC 2 (TSC 2017)"));

    const from = screen.getByLabelText("From month");
    const to = screen.getByLabelText("To month");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-06");
    await userEvent.clear(to);
    await userEvent.type(to, "2026-08");

    await userEvent.click(screen.getByLabelText("Asset group"));
    await userEvent.click(await screen.findByRole("option", { name: "Crown jewels" }));

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onSubmit).toHaveBeenCalledWith({ framework: "soc2_tsc_2017", from: "2026-06", to: "2026-08", assetGroupId: "12" });
  });

  it("no envía con el periodo al revés y enseña el error", async () => {
    respond("get", "/api/v1/security/compliance/frameworks", { ok: true, frameworks: [{ framework: "soc2_tsc_2017", shortName: "SOC 2" }] });
    respond("get", "/api/v1/asset-groups", { ok: true, items: [] });
    const onSubmit = vi.fn();
    render(<ReportParamsDialog open reportType={TYPE} format="json" onClose={() => {}} onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getByLabelText("Framework")).toHaveTextContent("SOC 2"));
    const from = screen.getByLabelText("From month");
    const to = screen.getByLabelText("To month");
    await userEvent.clear(from); await userEvent.type(from, "2026-08");
    await userEvent.clear(to); await userEvent.type(to, "2026-01");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Must not be before/)).toBeInTheDocument();
  });

  it("los tipos sin params ni siquiera piden datos", () => {
    const { container } = render(<ReportParamsDialog open={false} reportType={null} onClose={() => {}} onSubmit={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(within(document.body).queryByRole("dialog")).toBeNull();
  });
});

// ── Familias en el selector del pack ──────────────────────────────────
// El pack acepta `family:cis`; el selector enseña "CIS Benchmarks" una vez,
// no un benchmark por SO, cuando el backend manda `families`.
describe("ReportParamsDialog — familias", () => {
  it("lista las familias y manda la clave family:cis", async () => {
    respond("get", "/api/v1/security/compliance/frameworks", {
      ok: true,
      frameworks: [
        { framework: "cis_windows_11_v5.1.0", shortName: "CIS Windows 11" },
        { framework: "cis_ubuntu_24_v2.0.0", shortName: "CIS Ubuntu 24.04" },
        { framework: "soc2_tsc_2017", shortName: "SOC 2 (TSC 2017)" },
      ],
      families: [
        { family: "cis", label: "CIS Benchmarks", key: "family:cis", frameworks: ["cis_ubuntu_24_v2.0.0", "cis_windows_11_v5.1.0"] },
        { family: "aicpa_soc2", label: "SOC 2 (TSC 2017)", key: "soc2_tsc_2017", frameworks: ["soc2_tsc_2017"] },
      ],
    });
    respond("get", "/api/v1/asset-groups", { ok: true, items: [] });
    const onSubmit = vi.fn();
    render(<ReportParamsDialog open reportType={TYPE} format="pdf" onClose={() => {}} onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getByLabelText("Framework")).toHaveTextContent("SOC 2 (TSC 2017)"));

    await userEvent.click(screen.getByLabelText("Framework"));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "CIS Benchmarks (2 benchmarks)" })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: "CIS Windows 11" })).toBeNull();
    await userEvent.click(within(listbox).getByRole("option", { name: "CIS Benchmarks (2 benchmarks)" }));

    const from = screen.getByLabelText("From month");
    const to = screen.getByLabelText("To month");
    await userEvent.clear(from); await userEvent.type(from, "2026-07");
    await userEvent.clear(to); await userEvent.type(to, "2026-08");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onSubmit).toHaveBeenCalledWith({ framework: "family:cis", from: "2026-07", to: "2026-08" });
  });
});
