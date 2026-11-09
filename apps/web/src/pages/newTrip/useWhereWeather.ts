import type { LonLat } from "@wayline/domain";
import { useMemo } from "react";
import { gridOf } from "../../components/map/weatherGrid";
import { useWeatherGrid } from "../../data/queries";
import type { ReachStation } from "./ReachLayer";
import {
  lineWind,
  pastForecast,
  type WhereWeather,
  whereWeather,
} from "./whereWeather";

/** The grid covers stations up to this far by train, whatever the filter. */
const GRID_MINUTES = 180;

/**
 * Forecast for the trip days over the stations in reach. Undefined while
 * loading, or when the dates are past the forecast.
 */
export function useWhereWeather(
  stations: ReachStation[] | null | undefined,
  today: string,
  startDate: string,
  days: number,
) {
  const past = pastForecast(today, startDate);
  // The query is keyed on the cells, so a new filter fetches nothing new.
  const grid = useMemo(
    () =>
      past
        ? undefined
        : gridOf(
            (stations ?? [])
              .filter((s) => s.reach.minutes <= GRID_MINUTES)
              .map((s) => s.place.coord),
          ),
    [stations, past],
  );
  const forecasts = useWeatherGrid(grid?.cells ?? []);
  const weather = useMemo((): WhereWeather | undefined => {
    if (!grid || forecasts.data?.length !== grid.cells.length) return;
    return whereWeather(grid, forecasts.data, startDate, days);
  }, [grid, forecasts.data, startDate, days]);
  const wind = useMemo(
    () => weather && ((line: LonLat[]) => lineWind(weather, line).effort),
    [weather],
  );
  return {
    weather,
    wind,
    past,
    loading: !past && !!grid && !weather && !forecasts.isError,
    failed: forecasts.isError,
  };
}
