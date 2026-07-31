// ============================================================
// projection-bridge — lets the store pull the editor's pending text in
// BEFORE it reads `sections`.
//
// ReportDocEditor projects the doc into the store on a 250ms debounce, so
// for up to 250ms the store is behind what the user has typed. Any store
// mutation that reads `sections` in that window (a dictation result, a
// template change) would build on stale content — and the rebuild it
// triggers would then overwrite the typed text with that stale copy.
//
// The store calls flushProjection() before every mutation, which runs any
// pending projection synchronously. The store's `sections` is therefore
// always current at the moment a mutation reads it.
// ============================================================

let pending: (() => void) | null = null;

// ReportDocEditor registers a flush while it has a projection scheduled, and
// clears it (null) once nothing is pending or on unmount.
export function setPendingProjection(fn: (() => void) | null) {
  pending = fn;
}

export function flushProjection() {
  const fn = pending;
  if (!fn) return;
  pending = null; // clear first: applyDocProjection re-enters through set()
  fn();
}
