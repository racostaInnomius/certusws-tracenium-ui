// src/components/PKI/IdentityRotationPanel.jsx
//
// «¿Quién ha rotado a la identidad híbrida, y a quién le puedo dar ahora?»
// (ADR-0015).
//
// ── Por qué existe ───────────────────────────────────────────────────
//
// El 14-sep se rotó un Windows con un agente que perdía la lista de CAs al
// renovar (MSIG-VEEAM-PC). Se quedó a oscuras y se tardó un día en verlo: no
// había dónde mirar. La tabla que decía qué equipos se podían rotar se sacó a
// mano de la base, y la primera versión enseñaba cinco equipos dados de baja
// hacía meses.
//
// Aquí la regla NO se calcula: la decide el backend (`rotation-status`), con
// la flota real y la matriz de visto bueno del tenant. Este componente sólo la
// pinta y lleva al inspector, donde ya vive el formulario de rotación — no se
// duplica.
//
// ── Lo que tiene que saltar a la vista ───────────────────────────────
//
// «Certificado nuevo nunca activado». Es la firma exacta de un equipo que
// rotó y no volvió. Va arriba y en rojo, antes que cualquier otra cosa.
//
// ── La otra mitad: el intercambio de claves ──────────────────────────
//
// La identidad híbrida protege QUIÉN es el equipo; ML-KEM protege el SECRETO
// DE SESIÓN contra «recoge ahora, descifra después». Son migraciones
// distintas y el grupo lo eligen los dos extremos (Windows negocia con
// SChannel), así que se enseña lo que el servidor VIO en la última conexión,
// no lo que debería pasar. No decide la rotación.

