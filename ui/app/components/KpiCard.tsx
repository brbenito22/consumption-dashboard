import React from "react";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { InformationOverlay } from "@dynatrace/strato-components-preview/overlays";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Spacings from "@dynatrace/strato-design-tokens/spacings";

type Variant = "default" | "positive" | "warning" | "critical";

interface KpiCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  isLoading?: boolean;
  error?: string | null;
  colorVariant?: Variant;
  icon?: React.ReactNode;
  /** Optional explanatory content shown in a native "i" information overlay. */
  info?: React.ReactNode;
}

const accent: Record<Variant, string> = {
  default:  Colors.Border.Primary.Accent,
  positive: Colors.Border.Success.Default,
  warning:  Colors.Border.Warning.Default,
  critical: Colors.Border.Critical.Default,
};

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subLabel,
  isLoading,
  error,
  colorVariant = "default",
  icon,
  info,
}) => {
  return (
    <Surface
      elevation="raised"
      style={{
        position: "relative",
        minWidth: "190px",
        flex: "1 1 190px",
        padding: `${Spacings.Size16} ${Spacings.Size20}`,
        overflow: "hidden",
      }}
    >
      {/* Accent bar */}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: Spacings.Size4,
          backgroundColor: accent[colorVariant],
        }}
      />

      <Flex flexDirection="column" gap={6}>
        <Flex alignItems="center" gap={6}>
          {icon && (
            <span style={{ display: "flex", alignItems: "center", color: Colors.Text.Neutral.Subdued, flexShrink: 0 }}>
              {icon}
            </span>
          )}
          <Text
            textStyle="small-emphasized"
            style={{ color: Colors.Text.Neutral.Subdued, textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            {label}
          </Text>
          {info && (
            <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <InformationOverlay>
                <InformationOverlay.Content>{info}</InformationOverlay.Content>
              </InformationOverlay>
            </span>
          )}
        </Flex>

        {isLoading ? (
          <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: "22px" }}>…</Text>
        ) : error ? (
          <Text textStyle="base-emphasized" style={{ color: Colors.Text.Critical.Default }}>N/A</Text>
        ) : (
          <Heading level={2} style={{ margin: 0, lineHeight: 1.15 }}>
            {value}
          </Heading>
        )}

        {subLabel && (
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
            {subLabel}
          </Text>
        )}
      </Flex>
    </Surface>
  );
};
