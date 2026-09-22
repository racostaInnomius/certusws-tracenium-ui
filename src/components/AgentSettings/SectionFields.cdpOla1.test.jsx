// src/components/AgentSettings/SectionFields.cdpOla1.test.jsx
//
// Los dos desplegables de alcance de CDP en Agent Settings. Lo que fija:
//   · ⭐ elegir «full» en las claves SSH de usuario saca un AVISO VISIBLE que
//     nombra los EDR y el documento de exclusiones — y NO bloquea el guardado
//     (es un valor válido, no un error);
//   · los otros modos no lo sacan;
//   · el desplegable escribe en la clave del formulario, no en otra;
//   · la ayuda de `fileDiscovery` dice los presupuestos y lo de root en Linux,
//     que es lo que explica una lista corta en un Linux sano.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectionFields from "./SectionFields";
import { setFormValue } from "./fieldSpecs";
import { readFormFromPolicy } from "../Policies/policyTransforms";

const CATALOG = [{ key: "cdp" }];
const formWith = (cdp = {}) => readFormFromPolicy({ plugins: { enabled: ["cdp"] }, cdp }, CATALOG);

afterEach(cleanup);

describe("cdp.sshUserKeys", () => {
  it("warns loudly about EDR detections when the mode is full, and names the exclusions doc", () => {
    render(<SectionFields sectionId="cdp" form={formWith({ sshUserKeys: "full" })} onChange={vi.fn()} />);
    const warning = screen.getByText(/opens private key files/i);
    expect(warning).toBeTruthy();
    expect(warning.textContent).toMatch(/CrowdStrike/);
    expect(warning.textContent).toMatch(/Defender/);
    expect(warning.textContent).toMatch(/SentinelOne/);
    expect(warning.textContent).toMatch(/docs\/EDR_EXCLUSIONS\.md/);
    // Se nombra el documento; no se copia su contenido aquí.
    expect(warning.textContent).not.toMatch(/Add-MpPreference|ExclusionPath/);
  });

  it.each([["public-only"], ["off"], [""]])("says nothing for %s", (mode) => {
    render(<SectionFields sectionId="cdp" form={formWith(mode ? { sshUserKeys: mode } : {})} onChange={vi.fn()} />);
    expect(screen.queryByText(/opens private key files/i)).toBeNull();
  });

  it("choosing a mode writes that form key and nothing else", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    const form = formWith();
    render(<SectionFields sectionId="cdp" form={form} onChange={onChange} />);
    // Desplegable de marca, no un <select> nativo: se abre y se elige.
    await user.click(screen.getByRole("combobox", { name: "SSH keys in user home directories" }));
    await user.click(screen.getByRole("option", { name: /^Off — collect no user SSH keys$/ }));
    expect(onChange).toHaveBeenCalledWith(setFormValue(form, "cdp.sshUserKeys", "off"));
  });
});

describe("cdp.fileDiscovery", () => {
  it("says what each mode walks, the budgets and why Linux reads less", () => {
    render(<SectionFields sectionId="cdp" form={formWith()} onChange={vi.fn()} />);
    const help = screen.getByText(/Each device stops after 45 seconds or 3000 files/i);
    expect(help.textContent).toMatch(/Default = the OS-specific roots/i);
    expect(help.textContent).toMatch(/Only the directories above = nothing but that list/i);
    expect(help.textContent).toMatch(/Off = no file walk at all/i);
    expect(help.textContent).toMatch(/does not run as root/i);
  });

  it("offers exactly the three values the backend accepts, plus «leave it to the agent»", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    const form = formWith();
    render(<SectionFields sectionId="cdp" form={form} onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Where to look for certificate files" }));
    expect(screen.getAllByRole("option")).toHaveLength(4);
    await user.click(screen.getByRole("option", { name: /^Only the directories above$/ }));
    expect(onChange).toHaveBeenCalledWith(setFormValue(form, "cdp.fileDiscovery", "configured"));
  });
});