import * as React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Grid,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { getCertificateRotationStatus } from "../../api/certificates";
import SummaryCard from "../common/SummaryCard";
import { BRAND, DATAGRID_SX, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";

const IDENTITY = {
  hybrid: { label: "Hybrid", fg: BRAND.tealText, bg: BRAND.tealSoft },
  g2_classic: { label: "G2 · classic", fg: BRAND.alert.warningText, bg: BRAND.alert.warningSoft },
  legacy_issuer: { label: "Legacy issuer", fg: BRAND.alert.warningText, bg: BRAND.alert.warningSoft },
  no_active_cert: { label: "No active certificate", fg: BRAND.dark, bg: BRAND.darkSoft }
};

/**
 * Qué dice cada motivo y por qué. El texto del tooltip es la explicación que
 * hacía falta el 14-sep: no «no», sino «no, porque…».
 */
export function readinessMeta(code, rules = {}) {
  const table = {
    pending_unactivated: {
      label: "New certificate never activated",
      tone: "error",
      hint: "The device received its new certificate and has not reconnected with it. It may be offline because of the rotation — check it before rotating anything else."
    },
    rotation_in_flight: { label: "Rotation in progress", tone: "info", hint: "A rotation is already running for this device." },
    done: { label: "Done", tone: "ok", hint: "The device already presents a hybrid identity." },
    no_active_cert: { label: "No active certificate", tone: "neutral", hint: "There is no active identity to rotate." },
    offline: {
      label: "Offline",
      tone: "neutral",
      hint: `Not seen for more than ${rules.offlineHours ?? 24} h: the rotation would not reach it.`
    },
    agent_too_old: {
      label: "Update agent first",
      tone: "warning",
      hint: `Agents older than ${rules.minAgent ?? "the minimum"} rotate to a classic certificate, not a hybrid one.`
    },
    windows_needs_agent_fix: {
      label: `Wait for agent ${rules.minAgentWindows ?? ""}`.trim(),
      tone: "warning",
      hint: "On older agents, a Windows device loses its list of trusted CAs when it renews and goes offline. Update the agent before rotating it."
    },
    needs_approval: {
      label: "Needs approval",
      tone: "warning",
      hint: "This tenant's access policy requires approval to rotate this class of device. An owner can use break-glass."
    },
    ready: { label: "Ready", tone: "ok", hint: "Safe to rotate now." }
  };
  return table[code] ?? { label: code, tone: "neutral", hint: "" };
}

const TONE = {
  error: { fg: BRAND.alert.errorText, bg: BRAND.alert.errorSoft },
  warning: { fg: BRAND.alert.warningText, bg: BRAND.alert.warningSoft },
  ok: { fg: BRAND.tealText, bg: BRAND.tealSoft },
  info: { fg: BRAND.dark, bg: BRAND.darkSoft },
  neutral: { fg: BRAND.dark, bg: BRAND.darkSoft }
};

/** Lo que el servidor vio en la última conexión del equipo. */
export function keyExchangeMeta(kex, rules = {}) {
  const days = rules.keyExchangeMaxAgeDays ?? 7;
  if (!kex) {
    return {
      label: "Not observed",
      tone: "neutral",
      hint: `No connection observed in the last ${days} days.`
    };
  }
  const when = kex.observedAt ? ` Observed ${formatDate(kex.observedAt)}.` : "";
  if (kex.postQuantum) {
    return {
      label: kex.group,
      tone: "ok",
      hint: `Post-quantum hybrid key exchange: the session secret resists harvest-now, decrypt-later.${when}`
    };
  }
  if (kex.group === "unknown") {
    return { label: "Unknown", tone: "neutral", hint: `The server could not read the negotiated group.${when}` };
  }
  return {
    label: kex.group,
    tone: "warning",
    hint: `Classical key exchange: the session secret is not protected against a future quantum computer.${when}`
  };
}

/** El orden de la tabla: primero lo que quema, después lo accionable. */
const PRIORITY = [
  "pending_unactivated",
  "ready",
  "needs_approval",
  "rotation_in_flight",
  "windows_needs_agent_fix",
  "agent_too_old",
  "offline",
  "no_active_cert",
  "done"
];
const priorityOf = (code) => {
  const i = PRIORITY.indexOf(code);
  return i < 0 ? PRIORITY.length : i;
};

function Pill({ label, fg, bg, hint }) {
  const chip = (
    <Chip size="small" label={label} sx={{ color: fg, bgcolor: bg, fontWeight: 700, maxWidth: "100%" }} />
  );
  return hint ? <Tooltip title={hint}>{chip}</Tooltip> : chip;
}

export default function IdentityRotationPanel({ onOpenDevice, loadStatus = getCertificateRotationStatus }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadStatus();
      setData(res ?? null);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [loadStatus]);

  React.useEffect(() => {
    load();
  }, [load]);

  const rules = data?.rules ?? {};
  const devices = React.useMemo(
    () =>
      [...(data?.devices ?? [])].sort(
        (a, b) => priorityOf(a.readiness) - priorityOf(b.readiness) || String(a.hostname).localeCompare(String(b.hostname))
      ),
    [data]
  );
  const by = data?.summary?.byReadiness ?? {};
  const total = data?.summary?.total ?? 0;
  const hybrid = data?.summary?.byState?.hybrid ?? 0;
  const waiting = (by.windows_needs_agent_fix ?? 0) + (by.agent_too_old ?? 0) + (by.needs_approval ?? 0);
  const unreachable = (by.offline ?? 0) + (by.no_active_cert ?? 0);
  const alarms = devices.filter((d) => d.readiness === "pending_unactivated");
  const kexBy = data?.summary?.byKeyExchange ?? {};
  const kexObserved = (kexBy.post_quantum ?? 0) + (kexBy.classical ?? 0) + (kexBy.unknown ?? 0);

  const columns = [
    {
      field: "hostname",
      headerName: "Device",
      flex: 1.2,
      minWidth: 170,
      renderCell: (p) => (
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, color: BRAND.dark }} noWrap title={p.value}>
          {p.value}
        </Typography>
      )
    },
    { field: "platform", headerName: "Platform", width: 100 },
    { field: "agentVersion", headerName: "Agent", width: 90 },
    {
      field: "lastSeenAt",
      headerName: "Last seen",
      width: 150,
      valueFormatter: (value) => (value ? formatDate(value) : "—")
    },
    {
      field: "state",
      headerName: "Identity",
      width: 170,
      renderCell: (p) => {
        const m = IDENTITY[p.value] ?? { label: p.value, fg: BRAND.dark, bg: BRAND.darkSoft };
        return <Pill label={m.label} fg={m.fg} bg={m.bg} hint={p.row.issuer ? `Issuer: ${p.row.issuer}` : null} />;
      }
    },
    {
      field: "readiness",
      headerName: "Rotate now?",
      flex: 1.3,
      minWidth: 220,
      sortComparator: (a, b) => priorityOf(a) - priorityOf(b),
      renderCell: (p) => {
        const m = readinessMeta(p.value, rules);
        const t = TONE[m.tone] ?? TONE.neutral;
        return <Pill label={m.label} fg={t.fg} bg={t.bg} hint={m.hint} />;
      }
    },
    {
      field: "keyExchange",
      headerName: "Key exchange",
      width: 170,
      sortComparator: (a, b) => Number(Boolean(b?.postQuantum)) - Number(Boolean(a?.postQuantum)),
      renderCell: (p) => {
        const m = keyExchangeMeta(p.value, rules);
        const t = TONE[m.tone] ?? TONE.neutral;
        return <Pill label={m.label} fg={t.fg} bg={t.bg} hint={m.hint} />;
      }
    },
    {
      field: "lastRotation",
      headerName: "Last rotation",
      width: 170,
      sortable: false,
      valueGetter: (value) => (value ? `${value.status} · ${formatDate(value.createdAt)}` : "—")
    },
    {
      field: "actions",
      headerName: "",
      width: 90,
      sortable: false,
      renderCell: (p) => (
        <Button size="small" onClick={() => onOpenDevice?.(p.row.deviceId)} aria-label={`Open ${p.row.hostname}`}>
          Open
        </Button>
      )
    }
  ];

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
        <Box>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 700, color: BRAND.dark }}>
            Identity rotation to the hybrid issuer
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8 }}>
            Which desktop agents already present a post-quantum hybrid identity, and which ones are safe to rotate now.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          onClick={load}
          disabled={loading}
          sx={{ alignSelf: { xs: "flex-start", sm: "center" }, whiteSpace: "nowrap" }}
        >
          Refresh
        </Button>
      </Stack>

      {error ? (
        <Alert severity="error">
          <AlertTitle>Could not load the rotation status</AlertTitle>
          {error}
        </Alert>
      ) : null}

      {alarms.length > 0 ? (
        <Alert severity="error" role="alert">
          <AlertTitle>
            {alarms.length === 1
              ? "1 device received a new certificate and has not reconnected"
              : `${alarms.length} devices received a new certificate and have not reconnected`}
          </AlertTitle>
          It may be offline because of the rotation. Check {alarms.length === 1 ? "it" : "them"} before rotating anything else.
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
            {alarms.map((d) => (
              <Button key={d.deviceId} size="small" color="error" variant="outlined" onClick={() => onOpenDevice?.(d.deviceId)}>
                {d.hostname}
                {d.pendingIssuedAt ? ` · issued ${formatDate(d.pendingIssuedAt)}` : ""}
              </Button>
            ))}
          </Stack>
        </Alert>
      ) : null}

      {/* Cinco tarjetas: rejilla de 15 columnas en escritorio, 3 cada una. */}
      <Grid container spacing={2} columns={{ xs: 12, md: 15 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard title="Hybrid identities" value={data ? `${hybrid} / ${total}` : "—"} stretch />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard title="Ready to rotate" value={data ? String(by.ready ?? 0) : "—"} stretch />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Waiting"
            value={data ? String(waiting) : "—"}
            titleHint="Agent update or approval needed before rotating."
            stretch
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Can't be reached"
            value={data ? String(unreachable) : "—"}
            titleHint="Offline, or without an active certificate."
            stretch
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Post-quantum key exchange"
            value={data ? `${kexBy.post_quantum ?? 0} / ${kexObserved}` : "—"}
            titleHint={`Devices whose last connection negotiated a hybrid ML-KEM key exchange, out of those observed in the last ${rules.keyExchangeMaxAgeDays ?? 7} days.`}
            stretch
          />
        </Grid>
      </Grid>

      <Box sx={{ width: "100%" }}>
        <DataGrid
          rows={devices}
          columns={columns}
          getRowId={(r) => r.deviceId}
          loading={loading}
          autoHeight
          disableRowSelectionOnClick
          initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
          pageSizeOptions={[25, 50, 100]}
          sx={DATAGRID_SX}
        />
      </Box>
    </Stack>
  );
}
