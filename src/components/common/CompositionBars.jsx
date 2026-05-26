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
// Consumers pass `items` as `[{ label, value, color?, sub?, children? }]`.
// Color defaults to BRAND.teal; `sub` is an optional secondary line.
// When `children` is provided, an expand/collapse icon appears and the
// nested breakdown is rendered below the parent row.
//
// Optional card navigation:
// - `onClick` turns the whole card into a keyboard-accessible button.
// - The expand/collapse icon stops propagation, so expandable rows still
//   work without triggering the card navigation.

import * as React from "react";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import { BRAND } from "../../theme/brand";

function formatTotalValue(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return "0";
  return numericValue.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatRowValue(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return "0";
  if (Number.isInteger(numericValue)) return numericValue.toLocaleString("en-US");
  return numericValue.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatPercentValue(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return "0%";
  if (Number.isInteger(numericValue)) return `${numericValue}%`;
  return `${numericValue.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function getRowKey(row, index) {
  return String(row?.id || row?.key || row?.label || `row-${index}`);
}

export default function CompositionBars({
  title,
  items = [],
  totalLabel = "items",
  emptyLabel = "No data",
  sortByValue = true,
  maxItems = 8,
  headerExtra = null,
  headerExtraPlacement = "inline",
  reserveHeaderExtraSpace = false,
  minHeight = 260,
  sx = null,
  onClick = null,
  actionLabel = "Open details",
  totalValue = null,
  showTotalChip = true,
  showPercentages = true,
}) {
  const [expandedRows, setExpandedRows] = React.useState({});
  const safeItems = Array.isArray(items) ? items : [];
  const calculatedTotal = safeItems.reduce((acc, it) => acc + Number(it?.value || 0), 0);
  const total = Number.isFinite(Number(totalValue)) ? Number(totalValue) : calculatedTotal;

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

  const interactive = typeof onClick === "function";

  const toggleRow = React.useCallback((rowKey) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }, []);

  const handleCardKeyDown = React.useCallback(
    (event) => {
      if (!interactive) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick();
      }
    },
    [interactive, onClick]
  );

  return (
    <Paper
      elevation={0}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? actionLabel : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={handleCardKeyDown}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight,
        minWidth: 0,
        cursor: interactive ? "pointer" : "default",
        transition:
          "border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease, background-color 140ms ease",
        "&:hover": interactive
          ? {
              borderColor: BRAND.teal,
              bgcolor: "rgba(90,159,159,0.035)",
              boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
              transform: "translateY(-1px)",
            }
          : undefined,
        "&:focus-visible": interactive
          ? {
              outline: `2px solid ${BRAND.teal}`,
              outlineOffset: 2,
            }
          : undefined,
        ...(sx || {}),
      }}
    >
      {headerExtraPlacement === "below" ? (
        <Stack
          sx={{
            mb: 1.25,
            gap: 0.7,
            minWidth: 0,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{ minWidth: 0 }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                color: BRAND.dark,
                fontWeight: 800,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={title}
            >
              {title}
            </Typography>

            {showTotalChip ? (
              <Chip
                size="small"
                label={`${formatTotalValue(total)} ${totalLabel}`}
                sx={{
                  height: 22,
                  fontSize: 11,
                  fontWeight: 800,
                  bgcolor: BRAND.tealSoft,
                  color: BRAND.tealText,
                  flexShrink: 0,
                  "& .MuiChip-label": { px: 1 },
                }}
              />
            ) : null}
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="flex-start"
            sx={{
              minHeight: reserveHeaderExtraSpace || headerExtra ? 28 : 0,
              visibility: headerExtra ? "visible" : "hidden",
            }}
          >
            {headerExtra || <Box aria-hidden="true" sx={{ height: 28 }} />}
          </Stack>
        </Stack>
      ) : (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            mb: 1.25,
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              color: BRAND.dark,
              fontWeight: 700,
              minWidth: 0,
              flex: "1 1 130px",
            }}
            title={title}
          >
            {title}
          </Typography>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              flex: "0 1 auto",
              flexWrap: "wrap",
              rowGap: 0.75,
              justifyContent: "flex-end",
            }}
          >
            {headerExtra}
            {showTotalChip ? (
              <Chip
                size="small"
                label={`${formatTotalValue(total)} ${totalLabel}`}
                sx={{
                  height: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  bgcolor: BRAND.tealSoft,
                  color: BRAND.tealText,
                }}
              />
            ) : null}
          </Stack>
        </Stack>
      )}

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
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            mt: 0.5,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            pr: 0.25,
            scrollbarWidth: "thin",
            scrollbarColor: `${BRAND.borderStrong || BRAND.border} transparent`,
            "&::-webkit-scrollbar": { width: 6 },
            "&::-webkit-scrollbar-thumb": {
              borderRadius: 999,
              backgroundColor: BRAND.borderStrong || BRAND.border,
            },
            "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          }}
        >
          {displayed.map((row, index) => {
            const value = Number(row.value || 0);
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            const barPct = Math.round((value / max) * 100);
            const color = row.color || BRAND.teal;
            const children = Array.isArray(row.children)
              ? row.children.filter((child) => Number(child?.value || 0) > 0)
              : [];
            const hasChildren = children.length > 0;
            const rowKey = getRowKey(row, index);
            const expanded = Boolean(expandedRows[rowKey]);

            // If the card is clickable, row clicks should navigate with the
            // card. Only the arrow icon expands/collapses and stops bubbling.
            const rowCanExpandByClick = hasChildren && !interactive;

            return (
              <Box
                key={rowKey}
                sx={{ display: "flex", flexDirection: "column", gap: 0.35 }}
              >
                <Box
                  role={rowCanExpandByClick ? "button" : undefined}
                  tabIndex={rowCanExpandByClick ? 0 : undefined}
                  aria-expanded={rowCanExpandByClick ? expanded : undefined}
                  onClick={
                    rowCanExpandByClick
                      ? (event) => {
                          event.stopPropagation();
                          toggleRow(rowKey);
                        }
                      : undefined
                  }
                  onKeyDown={
                    rowCanExpandByClick
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleRow(rowKey);
                          }
                        }
                      : undefined
                  }
                  sx={{
                    display: "grid",
                    gridTemplateColumns: hasChildren
                      ? "minmax(0, 1fr) 22px auto"
                      : "minmax(0, 1fr) auto",
                    alignItems: "center",
                    columnGap: 1,
                    fontSize: 12.5,
                    cursor: rowCanExpandByClick ? "pointer" : "inherit",
                    borderRadius: 1,
                    mx: hasChildren ? -0.5 : 0,
                    px: hasChildren ? 0.5 : 0,
                    py: hasChildren ? 0.25 : 0,
                    transition: "background-color 140ms ease",
                    "&:hover": rowCanExpandByClick
                      ? { bgcolor: "rgba(27,166,166,0.06)" }
                      : undefined,
                    "&:focus-visible": rowCanExpandByClick
                      ? {
                          outline: `2px solid ${BRAND.teal}`,
                          outlineOffset: 2,
                        }
                      : undefined,
                  }}
                >
                  <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
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
                        title={row.sub}
                      >
                        {row.sub}
                      </Typography>
                    ) : null}
                  </Box>

                  {hasChildren ? (
                    <Tooltip title={expanded ? "Hide versions" : "Show grouped versions"} arrow>
                      <IconButton
                        size="small"
                        aria-label={expanded ? "Hide grouped versions" : "Show grouped versions"}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleRow(rowKey);
                        }}
                        sx={{
                          width: 20,
                          height: 20,
                          color: BRAND.tealText,
                          flexShrink: 0,
                          justifySelf: "center",
                        }}
                      >
                        {expanded ? (
                          <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18 }} />
                        ) : (
                          <KeyboardArrowRightRoundedIcon sx={{ fontSize: 18 }} />
                        )}
                      </IconButton>
                    </Tooltip>
                  ) : null}

                  <Stack
                    direction="row"
                    spacing={0.75}
                    alignItems="baseline"
                    justifyContent="flex-end"
                    sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                  >
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
                      {formatRowValue(value)}
                    </Typography>
                    {showPercentages ? (
                      <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500 }}>
                        {pct}%
                      </Typography>
                    ) : null}
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

                {hasChildren ? (
                  <Collapse in={expanded} timeout={220} unmountOnExit>
                    <Box
                      sx={{
                        mt: 0.75,
                        ml: { xs: 0.75, sm: 1.25 },
                        pl: { xs: 0.75, sm: 1 },
                        pr: 0.25,
                        maxWidth: "100%",
                        minWidth: 0,
                        borderLeft: `2px solid ${BRAND.tealSoft}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.75,
                      }}
                    >
                      {children.map((child, childIndex) => {
                        const childValue = Number(child.value || 0);
                        const childPct = child.percentage != null
                          ? Number(child.percentage)
                          : value > 0
                          ? (childValue / value) * 100
                          : 0;
                        const childBarPct = Math.max(
                          4,
                          Math.min(100, Math.round(childPct))
                        );
                        const childKey = getRowKey(child, childIndex);

                        return (
                          <Box
                            key={`${rowKey}-${childKey}`}
                            sx={{ display: "flex", flexDirection: "column", gap: 0.3, minWidth: 0 }}
                          >
                            <Box
                              sx={{
                                display: "grid",
                                gridTemplateColumns: "minmax(0, 1fr) auto",
                                alignItems: "center",
                                columnGap: 1,
                              }}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  sx={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: BRAND.dark,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={child.label}
                                >
                                  {child.label}
                                </Typography>
                                {child.sub ? (
                                  <Typography
                                    sx={{
                                      mt: 0.1,
                                      fontSize: 10.5,
                                      color: "text.secondary",
                                      lineHeight: 1.15,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                    title={child.sub}
                                  >
                                    {child.sub}
                                  </Typography>
                                ) : null}
                              </Box>

                              <Stack
                                direction="row"
                                spacing={0.45}
                                alignItems="center"
                                justifyContent="flex-end"
                                sx={{ whiteSpace: "nowrap" }}
                              >
                                <Typography sx={{ fontSize: 12, fontWeight: 800, color: BRAND.dark }}>
                                  {formatRowValue(childValue)}
                                </Typography>
                                <Typography sx={{ fontSize: 10.5, color: "text.secondary", fontWeight: 600 }}>
                                  {formatPercentValue(childPct)}
                                </Typography>
                              </Stack>
                            </Box>

                            <Box
                              sx={{
                                height: 4,
                                borderRadius: 999,
                                bgcolor: BRAND.darkSoft,
                                overflow: "hidden",
                              }}
                            >
                              <Box
                                sx={{
                                  width: `${childBarPct}%`,
                                  height: "100%",
                                  bgcolor: child.color || color,
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </Collapse>
                ) : null}
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}
