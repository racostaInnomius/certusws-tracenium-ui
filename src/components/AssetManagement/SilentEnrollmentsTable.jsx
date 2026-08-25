// src/components/AssetManagement/SilentEnrollmentsTable.jsx
//
// Equipos que se enrolaron y NUNCA reportaron inventario.
//
// ⚠️ Por qué esta vista existe. La tabla de equipos del portal se alimenta de
// `host_current_status`, que sólo tiene fila cuando llegó inventario. Un equipo
// que se enroló y quedó mudo no aparece ahí — ni como error, ni como nada.
// Desaparece en silencio, y nadie busca lo que no sabe que existe: un operador
// tenía tres equipos así y ni siquiera podía nombrarlos.
//
// El nombre que se muestra es el CN del certificado con el que el equipo se
// enroló. Es lo que declaró la máquina, no algo que el servidor verificara, así
// que sirve para IDENTIFICAR ante una persona y nada más.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { listSilentEnrollments } from "../../api/devices";
import { BRAND, ROLE } from "../../theme/brand";

/**
 * Qué significa cada motivo y, sobre todo, A QUIÉN hay que mandarlo.
 *
 * ⚠️ Las dos fallas se ven idénticas en el portal —"no reporta"— y se arreglan
 * en sitios distintos. Sin esta distinción se manda a revisar el firewall de una
 * máquina cuyo tráfico ya está pasando, que es tiempo perdido de otra persona.
 */
const REASONS = {
  never_connected: {
    label: "Never connected",
    tone: ROLE.critical,
    bg: "rgba(198,40,40,.12)",
    hint:
      "Enrollment reached the API over HTTPS, but the agent has never opened its gRPC connection. " +
      "Check that outbound TCP to grpc.tracenium.com:443 is allowed from this machine.",
  },
  connected_silent: {
    label: "Connected, no data",
    tone: "#8A5E12",
    bg: "rgba(176,120,24,.14)",
    hint:
      "The agent IS reaching the control plane — its gRPC traffic is getting through — but it has " +
      "never sent an inventory snapshot. This is the agent or its AMP plugin on the endpoint, not the network.",
  },
};

/** "3 h" / "2 d" / "13 d" — la edad importa: 2 h es normal, 300 no. */
function formatAge(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n)) return "—";
  if (n < 48) return `${n} h`;
  return `${Math.round(n / 24)} d`;
}

function formatWhen(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function SilentEnrollmentsTable({ onBack }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSilentEnrollments();
      setRows(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      // ⚠️ Una lista vacía por fallo NO se muestra como "todo bien": la
      // ausencia de filas aquí significa "ningún equipo mudo", y afirmarlo sin
      // haber podido preguntar es justo el tipo de mentira tranquilizadora que
      // esta vista existe para evitar.
      setError(err?.message || "Could not load enrollments");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const counts = React.useMemo(
    () => ({
      never: rows.filter((r) => r.reason === "never_connected").length,
      silent: rows.filter((r) => r.reason === "connected_silent").length,
    }),
    [rows]
  );

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(text);
        setTimeout(() => setCopied(""), 1500);
      },
      () => {}
    );
  };

  return (
    <Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${BRAND.border}`, overflow: "hidden" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", md: "center" }}
        sx={{ p: 2, gap: 1.5, borderBottom: `1px solid ${BRAND.border}` }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: 15 }}>
            Enrolled, not reporting
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>
            These devices completed enrollment but have never sent an inventory snapshot, so they do
            not appear anywhere else in the portal.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load} sx={{ textTransform: "none" }}>
            Refresh
          </Button>
          {onBack ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<ArrowBackRoundedIcon />}
              onClick={onBack}
              sx={{ textTransform: "none" }}
            >
              Back
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {loading ? <LinearProgress /> : null}

      {error ? (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.dark }}>
            Every enrolled device is reporting
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1 }}>
            Nothing to chase. A device shows up here once it has been enrolled for more than two
            hours without sending inventory.
          </Typography>
        </Box>
      ) : null}

      {rows.length > 0 ? (
        <>
          <Stack direction="row" spacing={1} sx={{ px: 2, pt: 1.5, flexWrap: "wrap", rowGap: 0.75 }}>
            {counts.never > 0 ? (
              <Chip
                size="small"
                label={`${counts.never} never connected — check firewall`}
                sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: REASONS.never_connected.bg, color: REASONS.never_connected.tone }}
              />
            ) : null}
            {counts.silent > 0 ? (
              <Chip
                size="small"
                label={`${counts.silent} connected but silent — check the agent`}
                sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: REASONS.connected_silent.bg, color: REASONS.connected_silent.tone }}
              />
            ) : null}
          </Stack>

          <TableContainer sx={{ mt: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>Device</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>What is wrong</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Agent</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Enrolled</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Last contact</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => {
                  const meta = REASONS[r.reason] ?? REASONS.connected_silent;
                  return (
                    <TableRow key={r.deviceId} hover>
                      <TableCell>
                        <Typography sx={{ fontWeight: 700, fontSize: 13, color: BRAND.dark }}>
                          {r.hostname || "(name unknown)"}
                        </Typography>
                        {/* El UUID va a la vista porque es lo que identifica al
                            equipo en la base y en los logs del agente; con un
                            botón de copiar, porque nadie lo transcribe a mano. */}
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography
                            sx={{ fontSize: 10.5, color: "text.secondary", fontFamily: "monospace" }}
                          >
                            {r.deviceId}
                          </Typography>
                          <Tooltip title={copied === r.deviceId ? "Copied" : "Copy device ID"} arrow>
                            <Box
                              component="button"
                              onClick={() => copy(r.deviceId)}
                              aria-label="Copy device ID"
                              sx={{
                                border: 0,
                                bgcolor: "transparent",
                                cursor: "pointer",
                                p: 0.25,
                                lineHeight: 0,
                                color: "text.secondary",
                              }}
                            >
                              <ContentCopyRoundedIcon sx={{ fontSize: 12 }} />
                            </Box>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={meta.hint} arrow>
                          <Chip
                            size="small"
                            label={meta.label}
                            sx={{
                              height: 20,
                              fontSize: 11,
                              fontWeight: 800,
                              bgcolor: meta.bg,
                              color: meta.tone,
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ fontSize: 12.5 }}>{r.agentVersion || "—"}</TableCell>
                      <TableCell sx={{ fontSize: 12.5 }}>
                        <Tooltip title={formatWhen(r.enrolledAt)} arrow>
                          <span>{formatAge(r.hoursSinceEnroll)} ago</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ fontSize: 12.5, color: r.lastSeenAt ? "inherit" : ROLE.critical }}>
                        {formatWhen(r.lastSeenAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : null}
    </Paper>
  );
}
