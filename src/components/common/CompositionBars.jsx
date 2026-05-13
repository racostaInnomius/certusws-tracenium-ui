// src/components/common/CompositionBars.jsx
//
// Ranked breakdown card — title + a vertical list of rows, each with
// a colored CSS bar, a label on the left, a count on the right. The
// widest bar fills the track; everything scales proportionally.
//
// Consumers pass `items` as `[{ label, value, color?, sub?, children? }]`.
// When an item includes `children`, the row becomes expandable and renders
// a compact nested breakdown below the parent row.

import * as React from "react";
import { Box, Chip, Collapse, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
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

function formatPercentValue(value) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue)) {
    return "0%";
  }

  if (Number.isInteger(numericValue)) {
    return `${numericValue}%`;
  }

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
  minHeight = 260,
  sx = null,
}) {
  const [expandedRows, setExpandedRows] = React.useState({});
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

  const toggleRow = React.useCallback((rowKey) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }, []);

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
        height: minHeight,
        maxHeight: minHeight,
        minWidth: 0,
        overflow: "hidden",
        ...(sx || {}),
      }}
    >
      <Box
        sx={{
          mb: 0.85,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          minWidth: 0,
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            color: BRAND.dark,
            fontWeight: 700,
            minWidth: 0,
            pr: 0.75,
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
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 0.75,
            flexShrink: 0,
            minWidth: 0,
            maxWidth: "72%",
            flexWrap: "wrap",
            rowGap: 0.35,
          }}
        >
          {headerExtra}

          <Chip
            size="small"
            label={`${formatTotalValue(total, totalLabel)} ${totalLabel}`}
            sx={{
              height: 20,
              maxWidth: { xs: 116, sm: 132 },
              fontSize: 11,
              fontWeight: 700,
              bgcolor: BRAND.tealSoft,
              color: BRAND.tealText,
              flexShrink: 0,
              "& .MuiChip-label": {
                px: 1,
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
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            pr: 0.25,
            display: "flex",
            flexDirection: "column",
            gap: 0.8,
            mt: 0,
            scrollbarWidth: "thin",
            scrollbarColor: `${BRAND.borderStrong || BRAND.border} transparent`,
            "&::-webkit-scrollbar": {
              width: 6,
            },
            "&::-webkit-scrollbar-thumb": {
              borderRadius: 999,
              backgroundColor: BRAND.borderStrong || BRAND.border,
            },
            "&::-webkit-scrollbar-track": {
              backgroundColor: "transparent",
            },
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

            return (
              <Box
                key={rowKey}
                sx={{ display: "flex", flexDirection: "column", gap: 0.35 }}
              >
                <Box
                  role={hasChildren ? "button" : undefined}
                  tabIndex={hasChildren ? 0 : undefined}
                  aria-expanded={hasChildren ? expanded : undefined}
                  onClick={hasChildren ? () => toggleRow(rowKey) : undefined}
                  onKeyDown={
                    hasChildren
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleRow(rowKey);
                          }
                        }
                      : undefined
                  }
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    alignItems: "center",
                    columnGap: 1,
                    fontSize: 12.5,
                    cursor: hasChildren ? "pointer" : "default",
                    borderRadius: 1,
                    mx: hasChildren ? -0.5 : 0,
                    px: hasChildren ? 0.5 : 0,
                    py: hasChildren ? 0.25 : 0,
                    transition: "background-color 140ms ease",
                    "&:hover": hasChildren
                      ? { bgcolor: "rgba(27,166,166,0.06)" }
                      : undefined,
                    "&:focus-visible": hasChildren
                      ? {
                          outline: `2px solid ${BRAND.teal}`,
                          outlineOffset: 2,
                        }
                      : undefined,
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    sx={{ minWidth: 0 }}
                  >
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
                            ml: -0.5,
                            color: BRAND.tealText,
                            flexShrink: 0,
                          }}
                        >
                          {expanded ? (
                            <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18 }} />
                          ) : (
                            <KeyboardArrowRightRoundedIcon sx={{ fontSize: 18 }} />
                          )}
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Box sx={{ width: hasChildren ? 20 : 0, flexShrink: 0 }} />
                    )}

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
                          title={row.sub}
                        >
                          {row.sub}
                        </Typography>
                      ) : null}
                    </Box>
                  </Stack>

                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0, whiteSpace: "nowrap" }}>
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
                        const childBarPct = Math.max(4, Math.min(100, Math.round(childPct)));
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
                                columnGap: 0.75,
                                minWidth: 0,
                              }}
                            >
                              <Box sx={{ minWidth: 0, flex: 1 }}>
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
                                spacing={0.65}
                                alignItems="center"
                                sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
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
                                borderRadius: 2,
                                bgcolor: BRAND.darkSoft,
                                overflow: "hidden",
                              }}
                            >
                              <Box
                                sx={{
                                  width: `${childBarPct}%`,
                                  height: "100%",
                                  bgcolor: child.color || color,
                                  opacity: 0.88,
                                  transition: "width 240ms ease",
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
