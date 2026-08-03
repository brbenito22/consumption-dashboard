/**
 * Shared number/size formatters. Single source of truth — these were
 * duplicated per-page (BillingOverview, QueryCost, CapabilityCostPanel,
 * CapabilityDetailSheet, CostAllocation, Observability) and had drifted:
 * different decimal counts and missing isFinite guards meant the SAME value
 * could render differently on two tabs. In a cost app that reads as a bug,
 * so every tab now formats through here.
 */

/** "1,234.56" with a fixed number of decimals; "—" for NaN/Infinity. */
export const fmtNum = (v: number, d = 2): string =>
  !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Whole number with thousands separators; "—" for NaN/Infinity. */
export const fmtInt = (v: number): string =>
  !isFinite(v) ? "—" : Math.round(v).toLocaleString("en-US");

/** GiB value scaled to MiB/GiB/TiB. */
export const fmtGib = (v: number): string =>
  !isFinite(v) ? "—"
    : v >= 1024 ? `${fmtNum(v / 1024, 2)} TiB`
    : v >= 1 ? `${fmtNum(v, 2)} GiB`
    : `${fmtNum(v * 1024, 1)} MiB`;

/** Human-friendly window label (avoids fractional hours like "10.3666h"). */
export const fmtHours = (h: number): string => {
  if (h >= 48) return `${Math.round(h / 24)}d`;
  if (h >= 1) return `${Math.round(h)}h`;
  return `${Math.round(h * 60)}min`;
};

/** Signed percentage with a direction glyph — "▲ +12.3%" / "▼ -8.1%" / "＝ 0.2%". */
export const fmtDelta = (pct: number | null): string => {
  if (pct === null || !isFinite(pct)) return "—";
  const arrow = pct > 0.5 ? "▲" : pct < -0.5 ? "▼" : "＝";
  return `${arrow} ${pct > 0 ? "+" : ""}${fmtNum(pct, 1)}%`;
};
