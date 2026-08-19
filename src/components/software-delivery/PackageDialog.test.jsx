// src/components/software-delivery/PackageDialog.test.jsx
//
// Sprint 2 — component tests for the SDP catalog create/edit dialog.
//
// The dialog is "dumb" (no API calls): it validates the form and calls
// onSubmit(payload). So these tests are pure RTL + user-event, no MSW.
// The focus is the load-bearing logic that used to be labelled
// "out of scope, lives in the component" in Sprint 1:
//   * sha256 hex64 validation
//   * platform → format conditioning
//   * expectedExitCodes CSV parsing (incl. edge cases)
//
// NOTE on selectors: MUI's outlined TextField renders the field label
// twice (a <label> and the notched-outline <legend>), so getByLabelText
// returns "multiple elements". We use getByRole('textbox'|'combobox',
// { name }) instead, which resolves to the single control.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PackageDialog from "./PackageDialog";

// vitest.config.js does not set `globals: true`, so RTL's automatic
// afterEach cleanup never registers. Component suites must unmount
// explicitly or the previous test's DOM leaks into the next one
// ("Found multiple elements"). Do it locally to avoid touching shared
// test config.
afterEach(cleanup);

const VALID_SHA = "a".repeat(64); // 64 hex chars

const textbox = (name) => screen.getByRole("textbox", { name });
const combobox = (name) => screen.getByRole("combobox", { name });

// user-event types char-by-char; a 64-char sha256 with the default
// per-keystroke delay blows the 5s test timeout. delay:null removes it.
const setupUser = () => userEvent.setup({ delay: null });

// The sha256 field is long; fireEvent.change sets it in one shot (the
// component only reads e.target.value, no per-key logic to exercise).
function setSha(value) {
  fireEvent.change(textbox(/sha256/), { target: { value } });
}

function renderDialog(props = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <PackageDialog
      open
      mode="create"
      item={null}
      submitting={false}
      onClose={onClose}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onSubmit, onClose, ...utils };
}

// Fill the always-required identity/distribution fields with valid data
// so that a submit only fails on the field a given test is exercising.
// The Download URL is 35 chars, and `user.type` re-renders the whole MUI
// Dialog once per keystroke. Together with Name/Version that was ~44
// renders per test across 12 tests, which pushed this file past the 15s
// testTimeout on a loaded machine (observed: 17s) — a flake with no
// diagnostic value, since the field has no per-key logic to exercise
// (the component only reads e.target.value). Same reasoning as setSha
// above, so it gets the same one-shot treatment.
//
// Name and Version stay as real typing: they're short (9 keystrokes
// total) and keep some genuine user-interaction coverage in the helper.
function setUrl(value) {
  fireEvent.change(textbox(/Download URL/), { target: { value } });
}

async function fillRequiredValid(user) {
  await user.type(textbox(/^Name/), "7zip");
  await user.type(textbox(/^Version/), "23.01");
  setUrl("https://blob.tracenium.com/7zip.msi");
  setSha(VALID_SHA);
}

describe("PackageDialog — sha256 validation", () => {
  it("accepts a 64-char hex string and submits normalized (lowercase)", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog();
    await fillRequiredValid(user);

    setSha("A".repeat(64)); // uppercase hex — valid, lowercased on submit

    await user.click(screen.getByRole("button", { name: /Create/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].sha256).toBe("a".repeat(64));
  });

  it("rejects a 63-char hex string (too short) and does not submit", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog();
    await fillRequiredValid(user);

    setSha("a".repeat(63));

    await user.click(screen.getByRole("button", { name: /Create/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/sha256 must be a 64-char hex string/i)).toBeInTheDocument();
  });

  it("rejects a 64-char string containing a non-hex character", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog();
    await fillRequiredValid(user);

    setSha("g" + "a".repeat(63)); // 'g' is not hex

    await user.click(screen.getByRole("button", { name: /Create/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/sha256 must be a 64-char hex string/i)).toBeInTheDocument();
  });
});

