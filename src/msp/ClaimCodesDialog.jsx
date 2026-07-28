// src/msp/ClaimCodesDialog.jsx
//
// "Add a client" — the MSP-owner surface from the Portfolio. Two ways to
// bring a client under the MSP:
//   * Invite existing — issue a claim code the client's owner redeems
//     (ClaimCodesPanel). For a client that already uses Tracenium.
//   * Create new — provision a fresh client tenant + assign an admin who
//     binds on first login (CreateClientPanel). For a brand-new client.
// The vendor gets the same panels embedded in MspAdmin.

import * as React from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Tab, Tabs, Typography } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import { BRAND } from "../theme/brand";
import ClaimCodesPanel from "./ClaimCodesPanel";
import CreateClientPanel from "./CreateClientPanel";

export default function ClaimCodesDialog({ open, mspId, mspName, onClose }) {
  const [tab, setTab] = React.useState(0);

  // Reset to the first tab whenever the dialog is (re)opened.
  React.useEffect(() => { if (open) setTab(0); }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 0 }}>
        <PersonAddAltOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }} noWrap>Add a client</Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>{mspName || `Partner ${mspId}`}</Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ px: 3, minHeight: 40, "& .MuiTab-root": { textTransform: "none", minHeight: 40, fontWeight: 700 } }}
        TabIndicatorProps={{ sx: { bgcolor: BRAND.teal } }}
      >
        <Tab label="Invite existing" sx={{ color: tab === 0 ? BRAND.tealText : BRAND.gray }} />
        <Tab label="Create new" sx={{ color: tab === 1 ? BRAND.tealText : BRAND.gray }} />
      </Tabs>

      <DialogContent>
        {mspId && tab === 0 ? <ClaimCodesPanel mspId={mspId} mspName={mspName} /> : null}
        {mspId && tab === 1 ? (
          <CreateClientPanel mspId={mspId} mspName={mspName} onSwitchToCodes={() => setTab(0)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
