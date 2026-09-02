// src/components/RemoteControl/HistoryPager.jsx
//
// The pager shared by the Sessions and File transfers tabs.
//
// Two lists with the same job get the same control: the range and the total
// on one side, Previous/Next on the other. Written once rather than twice
// because the interesting part — what happens when the total is unknown or
// the page runs past the end — is a decision, not a layout, and two copies
// of a decision drift.

import { Box, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

function pagerSx(enabled) {
  return {
    font: "inherit",
    fontSize: TEXT.xs,
    fontWeight: 700,
    px: 1.25,
    py: 0.5,
    borderRadius: 1,
    bgcolor: "transparent",
    cursor: enabled ? "pointer" : "default",
    color: enabled ? BRAND.tealText : BRAND.gray,
    border: `1px solid ${enabled ? BRAND.teal : BRAND.border}`,
    "&:hover": enabled ? { bgcolor: BRAND.tealSoft } : undefined,
    "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 }
  };
}

/**
 * @param {string} noun  singular name of the thing being paged, for the count
 *   line. "session" reads better than "item" and costs one prop.
 */
export default function HistoryPager({
  page,
  pageSize,
  total,
  loading = false,
  noun = "row",
  onPage
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{ mt: 1.5, gap: 1, flexWrap: "wrap" }}
    >
      <Typography variant="caption" sx={{ color: BRAND.gray }}>
        {total === 0
          ? `No ${noun}s`
          : `${first}–${last} of ${total} ${noun}${total === 1 ? "" : "s"}`}
      </Typography>

      <Stack direction="row" spacing={0.5} alignItems="center">
        <Box
          component="button"
          type="button"
          aria-label="Previous page"
          disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}
          sx={pagerSx(page > 1 && !loading)}
        >
          Previous
        </Box>
        <Typography variant="caption" sx={{ color: BRAND.gray, px: 0.5 }}>
          {page} / {pageCount}
        </Typography>
        <Box
          component="button"
          type="button"
          aria-label="Next page"
          disabled={page >= pageCount || loading}
          onClick={() => onPage(page + 1)}
          sx={pagerSx(page < pageCount && !loading)}
        >
          Next
        </Box>
      </Stack>
    </Stack>
  );
}
