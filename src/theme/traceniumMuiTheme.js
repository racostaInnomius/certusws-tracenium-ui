import { createTheme } from "@mui/material/styles";
import { BRAND, ROLE } from "./brand";

// Colores del <Alert> por severidad. `palette.<severity>.light` son rgba
// translúcidos (así los usan como relleno), y el Alert estándar de MUI deriva de
// ellos el texto — darken(rgba al 22 %, 0.6) sigue al 22 %: el texto de error
// salía casi invisible. Aquí el texto es opaco y el fondo, el suave de ROLE.
// No se toca `palette.*.light`: su significado sigue siendo "relleno suave".
export const ALERT_TONES = {
  error: { fg: BRAND.alert.errorText, bg: ROLE.criticalSoft },
  warning: { fg: BRAND.alert.warningText, bg: ROLE.cautionSoft },
  info: { fg: BRAND.alert.infoText, bg: ROLE.neutralSoft },
  success: { fg: BRAND.alert.successText, bg: ROLE.positiveSoft },
};

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// standardError, outlinedWarning, … — las claves que MUI resuelve como
// `${variant}${Color}`. El icono va del mismo color que el texto: `main` en
// ámbar (#F4D37D) sobre el fondo ámbar suave tampoco se ve.
const alertStyleOverrides = Object.fromEntries(
  Object.entries(ALERT_TONES).flatMap(([severity, { fg, bg }]) => {
    const text = { color: fg, "& .MuiAlert-icon": { color: fg } };
    return [
      [`standard${capitalize(severity)}`, { ...text, backgroundColor: bg }],
      [`outlined${capitalize(severity)}`, text],
    ];
  }),
);

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
    MuiAlert: {
      styleOverrides: alertStyleOverrides,
    },
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
