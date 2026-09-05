// src/components/RemoteControl/ScreenShareViewer.blit.test.jsx
//
// ⚠️ Lo que se DIBUJA, que es la mitad del visor que nadie probaba.
//
// `ScreenShareViewer.test.jsx` cubre la máquina de estados y dice
// explícitamente que lo pintado se queda fuera porque jsdom no implementa
// `getContext()`. Pero jsdom no implementarlo no impide comprobar qué se le
// PIDE al contexto: con un doble que apunta cada `drawImage` y cada cambio
// de tamaño se fija justo lo que se puede romper sin que se note.
//
// Y lo que se puede romper aquí es caro y silencioso:
//
//   · Asignar `canvas.width` o `canvas.height` BORRA el canvas. Si eso
//     ocurre en cada fotograma parcial, cada parche limpia la imagen que
//     venía a parchear: la pantalla parpadea en negro con solo la región
//     cambiada visible, y no hay error en ninguna consola.
//   · Un parcial se pinta en (x,y); pintarlo en (0,0) —o tomar el tamaño
//     de la imagen recibida como si fuera el escritorio— deja la región
//     cambiada en la esquina y descuadra además la inyección de entrada,
//     que mapea los clics por `liveSize`.
//   · El keyframe periódico es lo que cura una región perdida por un canal
//     no fiable. Si un fotograma completo dejara de redibujarlo todo, ese
//     desperfecto se quedaría en pantalla hasta reconectar.
//
// Los trozos se reensamblan en orden de índice, no de llegada: el
// DataChannel de vídeo es no fiable y desordenado por diseño.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

import ScreenShareViewer from "./ScreenShareViewer";

// ── Dobles de transporte (los mismos que ScreenShareViewer.test.jsx) ──
const sockets = [];
const peers = [];

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
    sockets.push(this);
  }
  send(d) {
    this.sent.push(d);
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
  addEventListener() {}
  removeEventListener() {}
  fireOpen() {
    return act(() => this.onopen?.({}));
  }
  fireMessage(obj) {
    return act(async () => {
      await this.onmessage?.({ data: JSON.stringify(obj) });
    });
  }
}

class FakeDataChannel {
  constructor() {
    this.readyState = "connecting";
    this.sent = [];
    this.bufferedAmount = 0;
  }
  send(d) {
    this.sent.push(d);
  }
  close() {
    this.readyState = "closed";
  }
  addEventListener() {}
  removeEventListener() {}
  fireOpen() {
    this.readyState = "open";
    return act(() => this.onopen?.({}));
  }
  fireMessage(obj) {
    return act(() => this.onmessage?.({ data: JSON.stringify(obj) }));
  }
}