describe("PackageDialog — platform ⇄ format conditioning", () => {
  it("defaults to windows → msi/exe format options", async () => {
    const user = setupUser();
    renderDialog();

    // Open the Format select; options are windows-family.
    await user.click(combobox(/^Format/));
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "msi" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "exe" })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: "pkg" })).not.toBeInTheDocument();
  });

  it("switching platform to macos snaps format to pkg and offers pkg/dmg", async () => {
    const user = setupUser();
    renderDialog();

    // Change Platform → macos.
    await user.click(combobox(/^Platform/));
    await user.click(screen.getByRole("option", { name: "macos" }));

    // Format value should have snapped away from msi (windows-only) to pkg.
    expect(combobox(/^Format/)).toHaveTextContent("pkg");

    // And the option list is the macos family.
    await user.click(combobox(/^Format/));
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "pkg" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "dmg" })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: "msi" })).not.toBeInTheDocument();
  });
});

describe("PackageDialog — expectedExitCodes CSV parse", () => {
  // The parser lives in the component (parseExitCodes). Sprint 1 deferred
  // it; now in scope. We drive it through onSubmit's payload since it isn't
  // exported. Default form value is "0, 3010".

  async function submitWithExitCodes(user, raw) {
    const field = textbox(/Expected exit codes/i);
    await user.clear(field);
    if (raw !== "") await user.type(field, raw);
    await user.click(screen.getByRole("button", { name: /Create/i }));
  }

  it('parses "0, 3010" → [0, 3010]', async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog();
    await fillRequiredValid(user);
    await submitWithExitCodes(user, "0, 3010");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].expectedExitCodes).toEqual([0, 3010]);
  });

  it("tolerates internal whitespace between values → [0, 1641, 3010]", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog();
    await fillRequiredValid(user);
    await submitWithExitCodes(user, "  0 ,  1641 , 3010 ");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].expectedExitCodes).toEqual([0, 1641, 3010]);
  });

  // HALLAZGO (bug real, documentado con actual behavior + it.fails abajo):
  // parseExitCodes hace split(",").map(Number). Number("") === 0 (NO NaN),
  // así que un token vacío por una coma final se convierte en 0 espurio.
  // Aquí ASSERTAMOS el comportamiento actual (buggy) para mantener verde.
  it("BUG: trailing comma injects a spurious 0 (PackageDialog.jsx:87)", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog();
    await fillRequiredValid(user);
    await submitWithExitCodes(user, "0, 1641, 3010, ");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Desired would be [0, 1641, 3010]; actual appends a phantom 0.
    expect(onSubmit.mock.calls[0][0].expectedExitCodes).toEqual([0, 1641, 3010, 0]);
  });

  // Same root cause, expressed as the fix we WANT: a trailing comma should
  // not add a 0. it.fails documents that the component does not yet do this.
  it.fails(
    "FIX WANTED: trailing comma should not inject a 0 (PackageDialog.jsx:87 parseExitCodes)",
    async () => {
      const user = setupUser();
      const { onSubmit } = renderDialog();
      await fillRequiredValid(user);
      await submitWithExitCodes(user, "0, 1641, 3010, ");

      expect(onSubmit.mock.calls[0][0].expectedExitCodes).toEqual([0, 1641, 3010]);
    }
  );

  // HALLAZGO (bug real): blanking the field does NOT trigger the "at least
  // one integer" validation, because parseExitCodes("") === [0] (Number("")
  // is 0). The operator can clear the field and silently deploy with
  // expectedExitCodes:[0]. Actual behavior asserted here (submits, no error).
  it("BUG: empty field defaults to [0] instead of erroring (PackageDialog.jsx:134)", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog();
    await fillRequiredValid(user);
    await submitWithExitCodes(user, "");

    // The intended guard (validate → "at least one integer") is bypassed.
    expect(
      screen.queryByText(/Expected exit codes must be at least one integer/i)
    ).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].expectedExitCodes).toEqual([0]);
  });

  // The fix we WANT: an empty field is invalid. it.fails documents the gap.
  it.fails(
    "FIX WANTED: empty exit codes should block submit (PackageDialog.jsx:134 validate)",
    async () => {
      const user = setupUser();
      const { onSubmit } = renderDialog();
      await fillRequiredValid(user);
      await submitWithExitCodes(user, "");

      expect(onSubmit).not.toHaveBeenCalled();
    }
  );

  it("all-non-numeric CSV → parses to empty → validation error", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog();
    await fillRequiredValid(user);
    await submitWithExitCodes(user, "abc, def");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Expected exit codes must be at least one integer/i)
    ).toBeInTheDocument();
  });

  // HALLAZGO documentado como it.fails: parseExitCodes usa Number()+isInteger,
  // así que "3.14" (float) se filtra pero "0x10" → Number("0x10")=16 se ACEPTA,
  // y "1e3" → 1000 también. Un CSV pensado como lista de enteros decimales
  // termina aceptando notación hex/exponencial silenciosamente. Parser frágil:
  // el operador escribe "1e3" por error y pasa como exit code 1000. Se marca
  // como comportamiento sorprendente, NO se arregla.
  it.fails(
    "FRAGILE PARSER: Number()-based parse silently accepts hex/exponential tokens (PackageDialog.jsx:87 parseExitCodes)",
    async () => {
      const user = setupUser();
      const { onSubmit } = renderDialog();
      await fillRequiredValid(user);
      await submitWithExitCodes(user, "0x10, 1e3");

      // We ASSERT the (desirable) strict behavior that only plain decimal
      // integers are accepted; the component FAILS this because Number()
      // coerces "0x10"→16 and "1e3"→1000. it.fails documents the gap.
      expect(onSubmit).not.toHaveBeenCalled();
    }
  );
});

