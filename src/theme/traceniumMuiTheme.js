import { createTheme } from "@mui/material/styles";
import { BRAND, ROLE } from "./brand";

// Central MUI theme for Tracenium.
// Purpose: remove stock Material UI blue from controls that rely on default
// `primary` / `info` colors and replace it with Tracenium teal/green tokens.
const traceniumMuiTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: BRAND.teal,
      dark: BRAND.tealHover,
      light: BRAND.tealSoftStrong,
      contrastText: BRAND.surface,
    },
    secondary: {
      main: BRAND.tealText,
      dark: BRAND.dark,
      light: BRAND.tealSoft,
      contrastText: BRAND.surface,
    },
    info: {
      main: BRAND.teal,
      dark: BRAND.tealHover,
      light: BRAND.tealSoftStrong,
      contrastText: BRAND.surface,
    },
    success: {
      main: ROLE.positive,
      light: ROLE.positiveSoft,
      contrastText: BRAND.surface,
    },
    warning: {
      main: ROLE.caution,
      light: ROLE.cautionSoft,
      contrastText: BRAND.dark,
    },
    error: {
      main: ROLE.critical,
      light: ROLE.criticalSoft,
      contrastText: BRAND.surface,
    },
    text: {
      primary: BRAND.dark,
    },
    divider: BRAND.border,
    background: {
      default: "#f5f6f8",
      paper: BRAND.surface,
    },
  },
  // Keep Tracenium surfaces refined, not overly rounded.
  // MUI multiplies numeric sx values like borderRadius: 3 by this value,
  // so 4 gives cards a clean ~12px radius instead of very rounded ~30px corners.
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 10,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 700,
          borderRadius: 8,
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none",
          },
        },
        containedPrimary: {
          backgroundColor: BRAND.teal,
          color: BRAND.surface,
          "&:hover": {
            backgroundColor: BRAND.tealHover,
          },
        },
        outlinedPrimary: {
          borderColor: BRAND.teal,
          color: BRAND.tealText,
          "&:hover": {
            borderColor: BRAND.tealHover,
            backgroundColor: BRAND.tealSoft,
          },
        },
        textPrimary: {
          color: BRAND.tealText,
          "&:hover": {
            backgroundColor: BRAND.tealSoft,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        colorPrimary: {
          color: BRAND.tealText,
          "&:hover": {
            backgroundColor: BRAND.tealSoft,
          },
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: BRAND.teal,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: BRAND.tealSoft,
        },
        bar: {
          backgroundColor: BRAND.teal,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: BRAND.teal,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: "rgba(59,64,77,0.72)",
          fontWeight: 700,
          "&.Mui-selected": {
            color: BRAND.tealText,
          },
          "&.Mui-focusVisible": {
            backgroundColor: BRAND.tealSoft,
          },
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: BRAND.gray,
          "&.Mui-checked": {
            color: BRAND.teal,
          },
          "&.MuiCheckbox-indeterminate": {
            color: BRAND.teal,
          },
        },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: BRAND.gray,
          "&.Mui-checked": {
            color: BRAND.teal,
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          "&.Mui-checked": {
            color: BRAND.surface,
            "& + .MuiSwitch-track": {
              backgroundColor: BRAND.teal,
              opacity: 1,
            },
          },
        },
        track: {
          backgroundColor: "rgba(59,64,77,0.28)",
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: BRAND.teal,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        color: "primary",
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: BRAND.teal,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: BRAND.teal,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          "&.Mui-focused": {
            color: BRAND.tealText,
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: BRAND.tealText,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          "&.Mui-selected": {
            backgroundColor: BRAND.tealSoft,
            "&:hover": {
              backgroundColor: BRAND.tealSoftStrong,
            },
          },
        },
      },
    },
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          "&.Mui-selected": {
            backgroundColor: BRAND.teal,
            color: BRAND.surface,
            "&:hover": {
              backgroundColor: BRAND.tealHover,
            },
          },
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          "--DataGrid-rowBorderColor": BRAND.border,
          "& .MuiDataGrid-row.Mui-selected": {
            backgroundColor: BRAND.tealSoft,
          },
          "& .MuiDataGrid-row.Mui-selected:hover": {
            backgroundColor: BRAND.tealSoftStrong,
          },
          "& .MuiDataGrid-row:hover": {
            backgroundColor: BRAND.rowHover,
          },
          "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-cell:focus": {
            outline: `1px solid ${BRAND.teal}`,
          },
          "& .MuiDataGrid-columnHeader:focus-within, & .MuiDataGrid-cell:focus-within": {
            outline: `1px solid ${BRAND.teal}`,
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: BRAND.tealText,
          "&:hover": {
            color: BRAND.tealHover,
          },
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: BRAND.teal,
          color: BRAND.surface,
        },
        colorInfo: {
          backgroundColor: BRAND.teal,
          color: BRAND.surface,
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        primary: {
          backgroundColor: BRAND.teal,
          color: BRAND.surface,
          "&:hover": {
            backgroundColor: BRAND.tealHover,
          },
        },
      },
    },
  },
});

export default traceniumMuiTheme;
