// src/components/RemoteControl/ConnectTab.jsx
//
// The Connect tab: the KPI strip and the device table.
//
// ── The KPI strip, and what was wrong with it ────────────────────────
//
// It used to be four cards. Two of them didn't earn their place and one was
// factually wrong:
//
//   · "Connectable devices" showed summary.connectableDevices, which the
//     backend computes as COUNT(*) over every active enrolment with no
//     capability filter at all — the service comment says as much: "We don't
//     filter by rcp capability here to keep this query cheap". The card
//     labelled that number "with rcp enabled". It was the fleet size wearing
//     someone else's name;
//   · "Avg session duration" on its own is noise. An 8-minute average with
//     no idea how many sessions it averages tells you nothing, so it merges
//     into the 7-day card.
//
// readyNow / rcpCapable / fleetTotal now come from /summary, counted in SQL
// over every enrolled device. They used to be derived here from the device
// list, which was only correct while /devices returns the whole fleet —
// fleetNumbers() keeps that as a fallback for the window where the portal is
// newer than the API, and says which of the two it used.

import * as React from "react";
import { Box, Grid, Paper, Skeleton, Stack, Typography } from "@mui/material";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import FlashOnOutlinedIcon from "@mui/icons-material/FlashOnOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import ConnectablesTable from "./ConnectablesTable";
import NoRemoteControlCard from "./NoRemoteControlCard";
import { fleetNumbers } from "./rcpMethods";
import { setDeviceClass } from "../../api/remoteControl";
import { invalidateCachePrefix } from "../../hooks/useCachedFetch";
import {
  useConnectableDevices,
  useRemoteControlSummary,
  useDeviceFacets
} from "./useRemoteControlData";

function Kpi({ title, value, subtitle, icon: Icon, accent, tint, loading, onClick }) {
  const clickable = typeof onClick === "function";
  return (
    <Paper
      elevation={0}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        cursor: clickable ? "pointer" : "default",
        "&:hover": clickable ? { borderColor: BRAND.teal } : undefined,
        "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 }
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tint,
            color: accent,
            flexShrink: 0
          }}
        >
          <Icon fontSize="small" />
        </Box>
        <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600, lineHeight: 1.2 }}>
          {title}
        </Typography>
      </Stack>

      {loading ? (
        <Skeleton variant="text" width={90} height={40} />
      ) : (
        <Typography variant="h4" sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </Typography>
      )}

      {subtitle != null && !loading ? (
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          {subtitle}
        </Typography>
      ) : null}
    </Paper>
  );
}

function durationLabel(seconds) {
  if (seconds == null) return null;
  return seconds < 60 ? `${seconds}s avg` : `${Math.round(seconds / 60)} min avg`;
}

/**
 * Filter state, owned here because this is where the fetch lives.
 *
 * `searchInput` and `search` are deliberately two fields. The input updates
 * on every keystroke so typing stays responsive; `search` — the one in the
 * cache key and the query string — lags 350 ms behind it. Without the split,
 * "SRV-DC01" would be eight requests and eight cache entries, seven of them
 * for prefixes nobody will ever ask for again.
 */
function useDeviceFilters() {
  const [filters, setFilters] = React.useState({
    page: 1,
    pageSize: 25,
    searchInput: "",
    search: "",
    onlineOnly: true,
    rcpOnly: true,
    groupId: null,
    platform: null
  });

  React.useEffect(() => {
    if (filters.searchInput === filters.search) return undefined;
    const t = window.setTimeout(
      () => setFilters((f) => ({ ...f, search: f.searchInput, page: 1 })),
      350
    );
    return () => window.clearTimeout(t);
  }, [filters.searchInput, filters.search]);

  const update = React.useCallback((patch) => {
    setFilters((f) => ({
      ...f,
      ...patch,
      // Any change other than paging returns to page 1. Staying on page 4
      // after narrowing a filter to two results shows an empty table and
      // reads as "nothing matched".
      page: patch.page != null ? patch.page : 1
    }));
  }, []);

  return [filters, update];
}

