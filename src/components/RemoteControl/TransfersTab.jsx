// src/components/RemoteControl/TransfersTab.jsx
//
// The tenant-wide file transfer audit log, paged.
//
// It used to sit at the bottom of the page loading 200 rows on every visit
// whether or not anyone scrolled to it — and stopping there, so an audit
// trail longer than 200 transfers was quietly incomplete.
//
// El estado de los filtros vive AQUÍ y no en la tabla porque quien pagina
// es esta pestaña: un filtro que la tabla se guardara para sí filtraría la
// página cargada, que es exactamente el fallo que se corrige.

import * as React from "react";
import { Box } from "@mui/material";
import FileTransfersAuditTable from "./FileTransfersAuditTable";
import HistoryPager from "./HistoryPager";
import { useFileTransfers } from "./useRemoteControlData";

const NO_FILTERS = { direction: "all", status: "all", filename: "" };

/** Espera antes de convertir lo tecleado en una petición. */
export const FILENAME_DEBOUNCE_MS = 350;

export default function TransfersTab({ refreshNonce = 0 }) {
  const [page, setPage] = React.useState(1);
  const pageSize = 25;

  // Lo que se ve en la caja de texto (inmediato) y lo que se consulta
  // (retrasado): sin esa separación cada tecla sería una consulta a la
  // tabla de auditoría entera.
  const [filters, setFilters] = React.useState(NO_FILTERS);
  const [queryFilename, setQueryFilename] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setQueryFilename(filters.filename), FILENAME_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.filename]);

  const { transfers, total, loading, refetch } = useFileTransfers({
    page,
    pageSize,
    direction: filters.direction,
    status: filters.status,
    filename: queryFilename
  });

  // ⚠️ Volver a la página 1 al cambiar un filtro.
  //
  // Estando en la página 7 y filtrando por "failed", la consulta pide el
  // offset 150 de un resultado que quizá tenga 3 filas: la tabla sale
  // vacía con el filtro puesto y se lee como "no hay ninguna".
  React.useEffect(() => {
    setPage(1);
  }, [filters.direction, filters.status, queryFilename]);

  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refetch();
  }, [refreshNonce, refetch]);

  return (
    <Box>
      <FileTransfersAuditTable
        transfers={transfers}
        total={total}
        loading={loading}
        filters={filters}
        onFiltersChange={setFilters}
      />
      <HistoryPager
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        noun="transfer"
        onPage={setPage}
      />
    </Box>
  );
}
