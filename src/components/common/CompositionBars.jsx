// src/components/common/CompositionBars.jsx
//
// Ranked breakdown card — title + a vertical list of rows, each with
// a colored CSS bar, a label on the left, a count on the right. The
// widest bar fills the track; everything scales proportionally.
//
// Used as a drop-in replacement for the various recharts BarChart +
// DonutChart combos that felt heavy for the tiny categorical data we
// actually have ("3 OS versions", "2 manufacturers"). A flat list
// reads in <200ms and doesn't waste the whole panel on axes + legend.
//
// Consumers pass `items` as `[{ label, value, color?, sub? }]`. Color
// defaults to BRAND.teal; `sub` is an optional secondary line
// (platform family, version tag, etc.) that renders smaller beneath
// the label.
//
// The bar fills "value / maxValue" so rank ordering is visual: the
// largest bucket is 100% width, everything else is relative. A
// total-row chip in the header shows the sum and the subset label
// (e.g. "6 hosts", "10 jobs") — same pattern as `JobsByTypeCard` in
// the Jobs page.

import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { BRAND } from "../../theme/brand";

function formatTotalValue(value, totalLabel) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  if (String(totalLabel || "").includes("%")) {
    return numericValue.toFixed(2);
  }

  return numericValue.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function formatRowValue(value) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  if (Number.isInteger(numericValue)) {
    return numericValue.toLocaleString("en-US");
  }

  return numericValue.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function CompositionBars({
  title,
  items = [],
  totalLabel = "items",
  emptyLabel = "No data",
  sortByValue = true,
  maxItems = 8,
  headerExtra = null,
  minHeight = 260,
  sx = null,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const total = safeItems.reduce((acc, it) => acc + Number(it?.value || 0), 0);

  const displayed = (sortByValue
    ? [...safeItems].sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    : safeItems
  )
    .filter((it) => Number(it?.value || 0) > 0)
    .slice(0, maxItems);

  const max = displayed.reduce(
    (acc, it) => Math.max(acc, Number(it.value || 0)),
    0
  ) || 1;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight,
        minWidth: 0,
        ...(sx || {}),
      }}
    >
      <Box
        sx={{
          mb: 1.25,
          minHeight: 76,
          display: "grid",
          gridTemplateRows: "auto auto",
          alignContent: "start",
          rowGap: 1,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ minHeight: 28, minWidth: 0 }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              color: BRAND.dark,
              fontWeight: 700,
              minWidth: 0,
              pr: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={title}
          >
            {title}
          </Typography>

          <Box
            sx={{
              minWidth: { xs: 92, sm: 104 },
              display: "flex",
              justifyContent: "flex-end",
              flexShrink: 0,
            }}
          >
            {headerExtra}
          </Box>
        </Stack>

        <Box
          sx={{
            minHeight: 24,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <Chip
            size="small"
            label={`${formatTotalValue(total, totalLabel)} ${totalLabel}`}
            sx={{
              height: 20,
              maxWidth: "100%",
              fontSize: 11,
              fontWeight: 700,
              bgcolor: BRAND.tealSoft,
              color: BRAND.tealText,
              "& .MuiChip-label": {
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
            }}
          />
        </Box>
      </Box>

      {displayed.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BRAND.gray,
            minHeight: 120,
          }}
        >
          <Typography variant="caption">{emptyLabel}</Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 0.5 }}>
          {displayed.map((row) => {
            const value = Number(row.value || 0);
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            const barPct = Math.round((value / max) * 100);
            const color = row.color || BRAND.teal;
            return (
              <Box
                key={String(row.label)}
                sx={{ display: "flex", flexDirection: "column", gap: 0.35 }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 1,
                    fontSize: 12.5,
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: BRAND.dark,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={row.label}
                    >
                      {row.label}
                    </Typography>
                    {row.sub ? (
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: "text.secondary",
                          lineHeight: 1.2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.sub}
                      </Typography>
                    ) : null}
                  </Box>
                  <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ flexShrink: 0 }}>
                    <Typography
                      sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}
                    >
                      {formatRowValue(value)}
                    </Typography>
                    <Typography
                      sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500 }}
                    >
                      {pct}%
                    </Typography>
                  </Stack>
                </Box>
                <Box
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: BRAND.darkSoft,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      width: `${barPct}%`,
                      height: "100%",
                      bgcolor: color,
                      transition: "width 240ms ease",
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}
