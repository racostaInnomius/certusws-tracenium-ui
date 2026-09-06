// src/components/software-delivery/PackageProvenanceDrawer.test.jsx
//
// Fase 3b: "de dónde salió este paquete" se contesta desde su fila del
// catálogo, no navegando a una pestaña.
//
// Lo que se fija aquí es que el panel diga la verdad en los tres estados que
// existen de verdad en producción — analizado con propuesta, analizado SIN
// propuesta, y sin análisis ninguno — porque el del medio era invisible.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import PackageProvenanceDrawer from "./PackageProvenanceDrawer";

const PKG = { id: 1, name: "WinZip", version: "27.0" };

const ANALYSED = {
  id: 9,
  packageId: 1,
  filename: "winzip.exe",
  sha256: "abc123def456abc123def456abc123def456abc123def456abc123def4560000",
  sizeBytes: 12 * 1024 * 1024,
  facts: {
    name: "WinZip",
    vendor: "WinZip Computing",
    version: "27.0",
    platform: "windows",
    format: "exe",
    installerType: "innosetup",
    productCode: null,
    detectionHint: "WinZip 27.0",
  },
  detectionSignals: ["pe:innosetup", "authenticode:present"],
  verification: {
    verdict: "warn",
    reasons: ["signature present but chain not verified"],
    signature: { signerCommonName: "WinZip Computing, Inc." },
  },
  proposedConfig: null,
  aiError: null,
};

afterEach(cleanup);

function open(props = {}) {
  return render(
    <PackageProvenanceDrawer open onClose={vi.fn()} pkg={PKG} intake={null} {...props} />
  );
}

describe("PackageProvenanceDrawer · el paquete analizado", () => {
  it("muestra el veredicto y quién lo firmó", () => {
    open({ intake: ANALYSED });
    expect(screen.getByText(/security verdict/i)).toBeInTheDocument();
    expect(screen.getByText(/WinZip Computing, Inc\./)).toBeInTheDocument();
    expect(screen.getByText(/chain not verified/i)).toBeInTheDocument();
  });

  it("muestra lo que el pipeline leyó del binario", () => {
    open({ intake: ANALYSED });
    expect(screen.getByText("innosetup")).toBeInTheDocument();
    expect(screen.getByText(/12\.0 MiB/)).toBeInTheDocument();
    expect(screen.getByText("pe:innosetup")).toBeInTheDocument();
  });

  // ⚠️ "no extraído" y "vacío" no son lo mismo. Que el pipeline mirara y no
  // encontrara el ProductCode ES información sobre el binario; dejar la celda
  // en blanco lo haría parecer un hueco de la UI.
  it("dice que un dato no se pudo extraer, en vez de dejarlo en blanco", () => {
    open({ intake: ANALYSED });
    const fila = screen.getByText("Product code").parentElement;
    expect(fila.textContent).toMatch(/not extracted/i);
  });
});

describe("PackageProvenanceDrawer · analizado pero SIN propuesta", () => {
  // ⚠️ ESTE ESTADO ERA INVISIBLE Y ES EL 100% DE LA PRODUCCIÓN ACTUAL.
  //
  // `IntakeProposalBanner` devuelve null cuando no hay propuesta, así que un
  // panel que sólo lo montara no diría absolutamente nada. El motivo vive en
  // `aiError` y hasta ahora sólo se veía consultando la base de datos: los
  // cuatro intakes que existen fallaron así, y el operador tecleó los
  // argumentos sin saber por qué no se los propusieron.
  it("dice que no hubo propuesta y por qué", () => {
    open({
      intake: {
        ...ANALYSED,
        proposedConfig: null,
        aiError: "Could not resolve authentication method",
      },
    });

    expect(screen.getByText(/no configuration was proposed/i)).toBeInTheDocument();
    expect(screen.getByText(/could not resolve authentication method/i)).toBeInTheDocument();
  });

  it("lo dice también cuando no se guardó el motivo", () => {
    open({ intake: { ...ANALYSED, proposedConfig: null, aiError: null } });
    expect(screen.getByText(/no configuration was proposed/i)).toBeInTheDocument();
  });

  it("cuando SÍ hay propuesta, muestra la confianza del modelo", () => {
    open({
      intake: {
        ...ANALYSED,
        proposedConfig: {
          silentInstallArgs: "/VERYSILENT",
          confidence: "high",
          notes: null,
          detectionRule: { type: "file_exists", path: "C:/x.exe" },
          expectedExitCodes: [0],
          requiresReboot: false,
          description: "x",
        },
      },
    });
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
    expect(screen.queryByText(/no configuration was proposed/i)).toBeNull();
  });
});

describe("PackageProvenanceDrawer · el paquete sin análisis", () => {
  // ⚠️ La ausencia ES la respuesta, y por eso el botón se ofrece en todas las
  // filas. Un paquete de la vía URL se validó sólo en la FORMA de sus campos;
  // esconder el panel dejaría al operador sin saber qué significa "Unverified".
  it("explica que nadie verificó nada, en vez de quedarse vacío", () => {
    open({ intake: null });
    expect(screen.getByText(/no analysis on record/i)).toBeInTheDocument();
    expect(screen.getByText(/supplied its hash and install arguments by hand/i)).toBeInTheDocument();
  });

  it("no inventa un veredicto de seguridad que no existe", () => {
    open({ intake: null });
    expect(screen.queryByText(/security verdict/i)).toBeNull();
    expect(screen.queryByText(/read from the binary/i)).toBeNull();
  });

  it("nombra el paquete que se está mirando", () => {
    open({ intake: null });
    expect(screen.getByText(/WinZip/)).toBeInTheDocument();
  });
});