describe("PackageDialog — edit mode seeding", () => {
  it("seeds fields from an existing item and joins exit codes back to CSV", async () => {
    const item = {
      name: "Firefox",
      version: "120.0",
      platform: "linux",
      arch: "x64",
      format: "deb",
      downloadPath: "https://blob.tracenium.com/firefox.deb",
      sha256: VALID_SHA,
      expectedExitCodes: [0, 100],
      isActive: true,
    };
    render(
      <PackageDialog
        open
        mode="edit"
        item={item}
        submitting={false}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(textbox(/^Name/)).toHaveValue("Firefox");
    expect(textbox(/Expected exit codes/i)).toHaveValue("0, 100");
    expect(combobox(/^Format/)).toHaveTextContent("deb");
  });
});

describe("PackageDialog — approve mode (AI intake review)", () => {
  const approveItem = {
    name: "7zip",
    version: "23.01",
    platform: "windows",
    arch: "any",
    format: "msi",
    downloadPath: "", // intake leaves this blank; backend mints a signed URL
    sha256: VALID_SHA,
    silentInstallArgs: "/qn /norestart",
    expectedExitCodes: [0, 3010],
    detectionRule: null,
  };

  it("allows a blank download URL and submits (backend mints the signed URL)", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({ mode: "approve", item: approveItem });

    await user.click(screen.getByRole("button", { name: /Approve & add to catalog/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].downloadPath).toBe("");
  });

  it("still rejects a non-https download URL when one is typed in approve mode", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({ mode: "approve", item: approveItem });

    await user.type(textbox(/Download URL/), "ftp://nope/app.msi");
    await user.click(screen.getByRole("button", { name: /Approve & add to catalog/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/must be an https URL/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Editing an intake-approved package
// ---------------------------------------------------------------------------
//
// Approving through AI intake stores `blob:<name>` as the download path — the
// backend mints a fresh signed URL from that exact string on every dispatch.
// The form used to demand https, so EVERY intake-approved package was
// impossible to edit: even just ticking Active off failed with "Download path
// must be an https URL". Every package in the live catalog is of this shape.

describe("PackageDialog — managed blob download paths", () => {
  const blobItem = {
    id: 7,
    name: "Tracenium Agent",
    version: "1.1.45",
    platform: "windows",
    arch: "x64",
    format: "msi",
    downloadPath: "blob:intake/111/4800de477c1bd99f/agent.msi",
    sha256: VALID_SHA,
    silentInstallArgs: "/qn /norestart",
    expectedExitCodes: [0, 3010],
    detectionRule: null,
    isActive: true,
  };

  it("saves an intake-approved package without demanding an https URL", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({ mode: "edit", item: blobItem });

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].downloadPath).toBe(blobItem.downloadPath);
    expect(screen.queryByText(/must be an https URL/i)).not.toBeInTheDocument();
  });

  it("shows the managed path read-only — hand-editing it would break delivery", () => {
    renderDialog({ mode: "edit", item: blobItem });
    const field = textbox(/Download source/i);
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveValue(blobItem.downloadPath);
  });

  it("keeps rejecting a non-https URL that the operator typed by hand", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      item: { ...blobItem, downloadPath: "https://cdn.example.com/a.msi" },
    });

    const field = textbox(/Download URL/i);
    await user.clear(field);
    await user.type(field, "ftp://nope/app.msi");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/must be an https URL/i)).toBeInTheDocument();
  });
});
