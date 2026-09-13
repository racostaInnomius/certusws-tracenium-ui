import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Alert } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import traceniumMuiTheme, { ALERT_TONES } from "./traceniumMuiTheme";
import { BRAND, ROLE } from "./brand";

afterEach(cleanup);

// jsdom normaliza los colores de getComputedStyle a rgb()/rgba().
function toCss(color) {
  const probe = document.createElement("div");
  probe.style.color = color;
  return probe.style.color;
}

function renderAlert(severity, variant) {
  const { container } = render(
    <ThemeProvider theme={traceniumMuiTheme}>
      <Alert severity={severity} variant={variant}>
        mensaje
      </Alert>
    </ThemeProvider>,
  );
  const root = container.querySelector(".MuiAlert-root");
  return { root: getComputedStyle(root), icon: getComputedStyle(container.querySelector(".MuiAlert-icon")) };
}

describe("MuiAlert en el tema", () => {
  it("usa los tokens de texto opacos de brand.js", () => {
    expect(ALERT_TONES.error.fg).toBe(BRAND.alert.errorText);
    expect(ALERT_TONES.warning.fg).toBe(BRAND.alert.warningText);
    expect(ALERT_TONES.info.fg).toBe(BRAND.tealText);
    expect(ALERT_TONES.success.fg).toBe(ROLE.positive);
  });

  for (const severity of Object.keys(ALERT_TONES)) {
    it(`standard ${severity}: texto e icono opacos, fondo suave`, () => {
      const { fg, bg } = ALERT_TONES[severity];
      const { root, icon } = renderAlert(severity, "standard");
      expect(root.color).toBe(toCss(fg));
      // Regresión medida en navegador: rgba(90, 50, 48, 0.22).
      expect(root.color).not.toMatch(/rgba/);
      expect(root.backgroundColor).toBe(toCss(bg));
      expect(icon.color).toBe(toCss(fg));
    });

    it(`outlined ${severity}: texto e icono opacos`, () => {
      const { fg } = ALERT_TONES[severity];
      const { root, icon } = renderAlert(severity, "outlined");
      expect(root.color).toBe(toCss(fg));
      expect(icon.color).toBe(toCss(fg));
    });
  }

  it("no cambia palette.*.light (relleno suave para el resto)", () => {
    const { palette } = traceniumMuiTheme;
    expect(palette.error.light).toBe(ROLE.criticalSoft);
    expect(palette.warning.light).toBe(ROLE.cautionSoft);
    expect(palette.info.light).toBe(BRAND.tealSoftStrong);
    expect(palette.success.light).toBe(ROLE.positiveSoft);
  });
});
