// src/components/Billing/StaffSubscriptions.jsx
//
// La vista de STAFF sobre las suscripciones de todos los tenants.
//
// Es la contraparte de la página Billing, que es la vista del CLIENTE sobre la
// suya. Responden preguntas distintas: allí "¿cuánto pago?", aquí "¿quién no
// está pagando, a quién se le acaba la prueba, y a quién le doy más tiempo?".
//
// Vive en el Tenant Administrator porque es donde el staff ya mira la lista de
// tenants, y en su propio panel en vez de como cinco columnas más en la tabla
// de arriba: ésa ya tiene nueve y sumarle plan, estado, prueba y equipos la
// dejaría ilegible justo en la pantalla donde hay que comparar.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import CardMembershipOutlinedIcon from "@mui/icons-material/CardMembershipOutlined";
import { httpGetJson, httpPostJson } from "../../api/http";
import { BRAND } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";

const TIER_LABELS = { starter: "Starter", professional: "Professional", enterprise: "Enterprise" };

/**
 * Cómo se lee el estado de pago de un vistazo.
 *
 * `severity` sólo decide el color: lo que el staff necesita es distinguir "va
 * bien", "hay que llamarle" y "esto ya está cortado", no memorizar el
 * vocabulario de Stripe.
 */
const STATUS_VIEW = {
  active: { label: "Up to date", tone: "success" },
  trialing: { label: "Trial", tone: "info" },
  past_due: { label: "Payment failed", tone: "warning" },
  unpaid: { label: "Unpaid", tone: "error" },
  canceled: { label: "Canceled", tone: "error" },
  incomplete: { label: "Awaiting first payment", tone: "warning" },
  incomplete_expired: { label: "Expired unpaid", tone: "error" },
  none: { label: "No subscription", tone: "default" },
};

/** Prueba: la columna tiene tres estados, no dos. */
function TrialCell({ row }) {
  // Sin fecha NO es "cero días": es que este tenant nunca tuvo prueba. Son dos
  // conversaciones comerciales distintas y la tabla no puede confundirlas.
  if (row.trialDaysLeft === null) {
    return <Typography variant="body2" color="text.secondary">—</Typography>;
  }
  if (row.trialDaysLeft <= 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        ended {new Date(row.trialEndsAt).toLocaleDateString()}
      </Typography>
    );
  }
  return (
    <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.tealText }}>
      {row.trialDaysLeft} day{row.trialDaysLeft === 1 ? "" : "s"} left
    </Typography>
  );
}

export default function StaffSubscriptions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [target, setTarget] = useState(null); // tenant al que se extiende
  const [months, setMonths] = useState(1);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await httpGetJson("/api/v1/billing/admin/subscriptions");
      setRows(data?.subscriptions ?? []);
    } catch (err) {
      setError(err?.message ?? "Could not load subscriptions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const attention = useMemo(
    () =>
      rows.filter(
        (r) => !["active", "trialing"].includes(r.status) || (r.graceDaysLeft ?? 99) <= 5
      ).length,
    [rows]
  );

  const extend = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await httpPostJson(
        `/api/v1/billing/admin/subscriptions/${encodeURIComponent(target.tenantId)}/trial`,
        { months }
      );
      setNotice(
        `${target.tenantName ?? target.tenantId}: full access until ` +
          `${new Date(r.trialEndsAt).toLocaleDateString()}.`
      );
      setTarget(null);
      await load();
    } catch (err) {
      setError(err?.message ?? "Could not extend the trial.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionPaper variant="panel">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <CardMembershipOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
        <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Subscriptions</Typography>
        {/* Cuántos piden atención, para no tener que leer la tabla entera
            cuando lo único que se quiere saber es si hay algo que atender. */}
        {attention > 0 && (
          <Chip size="small" color="warning" label={`${attention} need attention`} />
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>{notice}</Alert>}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={22} sx={{ color: BRAND.teal }} />
        </Stack>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tenant</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell align="right">Devices</TableCell>
                <TableCell>Full access</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const view = STATUS_VIEW[r.status] ?? { label: r.status, tone: "default" };
                const overCap = r.maxDevices != null && r.devices > r.maxDevices;
                return (
                  <TableRow key={r.tenantId} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {r.tenantName ?? `Tenant ${r.tenantId}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        #{r.tenantId}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {TIER_LABELS[r.tier] ?? "—"}
                        {r.mdmTier ? ` · MDM ×${r.mdmQuantity ?? 0}` : ""}
                      </Typography>
                      {/* Contratado y efectivo difieren durante una prueba, y
                          es lo primero que confunde a quien mira: sin esto,
                          nadie entiende por qué un Starter usa PMP. */}
                      {r.effectiveTier && r.effectiveTier !== r.tier && (
                        <Typography variant="caption" sx={{ color: BRAND.tealText }}>
                          using {TIER_LABELS[r.effectiveTier]}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip
                        size="small"
                        label={view.label}
                        color={view.tone === "default" ? undefined : view.tone}
                      />
                      {r.graceDaysLeft != null && (
                        <Typography
                          variant="caption"
                          display="block"
                          color={r.graceDaysLeft > 0 ? "warning.main" : "error.main"}
                        >
                          {r.graceDaysLeft > 0
                            ? `${r.graceDaysLeft} days of grace`
                            : "grace exhausted"}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        color={overCap ? "error.main" : "text.primary"}
                        sx={{ fontWeight: overCap ? 700 : 400 }}
                      >
                        {r.devices} / {r.maxDevices ?? "—"}
                      </Typography>
                    </TableCell>

                    <TableCell><TrialCell row={r} /></TableCell>

                    <TableCell align="right">
                      <Tooltip title="Grant or extend full access — does not change what Stripe bills">
                        <Button
                          size="small"
                          onClick={() => {
                            setMonths(1);
                            setTarget(r);
                          }}
                        >
                          {r.trialDaysLeft > 0 ? "Extend" : "Grant"}
                        </Button>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      <Dialog open={Boolean(target)} onClose={saving ? undefined : () => setTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
          Full access for {target?.tenantName ?? target?.tenantId}
        </DialogTitle>
        <DialogContent>
          <TextField
            select fullWidth size="small" label="Months" value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            sx={{ mt: 1 }}
          >
            {[1, 2, 3, 6, 12].map((m) => (
              <MenuItem key={m} value={m}>{m} month{m === 1 ? "" : "s"}</MenuItem>
            ))}
          </TextField>

          {/* ⚠️ Lo que más se malinterpreta de esta pantalla. Se dice donde se
              decide, no en una nota al pie. */}
          <Alert severity="info" sx={{ mt: 2 }}>
            This grants the highest tier until the date. It does <strong>not</strong>{" "}
            change what Stripe bills — a tenant paying Professional keeps paying
            Professional and uses Enterprise meanwhile.
          </Alert>

          {target?.trialDaysLeft > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              Added on top of the {target.trialDaysLeft} days already left, not instead of them.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTarget(null)} disabled={saving} color="inherit">Cancel</Button>
          <Button onClick={extend} disabled={saving} variant="contained">
            {saving ? "Granting…" : "Grant access"}
          </Button>
        </DialogActions>
      </Dialog>
    </SectionPaper>
  );
}
