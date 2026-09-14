// src/components/inventory/BrowserExtensionsPanel.jsx
//
// Extensions installed in Chrome, Edge and Firefox across the fleet, with how
// much each one can reach.
//
// ⚠️ The risk level measures CAPABILITY, not intent: a legitimate password
// manager asks for what a session stealer asks for. That is why every level
// carries its reasons — the operator decides with them in front of them, and
// the level alone would read as an accusation.
//
// ⚠️ Coverage is stated, not implied. Linux devices are not read (the agent's
// sandbox keeps it out of home folders) and an empty table on a fleet of Linux
// machines must not read as "no extensions".

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Paper,
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
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import { BRAND, ICON, TEXT, TEXT_MUTED } from "../../theme/brand";
import { SEVERITY_ORDER, severityMeta } from "../../theme/severity";
import { getSearchParam } from "../../utils/browserState";
import { deleteExtensionRule, getBrowserExtensions, getExtensionRules, putExtensionRule } from "../../api/inventoryDashboard";
import CreateDeviceGroupButton from "../common/CreateDeviceGroupButton";
import { BlockAllOthersControls, ExtensionRuleActions, RuleChip } from "./ExtensionRuleControls";

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

function RiskChip({ risk }) {
  const meta = severityMeta(risk?.level);
  const reasons = Array.isArray(risk?.reasons) ? risk.reasons : [];
  return (
    <Tooltip
      title={
        reasons.length > 0 ? (
          <Stack spacing={0.25}>
            {reasons.map((r) => (
              <span key={r.code}>{r.label}</span>
            ))}
          </Stack>
        ) : (
          "No permission that reaches beyond the extension itself"
        )
      }
    >
      <Chip size="small" label={meta.label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: meta.bg, color: meta.fg }} />
    </Tooltip>
  );
}

function CoverageLine({ coverage }) {
  const c = coverage || {};
  const parts = [`${Number(c.collected || 0)} read`];
  if (Number(c.unsupported || 0) > 0) parts.push(`${c.unsupported} Linux not read`);
  if (Number(c.unavailable || 0) > 0) parts.push(`${c.unavailable} could not be read`);
  return (
    <Tooltip title="Devices whose browser profiles the agent read on its last report. Linux is not read: the agent's sandbox keeps it out of home folders.">
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>Devices: {parts.join(" · ")}</Typography>
    </Tooltip>
  );
}

