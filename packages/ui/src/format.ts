import { useMemo } from "react";
import { useTranslation } from "react-i18next";

// Plain "en" would format dates the US way. The design uses "Sat 12 Jun".
function intlLocale(language: string) {
  return language === "en" ? "en-GB" : language;
}

export function createFormat(language: string) {
  const locale = intlLocale(language);
  const km = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "kilometer",
    maximumFractionDigits: 0,
  });
  const meters = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "meter",
    maximumFractionDigits: 0,
  });
  const speed = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "kilometer-per-hour",
    maximumFractionDigits: 0,
  });
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return {
    /** 78 km, or 850 m below 1 km. Zero is 0 km. Input in meters. */
    distance: (m: number) =>
      m > 0 && m < 1000 ? meters.format(m) : km.format(m / 1000),
    /** 650 m */
    elevation: (m: number) => meters.format(m),
    /** 22 °C */
    temperature: (c: number) => `${number.format(c)}\u00a0°C`,
    /** 16 km/h */
    speed: (kmh: number) => speed.format(kmh),
    /** 86 %. Input as share from 0 to 1. */
    percent: (share: number) => percent.format(share),
    /** Sat 12 Jun */
    date: (d: Date) => date.format(d),
    /** 14:30 */
    time: (d: Date) => time.format(d),
  };
}

export type Format = ReturnType<typeof createFormat>;

/** Formatters for the current language. */
export function useFormat(): Format {
  const { i18n } = useTranslation();
  return useMemo(() => createFormat(i18n.language), [i18n.language]);
}
