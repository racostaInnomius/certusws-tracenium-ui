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

function rgb(color) {
  if (color.startsWith("#")) {
    return { c: [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)), a: 1 };
  }
  const [r, g, b, a = 1] = color.match(/[\d.]+/g).map(Number);
  return { c: [r, g, b], a };
}

function overWhite(color) {
  const { c, a } = rgb(color);
  return c.map((v) => 255 - a * (255 - v));
}

function contrastRatio(fg, bgChannels) {
  const lum = (channels) =>
    channels
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [hi, lo] = [lum(rgb(fg).c), lum(bgChannels)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
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
    expect(ALERT_TONES.info.fg).toBe(BRAND.alert.infoText);
    expect(ALERT_TONES.success.fg).toBe(BRAND.alert.successText);
  });

  // El fondo es translúcido: el contraste real es contra ese rgba compuesto
  // sobre el papel blanco, no contra blanco (ahí `tealText` pasaba y aquí no).
  for (const [severity, { fg, bg }] of Object.entries(ALERT_TONES)) {
    it(`${severity}: el texto cumple WCAG AA (4,5:1) sobre su fondo`, () => {
      expect(contrastRatio(fg, overWhite(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }

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
