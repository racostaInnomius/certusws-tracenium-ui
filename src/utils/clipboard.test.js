// src/utils/clipboard.test.js
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

let copied;
let execSpy;

function stubClipboard(writeText) {
  Object.defineProperty(navigator, "clipboard", { value: writeText ? { writeText } : undefined, configurable: true });
}

beforeEach(() => {
  copied = null;
  // jsdom no implementa execCommand: el doble copia lo que esté seleccionado.
  execSpy = vi.fn((cmd) => {
    if (cmd !== "copy") return false;
    const el = document.activeElement;
    copied = el && "value" in el ? el.value.slice(el.selectionStart, el.selectionEnd) : null;
    return true;
  });
  document.execCommand = execSpy;
});
afterEach(() => {
  stubClipboard(undefined);
  delete document.execCommand;
  document.body.innerHTML = "";
});

describe("copyText", () => {
  it("usa la API del portapapeles cuando deja", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    await copyText("https://mdm.tracenium.com/enroll/abc");
    expect(writeText).toHaveBeenCalledWith("https://mdm.tracenium.com/enroll/abc");
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("⭐ si la API la rechaza (permiso denegado), copia por execCommand el texto exacto", async () => {
    stubClipboard(vi.fn(() => Promise.reject(new DOMException("Document is not focused.", "NotAllowedError"))));
    await copyText("https://mdm.tracenium.com/enroll/abc");
    expect(copied).toBe("https://mdm.tracenium.com/enroll/abc");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("sin API (contexto no seguro) va directo al respaldo", async () => {
    stubClipboard(undefined);
    await copyText("CWY6T7FN0F");
    expect(copied).toBe("CWY6T7FN0F");
  });

  it("si ninguna vía copia, rechaza — el que llama avisa de verdad", async () => {
    stubClipboard(vi.fn(() => Promise.reject(new Error("denied"))));
    execSpy.mockReturnValue(false);
    await expect(copyText("x")).rejects.toThrow("clipboard_unavailable");
  });

  it("devuelve el foco al botón y, dentro de un diálogo, copia desde dentro de él", async () => {
    stubClipboard(undefined);
    document.body.innerHTML = '<div role="dialog"><button id="b">Copy</button></div>';
    const button = document.getElementById("b");
    button.focus();
    let host = null;
    execSpy.mockImplementation(() => {
      host = document.activeElement?.parentElement?.getAttribute("role");
      return true;
    });
    await copyText("x");
    expect(host).toBe("dialog");
    expect(document.activeElement).toBe(button);
  });
});
