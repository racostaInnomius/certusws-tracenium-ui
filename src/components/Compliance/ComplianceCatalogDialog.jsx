// src/components/Compliance/ComplianceCatalogDialog.jsx
//
// Checks-catalog browser. Surfaces the GLOBAL compliance control catalog
// (getComplianceCatalog, previously unused by the UI) so an operator/auditor can
// answer "what does Tracenium actually check for?" — filtered by platform,
// category, severity and framework, with per-check description + remediation +
// framework control mappings. Read-only (the catalog is seeded via migration).

import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Stack,
  Typography,
  IconButton,
  TextField,
  MenuItem,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Collapse,
  CircularProgress,
  Tooltip,
  InputAdornment,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import LaunchOutlinedIcon from "@mui/icons-material/LaunchOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { getComplianceCatalog } from "../../api/compliance";

// Canonical severity scale (theme/severity.js) — removes the hardcoded hex.
const SEV_META = {
  critical: severityMeta("critical"),
  high: severityMeta("high"),
  medium: severityMeta("medium"),
  low: severityMeta("low"),
  info: severityMeta("info"),
};
const SEV_ORDER = ["critical", "high", "medium", "low", "info"];
const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function sevMeta(s) {
  return SEV_META[String(s || "").toLowerCase()] || SEV_META.info;
}

function frameworkFamily(framework) {
  const f = String(framework || "");
  if (f.startsWith("cis_")) return "CIS";
  if (f.startsWith("nist_csf")) return "CSF";
  if (f.startsWith("nist_800_53")) return "NIST";
  if (f.startsWith("stig_")) return "STIG";
  return f;
}

function prettyCategory(c) {
  return String(c || "").replace(/_/g, " ");
}

function FrameworkChip({ fw }) {
  const fam = frameworkFamily(fw.framework);
  // CIS levels (L1/L2) and STIG severities (CAT I/II/III) are meaningful; NIST/CSF
  // control levels are noise here.
  const label =
    fw.controlLevel && (fam === "CIS" || fam === "STIG")
      ? `${fam} ${fw.controlId} · ${fw.controlLevel}`
      : `${fam} ${fw.controlId}`;
  const chip = (
    <Chip
      label={label}
      size="small"
      icon={fw.referenceUrl ? <LaunchOutlinedIcon sx={{ fontSize: ICON.xs }} /> : undefined}
      onClick={fw.referenceUrl ? () => window.open(fw.referenceUrl, "_blank", "noopener,noreferrer") : undefined}
      clickable={Boolean(fw.referenceUrl)}
      sx={{
        bgcolor: BRAND.darkSoft,
        color: BRAND.dark,
        fontWeight: 600,
        fontSize: TEXT.xs,
        height: 20,
        border: `1px solid ${BRAND.border}`,
        "& .MuiChip-icon": { color: BRAND.dark, ml: "5px" },
      }}
    />
  );
  return fw.controlTitle ? (
    <Tooltip title={fw.controlTitle} arrow placement="top">
      <span>{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}

function CheckRow({ check }) {
  const [open, setOpen] = React.useState(false);
  const m = sevMeta(check.severity);
  const steps = Array.isArray(check.remediationDetails?.steps) ? check.remediationDetails.steps : [];
  return (
    <>
      <TableRow hover sx={{ "& > *": { borderBottom: open ? "none" : undefined } }}>
        <TableCell sx={{ width: 34, pr: 0 }}>
          <IconButton
            aria-label={open ? "Collapse" : "Expand"}
            size="small"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ExpandLessOutlinedIcon fontSize="small" /> : <ExpandMoreOutlinedIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{check.title}</Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace" }}>{check.checkId}</Typography>
        </TableCell>
        <TableCell>
          <Chip
            size="small"
            label={check.platform}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
          />
        </TableCell>
        <TableCell>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, textTransform: "capitalize" }}>
            {prettyCategory(check.category)}
          </Typography>
        </TableCell>
        <TableCell>
          <Chip size="small" label={m.label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 800, bgcolor: m.bg, color: m.fg }} />
        </TableCell>
        <TableCell>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
            {(check.frameworks || []).map((fw, i) => (
              <FrameworkChip key={`${fw.framework}-${fw.controlId}-${i}`} fw={fw} />
            ))}
          </Stack>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ py: 0, borderBottom: open ? `1px solid ${BRAND.border}` : "none" }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1.5, pl: 5, pr: 2 }}>
              {check.description ? (
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, mb: 1 }}>{check.description}</Typography>
              ) : null}
              {check.remediationSummary ? (
                <>
                  <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray, mb: 0.3 }}>REMEDIATION</Typography>
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, mb: steps.length ? 0.5 : 0 }}>
                    {check.remediationSummary}
                  </Typography>
                </>
              ) : null}
              {steps.length ? (
                <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                  {steps.map((s, i) => (
                    <Typography key={i} component="li" sx={{ fontSize: TEXT.sm, color: BRAND.dark, mb: 0.2 }}>
                      {s}
                    </Typography>
                  ))}
                </Box>
              ) : null}
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 1 }}>
                Collector: {check.collectorPlugin || "—"}
                {check.collectorVersionMin ? ` · min agent ${check.collectorVersionMin}` : ""}
                {check.remediationType ? ` · remediation: ${check.remediationType}` : ""}
              </Typography>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// Fase B — the browser body (filters + count + table) extracted from the