class FakeRTCPeerConnection {
  constructor() {
    this.connectionState = "new";
    this.iceConnectionState = "new";
    this._listeners = {};
    this.dc = null;
    peers.push(this);
  }
  addEventListener(t, cb) {
    (this._listeners[t] ||= []).push(cb);
  }
  removeEventListener(t, cb) {
    this._listeners[t] = (this._listeners[t] || []).filter((h) => h !== cb);
  }
  createDataChannel() {
    this.dc = new FakeDataChannel();
    return this.dc;
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0" };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
  async getStats() {
    return new Map();
  }
  close() {
    this.connectionState = "closed";
  }
}

// ── El canvas y la imagen, que aquí sí importan ──────────────────────

/** Cada `drawImage` y cada asignación de tamaño, en orden. */
let draws;
let sizes;
let fakeCanvas;

/**
 * Un `Image` que carga cuando se lo digan.
 *
 * El componente hace `img.src = "data:image/jpeg;base64,..."` y pinta en
 * `onload`. jsdom no decodifica nada, así que sin esto `onload` no llega
 * nunca y `drawImage` no se llama — el test pasaría vacío.
 */
const pendingImages = [];
class FakeImage {
  constructor() {
    this.width = 0;
    this.height = 0;
    pendingImages.push(this);
  }
  set src(v) {
    this._src = v;
  }
  get src() {
    return this._src;
  }
}

/** Resuelve la última imagen pendiente con el tamaño dado. */
async function decodeLast({ width, height }) {
  const img = pendingImages[pendingImages.length - 1];
  img.width = width;
  img.height = height;
  await act(async () => {
    img.onload?.();
  });
}

beforeEach(() => {
  sockets.length = 0;
  peers.length = 0;
  pendingImages.length = 0;
  draws = [];
  sizes = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);
  vi.stubGlobal("Image", FakeImage);

  // El canvas real de jsdom no tiene contexto 2D, pero sí propiedades
  // width/height. Se interponen para APUNTAR las asignaciones: son las que
  // borran el lienzo, y ese borrado es el fallo que se persigue.
  fakeCanvas = { width: 0, height: 0 };
  const ctx = {
    canvas: fakeCanvas,
    drawImage: (img, x, y) => draws.push({ src: img.src, x, y, w: img.width, h: img.height }),
    clearRect: () => {},
    fillRect: () => {},
    putImageData: () => {},
    getImageData: () => ({ data: [] })
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
  for (const dim of ["width", "height"]) {
    Object.defineProperty(HTMLCanvasElement.prototype, dim, {
      configurable: true,
      get() {
        return fakeCanvas[dim];
      },
      set(v) {
        sizes.push({ [dim]: v });
        fakeCanvas[dim] = v;
      }
    });
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const dim of ["width", "height"]) {
    delete HTMLCanvasElement.prototype[dim];
  }
});

const SESSION = {
  sessionId: "sess-1",
  signalingUrl: "/api/v1/remote-control/signal/sess-1",
  turnConfig: { iceServers: [] }
};
const DEVICE = { deviceId: "dev-1", hostname: "SRV-DC01", platform: "windows" };

async function connect() {
  render(<ScreenShareViewer session={SESSION} device={DEVICE} onClose={vi.fn()} />);
  await waitFor(() => expect(sockets[0]).toBeTruthy());
  const ws = sockets[0];
  await ws.fireOpen();
  await waitFor(() => expect(peers[0]?.dc).toBeTruthy());
  await ws.fireMessage({ type: "answer", sdp: "v=0" });
  await peers[0].dc.fireOpen();
  return { ws, dc: peers[0].dc };
}

/** Un fotograma completo de 1920×1080, ya decodificado. */
async function fullFrame(dc, data = "AAAA") {
  await dc.fireMessage({ op: "frame", data, width: 1920, height: 1080, full: true });
  await decodeLast({ width: 1920, height: 1080 });
}

describe("fotograma completo", () => {
  it("dimensiona el lienzo con el escritorio y lo pinta en el origen", async () => {
    const { dc } = await connect();
    await fullFrame(dc);

    expect(sizes).toEqual([{ width: 1920 }, { height: 1080 }]);
    expect(draws).toEqual([
      { src: "data:image/jpeg;base64,AAAA", x: 0, y: 0, w: 1920, h: 1080 }
    ]);
  });

  it("un segundo completo del mismo tamaño NO vuelve a dimensionar", async () => {
    // Asignar width/height borra el lienzo. Hacerlo en cada fotograma sería
    // invisible con completos seguidos y catastrófico con parciales.
    const { dc } = await connect();
    await fullFrame(dc);
    sizes.length = 0;

    await fullFrame(dc, "BBBB");
    expect(sizes).toEqual([]);
    expect(draws).toHaveLength(2);
  });

  it("un cambio de resolución sí redimensiona", async () => {
    const { dc } = await connect();
    await fullFrame(dc);
    sizes.length = 0;

    await dc.fireMessage({ op: "frame", data: "CCCC", width: 1280, height: 720, full: true });
    await decodeLast({ width: 1280, height: 720 });
    expect(sizes).toEqual([{ width: 1280 }, { height: 720 }]);
  });

  it("sin medidas del agente cae al tamaño de la propia imagen", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ op: "frame", data: "DDDD", full: true });
    await decodeLast({ width: 800, height: 600 });
    expect(sizes).toEqual([{ width: 800 }, { height: 600 }]);
  });
});

