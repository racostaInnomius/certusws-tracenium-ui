// src/components/patch-management/ExtensionControlPanel.jsx
//
// Browser extension control — the remediation side of extension risk.
//
// Security Compliance measures (cross.browser_extensions.* findings); this is
// where the operator acts on them: block an extension, approve it (accepting
// its risk), or switch a browser to "only approved extensions". Every action
// is a tenant rule the agents apply on their next check-in, and each rule
// shows how far it got.
//
// "To review" lists the extensions that are behind those findings: critical
// or high risk, or installed outside a store, and without a rule yet. Once an
// extension has a rule it moves to "Rules".
//
// ⚠️ An approval expires after six months and then the extension comes BACK to
// "To review" — Security Compliance is counting it again, so leaving it under
// "Rules" would show a decision that no longer holds. It is listed once, where
// the work is.

import * as React from "react";
import { Box, Chip, Paper, Skeleton, Stack, TextField, Typography } from "@mui/material";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import { BRAND, ICON, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { getSearchParam } from "../../utils/browserState";
import { deleteExtensionRule, getBrowserExtensions, getExtensionRules, putExtensionRule } from "../../api/inventoryDashboard";
import { BlockAllOthersControls, ExtensionRuleActions, RuleChip } from "./ExtensionRuleControls";
import { isExpiredApproval } from "./extensionRuleExpiry";

const BROWSER_LABEL = { chrome: "Chrome", edge: "Edge", firefox: "Firefox" };
const OUTSIDE_STORE = new Set(["sideloaded", "unpacked"]);

function needsReview(e) {
  const level = e?.risk?.level;
  return level === "critical" || level === "high" || (e?.sources || []).some((s) => OUTSIDE_STORE.has(s));
}

function ExtensionRow({ extension, rule, canManage, entitled, windowsDevices, onSave, onRemove, highlighted }) {
  const meta = severityMeta(extension.risk?.level);
  const reasons = extension.risk?.reasons || [];
  return (
    <Box
      data-testid={`extension-${extension.browser}-${extension.extensionId}`}
      sx={{ p: 1.25, borderRadius: 1.5, border: `1px solid ${highlighted ? BRAND.teal : BRAND.border}`, bgcolor: highlighted ? BRAND.tealSoft : "transparent" }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{extension.name}</Typography>
        <Chip size="small" label={meta.label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: meta.bg, color: meta.fg }} />
        <RuleChip rule={rule} />
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
          {BROWSER_LABEL[extension.browser] || extension.browser} · {extension.devices} device{extension.devices === 1 ? "" : "s"} ·{" "}
          <Box component="span" sx={{ fontFamily: "monospace" }}>{extension.extensionId}</Box>
        </Typography>
      </Box>
      {reasons.length > 0 ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.dark, mb: 0.75 }}>{reasons.map((r) => r.label).join(" · ")}</Typography>
      ) : null}
      <ExtensionRuleActions
        extension={extension}
        rule={rule}
        canManage={canManage}
        entitled={entitled}
        windowsDevices={windowsDevices}
        onSave={onSave}
        onRemove={onRemove}
      />
    </Box>
  );
}

export default function ExtensionControlPanel({ notify, canManage = false, entitled = true }) {
  const [inventory, setInventory] = React.useState(null);
  const [rulesView, setRulesView] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const linked = React.useMemo(() => getSearchParam("extension", ""), []);
  const [query, setQuery] = React.useState(() => (linked.includes("|") ? linked.slice(linked.indexOf("|") + 1) : ""));

  const notifyRef = React.useRef(notify);
  React.useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const loadRules = React.useCallback(
    () => getExtensionRules().then((res) => setRulesView(res && Array.isArray(res.rules) ? res : null)).catch(() => setRulesView(null)),
    []
  );

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getBrowserExtensions().catch(() => null), loadRules()]).then(([inv]) => {
      if (cancelled) return;
      setInventory(inv);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadRules]);

  const rulesByKey = React.useMemo(() => {
    const map = new Map();
    for (const r of rulesView?.rules || []) map.set(`${r.browser}|${r.extensionId}`, r);
    return map;
  }, [rulesView]);

  const extensions = Array.isArray(inventory?.extensions) ? inventory.extensions : [];
  const q = query.trim().toLowerCase();
  const matches = (e) => !q || String(e.name).toLowerCase().includes(q) || String(e.extensionId).toLowerCase().includes(q);
  const ruleFor = (e) => rulesByKey.get(`${e.browser}|${e.extensionId}`);
  const toReview = extensions.filter((e) => {
    const rule = ruleFor(e);
    if (!matches(e)) return false;
    // Una aprobación vencida es trabajo pendiente aunque haya regla.
    if (isExpiredApproval(rule)) return true;
    return needsReview(e) && !rule;
  });
  const ruled = (rulesView?.rules || []).filter(
    (r) =>
      r.extensionId !== "*" &&
      !isExpiredApproval(r) &&
      (!q || String(r.name || "").toLowerCase().includes(q) || r.extensionId.includes(q))
  );
  const inventoryByKey = new Map(extensions.map((e) => [`${e.browser}|${e.extensionId}`, e]));

  const save = async (rule) => {
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
  const remove = async (browser, extensionId) => {
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

  const shared = { canManage, entitled, windowsDevices: rulesView?.windowsDevices, onSave: save, onRemove: remove };

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
        <ExtensionOutlinedIcon sx={{ color: BRAND.teal, fontSize: ICON.lg }} />
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>Browser extension control</Typography>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder="Search name or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputProps={{ "aria-label": "Search extensions to control" }}
          sx={{ minWidth: 220 }}
        />
      </Box>

      {loading ? (
        <Skeleton variant="rounded" height={120} />
      ) : inventory?.available === false ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>The extension inventory is not enabled on this server yet.</Typography>
      ) : (
        <Stack spacing={2}>
          {rulesView ? <BlockAllOthersControls rules={rulesView.rules} {...shared} /> : null}

          <Box>
            <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.75 }}>
              To review ({toReview.length})
            </Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mb: 1 }}>
              Critical or high risk, or installed outside a store, and without a rule — plus approvals that ran out. This is what the browser extension findings in Security Compliance count.
            </Typography>
            {toReview.length === 0 ? (
              <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Nothing to review.</Typography>
            ) : (
              <Stack spacing={1}>
                {toReview.map((e) => (
                  <ExtensionRow
                    key={`${e.browser}|${e.extensionId}`}
                    extension={e}
                    rule={ruleFor(e) || null}
                    highlighted={linked === `${e.browser}|${e.extensionId}`}
                    {...shared}
                  />
                ))}
              </Stack>
            )}
          </Box>

          <Box>
            <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.75 }}>Rules ({ruled.length})</Typography>
            {ruled.length === 0 ? (
              <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>No extension is blocked or approved yet.</Typography>
            ) : (
              <Stack spacing={1}>
                {ruled.map((r) => {
                  const inv = inventoryByKey.get(`${r.browser}|${r.extensionId}`);
                  const extension = inv || { browser: r.browser, extensionId: r.extensionId, name: r.name || r.extensionId, devices: 0, risk: null };
                  return (
                    <Box key={`${r.browser}|${r.extensionId}`}>
                      <ExtensionRow extension={extension} rule={r} highlighted={linked === `${r.browser}|${r.extensionId}`} {...shared} />
                      {!inv ? (
                        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.25, ml: 1.25 }}>
                          Not installed on any device right now.
                        </Typography>
                      ) : null}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Stack>
      )}
    </Paper>
  );
}
