// src/components/Compliance/usePagedList.js
//
// Hooks for the paginated lists in Security Compliance (see pagedList.jsx).

import * as React from "react";

/**
 * One paginated list: first page on mount (and whenever `fetchPage`
 * changes), then "show more" appends. A response that arrives after a newer
 * request was issued is dropped — typing in the search box fires several.
 */
export function usePagedList(fetchPage, pageSize) {
  const [state, setState] = React.useState({ items: [], total: 0, loading: true, err: null });
  const seq = React.useRef(0);

  const load = React.useCallback(
    async (offset, append) => {
      const id = ++seq.current;
      setState((s) => ({ ...s, loading: true, err: null }));
      try {
        const res = await fetchPage({ limit: pageSize, offset });
        if (id !== seq.current) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        setState((s) => ({
          items: append ? [...s.items, ...items] : items,
          total: Number.isFinite(Number(res?.total)) ? Number(res.total) : items.length,
          loading: false,
          err: null,
        }));
      } catch (e) {
        if (id !== seq.current) return;
        setState((s) => ({ ...s, loading: false, err: e?.body?.message || e?.message || "Failed to load" }));
      }
    },
    [fetchPage, pageSize]
  );

  React.useEffect(() => {
    load(0, false);
  }, [load]);

  return { ...state, loadMore: () => load(state.items.length, true) };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
