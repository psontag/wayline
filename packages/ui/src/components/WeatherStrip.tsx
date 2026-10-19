import { ArrowUp, Cloud, CloudRain, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";

export type WeatherCondition = "sun" | "cloud" | "rain";

export type WeatherStripItem = {
  /** Meters from the stage start. */
  distance: number;
  /** Expected time at this point. */
  time: Date;
  temperature: number;
  condition: WeatherCondition;
  wind: {
    kind: "head" | "tail" | "cross";
    /** Where the wind blows to, relative to the way ahead. 0 = tailwind. */
    rotation: number;
  };
};

const icons = { sun: Sun, cloud: Cloud, rain: CloudRain };

/** Weather at a few points of a stage, at the expected time there. */
export function WeatherStrip({ items }: { items: WeatherStripItem[] }) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  return (
    <ul className="grid auto-cols-fr grid-flow-col gap-2 tabular-nums">
      {items.map((item, i) => {
        const Icon = icons[item.condition];
        return (
          <li
            key={i}
            // Every other item only where there is room.
            className={cn(
              "flex min-w-0 flex-col items-start gap-0.5",
              i % 2 === 1 && "max-sm:hidden",
            )}
          >
            <span className="truncate text-2xs text-text-muted">
              {t("weather.at", {
                distance: format.distance(item.distance),
                time: format.time(item.time),
              })}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Icon
                className="size-4 shrink-0"
                role="img"
                aria-label={t(`weather.condition.${item.condition}`)}
              />
              {format.temperature(item.temperature)}
            </span>
            <span
              className={cn(
                "flex items-center gap-1 text-xs",
                item.wind.kind === "head"
                  ? "text-selected-border"
                  : "text-text-muted",
              )}
            >
              <ArrowUp
                className="size-3.5 shrink-0"
                style={{ transform: `rotate(${item.wind.rotation}deg)` }}
                aria-hidden
              />
              {t(`weather.wind.${item.wind.kind}`)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
