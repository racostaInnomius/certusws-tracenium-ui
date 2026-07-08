// src/components/inventory/BrowserInventoryPanel.jsx
//
// Fleet browser posture — the #1 client-side attack surface. Per browser family:
// how many devices run it, the newest version present in the fleet, how many
// devices are behind that, and the version spread. "Behind" is relative to the
// fleet-latest (we don't ship a vendor version feed), so it reads honestly as
// "behind the newest version any of your devices runs".

import * as React from "react";
import {
  Box,
  Paper,
  Typography,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import { BRAND } from "../../theme/brand";
import { getBrowserInventory } from "../../api/inventoryDashboard";

const MAX_VERSION_CHIPS = 4;

export default function BrowserInventoryPanel({ notify }) {
  const [families, setFamilies] = React.useState([]);
  const [totalDevices, setTotalDevices] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBrowserInventory()
      .then((res) => {
        if (cancelled) return;
        setFamilies(Array.isArray(res?.families) ? res.families : []);
        setTotalDevices(Number(res?.totalDevicesWithBrowser ?? 0));
      })
      .catch((err) => {
        if (cancelled) return;
        setFamilies([]);
        notify?.("error", err?.body?.message || err?.message || "Failed to load browser inventory");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [notify]);

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <PublicOutlinedIcon sx={{ color: BRAND.teal, fontSize: 20 }} />
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: 15 }}>Browser inventory</Typography>
        {!loading ? (
          <Chip
            size="small"
            label={`${totalDevices} device${totalDevices === 1 ? "" : "s"}`}
            sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
          />
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 11, color: BRAND.gray }}>“Behind” = older than the newest version in your fleet</Typography>
      </Box>

      {loading ? (
        <Skeleton variant="rounded" height={160} />
      ) : families.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center", color: BRAND.gray }}>
          <Typography variant="caption">No browsers detected in the software inventory yet.</Typography>
        </Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Browser</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Devices</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Fleet-latest</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Behind</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Version spread</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {families.map((f) => {
                const extra = f.versions.length - MAX_VERSION_CHIPS;
                return (
                  <TableRow key={f.family} hover>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>{f.family}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, color: BRAND.dark }}>{f.deviceCount}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: BRAND.dark }}>
                        {f.latestVersion || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {f.behindCount > 0 ? (
                        <Chip
                          size="small"
                          label={`${f.behindCount} behind`}
                          sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: BRAND.alert?.warningSoft, color: BRAND.alert?.warning }}
                        />
                      ) : (
                        <Chip
                          size="small"
                          label="up to date"
                          sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: BRAND.alert?.successSoft, color: BRAND.alert?.success }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
                        {f.versions.slice(0, MAX_VERSION_CHIPS).map((v) => (
                          <Chip
                            key={v.version}
                            size="small"
                            label={`${v.version} · ${v.deviceCount}`}
                            sx={{
                              height: 20,
                              fontSize: 11,
                              fontFamily: "monospace",
                              bgcolor: v.outdated ? BRAND.alert?.warningSoft : BRAND.tealSoft,
                              color: v.outdated ? BRAND.alert?.warning : BRAND.tealText,
                            }}
                          />
                        ))}
                        {extra > 0 ? (
                          <Tooltip title={f.versions.slice(MAX_VERSION_CHIPS).map((v) => `${v.version} (${v.deviceCount})`).join(", ")}>
                            <Typography sx={{ fontSize: 11, color: BRAND.gray }}>+{extra} more</Typography>
                          </Tooltip>
                        ) : null}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}
