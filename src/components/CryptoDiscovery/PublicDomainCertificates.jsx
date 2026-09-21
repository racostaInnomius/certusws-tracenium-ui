// src/components/CryptoDiscovery/PublicDomainCertificates.jsx
//
// Los certificados de los dominios públicos (Certificate Transparency), como
// vista propia dentro de «Outside your devices» (21-sep).
//
// Por qué: el cliente que SÓLO vigila dominios no tenía dónde verlos. Estaban
// mezclados en la tabla genérica de fuera —columnas de algoritmo y familia,
// ni caducidad ni dominio—, al fondo de Explore y bajo un chip por cada
// nombre que el conector había tenido. Aquí se miran por lo que importa de un
// certificado público: de qué dominio es, quién lo emitió, cuándo caduca y si
// algún equipo lo tiene. Lo que vence primero, arriba.
//
// Se llega desde Settings → Public domains («View certificates», o un dominio
// concreto), desde el chip «Public domains» de Outside, o desde el gajo del
// sunburst. El dominio elegido vive en la URL (`adomain`).

import * as React from "react";
import { Alert, Box, Button, Chip, Stack, TextField, Tooltip, Typography } from "@mui/material";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { listCryptoAssets } from "../../api/cdp";

const MONO = "ui-monospace, Menlo, monospace";
const DAY = 86_400_000;
export const EXPIRING_DAYS = 30;

/** Días hasta que caduca (negativo = caducado); null sin fecha. */
export function daysLeft(notAfter, now) {
  if (!notAfter) return null;
  const t = Date.parse(notAfter);
  return Number.isFinite(t) ? Math.floor((t - now) / DAY) : null;
}

/**
 * Lo que se enseña, a partir de lo que llegó. Puro: los filtros y el
 * resumen se prueban sin montar nada.
 */
export function publicDomainView(items, { domain = "", query = "", expiringOnly = false, notOnDevicesOnly = false, now }) {
  const certs = (items ?? []).filter((a) => a.assetType === "certificate");
  const domains = [...new Set(certs.map((a) => a.domain).filter(Boolean))].sort();
  const q = query.trim().toLowerCase();
  const rows = certs.filter((a) => {
    if (domain && a.domain !== domain) return false;
    const d = daysLeft(a.notAfter, now);
    if (expiringOnly && !(d != null && d <= EXPIRING_DAYS)) return false;
    if (notOnDevicesOnly && a.inFleet) return false;
    if (q && ![a.name, a.subjectName, ...(a.names ?? [])].some((n) => String(n ?? "").toLowerCase().includes(q))) return false;
    return true;
  });
  // El servidor ya ordena por caducidad; se repite aquí para no depender de ello.
  rows.sort((a, b) => (Date.parse(a.notAfter ?? "") || Infinity) - (Date.parse(b.notAfter ?? "") || Infinity));
  const scope = domain ? certs.filter((a) => a.domain === domain) : certs;
  return {
    domains,
    rows,
    total: scope.length,
    expiring: scope.filter((a) => {
      const d = daysLeft(a.notAfter, now);
      return d != null && d <= EXPIRING_DAYS;
    }).length,
    notOnDevices: scope.filter((a) => !a.inFleet).length
  };
}

