import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { Stat } from "./Stat";
import { Tooltip } from "./Tooltip";
import { WarningText } from "./WarningText";

/** mm per hour from which an hour counts as wet. Below, a day is "Dry". */
export const WET_MM = 0.1;

export type Wind = {
  /** calm: too little wind for head, tail or cross to matter. */
  kind: "head" | "tail" | "cross" | "calm";
  /** Share of the distance with this wind, 0 to 1. Unused when calm. */
  share: number;
  speedKmh: number;
};

export type DayWeatherProps = {
  temperature: { min: number; max: number };
  /** Lowest feels-like temperature on the ride. */
  feelsLike?: number;
  /** mm, highest hourly value on the ride. */
  rain: number;
  wind?: Wind;
  /** E.g. "Cold start: −1 °C". One line each, below the stats. */
  warnings?: string[];
  /** One line. Warnings become an icon with a tooltip. */
  compact?: boolean;
  className?: string;
};

/** Temperature, rain and wind of a day as icon stats. */
export function DayWeather({
  temperature,
  feelsLike,
  rain,
  wind,
  warnings = [],
  compact = false,
  className,
}: DayWeatherProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const range = t("stage.temperatureRange", {
    min: Math.round(temperature.min),
    max: format.temperature(temperature.max),
  });
  const windKind = wind
    ? t(`stage.wind.${wind.kind}`, { share: format.percent(wind.share) })
    : "";
  const windText = wind
    ? t("stage.windWithSpeed", {
        wind: windKind,
        speed: format.speed(wind.speedKmh),
      })
    : "";

  return (
    <div
      className={cn(
        compact
          ? "flex items-center gap-x-3.5 overflow-hidden"
          : "flex flex-wrap gap-x-4 gap-y-1.5",
        className,
      )}
    >
      {compact && warnings.length > 0 && (
        <Tooltip label={warnings.join(" · ")}>
          <TriangleAlert
            role="img"
            aria-label={warnings.join(", ")}
            className="size-3.5 shrink-0 text-warning"
          />
        </Tooltip>
      )}
      <Stat
        size="sm"
        icon="temperature"
        label={t("stage.temperature")}
        value={
          feelsLike === undefined
            ? range
            : t("stage.feelsLike", {
                range,
                feelsLike: format.temperature(feelsLike),
              })
        }
      />
      <Stat
        size="sm"
        icon={rain >= WET_MM ? "rain" : "dry"}
        label={t("stage.rain")}
        value={
          rain >= WET_MM
            ? t("stage.rainUpTo", { amount: format.rain(rain) })
            : t("stage.dry")
        }
      />
      {wind && (
        // One line has no room for the speed. The tooltip has it.
        <Stat
          size="sm"
          icon="wind"
          label={compact ? windText : t("stage.windLabel")}
          value={compact ? windKind : windText}
        />
      )}
      {!compact &&
        warnings.map((warning) => (
          <WarningText key={warning} className="w-full">
            {warning}
          </WarningText>
        ))}
    </div>
  );
}
