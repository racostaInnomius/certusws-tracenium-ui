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

import { useEffect, useMemo } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from "react-leaflet";
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
          {pins.map((d) => {
            const isGps = d.source === "gps";
            const color = isGps ? ROLE.positive : BRAND.teal;
            return (
              <Marker key={d.agentId} position={[d.lat, d.lon]} icon={pinIcon(color)}>
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
          <FitToPins bounds={bounds} />
        </MapContainer>
      </Box>
    </Box>
  );
}
