// src/components/Compliance/pagedList.jsx
//
// The pieces every "list that grows with the fleet" in Security Compliance
// shares: one paginated list with a total, a debounced server-side search, a
// "Showing 50 of 1,203 · Show 50 more" footer, and a device name that opens
// the device drawer. Extracted from CategoryDrilldown (22-sep) when the
// Frameworks section needed the same thing for "devices failing a control" —
// the second copy was the cue, not a third.
//
// The rule these encode: nothing that grows with the fleet is ever fetched
// whole. A caller hands a `fetchPage({ limit, offset })`; the hook asks for
// the first page and appends the next on demand. The hooks live in
// usePagedList.js (a component file should only export components).

import * as React from "react";
import { Box, Button, CircularProgress, InputAdornment, Link, Stack, TextField, Typography } from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";

export function SearchBox({ value, onChange, label }) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      inputProps={{ "aria-label": label }}
      sx={{ width: { xs: "100%", sm: 260 } }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.gray }} />
          </InputAdornment>
        ),
      }}
    />
  );
}

/** "Showing 50 of 1,203" + the button for the next page. */
export function PageFooter({ shown, total, loading, onMore, noun, pageSize }) {
  if (total <= shown && !loading) return null;
  const remaining = Math.max(0, total - shown);
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1 }}>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
        Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun}
      </Typography>
      {remaining > 0 ? (
        <Button size="small" onClick={onMore} disabled={loading} sx={{ textTransform: "none" }}>
          Show {Math.min(remaining, pageSize).toLocaleString()} more
        </Button>
      ) : null}
      {loading ? <CircularProgress size={14} sx={{ color: BRAND.teal }} /> : null}
    </Stack>
  );
}

export function ListState({ loading, err, empty, children }) {
  if (err) return <Box sx={{ py: 1.5, color: BRAND.alert?.errorText, fontSize: TEXT.sm }}>{err}</Box>;
  if (loading && empty) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={20} sx={{ color: BRAND.teal }} />
      </Box>
    );
  }
  return children;
}

export function DeviceName({ device, onOpenDevice }) {
  const name = device.hostname || device.agentId;
  if (!onOpenDevice) return <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{name}</Typography>;
  return (
    <Link
      component="button"
      type="button"
      underline="hover"
      onClick={() => onOpenDevice(device.agentId)}
      sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, textAlign: "left" }}
    >
      {name}
    </Link>
  );
}
