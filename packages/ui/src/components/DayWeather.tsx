import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { Stat } from "./Stat";

export type Wind = {
  kind: "head" | "tail" | "cross";
  /** Share of the distance with this wind, 0 to 1. */
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
  className?: string;
};

/** Temperature, rain and wind of a day as icon stats. */
export function DayWeather({
  temperature,
  feelsLike,
  rain,
  wind,
  className,
}: DayWeatherProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const range = t("stage.temperatureRange", {
    min: Math.round(temperature.min),
    max: format.temperature(temperature.max),
  });

  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
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
        icon={rain >= 0.1 ? "rain" : "dry"}
        label={t("stage.rain")}
        value={
          rain >= 0.1
            ? t("stage.rainUpTo", { amount: format.rain(rain) })
            : t("stage.dry")
        }
      />
      {wind && (
        <Stat
          size="sm"
          icon="wind"
          label={t("stage.windLabel")}
          value={t("stage.windWithSpeed", {
            wind: t(`stage.wind.${wind.kind}`, {
              share: format.percent(wind.share),
            }),
            speed: format.speed(wind.speedKmh),
          })}
        />
      )}
    </div>
  );
}