// Dialog so the same component serves BOTH surfaces: the legacy modal
// (kept for compatibility and its tests) and the Catalog tab inside
// Security Compliance. `active` replaces the dialog's `open` as the
// fetch trigger — pass true for an always-mounted tab. `sx` merges onto
// the root flex column (the tab passes a height; the dialog fills its
// DialogContent).
export function CatalogBrowser({ active = true, sx }) {
  const [loading, setLoading] = React.useState(false);
  const [checks, setChecks] = React.useState([]);
  const [err, setErr] = React.useState(null);
  const [platform, setPlatform] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [severity, setSeverity] = React.useState("all");
  const [family, setFamily] = React.useState("all");
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getComplianceCatalog()
      .then((res) => {
        if (cancelled) return;
        setChecks(Array.isArray(res?.checks) ? res.checks : []);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.body?.message || e?.message || "Failed to load catalog");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const categories = React.useMemo(
    () => Array.from(new Set(checks.map((c) => c.category).filter(Boolean))).sort(),
    [checks]
  );
  const families = React.useMemo(
    () => Array.from(new Set(checks.flatMap((c) => (c.frameworks || []).map((f) => frameworkFamily(f.framework))))).sort(),
    [checks]
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return checks
      .filter((c) => platform === "all" || c.platform === platform)
      .filter((c) => category === "all" || c.category === category)
      .filter((c) => severity === "all" || String(c.severity).toLowerCase() === severity)
      .filter((c) => family === "all" || (c.frameworks || []).some((f) => frameworkFamily(f.framework) === family))
      .filter(
        (c) =>
          !needle ||
          String(c.checkId).toLowerCase().includes(needle) ||
          String(c.title).toLowerCase().includes(needle)
      )
      .sort((a, b) => {
        const s = (SEV_RANK[String(b.severity).toLowerCase()] ?? 0) - (SEV_RANK[String(a.severity).toLowerCase()] ?? 0);
        if (s !== 0) return s;
        return String(a.checkId).localeCompare(String(b.checkId));
      });
  }, [checks, platform, category, severity, family, q]);

  const selSx = { minWidth: 130 };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, minHeight: 0, flex: 1, ...sx }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          <TextField
            select size="small" label="Platform" value={platform}
            onChange={(e) => setPlatform(e.target.value)} sx={selSx}
          >
            <MenuItem value="all">All platforms</MenuItem>
            <MenuItem value="windows">Windows</MenuItem>
            <MenuItem value="macos">macOS</MenuItem>
            <MenuItem value="linux">Linux</MenuItem>
            <MenuItem value="cross">Cross-platform</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Category" value={category}
            onChange={(e) => setCategory(e.target.value)} sx={selSx}
          >
            <MenuItem value="all">All categories</MenuItem>
            {categories.map((c) => (
              <MenuItem key={c} value={c} sx={{ textTransform: "capitalize" }}>
                {prettyCategory(c)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Severity" value={severity}
            onChange={(e) => setSeverity(e.target.value)} sx={selSx}
          >
            <MenuItem value="all">All severities</MenuItem>
            {SEV_ORDER.map((s) => (
              <MenuItem key={s} value={s}>
                {SEV_META[s].label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Framework" value={family}
            onChange={(e) => setFamily(e.target.value)} sx={selSx}
          >
            <MenuItem value="all">All frameworks</MenuItem>
            {families.map((f) => (
              <MenuItem key={f} value={f}>
                {f}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small" placeholder="Search check id / title" value={q}
            onChange={(e) => setQ(e.target.value)}
            sx={{ minWidth: 220, flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon sx={{ fontSize: ICON.lg, color: BRAND.gray }} />
                </InputAdornment>
              ),
            }}
          />
        </Stack>

        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          {loading ? "Loading…" : `${filtered.length} of ${checks.length} checks`}
        </Typography>

        <Box sx={{ flex: 1, overflow: "auto", border: `1px solid ${BRAND.border}`, borderRadius: 1 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress size={28} sx={{ color: BRAND.teal }} />
            </Box>
          ) : err ? (
            <Box sx={{ p: 4, textAlign: "center", color: BRAND.alert?.error }}>{err}</Box>
          ) : filtered.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>No checks match these filters.</Box>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 34 }} />
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Check</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Platform</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Severity</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Frameworks</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((c) => (
                  <CheckRow key={c.checkId} check={c} />
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
    </Box>
  );
}

export default function ComplianceCatalogDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: "88vh" } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        <MenuBookOutlinedIcon sx={{ color: BRAND.teal }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>Checks catalog</Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            Every control Tracenium evaluates, across platforms and frameworks.
          </Typography>
        </Box>
        <IconButton aria-label="Close" size="small" onClick={onClose}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: "flex", flexDirection: "column" }}>
        <CatalogBrowser active={open} />
      </DialogContent>
    </Dialog>
  );
}
