// src/components/DeviceManagement/MdmOverviewTab.jsx
//
// Overview de MDM / MAM: qué funciona hoy y cuántos equipos hay en cada
// estado. Plan MDM/MAM: «estado real en vez de roadmap» — lo que aún no se
// entrega se dice aquí, como hecho, y desaparece cuando empiece a entregarse
// (lo decide `/api/v1/mdm/status`, no este componente).

import * as React from "react";
import Grid from "@mui/material/Grid";
import { Alert, Box, Button, Typography } from "@mui/material";
import PhonelinkSetupOutlinedIcon from "@mui/icons-material/PhonelinkSetupOutlined";
import SmartphoneOutlinedIcon from "@mui/icons-material/SmartphoneOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import PhonelinkEraseOutlinedIcon from "@mui/icons-material/PhonelinkEraseOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";

import SectionPaper from "../common/SectionPaper";
import SummaryCard from "../common/SummaryCard";
import { BRAND } from "../../theme/brand";
import { describeMissing, mdmOverview } from "./mdmModel";
import { Field, StatusChip } from "./mdmAtoms";

export default function MdmOverviewTab({ mdm, appDevices, onOpenTab }) {
  const counts = mdmOverview({ devices: mdm.devices, enrollments: mdm.enrollments, appDevices });
  const enrollment = mdm.status?.enrollment;
  const commands = mdm.status?.commands;

  // Bloques normales, no un contenedor CSS grid: el `Grid` de MUI usa márgenes
  // negativos y dentro de una pista de grid se desborda por la derecha.
  return (
    <Box>
      {mdm.access === "forbidden" ? (
        <Alert severity="info" sx={{ borderRadius: 3, mb: 2 }}>
          Apple device management (MDM) needs the Enrollment capability. The Tracenium app
          (MAM) policy is in Policies.
        </Alert>
      ) : (
        <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, mb: 1.5 }}>Apple device management</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Field label="Device enrollment">
                {enrollment ? (
                  <StatusChip
                    status={enrollment.available
                      ? { label: "Available", tone: "positive" }
                      : { label: "Not set up", tone: "caution" }}
                  />
                ) : "—"}
              </Field>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Field label="Commands and policies to devices">
                {commands ? (
                  <StatusChip
                    status={commands.deliverable
                      ? { label: "Delivered", tone: "positive" }
                      : { label: "Not delivered yet", tone: "caution" }}
                  />
                ) : "—"}
              </Field>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Field label="Enrollment links">
                {counts.pendingEnrollments} active
              </Field>
            </Grid>
          </Grid>
          {enrollment && !enrollment.available ? (
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 1.5 }}>
              Device enrollment isn&apos;t set up on this server yet: it still needs{" "}
              {describeMissing(enrollment.missing)}.
            </Typography>
          ) : null}
          {commands && !commands.deliverable ? (
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 1.5 }}>
              Macs, iPhones and iPads can enroll and report, but Tracenium can&apos;t wake them to
              deliver commands or policies until the Apple push certificate is set up.
            </Typography>
          ) : null}
        </SectionPaper>
      )}

      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="MDM devices"
            value={counts.mdmManaged}
            icon={<PhonelinkSetupOutlinedIcon />}
            onClick={() => onOpenTab("devices")}
            stretch
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="App (MAM) devices"
            value={counts.app}
            icon={<SmartphoneOutlinedIcon />}
            onClick={() => onOpenTab("devices")}
            stretch
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="Pending enrollment"
            titleHint="Enrollment links that are still valid and no device has used yet."
            value={counts.pendingEnrollments}
            icon={<LinkOutlinedIcon />}
            onClick={() => onOpenTab("enrollment")}
            stretch
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="Profile removed"
            titleHint="The enrollment profile was removed on the device: it left management."
            value={counts.removed}
            icon={<PhonelinkEraseOutlinedIcon />}
            accent={counts.removed ? BRAND.alert.errorText : undefined}
            tint={counts.removed ? BRAND.alert.errorSoft : undefined}
            onClick={() => onOpenTab("devices")}
            stretch
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="No check-in 7+ days"
            value={counts.stale}
            icon={<ScheduleOutlinedIcon />}
            accent={counts.stale ? BRAND.alert.warningText : undefined}
            tint={counts.stale ? BRAND.alert.warningSoft : undefined}
            onClick={() => onOpenTab("devices")}
            stretch
          />
        </Grid>
      </Grid>

      {mdm.access === "ok" && counts.mdmManaged === 0 && counts.pendingEnrollments === 0 ? (
        <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, mt: 2 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Enroll a first device</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, mb: 1.5 }}>
            Create an enrollment link for a Mac, iPhone or iPad by its serial number, then open it on
            the device. The user reads what Tracenium collects before installing the profile.
          </Typography>
          <Button
            variant="contained"
            onClick={() => onOpenTab("enrollment")}
            sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            Create enrollment link
          </Button>
        </SectionPaper>
      ) : null}
    </Box>
  );
}
