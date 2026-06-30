import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useLang } from "../context/LanguageContext";
import type { Lang } from "../i18n/strings";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "pt", label: "PT-BR" },
];

/** Compact EN / PT-BR segmented control for switching explanation language. */
export const LanguageToggle: React.FC = () => {
  const { lang, setLang } = useLang();
  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: "inline-flex",
        border: `1px solid ${Colors.Border.Neutral.Default}`,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {OPTIONS.map((o) => {
        const active = o.value === lang;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setLang(o.value)}
            aria-pressed={active}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 600,
              color: active ? Colors.Text.Neutral.OnAccent.Default : Colors.Text.Neutral.Subdued,
              background: active ? Colors.Background.Container.Primary.Accent : "transparent",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};
