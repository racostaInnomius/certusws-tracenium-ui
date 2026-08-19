// Every device with a position, on one map.
//
// Sibling of DeviceLocationMap (one device, inside the drawer) and shares its
// honesty rule: a `gps` pin is a position the device reported about itself, a
// `site` pin is only the nominal location of the network range an operator
// mapped. Same colours, same meaning, so an operator who learned them in the
// drawer reads this map without relearning anything.
//
// Loaded as its own lazy chunk — Leaflet is dead weight for anyone who never
// switches to the map view.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BRAND, ROLE } from "../../theme/brand";

// Leaflet's default marker icons resolve as bundler-relative URLs that Vite
// does not rewrite, so the stock setup renders broken images. A divIcon keeps
// it in CSS and lets the pin carry the brand colour.
function pinIcon(color) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:14px;height:14px;border-radius:50%;
      background:${color};border:3px solid #fff;
      box-shadow:0 0 0 1px rgba(0,0,0,.3);
    "></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/**
 * The badge for a group of co-located devices.
 *
 * Built by hand rather than using the plugin's default so the count reads in
 * the brand palette and scales with the group: a cluster of 40 should look
 * heavier than one of 2 without having to read the number.
 */
function clusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 50 ? 42 : 50;
  return L.divIcon({
    className: "",
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:50%;
      background:${BRAND.teal};color:#fff;border:3px solid #fff;
      box-shadow:0 0 0 1px rgba(0,0,0,.25);
      font-size:${count < 100 ? 13 : 11}px;font-weight:800;
    ">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Frame every pin on first render.
 *
 * Without this the map opens on a default centre and the operator has to hunt
 * for their own fleet. Deliberately NOT re-run on every data refresh: yanking
 * the viewport back while someone is panning around is worse than a slightly
 * stale frame.
 */
function FitToPins({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

export default function FleetLocationMap({
  devices = [],
  withoutPosition = 0,
  loadError = null,
  onSelectDevice,
}) {
  const pins = useMemo(
    () =>
      devices
        .map((d) => ({ ...d, lat: Number(d.lat), lon: Number(d.lon) }))
        .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lon)),
    [devices]
  );

  const bounds = useMemo(
    () => (pins.length ? pins.map((d) => [d.lat, d.lon]) : null),
    [pins]
  );

  // Which devices a clicked badge stands for.
  //
  // A count with no way to see WHO is a dead end: the operator reads "12",
  // and then needs some other route to find out which twelve. Clicking the
  // badge lists them, and each row opens that device.
  const [clusterSelection, setClusterSelection] = useState(null);

  const byAgentId = useMemo(
    () => new Map(pins.map((d) => [d.agentId, d])),
    [pins]
  );

  const handleClusterClick = useCallback(
    (event) => {
      // getAllChildMarkers gives the Leaflet layers; the agentId was stamped on
      // each one when it mounted (see the Marker ref below) because that is the
      // only thread back from a Leaflet layer to our own row.
      const ids = event.layer
        .getAllChildMarkers()
        .map((m) => m.options?.__agentId)
        .filter(Boolean);
      const devices = ids.map((id) => byAgentId.get(id)).filter(Boolean);
      setClusterSelection(devices.length ? devices : null);
    },
    [byAgentId]
  );

  // A failed load must never render as an empty fleet. "No device is reporting
  // a position" is a statement about the fleet; if we could not ask, we do not
  // get to make it.
  if (loadError) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.dark }}>
          Could not load device positions
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1 }}>
          {loadError === "unavailable"
            ? "This control plane does not expose the fleet positions endpoint yet — it arrives with the next backend release."
            : "The request failed. Try refreshing; if it persists, check the control plane logs."}
        </Typography>
      </Box>
    );
  }

  if (!pins.length) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.dark }}>
          No device is reporting a position yet
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1 }}>
          {withoutPosition > 0
            ? `${withoutPosition} device${withoutPosition === 1 ? "" : "s"} have no coordinates. `
            : ""}
          Devices appear here once they report their own position, or once you give a
          mapped network range its coordinates in Location Sites.
        </Typography>
      </Box>
    );
  }

  const gpsCount = pins.filter((d) => d.source === "gps").length;
  const siteCount = pins.length - gpsCount;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.75 }} alignItems="center">
        <Chip
          size="small"
          label={`${gpsCount} device-reported`}
          sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: "rgba(46,125,50,.12)", color: ROLE.positive }}
        />
        <Chip
          size="small"
          label={`${siteCount} by site`}
          sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
        />
        {/* The count that keeps the map honest: five dots means something very
            different if the fleet is five or nineteen. */}
        {withoutPosition > 0 ? (
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            {withoutPosition} device{withoutPosition === 1 ? "" : "s"} without a position — not shown
          </Typography>
        ) : null}
      </Stack>

      <Box
        sx={{
          height: 560,
          borderRadius: 1,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          "& .leaflet-container": { height: "100%", width: "100%", zIndex: 0 },
        }}
      >
        <MapContainer center={[pins[0].lat, pins[0].lon]} zoom={11} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MarkerClusterGroup
            iconCreateFunction={clusterIcon}
            // The coverage polygon on hover is visual noise for an inventory
            // map and obscures the very pins it outlines.
            showCoverageOnHover={false}
            // Devices in the same building sit metres apart. A tight radius
            // keeps two adjacent offices from merging into one badge, which is
            // exactly the way clustering hides meaning.
            maxClusterRadius={45}
            // At the deepest zoom, overlapping pins fan out. Without this, one
            // of two devices twenty metres apart is unreachable with a mouse.
            spiderfyOnMaxZoom
            eventHandlers={{ clusterclick: handleClusterClick }}
          >
          {pins.map((d) => {
            const isGps = d.source === "gps";
            const color = isGps ? ROLE.positive : BRAND.teal;
            return (
              <Marker
                key={d.agentId}
                position={[d.lat, d.lon]}
                icon={pinIcon(color)}
                // Stamp the id on the Leaflet layer so a cluster can name its
                // members. react-leaflet does not forward unknown props to
                // layer options, so the ref is the supported way through.
                ref={(m) => {
                  if (m) m.options.__agentId = d.agentId;
                }}
              >
                {/* Accuracy is drawn only for a device-reported fix, and only
                    when the device gave one. An invented radius around a site
                    pin would claim a precision nobody measured. */}
                {isGps && Number(d.accuracyM) > 0 ? (
                  <Circle
                    center={[d.lat, d.lon]}
                    radius={Number(d.accuracyM)}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.1, weight: 1 }}
                  />
                ) : null}
                <Popup>
                  <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{d.hostname || d.agentId}</Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    {isGps ? "Device-reported position" : `Site: ${d.siteName || d.city || d.subnetCidr || "—"}`}
                  </Typography>
                  {onSelectDevice ? (
                    <Typography
                      component="button"
                      onClick={() => onSelectDevice(d.agentId)}
                      sx={{
                        mt: 0.75, p: 0, border: 0, background: "none", cursor: "pointer",
                        fontSize: 12, fontWeight: 700, color: BRAND.teal, textDecoration: "underline",
                      }}
                    >
                      Open device
                    </Typography>
                  ) : null}
                </Popup>
              </Marker>
            );
          })}
          </MarkerClusterGroup>
          <FitToPins bounds={bounds} />
        </MapContainer>
      </Box>

      {/* What the badge stands for. Rendered below the map rather than inside a
          Leaflet popup: a popup is clipped by the map viewport, and for a
          cluster of thirty that is the difference between a usable list and a
          scrolling stub. */}
      {clusterSelection ? (
        <Box
          sx={{
            mt: 1.5, p: 1.5, borderRadius: 1,
            border: "1px solid", borderColor: "divider",
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: BRAND.dark }}>
              {clusterSelection.length} device{clusterSelection.length === 1 ? "" : "s"} at this location
            </Typography>
            <Typography
              component="button"
              onClick={() => setClusterSelection(null)}
              sx={{
                p: 0, border: 0, background: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, color: BRAND.teal,
              }}
            >
              Close
            </Typography>
          </Stack>
          <Divider sx={{ mb: 1 }} />
          <Stack spacing={0.5} sx={{ maxHeight: 220, overflowY: "auto" }}>
            {clusterSelection.map((d) => (
              <Stack
                key={d.agentId}
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ flexWrap: "wrap", rowGap: 0.25 }}
              >
                <Box
                  sx={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    bgcolor: d.source === "gps" ? ROLE.positive : BRAND.teal,
                  }}
                />
                <Typography
                  component={onSelectDevice ? "button" : "span"}
                  onClick={onSelectDevice ? () => onSelectDevice(d.agentId) : undefined}
                  sx={{
                    p: 0, border: 0, background: "none",
                    cursor: onSelectDevice ? "pointer" : "default",
                    fontSize: 13, fontWeight: 700, color: BRAND.dark,
                    textDecoration: onSelectDevice ? "underline" : "none",
                  }}
                >
                  {d.hostname || d.agentId}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                  {d.osPlatform || "—"} · {d.source === "gps" ? "device-reported" : d.siteName || d.city || "site"}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
}
