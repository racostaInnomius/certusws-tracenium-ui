import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FeaturesSection from "./FeaturesSection";

afterEach(cleanup);

const rcpCatalog = [{ key: "rcp", impliesModule: "remoteControl" }];
const rcpEnabledForm = { plugins: { rcp: true }, features: {} };
const noRcpForm = { plugins: { rcp: false }, features: {} };

describe("FeaturesSection", () => {
  it("renders the self-update toggle, checked by default (unset)", () => {
    render(<FeaturesSection form={{ plugins: {}, features: {} }} onChange={() => {}} catalog={[]} />);
    expect(screen.getByRole("switch", { name: /Self-update/i })).toBeChecked();
  });

  it("toggling self-update off emits features.selfUpdate=false", () => {
    const onChange = vi.fn();
    render(<FeaturesSection form={{ plugins: {}, features: {} }} onChange={onChange} catalog={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: /Self-update/i }));
    expect(onChange.mock.calls[0][0].features.selfUpdate).toBe(false);
  });

  it("hides the RCP sub-section when no remoteControl plugin is enabled", () => {
    render(<FeaturesSection form={noRcpForm} onChange={() => {}} catalog={rcpCatalog} />);
    expect(screen.queryByText("Remote Control (RCP)")).not.toBeInTheDocument();
  });

  it("shows the four RCP gates when the rcp plugin is enabled", () => {
    render(<FeaturesSection form={rcpEnabledForm} onChange={() => {}} catalog={rcpCatalog} />);
    expect(screen.getByText("Remote Control (RCP)")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Remote shell/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Remote file transfer/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Remote screen share/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Require user consent/i })).toBeInTheDocument();
  });

  it("toggling a RCP gate emits the matching feature flag", () => {
    const onChange = vi.fn();
    render(<FeaturesSection form={rcpEnabledForm} onChange={onChange} catalog={rcpCatalog} />);
    fireEvent.click(screen.getByRole("switch", { name: /Remote shell/i }));
    expect(onChange.mock.calls[0][0].features.remoteShell).toBe(true);
  });

  // ── Consent gate ────────────────────────────────────────────────
  //
  // Ya es utilizable: el aviso nativo existe en las tres plataformas y el
  // agente anuncia rcp.consent cuando puede preguntar. El gate dejó de ser
  // global y pasó a ser POR DISPOSITIVO — y eso es justo lo que hay que
  // seguir protegiendo aquí. En una flota mixta, encenderlo hace que los
  // equipos con agente antiguo vean sus sesiones RECHAZADAS, no abiertas sin
  // preguntar. El interruptor se puede encender; la advertencia es lo que
  // impide que se encienda a ciegas.
  describe("Require user consent", () => {
    const withConsent = (on) => ({
      plugins: { rcp: true },
      features: { remoteRequireConsent: on },
    });

    it("SE PUEDE encender", () => {
      const onChange = vi.fn();
      render(<FeaturesSection form={withConsent(false)} onChange={onChange} catalog={rcpCatalog} />);
      const sw = screen.getByRole("switch", { name: /Require user consent/i });
      expect(sw).toBeEnabled();
      fireEvent.click(sw);
      expect(onChange.mock.calls[0][0].features.remoteRequireConsent).toBe(true);
    });

    it("ya NO se marca como no disponible", () => {
      // El chip que queda en la sección es el de GRABACIÓN, que sigue gateada.
      // Este test moriría si alguien volviera a marcar el consentimiento como
      // indisponible sin querer.
      render(<FeaturesSection form={withConsent(false)} onChange={() => {}} catalog={rcpCatalog} />);
      const label = screen.getByRole("switch", { name: /Require user consent/i })
        .closest("label");
      expect(label?.textContent || "").not.toMatch(/Not available yet/i);
    });

    it("dice que hace falta un agente que sepa preguntar", () => {
      // Sin esto, un administrador lo enciende creyendo que todos sus equipos
      // van a preguntar, y lo que obtiene es la mitad de la flota sin acceso.
      render(<FeaturesSection form={withConsent(false)} onChange={() => {}} catalog={rcpCatalog} />);
      expect(screen.getByText(/older agent/i)).toBeInTheDocument();
    });

    it("stays switchable when already on, so it can be undone", () => {
      const onChange = vi.fn();
      render(<FeaturesSection form={withConsent(true)} onChange={onChange} catalog={rcpCatalog} />);
      const sw = screen.getByRole("switch", { name: /Require user consent/i });
      expect(sw).toBeEnabled();
      fireEvent.click(sw);
      expect(onChange.mock.calls[0][0].features.remoteRequireConsent).toBe(false);
    });

    it("mientras está ON advierte del riesgo en flota mixta", () => {
      // La advertencia es lo único que separa "decisión informada" de
      // "sorpresa el lunes por la mañana".
      render(<FeaturesSection form={withConsent(true)} onChange={() => {}} catalog={rcpCatalog} />);
      expect(screen.getByText(/REFUSED/)).toBeInTheDocument();
    });

    // ── Grabación de pantalla (ADR-0012) ──────────────────────────
    //
    // Gateado igual que el consentimiento pero por un daño DISTINTO.
    // Encender el consentimiento sobre la flota actual bloquea todas las
    // sesiones; encender la grabación no rompe nada — y eso es peor de
    // detectar: el interruptor diría "grabando" y no se grabaría nada, así
    // que un administrador creería tener vídeo que nunca existió.
    describe("Record screen sessions", () => {
      const withRecording = (on) => ({
        plugins: { rcp: true },
        features: { remoteRecordScreen: on },
      });

      it("SE PUEDE encender", () => {
        const onChange = vi.fn();
        render(<FeaturesSection form={withRecording(false)} onChange={onChange} catalog={rcpCatalog} />);
        const sw = screen.getByRole("switch", { name: /Record screen sessions/i });
        expect(sw).toBeEnabled();
        fireEvent.click(sw);
        expect(onChange.mock.calls[0][0].features.remoteRecordScreen).toBe(true);
      });

      it("stays switchable when already on, so it can be undone", () => {
        // Nunca se puede dejar a un tenant sin forma de revertir.
        const onChange = vi.fn();
        render(<FeaturesSection form={withRecording(true)} onChange={onChange} catalog={rcpCatalog} />);
        const sw = screen.getByRole("switch", { name: /Record screen sessions/i });
        expect(sw).toBeEnabled();
        fireEvent.click(sw);
        expect(onChange.mock.calls[0][0].features.remoteRecordScreen).toBe(false);
      });

      it("avisa de que los agentes antiguos NO graban, en silencio", () => {
        // El daño difícil de detectar: a diferencia del consentimiento —que
        // rechaza sesiones y se nota— un agente que ignora la bandera no rompe
        // nada. El interruptor diría "grabando" y esos equipos no grabarían, y
        // alguien contaría con una prueba que no existe.
        render(<FeaturesSection form={withRecording(true)} onChange={() => {}} catalog={rcpCatalog} />);
        expect(screen.getByText(/IGNORE this and record nothing/i)).toBeInTheDocument();
      });

      it("dice que se graba cifrado y con retención", () => {
        // Es lo que un administrador necesita para decidir si puede activarlo
        // en su jurisdicción.
        render(<FeaturesSection form={withRecording(false)} onChange={() => {}} catalog={rcpCatalog} />);
        expect(screen.getByText(/encrypted on the/i)).toBeInTheDocument();
        expect(screen.getByText(/3 months/i)).toBeInTheDocument();
      });

      it("dice que solo afecta a screen sharing", () => {
        // El shell ya deja transcript; prometer que esto lo cubre sería
        // sugerir una cobertura de auditoría que no existe.
        render(<FeaturesSection form={withRecording(false)} onChange={() => {}} catalog={rcpCatalog} />);
        expect(screen.getByText(/only to screen sharing/i)).toBeInTheDocument();
      });
    });

    it("shows no warning while it is off", () => {
      render(<FeaturesSection form={withConsent(false)} onChange={() => {}} catalog={rcpCatalog} />);
      expect(screen.queryByText(/Remote control is currently blocked/i)).not.toBeInTheDocument();
    });

    it("readOnly still wins over the on-state exception", () => {
      render(<FeaturesSection form={withConsent(true)} onChange={() => {}} catalog={rcpCatalog} readOnly />);
      expect(screen.getByRole("switch", { name: /Require user consent/i })).toBeDisabled();
    });
  });

  it("disables switches when readOnly", () => {
    render(<FeaturesSection form={rcpEnabledForm} onChange={() => {}} catalog={rcpCatalog} readOnly />);
    expect(screen.getByRole("switch", { name: /Self-update/i })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /Remote shell/i })).toBeDisabled();
  });
});
