// src/components/inventory/BrowserExtensionsPanel.jsx
//
// Browser extensions found across the fleet — as INVENTORY.
//
// ⚠️ Neutral on purpose. Asset Management answers "what is there". How risky an
// extension is lives in Security Compliance (cross.browser_extensions.*
// findings, with score, exceptions and trend), and blocking or approving one
// lives in Patch Management → Security configuration → Browsers. A risk chip
// or a Block button here would be a second, disconnected place to decide the
// same thing.
//
// Collapsed by default: the page is long and most visits want the total, not
// the table. Expanding loads nothing new — the list came with the total.
//
// ⚠️ Coverage is stated, not implied: Linux is not read, and an empty list on
// a Linux fleet must not read as "no extensions".

import * as React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import { BRAND, ICON, TEXT, TEXT_MUTED } from "../../theme/brand";
import { getBrowserExtensions } from "../../api/inventoryDashboard";
import CreateDeviceGroupButton from "../common/CreateDeviceGroupButton";

const BROWSER_LABEL = { chrome: "Chrome", edge: "Edge", firefox: "Firefox" };

const SOURCE_LABEL = {
  store: "Store",
  policy: "Policy",
  default: "Preinstalled",
  sideloaded: "Other software",
  unpacked: "Developer mode",
  unknown: "Unknown",
};

const PAGE = 50;

function coverageText(coverage) {
  const c = coverage || {};
  const read = Number(c.collected || 0);
  const parts = [`${read} device${read === 1 ? "" : "s"} read`];
  if (Number(c.unsupported || 0) > 0) parts.push(`${c.unsupported} Linux not read`);
  if (Number(c.unavailable || 0) > 0) parts.push(`${c.unavailable} could not be read`);
  return parts.join(" · ");
}

