import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { STRINGS, type Lang, type StringKey } from "../i18n/strings";

interface LanguageState {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate an explanatory string; supports {var} interpolation. */
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageState>({
  lang: "en",
  setLang: () => {},
  t: (key) => String(key),
});

const STORAGE_KEY = "costcenter.lang";

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "pt") return saved;
    } catch { /* ignore */ }
    return "en";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      const entry = STRINGS[key];
      let s = (entry?.[lang] ?? entry?.en ?? String(key)) as string;
      if (vars) {
        for (const k of Object.keys(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
        }
      }
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLang = (): LanguageState => useContext(LanguageContext);
