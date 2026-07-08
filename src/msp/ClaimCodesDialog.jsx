// src/msp/ClaimCodesDialog.jsx
//
// Dialog wrapper around ClaimCodesPanel — the MSP-owner "Add a client"
// surface from the Portfolio. (The vendor gets the same panel embedded in
// MspAdmin.)

import * as React from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import { BRAND } from "../theme/brand";
import ClaimCodesPanel from "./ClaimCodesPanel";

export default function ClaimCodesDialog({ open, mspId, mspName, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <LinkOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }} noWrap>Add a client</Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>{mspName || `Partner ${mspId}`}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {mspId ? <ClaimCodesPanel mspId={mspId} mspName={mspName} /> : null}
      </DialogContent>
    </Dialog>
  );
}
