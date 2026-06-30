export type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d" | "90d" | "custom";

export interface TimeRangeOption {
  label: string;
  value: TimeRange;
  dqlFrom: string;
  /** DQL `to:` expression/timestamp (defaults to now()). */
  dqlTo: string;
  binInterval: string;
  /** Duration of this time range in hours — used to compute per-hour rates */
  hours: number;
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { label: "Last 1 hour",   value: "1h",  dqlFrom: "now()-1h",  dqlTo: "now()", binInterval: "5m",  hours: 1    },
  { label: "Last 6 hours",  value: "6h",  dqlFrom: "now()-6h",  dqlTo: "now()", binInterval: "30m", hours: 6    },
  { label: "Last 24 hours", value: "24h", dqlFrom: "now()-24h", dqlTo: "now()", binInterval: "1h",  hours: 24   },
  { label: "Last 7 days",   value: "7d",  dqlFrom: "now()-7d",  dqlTo: "now()", binInterval: "6h",  hours: 168  },
  { label: "Last 30 days",  value: "30d", dqlFrom: "now()-30d", dqlTo: "now()", binInterval: "1d",  hours: 720  },
  { label: "Last 90 days",  value: "90d", dqlFrom: "now()-90d", dqlTo: "now()", binInterval: "1d",  hours: 2160 },
];

/** Pick a sensible bin interval (~30 buckets) for an arbitrary window in hours. */
export function binForHours(hours: number): string {
  if (hours <= 2) return "5m";
  if (hours <= 12) return "30m";
  if (hours <= 48) return "1h";
  if (hours <= 24 * 14) return "6h";
  return "1d";
}

export interface ConsumptionRecord {
  interval: string;
  count: number;
}

export interface KpiData {
  label: string;
  value: number | string;
  unit?: string;
  color?: "positive" | "warning" | "negative" | "neutral";
}
