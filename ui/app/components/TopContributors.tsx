import React from "react";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { formatCount } from "../hooks/useDql";

export interface ContributorRow {
  name: string;
  value: number;
}

interface TopContributorsProps {
  title: string;
  unit: string;
  color: string;
  rows: ContributorRow[];
  isLoading?: boolean;
  error?: string | null;
  /** Truncate long names (e.g. file paths) from the start. */
  truncateStart?: boolean;
  /**
   * Optional estimated cost for each row, given its share of the section's
   * total consumption. When provided, the formatted cost is shown per row.
   */
  costForShare?: (sharePct: number) => string;
  /** Optional total cost for this capability/section (shown in the header). */
  sectionCost?: string;
  /**
   * Cost gate: when set and the panel hasn't been activated, the list is
   * replaced by a note + button — the underlying fetch logs/spans/events scan
   * (billable GiB) only runs when the user asks for it.
   */
  gate?: { active: boolean; onLoad: () => void; note: string; cta: string };
}

const shorten = (s: string, max = 52, fromStart = false) => {
  if (s.length <= max) return s;
  return fromStart ? `…${s.slice(s.length - max)}` : `${s.slice(0, max)}…`;
};

/** Ranked "biggest offenders" list with proportional bars. */
export const TopContributors: React.FC<TopContributorsProps> = ({
  title, unit, color, rows, isLoading, error, truncateStart, costForShare, sectionCost, gate,
}) => {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <Surface elevation="raised" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
        <Heading level={5} style={{ margin: 0 }}>{title}</Heading>
        {sectionCost !== undefined ? (
          <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default, whiteSpace: "nowrap" }}>
            {sectionCost} <span style={{ color: Colors.Text.Neutral.Subdued, fontWeight: 400 }}>/ {unit}</span>
          </Text>
        ) : (
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{unit}</Text>
        )}
      </Flex>

      {gate && !gate.active ? (
        <Flex flexDirection="column" gap={8} alignItems="flex-start">
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, lineHeight: 1.5 }}>{gate.note}</Text>
          <Button variant="default" onClick={gate.onLoad}>{gate.cta}</Button>
        </Flex>
      ) : isLoading ? (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>Loading…</Text>
      ) : error ? (
        <Text textStyle="small" style={{ color: Colors.Text.Critical.Default }}>No data available</Text>
      ) : rows.length === 0 ? (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>No data available</Text>
      ) : (
        <Flex flexDirection="column" gap={8}>
          {rows.map((r, i) => {
            const pct = (r.value / max) * 100;
            const share = total > 0 ? (r.value / total) * 100 : 0;
            const label = r.name && r.name !== "null" ? r.name : "(unspecified)";
            return (
              <Flex key={`${label}-${i}`} flexDirection="column" gap={4}>
                <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>
                    <span style={{ color: Colors.Text.Neutral.Subdued, marginRight: 6 }}>{i + 1}.</span>
                    {shorten(label, 52, truncateStart)}
                  </Text>
                  <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default, whiteSpace: "nowrap" }}>
                    {formatCount(r.value)}
                    <span style={{ color: Colors.Text.Neutral.Subdued, fontWeight: 400 }}> · {share.toFixed(0)}%</span>
                    {costForShare && (
                      <span style={{ color: Colors.Text.Neutral.Subdued, fontWeight: 400 }}> · {costForShare(share)}</span>
                    )}
                  </Text>
                </Flex>
                <div style={{ height: 6, borderRadius: 3, background: Colors.Background.Container.Neutral.Default, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.4s ease" }} />
                </div>
              </Flex>
            );
          })}
        </Flex>
      )}
    </Surface>
  );
};
