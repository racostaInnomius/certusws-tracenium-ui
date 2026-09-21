// src/components/Compliance/fileIntegrityStatus.js
//
// ADR-0027 — la frase de estado de la integridad de ficheros de un equipo.
// Puro, para probar las cuatro situaciones que no se pueden confundir: el
// tenant no declaró nada, el equipo nunca informó, no se pudo leer, y se leyó
// y no cambió nada.

const SCOPE_TEXT = {
  not_configured: "No watched set applies to this device's operating system.",
  unsupported: "File integrity is not read on this platform.",
  unavailable: "The last read could not be completed.",
};


export function fileIntegrityStatus(data) {
  if (!data) return { tone: "muted", text: "" };
  if (data.available === false) return { tone: "muted", text: "File integrity is not enabled on this server yet." };
  if (!data.configured) return { tone: "muted", text: "Your organization does not watch any files. Declare them in Agent Settings → Security Compliance." };
  if (!data.scan) return { tone: "warning", text: "This device has not reported file integrity yet. Agents from 1.1.78 report it on their next compliance cycle." };
  if (data.scan.scope !== "collected") {
    return { tone: "warning", text: `${SCOPE_TEXT[data.scan.scope] ?? "Not read."}${data.scan.error ? ` (${data.scan.error})` : ""}` };
  }
  const n = data.recentChanges?.length ?? 0;
  return {
    tone: n > 0 ? "attention" : "ok",
    text: n > 0
      ? `${n} change${n === 1 ? "" : "s"} in the last ${data.windowDays ?? 30} days.`
      : `No changes in the last ${data.windowDays ?? 30} days.`,
  };
}
