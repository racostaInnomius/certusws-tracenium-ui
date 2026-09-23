// src/components/CryptoDiscovery/ProcessLibrariesPanel.jsx
//
// Ola 1.5 — qué librería criptográfica carga cada servicio.
//
// Va en Roadmap, pegado a «Devices that cannot migrate yet», porque es su
// desglose: el panel de bloqueos dice CUÁNTOS equipos y por qué causa, y
// esto dice QUÉ SE REINICIA en cada uno. Sin él, «actualiza OpenSSL» es
// una frase; con él son tres servicios con nombre.
//
// ⚠️ `versionSource: "soname"` significa que la versión NO se leyó del
// artefacto: se dedujo de su nombre de fichero. `libssl.so.3` es la misma
// soname para un 3.0.2 y para un 3.6.2, y el umbral de ML-KEM (3.5) está
// entre los dos. La versión se enseña igual —ocultarla sería peor— pero
// marcada, y nunca con el mismo aspecto que una leída.

import * as React from "react";
import { Alert, Box, Chip, MenuItem, Skeleton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { listCdpProcessLibraries } from "../../api/cdp";
import {
  HOLDER_HINT,
  filterProcessLibraryDevices,
  formatPorts,
  groupProcessLibraries,
  summarizeProcessLibraries
} from "./processLibraries";

const MONO = "ui-monospace, Menlo, monospace";

/**
 * La versión, con su procedencia pegada.
 *
 * Una deducida NO se pinta en rojo: no es un hallazgo, es una
 * incertidumbre. Va en ámbar de aviso y con el símbolo delante, que es la
 * tercera categoría entre «dato» y «problema».
 */
function VersionChip({ library, version, confidence }) {
  const inferred = confidence.confirmed !== true;
  return (
    <Tooltip arrow title={`${library} — ${confidence.hint}`}>
      <Chip
        size="small"
        label={`${library} ${version ?? "?"}${inferred ? " ⚠" : ""}`}
        sx={{
          height: 20,
          fontSize: TEXT.xs,
          fontFamily: MONO,
          // ROLE.* rellena, BRAND.alert.*Text escribe.
          bgcolor: inferred ? BRAND.alert.warningSoft : BRAND.surfaceMuted,
          color: inferred ? BRAND.alert.warningText : TEXT_MUTED,
          fontWeight: inferred ? 700 : 400
        }}
      />
    </Tooltip>
  );
}

function DeviceBlock({ device }) {
  return (
    <Box sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 1.25, mt: 1.25 }}>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.sm, color: BRAND.dark }}>
        {device.label}
        {!device.host ? (
          <Tooltip arrow title="No hostname for this agent — it is no longer in the device table. The library reading still stands; only the name is missing.">
            <Box component="span" sx={{ ml: 0.75, fontWeight: 400, fontSize: TEXT.xs, color: TEXT_MUTED, cursor: "help" }}>
              (agent id — no hostname)
            </Box>
          </Tooltip>
        ) : null}
      </Typography>

      <Stack spacing={0.75} sx={{ mt: 0.75 }}>
        {device.holders.map((h) => (
          <Stack
            key={h.key}
            direction="row"
            spacing={1}
            sx={{ alignItems: "flex-start", flexWrap: "wrap", rowGap: 0.5, pl: 1 }}
          >
            <Tooltip arrow title={HOLDER_HINT[h.kind]}>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, minWidth: 180, cursor: "help" }}>
                {h.name}
                {/* Qué es lo que se está nombrando: «nginx» y
                    «nginx.service» no se reinician igual. */}
                <Box component="span" sx={{ color: TEXT_MUTED, fontWeight: 400 }}> · {h.kind}</Box>
              </Typography>
            </Tooltip>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
              {h.libraries.map((l, i) => (
                <VersionChip key={`${l.library}-${l.libraryPath}-${i}`} library={l.library} version={l.version} confidence={l.confidence} />
              ))}
              {formatPorts(h.ports) ? (
                <Chip size="small" label={formatPorts(h.ports)} sx={{ height: 20, fontSize: TEXT.xs, fontFamily: MONO }} />
              ) : null}
            </Stack>
            <Box sx={{ flexBasis: "100%" }}>
              {h.libraries.map((l, i) =>
                l.libraryPath ? (
                  <Typography key={`${l.libraryPath}-${i}`} sx={{ fontFamily: MONO, fontSize: TEXT.xs, color: TEXT_MUTED, pl: 1, wordBreak: "break-all" }}>
                    {l.libraryPath}
                  </Typography>
                ) : null
              )}
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export default function ProcessLibrariesPanel({ refreshNonce }) {
  const [state, setState] = React.useState({ loading: true, items: [], error: null });
  const [filter, setFilter] = React.useState({ library: "", onlyInferred: false, search: "" });

  React.useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    listCdpProcessLibraries({ limit: 2000 })
      .then((r) => alive && setState({ loading: false, items: Array.isArray(r?.items) ? r.items : [], error: null }))
      .catch((e) => alive && setState({ loading: false, items: [], error: e?.message || String(e) }));
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  const grouped = React.useMemo(() => groupProcessLibraries(state.items), [state.items]);
  const summary = React.useMemo(() => summarizeProcessLibraries(grouped), [grouped]);
  const devices = React.useMemo(() => filterProcessLibraryDevices(grouped.devices, filter), [grouped.devices, filter]);
  const set = (patch) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <SectionPaper sx={{ p: 2 }}>
      <Typography component="h3" sx={{ fontWeight: 800, fontSize: TEXT.base, color: BRAND.dark, m: 0 }}>
        What each service actually loads
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.85, mt: 0.5, mb: 1.5 }}>
        The blocker list above counts devices. This is what you restart on each one. A software inventory says the
        machine has OpenSSL; it does not say which of its forty processes has it loaded, so it never bounded the work.
        Nobody restarts &ldquo;openssl&rdquo; — they restart nginx.
      </Typography>

      {state.error ? (
        // Un fallo no es «ningún servicio carga nada»: eso sería una
        // tranquilidad que nadie ha medido.
        <Alert severity="error">The per-process libraries could not be read: {state.error}</Alert>
      ) : state.loading ? (
        <Skeleton height={120} />
      ) : summary.loads === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
          No device has reported a loaded crypto library. This needs the agent&apos;s process-library collector, and it
          says nothing about machines that have not reported one.
        </Typography>
      ) : (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
            <TextField
              select size="small" label="Library" value={filter.library} onChange={(e) => set({ library: e.target.value })}
              sx={{ minWidth: 160 }} slotProps={{ htmlInput: { "aria-label": "Library" } }}
            >
              <MenuItem value="">All libraries</MenuItem>
              {summary.libraries.map((l) => (
                <MenuItem key={l} value={l}>{l}</MenuItem>
              ))}
            </TextField>
            <TextField
              select size="small" label="Version" value={filter.onlyInferred ? "1" : ""} onChange={(e) => set({ onlyInferred: e.target.value === "1" })}
              sx={{ minWidth: 220 }} slotProps={{ htmlInput: { "aria-label": "Version" } }}
            >
              <MenuItem value="">Any provenance</MenuItem>
              <MenuItem value="1">Only versions not read</MenuItem>
            </TextField>
            <TextField
              size="small" label="Search" placeholder="host, service, path" value={filter.search}
              onChange={(e) => set({ search: e.target.value })} sx={{ minWidth: 220 }}
              slotProps={{ htmlInput: { "aria-label": "Search" } }}
            />
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
              {summary.services.toLocaleString()} service{summary.services === 1 ? "" : "s"} on{" "}
              {summary.devices.toLocaleString()} device{summary.devices === 1 ? "" : "s"}
            </Typography>
          </Stack>

          {summary.inferredLoads > 0 ? (
            // ⚠️ Arriba y no escondido en un tooltip: si la mitad de las
            // versiones son deducidas, el recuento de bloqueos de arriba
            // hereda esa incertidumbre, y quien lo lea tiene que saberlo.
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              {summary.inferredLoads.toLocaleString()} of {summary.loads.toLocaleString()} versions were{" "}
              <strong>not read from the library</strong> — they were inferred from its file name or its path.{" "}
              <code>libssl.so.3</code> is the same soname for OpenSSL 3.0.2 and for 3.6.2, and the ML-KEM threshold
              (3.5) sits between them. Those entries are marked ⚠ and cannot settle whether that service can migrate.
            </Alert>
          ) : null}

          {grouped.dropped > 0 ? (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              {grouped.dropped.toLocaleString()} row{grouped.dropped === 1 ? "" : "s"} came back without a device or a
              library name and {grouped.dropped === 1 ? "is" : "are"} not shown. Bucketing them together would have
              invented a device that does not exist.
            </Alert>
          ) : null}

          {devices.length === 0 ? (
            <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
              No service matches these filters. {summary.services.toLocaleString()} collected in total.
            </Typography>
          ) : (
            <Box>
              {devices.map((d) => (
                <DeviceBlock key={d.agentId} device={d} />
              ))}
            </Box>
          )}
        </>
      )}
    </SectionPaper>
  );
}
