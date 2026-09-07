import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import SectionFields from "./SectionFields";
import { FIELD_SPECS, getFormValue, overriddenKeys, resetSectionTo, setFormValue, specsFor } from "./fieldSpecs";
import { readFormFromPolicy } from "../Policies/policyTransforms";

const CATALOG = [
  { key: "amp", required: true },
  { key: "scp", impliesModule: "compliance" },
  { key: "rcp", impliesModule: "remoteControl" },
  { key: "cdp" },
];

function tenantForm() {
  return readFormFromPolicy(
    {
      plugins: { enabled: ["amp", "scp", "rcp", "cdp"] },
      update: { intervalSeconds: 21600 },
      features: { selfUpdate: true, remoteShell: true, remoteFile: true },
      rcp: { file: { roots: ["/home"] } },
      remoteControl: { maxUploadBytes: 1048576 },
    },
    CATALOG
  );
}

describe("field specs", () => {
  it("every key reads from the form readFormFromPolicy builds, with no typos", () => {
    const form = readFormFromPolicy({}, CATALOG);
    for (const [section, specs] of Object.entries(FIELD_SPECS)) {
      for (const spec of specs) {
        const [a] = spec.key.split(".");
        expect(form, `${section}: ${spec.key}`).toHaveProperty(a);
        // set → get round-trip on an immutable copy
        const next = setFormValue(form, spec.key, "x");
        expect(getFormValue(next, spec.key)).toBe("x");
        expect(getFormValue(form, spec.key)).not.toBe("x");
      }
    }
  });

  it("each plugin section has rows and the shared features block is split between agent and rcp", () => {
    expect(specsFor("agent").map((s) => s.key)).toContain("features.selfUpdate");
    expect(specsFor("rcp").map((s) => s.key)).toContain("features.remoteShell");
    expect(specsFor("agent").map((s) => s.key)).not.toContain("features.remoteShell");
    expect(specsFor("rcp").map((s) => s.key)).toContain("remoteControl.maxUploadBytes");
  });
});

describe("SectionFields in tenant scope", () => {
  it("renders one row per visible spec with a dash in the provenance column", () => {
    const onChange = vi.fn();
    render(<SectionFields sectionId="agent" form={tenantForm()} onChange={onChange} />);
    const list = screen.getByRole("list", { name: "agent settings" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByLabelText("Update probe interval")).toHaveValue(21600);
    expect(screen.queryByText("Inherits · Tenant")).toBeNull();
    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ update: { intervalSeconds: 7200 } }));
  });

  it("hides rows behind their switch and flags an out-of-range value inline", () => {
    const form = tenantForm();
    const { rerender } = render(<SectionFields sectionId="rcp" form={{ ...form, features: { ...form.features, remoteFile: false } }} onChange={() => {}} />);
    expect(screen.queryByLabelText("Allowed roots")).toBeNull();
    rerender(<SectionFields sectionId="rcp" form={form} onChange={() => {}} />);
    expect(screen.getByLabelText("Allowed roots")).toHaveValue("/home");
    rerender(<SectionFields sectionId="agent" form={{ ...form, update: { intervalSeconds: 5 } }} onChange={() => {}} />);
    expect(screen.getByText(/Must be between 60 and 86400/)).toBeInTheDocument();
  });

  it("warns while a fail-closed switch is on, y dice a QUÉ alcanza", () => {
    // ⚠️ El aviso decía "every remote session REFUSED", y era verdad: el
    // consentimiento se pedía también antes de una shell o una
    // transferencia. En un servidor virtual no hay nadie que conteste, así
    // que el aviso vencía solo y la sesión moría por `consent_timeout`.
    // Desde el 2026-09-07 solo alcanza a la pantalla, y el texto tiene que
    // decirlo: un aviso que exagera su radio se acaba ignorando entero.
    const form = tenantForm();
    render(<SectionFields sectionId="rcp" form={{ ...form, features: { ...form.features, remoteRequireConsent: true } }} onChange={() => {}} />);

    const aviso = screen.getByText(/REFUSED/);
    expect(aviso.textContent).toMatch(/Screen sessions/i);
    expect(aviso.textContent).not.toMatch(/every remote session/i);
    // Y dice cómo tenerlo encendido para los portátiles y apagado para los
    // servidores, que es la pregunta que sigue a encenderlo.
    expect(aviso.textContent).toMatch(/Apply to devices/i);
  });

  it("⚠️ la descripción no promete que se pregunte en una shell", () => {
    // Decía "before a session opens". Quien lo lea tiene que saber que una
    // shell contra un servidor NO va a preguntar a nadie — porque no hay
    // nadie— y que eso lo gobierna el vistobueno, no esto.
    const form = tenantForm();
    render(<SectionFields sectionId="rcp" form={form} onChange={() => {}} />);
    // Sale dos veces —la descripción de la fila y el resumen de la sección—,
    // así que se miran todas y basta con que lo diga alguna.
    const subs = screen.getAllByText(/Screen sharing only/i);
    expect(subs.some((el) => /Shell and file sessions do not ask/i.test(el.textContent))).toBe(true);
  });
});

describe("SectionFields in device scope", () => {
  it("says which rows inherit and which override, and puts a row back to inheriting", () => {
    const tenant = tenantForm();
    const device = { ...tenant, update: { intervalSeconds: 7200 } };
    const onChange = vi.fn();
    render(<SectionFields sectionId="agent" form={device} onChange={onChange} scope="device" compareForm={tenant} />);
    expect(screen.getAllByText("Inherits · Tenant")).toHaveLength(3);
    expect(screen.getByText("Override")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back to inherit/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ update: { intervalSeconds: 21600 } }));
    expect(overriddenKeys("agent", device, tenant)).toEqual(["update.intervalSeconds"]);
    expect(overriddenKeys("agent", resetSectionTo("agent", device, tenant), tenant)).toEqual([]);
  });

  it("treats blank and null as the same 'unset' value", () => {
    const tenant = tenantForm();
    expect(overriddenKeys("sdp", { ...tenant, sdp: { bandwidthLimitKbps: "" } }, { ...tenant, sdp: { bandwidthLimitKbps: null } })).toEqual([]);
  });
});
