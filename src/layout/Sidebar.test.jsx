import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

/**
 * EL ORDEN DEL MENÚ LATERAL.
 *
 * Se fija aquí porque es acordado con el usuario y se rompe sin que nada falle:
 * añadir una entrada nueva es una línea en un array, y el sitio donde se pone
 * no lo comprueba nadie. Un menú que cambia de orden solo obliga a releerlo
 * entero cada vez.
 *
 * Los tres bloques responden a criterios DISTINTOS, y por eso se prueban por
 * separado en vez de con una sola lista larga:
 *
 *   · los plugins van en el orden del ciclo de vida de un equipo (no
 *     alfabético: cuenta una historia);
 *   · los transversales y la administración van alfabéticos, porque no hay
 *     historia que contar y cualquier otro criterio sería inventado.
 */

// El Sidebar tiene dos formas: barra fija en escritorio y Drawer en móvil (que
// con `mobileOpen=false` no pinta nada). Se fuerza la de escritorio dando a
// jsdom el `matchMedia` que no trae — mockear `useMediaQuery` no serviría: el
// componente lo importa por nombre desde "@mui/material", no del submódulo.
window.matchMedia = (query) => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

let auth = {};
vi.mock("../auth/AuthContext", () => ({ useAuthContext: () => ({ auth }) }));
vi.mock("../msp/MspContext", () => ({ useMsp: () => ({ activeTenant: null }) }));
vi.mock("../api/tenants", () => ({ getTenantById: async () => ({}) }));
vi.mock("../auth/logout", () => ({ performLogout: () => {} }));

import Sidebar from "./Sidebar";

const asRole = (role) => ({ tenantMember: { role, isActive: true } });

afterEach(cleanup);

/** Las etiquetas de navegación, en el orden en que se pintan. */
function menu() {
  return screen
    .getAllByRole("button")
    .map((b) => b.textContent.trim())
    .filter((t) => t && t !== "Logout");
}

/** Lo que hay entre dos marcas, sin incluirlas. */
function between(labels, from, to) {
  const i = labels.findIndex((l) => l.startsWith(from));
  const j = to ? labels.findIndex((l) => l.startsWith(to)) : labels.length;
  return labels.slice(i + 1, j === -1 ? labels.length : j);
}

describe("los plugins, en orden de ciclo de vida", () => {
  it("van entre Overview y Alerts, en el orden acordado", () => {
    auth = asRole("OWNER");
    render(<Sidebar selected="overview" />);

    const plugins = between(menu(), "Overview", "Alerts");

    expect(plugins).toEqual([
      "Asset Management",
      "Software Delivery",
      "Security Compliance",
      "Remote Control",
      "Patch Management",
      "Crypto DiscoveryBeta",
      "MDM / MAMBeta",
    ]);
  });

  it("Remote Control ya no lleva la pastilla de Beta", () => {
    // Crypto Discovery y MDM/MAM sí la conservan: siguen siéndolo.
    auth = asRole("OWNER");
    render(<Sidebar selected="overview" />);

    const rc = screen.getByText("Remote Control").closest("div[role='button']");
    expect(within(rc).queryByText("Beta")).toBeNull();
    expect(screen.getByText("Crypto Discovery").closest("div[role='button']").textContent)
      .toContain("Beta");
  });
});

describe("los transversales, alfabéticos", () => {
  it("Alerts, Jobs, Reports", () => {
    auth = asRole("OWNER");
    render(<Sidebar selected="overview" />);

    expect(between(menu(), "Alerts", "Audit")).toEqual(["Jobs", "Reports"]);
  });
});

describe("Administration", () => {
  it("va al final y en orden alfabético", () => {
    auth = asRole("OWNER");
    render(<Sidebar selected="overview" />);

    expect(between(menu(), "Reports")).toEqual([
      "Audit",
      "Billing",
      "Device Enrollment",
      "Settings",
    ]);
  });

  // PKI salió del menú: es una tarjeta de Settings › Tenant Settings. La
  // clave `pki` sigue en pageRegistry, así que ?page=pki y los marcadores
  // existentes no se rompen — sólo desaparece la entrada del menú.
  //
  // ⚠️ Efecto colateral asumido: Settings se gatea con isPrivileged
  // (OWNER/ADMIN), y el backend de PKI gatea por CAPACIDAD. Un rol
  // personalizado con la capacidad `pki` pero sin ser OWNER/ADMIN pierde
  // el punto de entrada visible, aunque el servidor le deje entrar por el
  // enlace directo.
  it("PKI ya no está en el menú lateral", () => {
    auth = asRole("OWNER");
    render(<Sidebar selected="overview" />);
    // (Crypto Discovery, que NO es lo mismo —inventaría los certificados
    // que hay EN los equipos—, sigue arriba entre las áreas de producto;
    // aquí no aparece porque este fixture no habilita su plugin.)
    expect(menu()).not.toContain("PKI");
  });

  it("⚠️ estar bajo Administration NO significa ser sólo para admins", () => {
    // Audit y Device Enrollment se muestran SIEMPRE: sus rutas de backend
    // gatean por CAPACIDAD desde ADR-0011 Phase 3, no por rol. Esconderlas a
    // quien no es OWNER/ADMIN dejaría fuera a un rol personalizado que TIENE
    // la capacidad y al que el servidor sí deja entrar — la regresión que esa
    // fase vino a arreglar. El grupo dice "esto se toca de vez en cuando", no
    // "esto es de administradores".
    auth = asRole("MEMBER");
    render(<Sidebar selected="overview" />);

    const labels = menu();
    expect(labels).toContain("Audit");
    expect(labels).toContain("Device Enrollment");
  });

  it("Settings sigue siendo OWNER/ADMIN, y Billing sólo OWNER", () => {
    // Su backend todavía gatea por rol (requireRole), así que enseñarlas a
    // quien no puede entrar sería ofrecer una puerta que devuelve 403.
    auth = asRole("MEMBER");
    render(<Sidebar selected="overview" />);
    expect(menu()).not.toContain("Settings");
    expect(menu()).not.toContain("Billing");

    cleanup();
    auth = asRole("ADMIN");
    render(<Sidebar selected="overview" />);
    expect(menu()).toContain("Settings");
    expect(menu()).not.toContain("Billing");

    cleanup();
    auth = asRole("OWNER");
    render(<Sidebar selected="overview" />);
    expect(menu()).toContain("Billing");
  });
});

describe("los separadores", () => {
  it("hay tres, y el de Administration es el único con nombre", () => {
    // Los otros dos separan sin etiquetar a propósito: "Plugins" y
    // "Transversales" son vocabulario nuestro, no del cliente.
    auth = asRole("OWNER");
    const { container } = render(<Sidebar selected="overview" />);

    expect(container.querySelectorAll("hr")).toHaveLength(3);
    expect(screen.getByText("Administration")).toBeTruthy();
  });
});
