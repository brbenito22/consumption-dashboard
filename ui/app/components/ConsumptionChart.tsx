import React, { useMemo } from "react";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { TimeseriesChart } from "@dynatrace/strato-components-preview/charts";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Spacings from "@dynatrace/strato-design-tokens/spacings";
import { chartColor } from "../constants/palette";

interface DataPoint {
  timestamp: number;
  value: number;
}

interface ConsumptionChartProps {
  title: string;
  series: DataPoint[];
  unit?: string;
  isLoading?: boolean;
  error?: string | null;
  color?: string;
  height?: number;
}

/**
 * Wrapper around TimeseriesChart that accepts pre-transformed {timestamp, value} data.
 * Renders a loading skeleton or error state when appropriate.
 */
export const ConsumptionChart: React.FC<ConsumptionChartProps> = ({
  title,
  series,
  unit = "count",
  isLoading,
  error,
  color = chartColor(0),
  height = 200,
}) => {
  // Convert to Timeseries[] format expected by Strato TimeseriesChart
  const chartData = useMemo(() => {
    if (!series.length) return null;

    const step = series.length > 1 ? series[1].timestamp - series[0].timestamp : 60_000;

    return [
      {
        name: title,
        color,
        datapoints: series.map((p, i) => ({
          start: new Date(p.timestamp),
          end: new Date(p.timestamp + step),
          value: p.value,
        })),
      },
    ];
  }, [series, title, color]);

  return (
    <Surface
      elevation="raised"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: Spacings.Size8,
        padding: Spacings.Size16,
      }}
    >
      <Heading level={5} style={{ margin: 0, color: Colors.Text.Neutral.Default }}>
        {title}
      </Heading>

      {isLoading && (
        <Flex
          alignItems="center"
          justifyContent="center"
          style={{ height: `${height}px` }}
        >
          <Text style={{ color: "var(--dt-color-text-subdued)" }}>Loading data…</Text>
        </Flex>
      )}

      {!isLoading && error && (
        <Flex
          alignItems="center"
          justifyContent="center"
          style={{ height: `${height}px` }}
        >
          <Text style={{ color: "var(--dt-color-text-subdued)", fontSize: "12px" }}>
            No data available
          </Text>
        </Flex>
      )}

      {!isLoading && !error && !chartData && (
        <Flex
          alignItems="center"
          justifyContent="center"
          style={{ height: `${height}px` }}
        >
          <Text style={{ color: "var(--dt-color-text-subdued)" }}>No data available</Text>
        </Flex>
      )}

      {!isLoading && !error && chartData && (
        <div style={{ height: `${height}px`, overflow: "hidden", width: "100%" }}>
          <TimeseriesChart data={chartData} variant="area">
            <TimeseriesChart.YAxis label={unit} />
            <TimeseriesChart.Legend />
          </TimeseriesChart>
        </div>
      )}
    </Surface>
  );
};
