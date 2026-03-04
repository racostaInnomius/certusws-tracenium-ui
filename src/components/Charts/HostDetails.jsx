import * as React from "react";
import { Box, Divider, Typography } from "@mui/material";

function Field({ label, value }) {
  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 400 }}>{value ?? "—"}</Typography>
    </Box>
  );
}

export default function HostDetails({ host, detail }) {
  // host = row básico (hostname, os_platform, os_version, manufacturer, model)
  // detail = payload del nuevo endpoint

  const hostname = host?.hostname ?? host?.agent_id ?? "—";
  const operatingSystem =
    detail?.operatingSystem ??
    [host?.os_platform, host?.os_version].filter(Boolean).join(" ") ??
    "—";

  const manufacturer = detail?.manufacturer ?? host?.manufacturer ?? "—";
  const model = detail?.model ?? host?.model ?? "—";

  const type = detail?.type ?? "—";
  const serialNumber = detail?.serialNumber ?? "—";
  const macAddress = detail?.macAddress ?? "—";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Typography sx={{ color: "#1ba6a6", mb: 1 }}>Selected Host Detail</Typography>

      <Divider sx={{ mb: 1 }} />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 2,
          mb: 2,
        }}
      >
        <Field label="Hostname" value={hostname} />
        <Field label="Operating System" value={operatingSystem} />
        <Field label="Manufacturer" value={manufacturer} />
        <Field label="Model" value={model} />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 2,
        }}
      >
        <Field label="Type" value={type} />
        <Field label="Serial Number" value={serialNumber} />
        <Field label="MAC Address" value={macAddress} />
      </Box>
    </Box>
  );
}