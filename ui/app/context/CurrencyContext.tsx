import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Currency = string; // ISO currency code (USD, BRL, EUR, …)

const LOCALE_BY_CURRENCY: Record<string, string> = {
  USD: "en-US",
  BRL: "pt-BR",
  EUR: "de-DE",
  GBP: "en-GB",
};

interface CurrencyContextValue {
  /** Active currency — driven by the rate card (account currency or USD default). */
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Format a value already expressed in `currency`. No FX conversion is applied
   *  — values come from the rate card in its native currency, matching Dynatrace
   *  Cost Management exactly. */
  money: (v: number, dec?: number) => string;
  /** Format a small unit price with extra precision. */
  unitPrice: (v: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currency, setCurrency] = useState<Currency>("USD");

  const value = useMemo<CurrencyContextValue>(() => {
    const locale = LOCALE_BY_CURRENCY[currency] ?? "en-US";
    const money = (v: number, dec = 2) =>
      !isFinite(v) ? "—" : v.toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: dec, maximumFractionDigits: dec });
    const unitPrice = (v: number) => {
      const d = v < 0.01 ? 6 : v < 0.1 ? 4 : 2;
      return !isFinite(v) ? "—" : v.toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d });
    };
    return { currency, setCurrency, money, unitPrice };
  }, [currency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within a CurrencyProvider");
  return ctx;
}
