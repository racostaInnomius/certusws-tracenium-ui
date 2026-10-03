// src/components/Overview/RoleScopePanel.jsx
//
// Lo que ve en el Overview un rol que no tiene ninguna de sus áreas (ver
// overviewAccess.js), en lugar de cards vacías: que la página no es para su
// rol, y a qué páginas sí puede ir. Es la página a la que aterriza; sin esto,
// el rol "App Review" (sólo `enrollment`) llegaba a una rejilla de cards
// vacías y al diálogo "Insufficient permissions".

import { Box, Button, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

export default function RoleScopePanel({ role, pages, onNavigate }) {
  const whose = role ? `Your role (${role})` : "Your role";

  return (
    <Box
      component="section"
      aria-labelledby="overview-role-scope"
      sx={{
        px: 3,
        py: 2.5,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        bgcolor: BRAND.surface,
      }}
    >
      <Typography id="overview-role-scope" component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 700, color: BRAND.dark }}>
        Nothing on the Overview is part of your role
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>
        {pages.length
          ? `${whose} doesn't include the fleet, compliance or patching areas this page summarizes. It can use:`
          : `${whose} doesn't include any of the areas this page summarizes. Ask a tenant admin for the access you need.`}
      </Typography>
      {pages.length ? (
        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: "wrap" }}>
          {pages.map((entry) => (
            <Button key={entry.page} variant="outlined" size="small" onClick={() => onNavigate?.(entry.page)}>
              {entry.label}
            </Button>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}
