// src/msp/Portfolio.jsx
//
// The portfolio landing (F1). What an MSP operator / vendor sees above
// the single-tenant shell.
//
//   * MSP operator → a grid of their clients. Click one → enter its shell.
//   * Vendor       → a grid of MSPs. Click one → drill into that MSP's
//                    clients (vendor → MSP → client). Click a client →
//                    enter its shell.
//
// Selecting a client calls enterTenant() from MspContext, which sets the
// X-Tenant-Id header + flips AppShell over to the existing single-tenant
// shell for that client.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";
import { Menu, MenuItem } from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PageHeader from "../components/common/PageHeader";
import { BRAND } from "../theme/brand";
import { useMsp } from "./MspContext";
import { fetchMspClients, fetchMyMemberships } from "./mspApi";
import PortfolioGrid from "./PortfolioGrid";
import ConsolidatedStrip from "./ConsolidatedStrip";
import MspAdmin from "./MspAdmin";
import MspTeamDialog from "./MspTeamDialog";

export default function Portfolio() {
  const { portfolio, loading, error, enterTenant, reloadPortfolio } = useMsp();
  const [filter, setFilter] = React.useState("");

  // Vendor-only "Partner administration" surface (F3). Toggled from a
  // button in the top-level vendor view; closing it reloads the portfolio
  // so any hierarchy change (new MSP, reassigned client) is reflected.
  const [adminOpen, setAdminOpen] = React.useState(false);

  // Self-service: MSPs the caller OWNs → "Manage team". Fetched only at the
  // MSP-operator level (empty for the vendor). If they own >1 MSP, a menu
  // lets them pick which team to manage.
  const [ownedMsps, setOwnedMsps] = React.useState([]);
  const [teamMsp, setTeamMsp] = React.useState(null); // { id, name } | null
  const [teamMenuAnchor, setTeamMenuAnchor] = React.useState(null);

  // Vendor drill-down state: which MSP is expanded (null = MSP list).
  const [drilledMsp, setDrilledMsp] = React.useState(null); // { id, name } | null
  const [drillItems, setDrillItems] = React.useState([]);
  const [drillLoading, setDrillLoading] = React.useState(false);
  const [drillError, setDrillError] = React.useState("");

  const level = portfolio?.level ?? "none";

  const openMsp = React.useCallback(async (msp) => {
    setDrilledMsp({ id: msp.tenantId, name: msp.name });
    setDrillLoading(true);
    setDrillError("");
    setFilter("");
    try {
      const resp = await fetchMspClients(msp.tenantId);
      setDrillItems(resp?.items ?? []);
    } catch (err) {
      setDrillError(err?.message || "Could not load this MSP's clients.");
      setDrillItems([]);
    } finally {
      setDrillLoading(false);
    }
  }, []);

  const backToMsps = React.useCallback(() => {
    setDrilledMsp(null);
    setDrillItems([]);
    setFilter("");
  }, []);

  // Load the caller's owned MSPs once we know they're an MSP operator.
  React.useEffect(() => {
    let alive = true;
    if (level !== "msp") { setOwnedMsps([]); return () => { alive = false; }; }
    (async () => {
      try {
        const resp = await fetchMyMemberships();
        if (alive) setOwnedMsps((resp?.memberships ?? []).filter((m) => m.role === "OWNER"));
      } catch {
        if (alive) setOwnedMsps([]);
      }
    })();
    return () => { alive = false; };
  }, [level]);

  const openTeam = React.useCallback((m) => {
    setTeamMenuAnchor(null);
    setTeamMsp({ id: m.mspId, name: m.mspName });
  }, []);

  const onManageTeamClick = React.useCallback((e) => {
    if (ownedMsps.length === 1) openTeam(ownedMsps[0]);
    else setTeamMenuAnchor(e.currentTarget);
  }, [ownedMsps, openTeam]);

  // Decide which items are on screen + how a click behaves.
  let items = [];
  let onSelect = () => {};
  let title = "Portfolio";
  let subtitle = "";

  if (level === "vendor" && !drilledMsp) {
    items = portfolio.items;
    onSelect = openMsp; // click MSP → drill in
    title = "Partners";
    subtitle = "Managed service providers. Select one to see its clients.";
  } else if (level === "vendor" && drilledMsp) {
    items = drillItems;
    onSelect = (client) => enterTenant(client.tenantId, client.name, drillItems);
    title = drilledMsp.name || "MSP";
    subtitle = "Clients managed by this MSP. Select one to open its console.";
  } else if (level === "msp") {
    items = portfolio.items;
    onSelect = (client) => enterTenant(client.tenantId, client.name, portfolio.items);
    title = "Clients";
    subtitle = "Your managed clients. Select one to open its console.";
  }

  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      (it.name || `tenant ${it.tenantId}`).toLowerCase().includes(q)
    );
  }, [items, filter]);

  const busy = loading || drillLoading;

  // Vendor opened the admin surface — render it in place of the grid. On
  // close, refresh the portfolio so a newly created MSP / reassigned
  // client shows up immediately.
  if (adminOpen && level === "vendor") {
    return (
      <MspAdmin
        onClose={() => {
          setAdminOpen(false);
          reloadPortfolio();
        }}
      />
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={<BusinessOutlinedIcon />}
        actions={
          level === "vendor" && !drilledMsp ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<SettingsOutlinedIcon />}
              onClick={() => setAdminOpen(true)}
              sx={{
                textTransform: "none",
                fontWeight: 800,
                borderColor: BRAND.teal,
                color: BRAND.tealText,
                "&:hover": { borderColor: BRAND.tealText, bgcolor: BRAND.tealSoft },
              }}
            >
              Manage partners
            </Button>
          ) : level === "msp" && ownedMsps.length > 0 ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<GroupsOutlinedIcon />}
              onClick={onManageTeamClick}
              sx={{
                textTransform: "none",
                fontWeight: 800,
                borderColor: BRAND.teal,
                color: BRAND.tealText,
                "&:hover": { borderColor: BRAND.tealText, bgcolor: BRAND.tealSoft },
              }}
            >
              Manage team
            </Button>
          ) : null
        }
      />

      {/* Owned-MSP picker (only when the caller owns more than one MSP). */}
      <Menu anchorEl={teamMenuAnchor} open={Boolean(teamMenuAnchor)} onClose={() => setTeamMenuAnchor(null)}>
        {ownedMsps.map((m) => (
          <MenuItem key={m.mspId} onClick={() => openTeam(m)}>
            {m.mspName || `Partner ${m.mspId}`}
          </MenuItem>
        ))}
      </Menu>

      <MspTeamDialog
        open={Boolean(teamMsp)}
        mspId={teamMsp?.id}
        mspName={teamMsp?.name}
        onClose={() => setTeamMsp(null)}
      />

      {/* F2 consolidated summary — shown at the top-level list (not when
          drilled into a specific MSP, where the whole-portfolio total
          would be out of context). */}
      {!drilledMsp ? (
        <ConsolidatedStrip
          onOpenClient={(id, name) => enterTenant(id, name)}
        />
      ) : null}

      {/* Vendor drill-down back button */}
      {level === "vendor" && drilledMsp ? (
        <Box sx={{ mb: 2 }}>
          <Button
            size="small"
            startIcon={<ArrowBackOutlinedIcon />}
            onClick={backToMsps}
            sx={{ color: BRAND.gray }}
          >
            Back to partners
          </Button>
        </Box>
      ) : null}

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {drillError ? <Alert severity="error" sx={{ mb: 2 }}>{drillError}</Alert> : null}

      {/* Filter */}
      {items.length > 6 ? (
        <TextField
          size="small"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{ mb: 2, maxWidth: 320 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
              </InputAdornment>
            ),
          }}
        />
      ) : null}

      {busy ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Stack>
      ) : (
        <PortfolioGrid
          items={filtered}
          onSelect={onSelect}
          emptyLabel={
            filter
              ? "No matches."
              : level === "vendor" && !drilledMsp
                ? "No MSPs yet."
                : "No clients yet."
          }
        />
      )}

      {!busy && !error ? (
        <Box sx={{ mt: 3, textAlign: "center" }}>
          <Button size="small" onClick={reloadPortfolio} sx={{ color: BRAND.gray }}>
            Refresh
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
