// src/components/Compliance/BulkFindingToolbar.jsx
//
// Selection/bulk-action toolbar for the findings list, extracted from the
// SecurityCompliance god-component. Purely presentational and props-driven —
// no fetch, no local state beyond the derived `hasSelection`. The parent owns
// the selection set and the actions menu; this just renders the current count
// and wires the select-all / clear / open-menu callbacks.

import * as React from "react";
import { Button, Checkbox, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import PlaylistAddCheckOutlinedIcon from "@mui/icons-material/PlaylistAddCheckOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import { BRAND, ICON } from "../../theme/brand";

export default function BulkFindingToolbar({
  totalCount,
  selectedCount,
  onSelectAll,
  onClear,
  onOpenMenu,
  pending
}) {
  const hasSelection = selectedCount > 0;
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1,
        mb: 1.5,
        borderRadius: 2,
        border: `1px solid ${hasSelection ? BRAND.teal : BRAND.border}`,
        bgcolor: hasSelection ? BRAND.tealSoft : "transparent",
        transition: "background-color 120ms ease, border-color 120ms ease"
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <Checkbox
          size="small"
          checked={hasSelection && selectedCount === totalCount}
          indeterminate={hasSelection && selectedCount < totalCount}
          onChange={hasSelection ? onClear : onSelectAll}
          disabled={pending}
          sx={{ p: 0.5 }}
          inputProps={{ "aria-label": "Select all findings" }}
        />
        <Typography
          variant="body2"
          sx={{
            color: hasSelection ? BRAND.tealText : BRAND.gray,
            fontWeight: hasSelection ? 700 : 500,
            flex: 1
          }}
        >
          {hasSelection
            ? `${selectedCount} of ${totalCount} selected`
            : `Select all (${totalCount} findings)`}
        </Typography>
        {hasSelection ? (
          <>
            <Button
              size="small"
              variant="text"
              onClick={onClear}
              disabled={pending}
              sx={{ textTransform: "none" }}
            >
              Clear
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={onOpenMenu}
              disabled={pending}
              startIcon={
                pending ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <PlaylistAddCheckOutlinedIcon sx={{ fontSize: ICON.md }} />
                )
              }
              endIcon={<ExpandMoreOutlinedIcon sx={{ fontSize: ICON.sm }} />}
              sx={{ textTransform: "none" }}
            >
              Actions
            </Button>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}
