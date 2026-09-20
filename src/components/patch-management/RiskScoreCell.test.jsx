// src/components/patch-management/RiskScoreCell.test.jsx
//
// El score en la tabla. Lo que se fija es que el número se pueda EXPLICAR y
// que sus ausencias se digan:
//
//   · sin CVSS ni KEV no hay 0, hay «not scored» — un 0 afirma que no importa;
//   · sin EPSS el score vale igual pero está menos informado, y se marca: un
//     CVE recién publicado no es improbable, es desconocido;
//   · KEV se dice con palabras, porque es lo que explica por qué un 7,5 está
//     por encima de un 9,8.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RiskScoreCell, { explain } from "./RiskScoreCell";

const item = (over = {}) => ({
  cveId: "CVE-2024-38063",
  cvssScore: 9.8,
  epss: 0.94,
  epssPercentile: 0.999,
  riskScore: 899,
  riskBand: "high",
  knownExploited: false,
  kevOverdue: false,
  ...over,
});

afterEach(cleanup);

describe("la explicación", () => {
  it("dice de qué se compone el número", () => {
    const t = explain(item());
    expect(t).toMatch(/CVSS 9\.8/);
    expect(t).toMatch(/94\.0% chance of exploitation/);
    expect(t).toMatch(/higher than 100% of all CVEs/);
  });

  it("sin EPSS lo dice, en vez de dejar pensar que es improbable", () => {
    expect(explain(item({ epss: null, epssPercentile: null }))).toMatch(/no EPSS score yet/i);
  });

  it("KEV explica por qué adelanta a un CVSS más alto", () => {
    expect(explain(item({ knownExploited: true }))).toMatch(/outranks any CVSS/i);
    expect(explain(item({ knownExploited: true, kevOverdue: true }))).toMatch(/past its CISA due date/i);
  });

  it("sin señales, dice que no se pudo puntuar y por qué", () => {
    const t = explain(item({ riskScore: null, riskBand: null, cvssScore: null }));
    expect(t).toMatch(/not scored/i);
    expect(t).toMatch(/no CVSS base score and is not on the CISA KEV list/i);
  });
});

describe("la celda", () => {
  it("enseña el score sobre 1000 y su banda", () => {
    render(<RiskScoreCell item={item({ riskScore: 960, riskBand: "critical" })} />);
    expect(screen.getByText("960")).toBeInTheDocument();
    expect(screen.getByText("/1000")).toBeInTheDocument();
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("sin score no pinta un cero: pinta que no se puntuó", () => {
    render(<RiskScoreCell item={item({ riskScore: null, riskBand: null })} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/not scored/i)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("marca en la propia fila el CVE que todavía no tiene EPSS", () => {
    render(<RiskScoreCell item={item({ epss: null, epssPercentile: null })} />);
    expect(screen.getByText(/no EPSS yet/i)).toBeInTheDocument();
  });

  it("un score con EPSS no lleva ese aviso", () => {
    render(<RiskScoreCell item={item()} />);
    expect(screen.queryByText(/no EPSS yet/i)).not.toBeInTheDocument();
  });
});