export default function BrowserExtensionsPanel({ notify, canManageRules = false }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [level, setLevel] = React.useState(null);
  // Deep link desde una alerta: `?extension=chrome|<id>` abre esa fila.
  const linked = React.useMemo(() => {
    const raw = getSearchParam("extension", "");
    const bar = raw.indexOf("|");
    return bar > 0 ? { key: raw, extensionId: raw.slice(bar + 1) } : null;
  }, []);
  const [query, setQuery] = React.useState(linked?.extensionId ?? "");
  const [expanded, setExpanded] = React.useState(linked?.key ?? null);
  const [limit, setLimit] = React.useState(PAGE);

  // ⚠️ `notify` llega como función inline desde la página: con ella en las
  // dependencias, cada render de SoftwareInventory volvía a pedir la lista.
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

  // Reglas: se cargan aparte y un fallo no tumba el inventario (se ocultan los controles).
  const [rulesView, setRulesView] = React.useState(null);
  const loadRules = React.useCallback(() => {
    return getExtensionRules()
      .then((res) => setRulesView(res && Array.isArray(res.rules) ? res : null))
      .catch(() => setRulesView(null));
  }, []);
  React.useEffect(() => {
    loadRules();
  }, [loadRules]);

  const rulesByKey = React.useMemo(() => {
    const map = new Map();
    for (const r of rulesView?.rules || []) map.set(`${r.browser}|${r.extensionId}`, r);
    return map;
  }, [rulesView]);

  const saveRule = async (rule) => {
    try {
      await putExtensionRule(rule);
      notifyRef.current?.("success", "Rule saved. Windows devices apply it on their next check-in.");
      await loadRules();
      return true;
    } catch (err) {
      notifyRef.current?.("error", err?.body?.message || err?.message || "Failed to save the rule");
      return false;
    }
  };
  const removeRule = async (browser, extensionId) => {
    try {
      await deleteExtensionRule(browser, extensionId);
      notifyRef.current?.("success", "Rule removed. Devices take their entry out on their next check-in.");
      await loadRules();
      return true;
    } catch (err) {
      notifyRef.current?.("error", err?.body?.message || err?.message || "Failed to remove the rule");
      return false;
    }
  };

  const all = React.useMemo(() => (Array.isArray(data?.extensions) ? data.extensions : []), [data]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (e) =>
        (!level || e?.risk?.level === level) &&
        (!q || String(e.name).toLowerCase().includes(q) || String(e.extensionId).toLowerCase().includes(q))
    );
  }, [all, level, query]);
  const byLevel = data?.totals?.byLevel || {};

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
        <ExtensionOutlinedIcon sx={{ color: BRAND.teal, fontSize: ICON.lg }} />
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>Browser extensions</Typography>
        {!loading && data?.available !== false ? (
          <Chip
            size="small"
            label={`${all.length} extension${all.length === 1 ? "" : "s"}`}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
          />
        ) : null}
        <Box sx={{ flex: 1 }} />
        {!loading && data?.available !== false ? <CoverageLine coverage={data?.coverage} /> : null}
      </Box>

      {loading ? (
        <Skeleton variant="rounded" height={160} />
      ) : data?.available === false ? (
        <Box sx={{ p: 3, textAlign: "center", color: TEXT_MUTED }}>
          <Typography variant="caption">The extension inventory is not enabled on this server yet.</Typography>
        </Box>
      ) : all.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center", color: TEXT_MUTED }}>
          <Typography variant="caption">
            {Number(data?.coverage?.collected || 0) > 0
              ? "No extensions found in the browser profiles the agents read."
              : "No device has reported its browser extensions yet. Windows and macOS agents report them on their next inventory."}
          </Typography>
        </Box>
      ) : (
        <>
          {rulesView ? (
            <BlockAllOthersControls
              rules={rulesView.rules}
              canManage={canManageRules}
              windowsDevices={rulesView.windowsDevices}
              onSave={saveRule}
              onRemove={removeRule}
            />
          ) : null}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mr: 0.5 }}>Risk</Typography>
            {SEVERITY_ORDER.map((key) => {
              const meta = severityMeta(key);
              const active = level === key;
              return (
                <Chip
                  key={key}
                  size="small"
                  label={`${meta.label} ${Number(byLevel[key] || 0)}`}
                  onClick={() => {
                    setLevel(active ? null : key);
                    setLimit(PAGE);
                  }}
                  aria-pressed={active}
                  sx={{
                    height: 22,
                    fontSize: TEXT.xs,
                    fontWeight: 700,
                    bgcolor: active ? meta.bg : "transparent",
                    color: meta.fg,
                    border: `1px solid ${active ? "transparent" : BRAND.border}`,
                  }}
                />
              );
            })}
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
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Extension</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Risk</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Devices</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Installed from</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Versions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.slice(0, limit).map((e) => {
                  const key = `${e.browser}|${e.extensionId}`;
                  const open = expanded === key;
                  const disabled = Number(e.installs || 0) - Number(e.enabledInstalls || 0);
                  return (
                    <React.Fragment key={key}>
                      <TableRow hover onClick={() => setExpanded(open ? null : key)} sx={{ cursor: "pointer" }} aria-expanded={open}>
                        <TableCell>
                          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
                            {e.name}
                            <RuleChip rule={rulesByKey.get(key)} />
                          </Typography>
                          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                            {BROWSER_LABEL[e.browser] || e.browser} ·{" "}
                            <Box component="span" sx={{ fontFamily: "monospace" }}>
                              {e.extensionId}
                            </Box>
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <RiskChip risk={e.risk} />
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
                      {open ? (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ bgcolor: BRAND.surfaceMuted, py: 1.25 }}>
                            <Stack spacing={1}>
                              {rulesView ? (
                                <ExtensionRuleActions
                                  extension={e}
                                  rule={rulesByKey.get(key)}
                                  canManage={canManageRules}
                                  windowsDevices={rulesView.windowsDevices}
                                  onSave={saveRule}
                                  onRemove={removeRule}
                                />
                              ) : null}
                              <Box>
                                <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.dark, mb: 0.25 }}>
                                  What it can do (worst install)
                                </Typography>
                                {(e.risk?.reasons || []).length > 0 ? (
                                  (e.risk.reasons || []).map((r) => (
                                    <Typography key={r.code} sx={{ fontSize: TEXT.xs, color: BRAND.dark }}>
                                      <Box component="span" sx={{ color: severityMeta(r.level).fg, fontWeight: 700 }}>
                                        {severityMeta(r.level).label}
                                      </Box>{" "}
                                      · {r.label}
                                    </Typography>
                                  ))
                                ) : (
                                  <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                                    No permission that reaches beyond the extension itself.
                                  </Typography>
                                )}
                                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5, fontFamily: "monospace", wordBreak: "break-all" }}>
                                  {[...(e.permissions || []), ...(e.hostPermissions || [])].join(" ") || "—"}
                                </Typography>
                              </Box>
                              <Box>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
                                  <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.dark }}>
                                    Where it is installed
                                  </Typography>
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
                                      <Box component="span" sx={{ fontWeight: 700 }}>{i.hostname || i.agentId}</Box>
                                      <Box component="span" sx={{ color: TEXT_MUTED }}>
                                        {" "}· {i.osUser || "?"} · {i.profile || "?"} ·{" "}
                                      </Box>
                                      <Box component="span" sx={{ fontFamily: "monospace" }}>{i.version || "—"}</Box>
                                      <Box component="span" sx={{ color: TEXT_MUTED }}>
                                        {" "}· {SOURCE_LABEL[i.installSource] || i.installSource}
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
                              </Box>
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
    </Paper>
  );
}
