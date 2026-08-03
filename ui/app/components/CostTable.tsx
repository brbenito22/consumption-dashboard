import React from "react";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";

// ── Reusable cell styles (host inventory + all K8s cost tables) ──────────────
export const cellBase: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "13px",
  borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
  whiteSpace: "nowrap",
};
export const headCell: React.CSSProperties = {
  ...cellBase,
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: Colors.Text.Neutral.Subdued,
  background: Colors.Background.Container.Neutral.Default,
  position: "sticky",
  top: 0,
};

export type Align = "left" | "right";

/**
 * Minimal cost/consumption table: string cells, per-column alignment, loading /
 * error / empty states. First and last column render emphasized — by
 * convention the name and the money column.
 */
export const CostTable: React.FC<{
  columns: string[];
  aligns: Align[];
  rows: string[][];
  loading?: boolean;
  error?: string | null;
  empty?: string;
}> = ({ columns, aligns, rows, loading, error, empty }) => {
  if (error) return <Text style={{ color: "var(--dt-color-text-critical)" }}>Failed to load: {error}</Text>;
  if (loading) return <Text style={{ color: "var(--dt-color-text-subdued)" }}>Loading…</Text>;
  if (rows.length === 0) return <Text style={{ color: "var(--dt-color-text-subdued)" }}>{empty ?? "No data."}</Text>;
  return (
    <div style={{ overflowX: "auto", borderRadius: 6, border: `1px solid ${Colors.Border.Neutral.Default}` }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c} style={{ ...headCell, textAlign: aligns[i] }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci} style={{
                  ...cellBase,
                  textAlign: aligns[ci],
                  fontWeight: ci === 0 || ci === r.length - 1 ? 600 : 400,
                  color: ci === 0 || ci === r.length - 1 ? Colors.Text.Neutral.Default : Colors.Text.Neutral.Subdued,
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
