import Colors from "@dynatrace/strato-design-tokens/colors";

/**
 * Official Strato categorical data-visualization palette.
 * https://developer.dynatrace.com/design/data-visualizations/
 * Use these for chart series and category accents instead of hardcoded hex.
 */
export const CHART_PALETTE: string[] = [
  Colors.Charts.Categorical.Color01.Default,
  Colors.Charts.Categorical.Color02.Default,
  Colors.Charts.Categorical.Color03.Default,
  Colors.Charts.Categorical.Color04.Default,
  Colors.Charts.Categorical.Color05.Default,
  Colors.Charts.Categorical.Color06.Default,
  Colors.Charts.Categorical.Color07.Default,
  Colors.Charts.Categorical.Color08.Default,
  Colors.Charts.Categorical.Color09.Default,
  Colors.Charts.Categorical.Color10.Default,
  Colors.Charts.Categorical.Color11.Default,
  Colors.Charts.Categorical.Color12.Default,
  Colors.Charts.Categorical.Color13.Default,
  Colors.Charts.Categorical.Color14.Default,
  Colors.Charts.Categorical.Color15.Default,
];

/** Pick a palette color by index (wraps around). */
export const chartColor = (i: number): string => CHART_PALETTE[i % CHART_PALETTE.length];

/** Semantic status colors for charts. */
export const STATUS_COLORS = {
  ideal:    Colors.Charts.Status.Ideal.Default,
  good:     Colors.Charts.Status.Good.Default,
  neutral:  Colors.Charts.Status.Neutral.Default,
  warning:  Colors.Charts.Status.Warning.Default,
  critical: Colors.Charts.Status.Critical.Default,
};
