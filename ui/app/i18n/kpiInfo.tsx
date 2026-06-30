import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { StringKey } from "./strings";

type TFn = (key: StringKey, vars?: Record<string, string | number>) => string;

/**
 * Builds the content for a KPI's information overlay from the i18n dictionary.
 * Reads `kpi.<id>.title` and `kpi.<id>.body`. Pass the result to KpiCard's
 * `info` prop. Capability names / units inside the body stay in English.
 */
export function kpiInfo(t: TFn, id: string): React.ReactNode {
  return (
    <Flex flexDirection="column" gap={6} style={{ maxWidth: 320 }}>
      <Heading level={6} style={{ margin: 0 }}>{t(`kpi.${id}.title` as StringKey)}</Heading>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, margin: 0 }}>
        {t(`kpi.${id}.body` as StringKey)}
      </Text>
    </Flex>
  );
}
