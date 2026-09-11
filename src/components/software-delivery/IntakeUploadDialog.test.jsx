// src/components/software-delivery/IntakeUploadDialog.test.jsx
//
// Subir un instalador: lo que el operador NO tiene que teclear, y lo que no
// tiene que esperar para enterarse.
//
// Dos cosas medidas en campo el 7-sep-2026:
//   * Con el MSI de Chrome se tecleó "Chrome Enterprise / Google" y el fichero
//     traía dentro "Google Chrome / Google LLC / 152.0.7977.83". El extractor
//     pisa las pistas —el propio rótulo decía "extracted values win"— así que
//     ese trabajo se tiró.
//   * El MSI de Edge pesa ~260 MiB. Se subía entero para que el servidor lo
//     rechazara al final.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import IntakeUploadDialog, { MAX_UPLOAD_BYTES, tooLargeMessage } from "./IntakeUploadDialog";

afterEach(cleanup);

/** Un File con el tamaño que queramos, sin materializar los bytes. */
function fakeFile(name, sizeBytes) {
  const f = new File(["x"], name, { type: "application/octet-stream" });
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
}

describe("tooLargeMessage · el techo se comprueba aquí, no tras la espera", () => {
  it("acepta lo que cabe", () => {
    expect(tooLargeMessage(MAX_UPLOAD_BYTES)).toBeNull();
    expect(tooLargeMessage(1024)).toBeNull();
    expect(tooLargeMessage(0)).toBeNull();
  });

  // El caso real: el MSI de Edge.
  it("rechaza los 260 MiB de Edge diciendo ambos números", () => {
    const msg = tooLargeMessage(272_629_760, 209_715_200); // 260 MiB contra el techo viejo
    expect(msg).toMatch(/260 MiB/);
    expect(msg).toMatch(/200 MiB/);
  });

  // ⚠️ El límite del cliente DUPLICA el del servidor a propósito. Si alguien
  // sube uno y no el otro, esto no lo caza — pero el mensaje nombra el número,
  // así que el desajuste se ve en pantalla en vez de en un 413 opaco.
  it("el techo del cliente es el mismo que el del servidor", () => {
    expect(MAX_UPLOAD_BYTES).toBe(471_859_200); // 450 MiB, ver intake-upload.ts
  });
});

describe("IntakeUploadDialog · las pistas no son lo primero", () => {
  function open(props = {}) {
    return render(
      <IntakeUploadDialog open submitting={false} onClose={vi.fn()} onSubmit={vi.fn()} {...props} />
    );
  }

  // ⚠️ ESTO ES EL ARREGLO. Los campos estaban desplegados justo debajo del
  // selector de fichero, así que invitaban a rellenarlos; y lo que se escribía
  // lo pisaba el extractor.
  it("no enseña los campos de nombre/vendor/versión de entrada", () => {
    open();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("Vendor")).toBeNull();
  });

  it("dice de dónde salen esos datos", () => {
    open();
    expect(screen.getByText(/read from the file/i)).toBeInTheDocument();
  });

  // Siguen estando: hay binarios sin metadatos, y el SHA-256 declarado es la
  // única forma de contrastar lo que subes contra lo que el proveedor publicó.
  it("se pueden abrir para sobreescribir o declarar un hash", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: /read from the file/i }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Declared SHA-256")).toBeInTheDocument();
  });
});

describe("IntakeUploadDialog · el tamaño se avisa al elegir", () => {
  it("rechaza un fichero por encima del techo sin llamar a onSubmit", async () => {
    const onSubmit = vi.fn();
    render(
      <IntakeUploadDialog open submitting={false} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const input = document.querySelector('input[type="file"]');
    await userEvent.upload(input, fakeFile("edge.msi", MAX_UPLOAD_BYTES + 1));

    // El aviso sale al elegir, antes de tocar el botón.
    expect(screen.getByText(/the intake limit is 450 MiB/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /upload & analyze/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("deja pasar uno que cabe", async () => {
    const onSubmit = vi.fn();
    render(
      <IntakeUploadDialog open submitting={false} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const input = document.querySelector('input[type="file"]');
    await userEvent.upload(input, fakeFile("chrome.msi", 165_842_944)); // el MSI real de Chrome

    expect(screen.queryByText(/intake limit/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /upload & analyze/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("⚠️ y deja pasar el .pkg de Edge, que es el que motivó subir el techo", async () => {
    // 433 MB decimales = ~413 MiB. El caso concreto, con su tamaño real: un
    // techo que se quedase justo por debajo pasaría los tests genéricos
    // —que van en relativo a MAX_UPLOAD_BYTES— mientras sigue rechazando el
    // fichero por el que se cambió el número.
    const onSubmit = vi.fn();
    render(
      <IntakeUploadDialog open submitting={false} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const input = document.querySelector('input[type="file"]');
    await userEvent.upload(input, fakeFile("MicrosoftEdge.pkg", 433_000_000));

    expect(screen.queryByText(/intake limit/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /upload & analyze/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("el interruptor de VirusTotal", () => {
  // Decisión del owner: apagado por defecto. Es una consulta a un tercero sobre
  // el fichero de un cliente, y la toma quien sube.
  it("⚠️ viene APAGADO y la subida no pide análisis", async () => {
    const onSubmit = vi.fn();
    render(<IntakeUploadDialog open submitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);

    const input = document.querySelector('input[type="file"]');
    await userEvent.upload(input, fakeFile("app.msi", 1024));
    await userEvent.click(screen.getByRole("button", { name: /upload & analyze/i }));

    // Y se ve apagado, no sólo se comporta como apagado.
    expect(screen.getByRole("switch", { name: /virustotal/i })).not.toBeChecked();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1].scanReputation).toBe(false);
  });

  it("encendido, la subida lo pide", async () => {
    const onSubmit = vi.fn();
    render(<IntakeUploadDialog open submitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);

    const input = document.querySelector('input[type="file"]');
    await userEvent.upload(input, fakeFile("app.msi", 1024));
    // MUI 7 expone el Switch como role="switch", no "checkbox".
    await userEvent.click(screen.getByRole("switch", { name: /virustotal/i }));
    await userEvent.click(screen.getByRole("button", { name: /upload & analyze/i }));

    expect(onSubmit.mock.calls[0][1].scanReputation).toBe(true);
  });

  it("dice que NO se sube el fichero, que es lo que decide si alguien lo enciende", async () => {
    render(<IntakeUploadDialog open submitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument();
  });
});
