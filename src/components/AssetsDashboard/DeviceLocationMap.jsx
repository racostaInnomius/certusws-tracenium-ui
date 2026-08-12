// Map panel for a single device, opened from the drawer's "View on map" button.
//
// Loaded as its own lazy chunk (see AgentDetailTabs): Leaflet plus its CSS is
// dead weight for the overwhelming majority of drawer opens, where nobody
// touches the map.
//
// The honesty rule this component exists to enforce: a pin is only as good as
// where it came from. A `gps` pin is a position the device reported about
// itself. A `site` pin is the nominal location of the network range an operator
// mapped — the office, not the machine. Rendering both as an identical dot
// would repeat the mistake that made "Montreal" look like a fact.

import { useEffect, useRef } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BRAND, ROLE } from "../../theme/brand";

// Leaflet's default marker icons are resolved as bundler-relative URLs, which
// Vite does not rewrite — the stock setup renders broken images. A divIcon
// keeps the whole thing in CSS and lets the pin carry the brand colour.
function pinIcon(color) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:16px;height:16px;border-radius:50%;
      background:${color};border:3px solid #fff;
      box-shadow:0 0 0 1px rgba(0,0,0,.3);
    "></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/** Keeps the view centred when the drawer swaps to another device. */
function Recenter({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom());
  }, [map, lat, lon]);
  return null;
}

export default function DeviceLocationMap({ pin, height = 260 }) {
  const containerRef = useRef(null);
  if (!pin) return null;

  const isGps = pin.source === "gps";
  const color = isGps ? ROLE.positive : BRAND.teal;
  // A site pin is a whole network's nominal spot, so it opens wider: zooming to
  // street level would imply a precision the mapping does not have.
  const zoom = isGps ? 15 : 11;

  return (
    <Box ref={containerRef} sx={{ mt: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: "wrap", rowGap: 0.5 }}>
        <Chip
          size="small"
          label={isGps ? "Device-reported position" : "Site location (network range)"}
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 700,
            bgcolor: isGps ? "rgba(46,125,50,.12)" : BRAND.tealSoft,
            color: isGps ? ROLE.positive : BRAND.tealText,
          }}
        />
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {isGps
            ? "Reported by the device itself."
            : "Where this network range is registered — not a position the device reported."}
        </Typography>
      </Stack>

      <Box
        sx={{
          height,
          borderRadius: 1,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          // Leaflet panes stack above MUI's drawer without this.
          "& .leaflet-container": { height: "100%", width: "100%", zIndex: 0 },
        }}
      >
        <MapContainer center={[pin.lat, pin.lon]} zoom={zoom} scrollWheelZoom={false} attributionControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[pin.lat, pin.lon]} icon={pinIcon(color)} />
          {/* The accuracy radius is drawn only when the device gave one: an
              invented circle would overstate how well we know the position. */}
          {isGps && pin.accuracyM ? (
            <Circle
              center={[pin.lat, pin.lon]}
              radius={pin.accuracyM}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 1 }}
            />
          ) : null}
          <Recenter lat={pin.lat} lon={pin.lon} />
        </MapContainer>
      </Box>
    </Box>
  );
}