export default function BrowserExtensionsPanel({ notify }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState(null);
  const [limit, setLimit] = React.useState(PAGE);

  // `notify` llega inline desde la página: como dependencia del efecto, cada
  // render de SoftwareInventory volvía a pedir la lista.
  const notifyRef = React.useRef(notify);
  React.useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBrowserExtensions()
      .then((res) => !cancelled && setData(res || null))
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        notifyRef.current?.("error", err?.body?.message || err?.message || "Failed to load browser extensions");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const all = React.useMemo(() => (Array.isArray(data?.extensions) ? data.extensions : []), [data]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      all
        .filter((e) => !q || String(e.name).toLowerCase().includes(q) || String(e.extensionId).toLowerCase().includes(q))
        // Inventario: por presencia en la flota, no por riesgo.
        .sort((a, b) => b.devices - a.devices || String(a.name).localeCompare(String(b.name)))
    );
  }, [all, query]);
  const unavailable = data?.available === false;
  const installs = Number(data?.totals?.installs || 0);

  return (
    <Accordion
      disableGutters
      elevation={0}
      expanded={open}
      onChange={(_, v) => setOpen(v)}
      sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 2, mb: 3, "&:before": { display: "none" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="browser-extensions-content" id="browser-extensions-header">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", width: "100%" }}>
          <ExtensionOutlinedIcon sx={{ color: BRAND.teal, fontSize: ICON.lg }} />
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>Browser extensions</Typography>
          {loading ? (
            <Skeleton variant="rounded" width={120} height={20} />
          ) : unavailable ? (
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>not enabled on this server yet</Typography>
          ) : (
            <>
              <Chip
                size="small"
                label={`${all.length} found`}
                sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
              />
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                {installs} install{installs === 1 ? "" : "s"} · {coverageText(data?.coverage)}
              </Typography>
            </>
          )}
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0 }}>
        {loading || unavailable ? null : all.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, p: 1 }}>
            {Number(data?.coverage?.collected || 0) > 0
              ? "No extensions found in the browser profiles the agents read."
              : "No device has reported its browser extensions yet. Windows and macOS agents report them on their next inventory."}
          </Typography>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
              <Tooltip title="How risky each extension is: Security Compliance. Blocking or approving: Patch Management → Security configuration → Browsers.">
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                  Inventory only — risk lives in Security Compliance, blocking and approving in Patch Management
                </Typography>
              </Tooltip>
              <Box sx={{ flex: 1 }} />
              <TextField
                size="small"
                placeholder="Search name or ID"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                inputProps={{ "aria-label": "Search extensions" }}
                sx={{ minWidth: 220 }}
              />
            </Box>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 680 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Extension</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Devices</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Installed from</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Versions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.slice(0, limit).map((e) => {
                    const key = `${e.browser}|${e.extensionId}`;
                    const rowOpen = expanded === key;
                    const disabled = Number(e.installs || 0) - Number(e.enabledInstalls || 0);
                    return (
                      <React.Fragment key={key}>
                        <TableRow hover onClick={() => setExpanded(rowOpen ? null : key)} sx={{ cursor: "pointer" }} aria-expanded={rowOpen}>
                          <TableCell>
                            <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{e.name}</Typography>
                            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                              {BROWSER_LABEL[e.browser] || e.browser} ·{" "}
                              <Box component="span" sx={{ fontFamily: "monospace" }}>
                                {e.extensionId}
                              </Box>
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>{e.devices}</Typography>
                            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                              {e.users} user{e.users === 1 ? "" : "s"}
                              {disabled > 0 ? ` · ${disabled} disabled` : ""}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                              {(e.sources || []).map((s) => SOURCE_LABEL[s] || s).join(", ")}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Tooltip title={(e.versions || []).join(", ")}>
                              <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>{(e.versions || []).length}</Typography>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                        {rowOpen ? (
                          <TableRow>
                            <TableCell colSpan={4} sx={{ bgcolor: BRAND.surfaceMuted, py: 1.25 }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
                                <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.dark }}>Where it is installed</Typography>
                                <Box sx={{ flex: 1 }} />
                                <CreateDeviceGroupButton
                                  deviceIds={(e.installList || []).map((i) => i.agentId)}
                                  namePrefix={`${e.name} installed`}
                                  origin={`Browser extensions · ${BROWSER_LABEL[e.browser] || e.browser} · ${e.name}`}
                                  notify={notify}
                                />
                              </Box>
                              <Stack spacing={0.3}>
                                {(e.installList || []).map((i) => (
                                  <Typography key={`${i.agentId}|${i.osUser}|${i.profile}`} sx={{ fontSize: TEXT.xs, color: BRAND.dark }}>
                                    <Box component="span" sx={{ fontWeight: 700 }}>
                                      {i.hostname || i.agentId}
                                    </Box>
                                    <Box component="span" sx={{ color: TEXT_MUTED }}>
                                      {" "}
                                      · {i.osUser || "?"} · {i.profile || "?"} ·{" "}
                                    </Box>
                                    <Box component="span" sx={{ fontFamily: "monospace" }}>
                                      {i.version || "—"}
                                    </Box>
                                    <Box component="span" sx={{ color: TEXT_MUTED }}>
                                      {" "}
                                      · {SOURCE_LABEL[i.installSource] || i.installSource}
                                      {i.enabled === false ? " · disabled" : ""}
                                    </Box>
                                  </Typography>
                                ))}
                                {e.installListTruncated ? (
                                  <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                                    Showing the first {(e.installList || []).length} of {e.installs} installs.
                                  </Typography>
                                ) : null}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
            {filtered.length === 0 ? (
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, p: 2, textAlign: "center" }}>No extension matches.</Typography>
            ) : null}
            {filtered.length > limit ? (
              <Box sx={{ textAlign: "center", mt: 1 }}>
                <Button size="small" onClick={() => setLimit((n) => n + PAGE)}>
                  Show {Math.min(PAGE, filtered.length - limit)} more of {filtered.length - limit}
                </Button>
              </Box>
            ) : null}
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
