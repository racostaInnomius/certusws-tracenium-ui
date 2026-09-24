// src/components/common/PlatformTagline.jsx
//
// El eslogan del producto, con el «&» en el cian de la marca.
//
// Vivía sólo dentro del Topbar; la entrada al portal (SignInLanding) lo
// necesitaba igual, así que se saca aquí antes de que existan dos copias que
// se separen — que es como el mismo eslogan acaba pintado de dos maneras.

import * as React from "react";
import { Box } from "@mui/material";

import { BRAND } from "../../theme/brand";

export default function PlatformTagline({ sx }) {
  return (
    <Box component="span" sx={sx}>
      Endpoint Intelligence{" "}
      <Box component="span" sx={{ color: BRAND.accentBright, fontWeight: 900, px: 0.25 }}>
        &
      </Box>{" "}
      Compliance Platform
    </Box>
  );
}