function ExpiryCell({ notAfter, now }) {
  const d = daysLeft(notAfter, now);
  if (d == null) return <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>—</Typography>;
  const tone =
    d < 0
      ? { bg: BRAND.alert.errorSoft, fg: BRAND.alert.errorText, label: "expired" }
      : d <= EXPIRING_DAYS
        ? { bg: BRAND.alert.warningSoft, fg: BRAND.alert.warningText, label: d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}` }
        : null;
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Typography sx={{ fontSize: TEXT.sm }}>{new Date(notAfter).toLocaleDateString()}</Typography>
      {tone ? (
        <Chip size="small" label={tone.label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: tone.bg, color: tone.fg }} />
      ) : (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>in {d} days</Typography>
      )}
    </Stack>
  );
}

export default function PublicDomainCertificates({ refreshNonce, domain = "", onDomainChange, onShowAll, onSelect, onOpenSettings, now: fixedNow }) {
  const [items, setItems] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [expiringOnly, setExpiringOnly] = React.useState(false);
  const [notOnDevicesOnly, setNotOnDevicesOnly] = React.useState(false);
  const [now] = React.useState(() => fixedNow ?? Date.now());
  const ref = React.useRef(null);

  // Explore la pone arriba cuando se pide; esto sólo trae la vista a la
  // pantalla si se llegó con la página ya desplazada (desde Settings).
  React.useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    // Todos los de CT de una vez: los chips de dominio salen de aquí, y el
    // filtro por dominio es local (un tenant vigila pocos dominios).
    listCryptoAssets({ origin: "ct", limit: 1000 })
      .then((l) => alive && setItems(l?.items ?? []))
      .catch((e) => alive && setError(e?.message || String(e)));
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  const v = publicDomainView(items ?? [], { domain, query, expiringOnly, notOnDevicesOnly, now });

  return (
    <SectionPaper>
      <Box ref={ref} sx={{ scrollMarginTop: 80 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 0.5 }}>
        <Box>
          {onShowAll ? (
            <Button size="small" onClick={onShowAll} sx={{ px: 0, minWidth: 0, fontSize: TEXT.xs }}>
              ← Everything outside your devices
            </Button>
          ) : null}
          <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>Public domain certificates</Typography>
        </Box>
        {onOpenSettings ? (
          <Button size="small" startIcon={<SettingsOutlinedIcon fontSize="small" />} onClick={onOpenSettings} sx={{ flexShrink: 0 }}>
            Manage domains
          </Button>
        ) : null}
      </Stack>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1.5 }}>
        The certificates public CAs logged for the domains you watch and their subdomains, soonest to expire first. One
        that no device has is a service without an agent — or someone requesting certificates for your domains on their
        own.
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}

      {items && v.domains.length === 0 && !error ? (
        <Alert severity="info" action={onOpenSettings ? <Button color="inherit" size="small" onClick={onOpenSettings}>Add a domain</Button> : null}>
          No public certificates yet. Add a domain in Settings → Public domains and run it.
        </Alert>
      ) : null}

      {v.domains.length > 0 ? (
        <>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }} role="group" aria-label="Domain">
            <Chip size="small" label="All domains" onClick={() => onDomainChange?.("")} variant={domain ? "outlined" : "filled"} />
            {v.domains.map((d) => (
              <Chip key={d} size="small" label={d} onClick={() => onDomainChange?.(d)} variant={domain === d ? "filled" : "outlined"} sx={{ fontFamily: MONO }} />
            ))}
            {domain && !v.domains.includes(domain) ? (
              // Un enlace a un dominio sin certificados (recién añadido, aún sin leer).
              <Chip size="small" label={domain} onDelete={() => onDomainChange?.("")} variant="filled" sx={{ fontFamily: MONO }} />
            ) : null}
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
              <strong>{v.total}</strong> certificate{v.total === 1 ? "" : "s"}
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: v.expiring ? BRAND.alert.warningText : BRAND.dark, fontWeight: v.expiring ? 700 : 400 }}>
              {v.expiring} expire within {EXPIRING_DAYS} days
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{v.notOnDevices} not on any of your devices</Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
            <TextField
              size="small"
              placeholder="Search a name (api.example.com)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              slotProps={{ htmlInput: { "aria-label": "Search a name", style: { fontFamily: MONO } } }}
              sx={{ minWidth: 260 }}
            />
            <Chip size="small" label={`Expiring ≤ ${EXPIRING_DAYS} days`} onClick={() => setExpiringOnly((x) => !x)} variant={expiringOnly ? "filled" : "outlined"} aria-pressed={expiringOnly} />
            <Chip size="small" label="Not on any device" onClick={() => setNotOnDevicesOnly((x) => !x)} variant={notOnDevicesOnly ? "filled" : "outlined"} aria-pressed={notOnDevicesOnly} />
          </Stack>

          <Box sx={{ overflowX: "auto", mt: 1.5 }}>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: TEXT.sm, minWidth: 640 }}>
              <Box component="thead">
                <Box component="tr" sx={{ textAlign: "left", color: TEXT_MUTED, fontSize: TEXT.xs, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  <Box component="th" sx={{ py: 0.5 }}>Certificate</Box>
                  <Box component="th">Domain</Box>
                  <Box component="th">Issuer</Box>
                  <Box component="th">Expires</Box>
                  <Box component="th">On devices</Box>
                </Box>
              </Box>
              <Box component="tbody">
                {v.rows.map((a) => {
                  const others = (a.names ?? []).filter((n) => n !== a.name);
                  return (
                    <Box component="tr" key={a.assetId} sx={{ borderTop: `1px solid ${BRAND.border}` }}>
                      <Box component="td" sx={{ py: 0.75, pr: 1 }}>
                        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, fontFamily: MONO }}>{a.name}</Typography>
                        {others.length > 0 ? (
                          <Tooltip title={others.join(", ")}>
                            <Typography component="span" sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, cursor: "help" }}>
                              +{others.length} more name{others.length === 1 ? "" : "s"}
                            </Typography>
                          </Tooltip>
                        ) : null}
                      </Box>
                      <Box component="td" sx={{ fontSize: TEXT.xs, fontFamily: MONO, color: TEXT_MUTED }}>{a.domain ?? "—"}</Box>
                      <Box component="td">{a.issuerShort || a.issuerName || "—"}</Box>
                      <Box component="td"><ExpiryCell notAfter={a.notAfter} now={now} /></Box>
                      <Box component="td">
                        {a.inFleet ? (
                          <Chip size="small" label="seen by an agent" onClick={() => onSelect?.({ search: a.fingerprint256 })} sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText }} />
                        ) : (
                          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>not on any device</Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
            {v.rows.length === 0 ? (
              <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, mt: 1 }}>Nothing matches these filters.</Typography>
            ) : null}
          </Box>
        </>
      ) : null}
    </SectionPaper>
  );
}
