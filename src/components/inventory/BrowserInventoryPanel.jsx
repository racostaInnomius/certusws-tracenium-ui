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
  Stack,
} from "@mui/material";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { getBrowserInventory } from "../../api/inventoryDashboard";

const MAX_VERSION_CHIPS = 4;

export default function BrowserInventoryPanel({ notify }) {
  const [families, setFamilies] = React.useState([]);
  // Que familia tiene desplegada su lista de equipos atrasados.
  const [expanded, setExpanded] = React.useState(null);
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
        <PublicOutlinedIcon sx={{ color: BRAND.teal, fontSize: ICON.lg }} />
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>Browser inventory</Typography>
        {!loading ? (
          <Chip
            size="small"
            label={`${totalDevices} device${totalDevices === 1 ? "" : "s"}`}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
          />
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>“Behind” = older than the newest version <strong>on the same platform</strong></Typography>
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
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Fleet-latest by platform</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Behind</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Version spread</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {families.map((f) => {
                const extra = f.versions.length - MAX_VERSION_CHIPS;
                const multiPlatform = Array.isArray(f.platforms) && f.platforms.length > 1;
                const behind = Array.isArray(f.behindDevices) ? f.behindDevices : [];
                const abierto = expanded === f.family;
                return (
                  <TableRow key={f.family} hover>
                    <TableCell>
                      <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{f.family}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>{f.deviceCount}</Typography>
                    </TableCell>
                    <TableCell>
                      {/* ⚠️ Uno por plataforma, no uno global. Los navegadores
                          publican compilaciones distintas por SO para la MISMA
                          release: Chrome 152.0.7977.76 en macOS y .82 en
                          Windows son lo mismo, y comparar entre ellas contaba
                          como atrasadas Macs que estaban al dia. */}
                      {Array.isArray(f.platforms) && f.platforms.length > 0 ? (
                        <Stack spacing={0.25}>
                          {f.platforms.map((p) => (
                            <Typography
                              key={p.platform}
                              sx={{ fontSize: TEXT.xs, fontFamily: "monospace", color: BRAND.dark }}
                            >
                              <Box component="span" sx={{ color: BRAND.gray, mr: 0.5 }}>
                                {p.platform}
                              </Box>
                              {p.latestVersion || "—"}
                            </Typography>
                          ))}
                        </Stack>
                      ) : (
                        <Typography sx={{ fontSize: TEXT.sm, fontFamily: "monospace", color: BRAND.dark }}>
                          {f.latestVersion || "—"}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {f.behindCount > 0 ? (
                        // ⚠️ Clicable. El resumen decia "9 atrasados" y no
                        // habia forma de saber CUALES sin recorrer la flota a
                        // mano — el conteo sin la lista no es accionable.
                        <Chip
                          size="small"
                          label={`${f.behindCount} behind`}
                          onClick={behind.length > 0 ? () => setExpanded(abierto ? null : f.family) : undefined}
                          sx={{
                            height: 20, fontSize: TEXT.xs, fontWeight: 700,
                            bgcolor: BRAND.alert?.warningSoft, color: BRAND.alert?.warning,
                            cursor: behind.length > 0 ? "pointer" : "default",
                          }}
                        />
                      ) : (
                        <Chip
                          size="small"
                          label="up to date"
                          sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.alert?.successSoft, color: BRAND.alert?.success }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
                        {f.versions.slice(0, MAX_VERSION_CHIPS).map((v) => (
                          <Chip
                            key={`${v.platform || "?"}-${v.version}`}
                            size="small"
                            // La plataforma solo se nombra cuando la familia
                            // vive en mas de una: en una flota de un solo SO
                            // seria ruido en cada chip.
                            label={
                              multiPlatform
                                ? `${v.version} · ${v.platform} · ${v.deviceCount}`
                                : `${v.version} · ${v.deviceCount}`
                            }
                            sx={{
                              height: 20,
                              fontSize: TEXT.xs,
                              fontFamily: "monospace",
                              bgcolor: v.outdated ? BRAND.alert?.warningSoft : BRAND.tealSoft,
                              color: v.outdated ? BRAND.alert?.warning : BRAND.tealText,
                            }}
                          />
                        ))}
                        {extra > 0 ? (
                          <Tooltip title={f.versions.slice(MAX_VERSION_CHIPS).map((v) => `${v.version} (${v.deviceCount})`).join(", ")}>
                            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>+{extra} more</Typography>
                          </Tooltip>
                        ) : null}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Los equipos concretos de la familia expandida. Va como fila
                  aparte para no ensanchar la tabla en el caso normal. */}
              {families
                .filter((f) => expanded === f.family && Array.isArray(f.behindDevices) && f.behindDevices.length > 0)
                .map((f) => (
                  <TableRow key={`${f.family}-behind`}>
                    <TableCell colSpan={5} sx={{ bgcolor: BRAND.surfaceMuted, py: 1 }}>
                      <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.dark, mb: 0.75 }}>
                        {f.family}: devices behind their platform&apos;s newest version
                      </Typography>
                      <Stack spacing={0.4}>
                        {f.behindDevices.map((d) => (
                          <Typography key={d.agentId} sx={{ fontSize: TEXT.xs, color: BRAND.dark }}>
                            <Box component="span" sx={{ fontWeight: 700 }}>{d.hostname || d.agentId}</Box>
                            <Box component="span" sx={{ color: BRAND.gray }}> · {d.platform} · </Box>
                            <Box component="span" sx={{ fontFamily: "monospace" }}>{d.version}</Box>
                            <Box component="span" sx={{ color: BRAND.gray }}> → </Box>
                            <Box component="span" sx={{ fontFamily: "monospace" }}>{d.latestForPlatform}</Box>
                          </Typography>
                        ))}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}
