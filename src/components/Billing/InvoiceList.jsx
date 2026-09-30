// src/components/Billing/InvoiceList.jsx
//
// Las últimas facturas, en la página y no detrás de una pestaña.
//
// Tres estados que antes se confundían: "no hay facturas", "no se pudieron
// leer" (Stripe caído) —que se enseñaba como "No invoices yet"— y la lista.

import { useState } from "react";
import {
  Alert, Box, Button, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import SectionPaper from "../common/SectionPaper";
import { TEXT } from "../../theme/brand";
import StatusPill from "./StatusPill";
import { invoiceStatus } from "./billingModel";
import { formatMoney } from "./money";

export const INVOICES_COLLAPSED = 5;

// Texto sólo para lectores de pantalla. Medidas en "px" explícitos: en `sx`
// de MUI un `width: 1` es 100 %, y así fue como un "PDF oculto" ensanchó la
// página 1.200 px.
const HIDE_ON_PHONE = { display: { xs: "none", sm: "table-cell" } };

const SR_ONLY = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export default function InvoiceList({ invoices = [], failed = false, onRetry }) {
  const [all, setAll] = useState(false);
  const shown = all ? invoices : invoices.slice(0, INVOICES_COLLAPSED);

  return (
    <SectionPaper variant="card" component="section" aria-label="Invoices" sx={{ height: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Recent invoices</Typography>
        {invoices.length > INVOICES_COLLAPSED && (
          <Button size="small" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all ${invoices.length}`}
          </Button>
        )}
      </Box>

      {failed ? (
        <Alert
          severity="warning"
          action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Retry</Button> : null}
        >
          Couldn't load invoices from Stripe right now.
        </Alert>
      ) : invoices.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.base, color: "text.secondary" }}>
          Your invoices will appear here after the first charge.
        </Typography>
      ) : (
        // En móvil el número de factura sobra (va en el PDF) y el padding de
        // MUI empujaba la tabla 60 px fuera de la pantalla.
        <Table size="small" sx={{ "& td, & th": { px: { xs: 0.75, sm: 2 } } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={HIDE_ON_PHONE}>Number</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right" sx={{ width: 48 }}>
                <Box component="span" sx={SR_ONLY}>
                  PDF
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((i) => {
              const st = invoiceStatus(i.status);
              // Pagada: lo que se cobró. Abierta: lo que se debe.
              const amount = i.status === "paid" ? i.amountPaid ?? i.amountDue : i.amountDue;
              return (
                <TableRow key={i.id}>
                  <TableCell sx={HIDE_ON_PHONE}>{i.number ?? i.id}</TableCell>
                  <TableCell>{new Date(i.created).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  </TableCell>
                  <TableCell align="right">{formatMoney(amount, i.currency)}</TableCell>
                  <TableCell align="right">
                    {i.pdfUrl && (
                      <Tooltip title="Download PDF">
                        <IconButton
                          size="small"
                          href={i.pdfUrl}
                          target="_blank"
                          rel="noopener"
                          aria-label={`Download invoice ${i.number ?? i.id} as PDF`}
                        >
                          <DownloadOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SectionPaper>
  );
}
