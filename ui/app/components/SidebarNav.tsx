import React, { useState } from "react";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Spacings from "@dynatrace/strato-design-tokens/spacings";
import Borders from "@dynatrace/strato-design-tokens/borders";

export interface SidebarNavEntry {
  key: string;
  label: string;
  icon: React.ReactNode;
}

interface SidebarNavProps {
  title: string;
  entries: SidebarNavEntry[];
  activeKey: string;
  onSelect: (key: string) => void;
}

interface ItemProps {
  entry: SidebarNavEntry;
  selected: boolean;
  onSelect: (key: string) => void;
}

const SidebarItem: React.FC<ItemProps> = ({ entry, selected, onSelect }) => {
  const [hover, setHover] = useState(false);

  const background = selected
    ? hover
      ? Colors.Background.Field.Primary.EmphasizedHover
      : Colors.Background.Field.Primary.Emphasized
    : hover
      ? Colors.Background.Field.Neutral.DefaultHover
      : "transparent";

  const color = selected ? Colors.Text.Primary.Default : Colors.Text.Neutral.Default;

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.key)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={entry.label}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "clamp(8px, 0.6vw, 12px)",
        width: "100%",
        minWidth: 0,
        border: "none",
        cursor: "pointer",
        textAlign: "start",
        background,
        color,
        borderRadius: Borders.Radius.Field.Default,
        paddingBlock: Spacings.Size8,
        paddingInline: "clamp(10px, 0.8vw, 14px)",
        transition: "background-color 0.12s ease",
      }}
    >
      {/* Accent indicator bar on the left when selected */}
      {selected && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: Spacings.Size8,
            bottom: Spacings.Size8,
            width: Spacings.Size4,
            borderRadius: Borders.Radius.Field.Default,
            backgroundColor: Colors.Border.Primary.Accent,
          }}
        />
      )}

      <span style={{ display: "flex", alignItems: "center", color, flexShrink: 0 }}>
        {entry.icon}
      </span>

      {/* Responsive label: scales with viewport (adapts to zoom), single line,
          ellipsis as a last resort on extremely narrow widths. */}
      <Text
        as="span"
        textStyle={selected ? "base-emphasized" : "base"}
        style={{
          color,
          minWidth: 0,
          flex: "1 1 auto",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "clamp(12px, 0.9vw, 14px)",
          lineHeight: 1.25,
        }}
      >
        {entry.label}
      </Text>
    </button>
  );
};

export const SidebarNav: React.FC<SidebarNavProps> = ({ title, entries, activeKey, onSelect }) => {
  return (
    <nav
      style={{
        display: "flex",
        flexDirection: "column",
        gap: Spacings.Size4,
        padding: Spacings.Size8,
      }}
    >
      <Text
        as="span"
        textStyle="small-emphasized"
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: Colors.Text.Neutral.Subdued,
          padding: `${Spacings.Size8} ${Spacings.Size16} ${Spacings.Size4}`,
        }}
      >
        {title}
      </Text>

      {entries.map((entry) => (
        <SidebarItem
          key={entry.key}
          entry={entry}
          selected={entry.key === activeKey}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
};
