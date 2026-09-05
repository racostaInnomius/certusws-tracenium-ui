import { describe, it, expect } from "vitest";
import { describeWithoutGpos } from "../gpoDomainSummary";

describe("describeWithoutGpos", () => {
  it("no desglosa lo que no existe", () => {
    expect(describeWithoutGpos(null)).toBeNull();
    expect(describeWithoutGpos(undefined)).toBeNull();
    expect(describeWithoutGpos({ withoutAnyGpos: 0 })).toBeNull();
  });

  it("separa el equipo averiado del que está bien así", () => {
    const d = describeWithoutGpos({
      withoutAnyGpos: 2,
      domainJoinedWithoutGpos: 1,
      notDomainJoinedWithoutGpos: 1,
    });

    expect(d.text).toBe("1 domain-joined · 1 workgroup");
    expect(d.actionable).toBe(true);
  });

  it("un workgroup sin directivas no es una alarma", () => {
    const d = describeWithoutGpos({
      withoutAnyGpos: 3,
      domainJoinedWithoutGpos: 0,
      notDomainJoinedWithoutGpos: 3,
    });

    expect(d.text).toBe("3 workgroup");
    expect(d.actionable).toBe(false);
  });

  it("lo que falta por saber se declara, no se reparte", () => {
    // Antes de que la migración 20260904 complete un ciclo, el backend no
    // manda las dos ramas. Sumar el resto a "workgroup" diría que está todo
    // bien; sumarlo a "domain-joined" inventaría averías.
    const d = describeWithoutGpos({ withoutAnyGpos: 4 });

    expect(d).toMatchObject({ joined: 0, workgroup: 0, pending: 4 });
    expect(d.text).toBe("4 unknown");
    expect(d.actionable).toBe(false);
  });

  it("mezcla las tres cuando el ciclo va a medias", () => {
    const d = describeWithoutGpos({
      withoutAnyGpos: 5,
      domainJoinedWithoutGpos: 1,
      notDomainJoinedWithoutGpos: 2,
    });

    expect(d.pending).toBe(2);
    expect(d.text).toBe("1 domain-joined · 2 workgroup · 2 unknown");
  });

  it("nunca inventa pendientes negativos", () => {
    // Si las ramas llegaran a sumar más que el total —dos consultas distintas,
    // una carrera— el desglose no debe restar por debajo de cero.
    const d = describeWithoutGpos({
      withoutAnyGpos: 1,
      domainJoinedWithoutGpos: 1,
      notDomainJoinedWithoutGpos: 1,
    });

    expect(d.pending).toBe(0);
  });
});