export default function ConnectTab({
  onConnect,
  highlightDeviceId,
  onShowActiveSessions,
  refreshNonce = 0,
  // La página es quien tiene el snackbar; aquí solo se sabe qué pasó.
  onNotify = null
}) {
  const [filters, setFilters] = useDeviceFilters();

  // A deep link names one device, and the filters that ship on would hide an
  // offline one. Dropping them for that first render is what makes the link
  // land on the row it promised.
  const effectiveFilters = React.useMemo(
    () =>
      highlightDeviceId
        ? { ...filters, search: highlightDeviceId, onlineOnly: false, rcpOnly: false }
        : filters,
    [filters, highlightDeviceId]
  );

  const {
    devices,
    total,
    complete,
    loading: devicesLoading,
    refetch: refetchDevices
  } = useConnectableDevices(effectiveFilters);
  const { summary, loading: summaryLoading, refetch: refetchSummary } = useRemoteControlSummary();
  const { groups, platforms } = useDeviceFacets();

  // Reaches the panel that IS mounted. The ones that aren't are covered by
  // the page invalidating the cache prefix, which makes their next mount
  // reload — see refreshAll() in pages/RemoteControl.jsx.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refetchDevices();
    refetchSummary();
  }, [refreshNonce, refetchDevices, refetchSummary]);

  // ── Corregir la clase de un equipo ────────────────────────────────
  //
  // ⚠️ Cambia el GOBIERNO, no una etiqueta: la clase decide si entrar exige
  // el vistobueno de otra persona y si se le pregunta al usuario del equipo.
  // Por eso se recarga la lista después en vez de pintar el valor nuevo a la
  // ligera — lo que vale es lo que quedó escrito, no lo que se pidió.
  const [classBusyDeviceId, setClassBusyDeviceId] = React.useState("");
  const changeDeviceClass = React.useCallback(
    async (device, next) => {
      const id = String(device?.deviceId || "");
      if (!id) return;
      setClassBusyDeviceId(id);
      try {
        await setDeviceClass(id, next);
        // La clase la leen también el asistente y la matriz de política, y
        // esas viven detrás de otras claves de caché.
        invalidateCachePrefix("remoteControl:");
        await refetchDevices();
        onNotify?.(
          "success",
          `${device.hostname || id} is now treated as ${next === "server" ? "a server" : "an endpoint"}.`
        );
      } catch (err) {
        // Sin recargar: si falló, la fila tiene que seguir enseñando lo que
        // el backend cree, no lo que se intentó.
        onNotify?.("error", `Could not change the class: ${err?.message || "unknown error"}`);
      } finally {
        setClassBusyDeviceId("");
      }
    },
    [refetchDevices, onNotify]
  );

  const fleet = React.useMemo(
    () => fleetNumbers(summary, devices, { complete }),
    [summary, devices, complete]
  );

  // How many devices the "remote control" filter hides. It comes from the
  // summary and not from counting rows: with a paged list the rows on screen
  // cannot answer a question about the whole fleet.
  const withoutRcp =
    fleet.fleetTotal != null && fleet.rcpCapable != null
      ? Math.max(0, fleet.fleetTotal - fleet.rcpCapable)
      : null;

  const active = Number(summary?.activeSessions ?? 0);
  const last7d = Number(summary?.sessionsLast7d ?? 0);
  const avg = durationLabel(summary?.avgDurationSec ?? null);
  const denied = Number(summary?.deniedByUser7d ?? 0);

  // No device has a capability: the table would be an empty box with three
  // filters on top. The card explains it and says where to fix it.
  //
  // Gated on the device list having FINISHED loading and not on rcpCapable
  // alone, because /summary can land first and rcpCapable is 0 until it
  // does — without the guard the card flashes over a fleet that has plugins.
  // The card covers both shapes of empty (no devices, or devices with no
  // capability), so it must not also require devices.length === 0.
  const showEmptyState = !devicesLoading && fleet.rcpCapable === 0;

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Kpi
            title="Ready now"
            value={
              fleet.readyNow == null ? (
                "—"
              ) : (
                <>
                  {fleet.readyNow}
                  <Box
                    component="span"
                    sx={{ fontSize: "1rem", color: BRAND.gray, fontWeight: 500 }}
                  >
                    {" "}
                    / {fleet.rcpCapable}
                  </Box>
                </>
              )
            }
            subtitle={
              fleet.fleetTotal == null
                ? "fleet totals unavailable"
                : `online with remote control · ${fleet.fleetTotal} devices in the fleet`
            }
            icon={DesktopWindowsOutlinedIcon}
            accent={BRAND.teal}
            tint={BRAND.tealSoft}
            // The count comes from /summary now, so the card is ready as
            // soon as that lands — waiting on the device list would leave it
            // blank while a long list downloads behind it.
            loading={
              fleet.source === "server"
                ? summaryLoading && !summary
                : devicesLoading && devices.length === 0
            }
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Kpi
            title="Active sessions"
            value={active}
            subtitle={active > 0 ? "in progress — open the history" : "none right now"}
            icon={FlashOnOutlinedIcon}
            accent={active > 0 ? ROLE.positive : BRAND.gray}
            tint={active > 0 ? ROLE.positiveSoft : BRAND.surfaceMuted}
            loading={summaryLoading && !summary}
            // A number nobody can act on is decoration. Clicking it goes to
            // the history, which is where the sessions themselves are.
            onClick={active > 0 ? onShowActiveSessions : undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Kpi
            title="Last 7 days"
            value={last7d}
            subtitle={
              <>
                {last7d > 0
                  ? [`${last7d === 1 ? "session" : "sessions"}`, avg]
                      .filter(Boolean)
                      .join(" · ")
                  : "no sessions yet"}
                {/* ADR-0012's number, which until now appeared on no screen
                    at all: how often the person at the endpoint said no.
                    Rendered only when it isn't zero — with consent switched
                    off it is always zero, and a permanent "0 refused" would
                    read as reassurance about a question nobody is asking. */}
                {denied > 0 ? (
                  <Box component="span" sx={{ color: ROLE.caution, fontWeight: 700 }}>
                    {" · "}
                    {denied} refused by the user
                  </Box>
                ) : null}
              </>
            }
            icon={HistoryOutlinedIcon}
            accent={BRAND.teal}
            tint={BRAND.tealSoft}
            loading={summaryLoading && !summary}
          />
        </Grid>
      </Grid>

      {showEmptyState ? (
        <NoRemoteControlCard fleetTotal={fleet.fleetTotal} />
      ) : (
        <ConnectablesTable
          devices={devices}
          loading={devicesLoading}
          onConnect={onConnect}
          highlightDeviceId={highlightDeviceId}
          filters={filters}
          onFilters={setFilters}
          total={total}
          withoutRcp={withoutRcp}
          groups={groups}
          platforms={platforms}
          onChangeDeviceClass={changeDeviceClass}
          classBusyDeviceId={classBusyDeviceId}
        />
      )}
    </Box>
  );
}
