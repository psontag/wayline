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
  const kmShort = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "kilometer",
    maximumFractionDigits: 1,
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
  const grade = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const mm = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "millimeter",
    maximumFractionDigits: 1,
  });
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
  const list = new Intl.ListFormat(locale, { type: "conjunction" });

  return {
    /** 78 km, or 850 m below 1 km. Zero is 0 km. Input in meters. */
    distance: (m: number) =>
      m > 0 && m < 1000 ? meters.format(m) : km.format(m / 1000),
    /** 2.6 km, for short stretches like climbs. 850 m below 1 km. */
    shortDistance: (m: number) =>
      m > 0 && m < 1000 ? meters.format(m) : kmShort.format(m / 1000),
    /** 650 m */
    elevation: (m: number) => meters.format(m),
    /** 22 °C */
    temperature: (c: number) => `${number.format(c)}\u00a0°C`,
    /** 16 km/h */
    speed: (kmh: number) => speed.format(kmh),
    /** 86 %. Input as share from 0 to 1. */
    percent: (share: number) => percent.format(share),
    /** +4.5 %, the slope of a road. Input as share. */
    grade: (share: number) => grade.format(share),
    /** Sat 12 Jun. Some engines put a comma after the weekday; drop it. */
    date: (d: Date) =>
      date
        .formatToParts(d)
        .map((p) => (p.type === "literal" ? p.value.replace(",", "") : p.value))
        .join(""),
    /** 14:30 */
    time: (d: Date) => time.format(d),
    /** 14:30 from hours as a decimal, e.g. 14.5. */
    clock: (h: number) => {
      const m = Math.round(h * 60);
      return time.format(new Date(2000, 0, 1, Math.floor(m / 60), m % 60));
    },
    /** 4 h 15, or 45 min below 1 h. Rounded to 5 min. Input in hours. */
    duration: (h: number) => {
      const total = Math.round((h * 60) / 5) * 5;
      const hours = Math.floor(total / 60);
      const minutes = total % 60;
      if (!hours) return `${minutes}\u00a0min`;
      return minutes
        ? `${hours}\u00a0h ${String(minutes).padStart(2, "0")}`
        : `${hours}\u00a0h`;
    },
    /** 1.2 mm */
    rain: (v: number) => mm.format(v),
    /** Kronach, Kulmbach and Coburg */
    list: (items: string[]) => list.format(items),
    /** Sat 12 Jun – Tue 15 Jun */
    dateRange: (from: Date, to: Date) => date.formatRange(from, to),
  };
}

export type Format = ReturnType<typeof createFormat>;

/** Formatters for the current language. */
export function useFormat(): Format {
  const { i18n } = useTranslation();
  return useMemo(() => createFormat(i18n.language), [i18n.language]);
}