describe("⚠️ región parcial — el parche no puede borrar lo que parchea", () => {
  it("se pinta en (x,y) y NO redimensiona el lienzo", async () => {
    const { dc } = await connect();
    await fullFrame(dc);
    sizes.length = 0;
    draws.length = 0;

    await dc.fireMessage({
      op: "frame",
      data: "EEEE",
      width: 1920,
      height: 1080,
      full: false,
      x: 640,
      y: 360
    });
    // La imagen de un parcial es solo la región: 240×120, no el escritorio.
    await decodeLast({ width: 240, height: 120 });

    expect(sizes).toEqual([]);
    expect(draws).toEqual([
      { src: "data:image/jpeg;base64,EEEE", x: 640, y: 360, w: 240, h: 120 }
    ]);
  });

  it("⚠️ un parcial sin medidas del escritorio conserva el lienzo", async () => {
    // Este es el camino que rompe si alguien "simplifica" el fallback y toma
    // el tamaño de la imagen: el lienzo pasaría a 240×120 —borrándose— y el
    // escritorio de 1920 quedaría reducido a la región cambiada.
    const { dc } = await connect();
    await fullFrame(dc);
    sizes.length = 0;

    await dc.fireMessage({ op: "frame", data: "FFFF", full: false, x: 10, y: 20 });
    await decodeLast({ width: 240, height: 120 });

    expect(sizes).toEqual([]);
    expect(fakeCanvas).toEqual({ width: 1920, height: 1080 });
  });

  it("x/y ausentes se pintan en el origen, no en NaN", async () => {
    const { dc } = await connect();
    await fullFrame(dc);
    draws.length = 0;

    await dc.fireMessage({ op: "frame", data: "GGGG", width: 1920, height: 1080, full: false });
    await decodeLast({ width: 100, height: 100 });
    expect(draws[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe("⚠️ keyframe — lo que cura una región perdida", () => {
  it("un completo tras varios parciales vuelve a pintar el escritorio entero", async () => {
    // El canal de vídeo no es fiable: una región puede perderse y quedarse
    // sucia en pantalla. El agente fuerza un completo periódico justo para
    // eso, y si dejara de redibujarlo todo el desperfecto se quedaría hasta
    // reconectar.
    const { dc } = await connect();
    await fullFrame(dc);

    for (const [i, xy] of [[100, 100], [200, 200]].entries()) {
      await dc.fireMessage({
        op: "frame",
        data: `P${i}`,
        width: 1920,
        height: 1080,
        full: false,
        x: xy[0],
        y: xy[1]
      });
      await decodeLast({ width: 50, height: 50 });
    }
    draws.length = 0;
    sizes.length = 0;

    await fullFrame(dc, "KEY");
    expect(sizes).toEqual([]); // mismo tamaño: no se borra por dimensionar
    expect(draws).toEqual([
      { src: "data:image/jpeg;base64,KEY", x: 0, y: 0, w: 1920, h: 1080 }
    ]);
  });
});

describe("fotograma troceado", () => {
  it("se reensambla en orden de índice, no de llegada", async () => {
    // El transporte es no fiable Y desordenado. Concatenar por orden de
    // llegada produce un JPEG corrupto que no lanza nada: `img.onload`
    // simplemente no ocurre y la pantalla se congela sin decir por qué.
    const { dc } = await connect();
    await dc.fireMessage({
      op: "frameStart",
      seq: 7,
      chunks: 3,
      width: 1920,
      height: 1080,
      full: true
    });
    await dc.fireMessage({ op: "frameChunk", seq: 7, idx: 2, data: "CC" });
    await dc.fireMessage({ op: "frameChunk", seq: 7, idx: 0, data: "AA" });
    await dc.fireMessage({ op: "frameChunk", seq: 7, idx: 1, data: "BB" });
    await decodeLast({ width: 1920, height: 1080 });

    expect(draws).toEqual([
      { src: "data:image/jpeg;base64,AABBCC", x: 0, y: 0, w: 1920, h: 1080 }
    ]);
  });

  it("un parcial troceado conserva su (x,y) del frameStart", async () => {
    // Los trozos solo llevan payload: si la geometría no viaja en el
    // frameStart, la región se pinta en el origen.
    const { dc } = await connect();
    await fullFrame(dc);
    draws.length = 0;

    await dc.fireMessage({
      op: "frameStart",
      seq: 8,
      chunks: 2,
      width: 1920,
      height: 1080,
      full: false,
      x: 300,
      y: 150
    });
    await dc.fireMessage({ op: "frameChunk", seq: 8, idx: 0, data: "XX" });
    await dc.fireMessage({ op: "frameChunk", seq: 8, idx: 1, data: "YY" });
    await decodeLast({ width: 64, height: 64 });

    expect(draws).toEqual([
      { src: "data:image/jpeg;base64,XXYY", x: 300, y: 150, w: 64, h: 64 }
    ]);
  });

  it("⚠️ un trozo tardío de un fotograma anterior no se pinta", async () => {
    // Llega después del siguiente frameStart. Pintarlo mezclaría dos
    // fotogramas en un mismo JPEG.
    const { dc } = await connect();
    await dc.fireMessage({ op: "frameStart", seq: 1, chunks: 2, width: 1920, height: 1080, full: true });
    await dc.fireMessage({ op: "frameChunk", seq: 1, idx: 0, data: "AA" });
    await dc.fireMessage({ op: "frameStart", seq: 2, chunks: 1, width: 1920, height: 1080, full: true });
    await dc.fireMessage({ op: "frameChunk", seq: 1, idx: 1, data: "BB" }); // tardío

    expect(pendingImages).toHaveLength(0); // nada que decodificar todavía

    await dc.fireMessage({ op: "frameChunk", seq: 2, idx: 0, data: "ZZ" });
    await decodeLast({ width: 1920, height: 1080 });
    expect(draws).toEqual([
      { src: "data:image/jpeg;base64,ZZ", x: 0, y: 0, w: 1920, h: 1080 }
    ]);
  });

  it("un fotograma incompleto se descarta en frameDone y no cuelga el siguiente", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ op: "frameStart", seq: 3, chunks: 2, width: 1920, height: 1080, full: true });
    await dc.fireMessage({ op: "frameChunk", seq: 3, idx: 0, data: "AA" });
    await dc.fireMessage({ op: "frameDone", seq: 3 });
    // El trozo que faltaba llega tarde: ya no hay ensamblaje al que sumarlo.
    await dc.fireMessage({ op: "frameChunk", seq: 3, idx: 1, data: "BB" });
    expect(pendingImages).toHaveLength(0);

    await fullFrame(dc, "NEXT");
    expect(draws).toEqual([
      { src: "data:image/jpeg;base64,NEXT", x: 0, y: 0, w: 1920, h: 1080 }
    ]);
  });
});
