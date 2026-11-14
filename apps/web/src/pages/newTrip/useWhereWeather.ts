import type { LonLat } from "@wayline/domain";
import { useMemo, useState } from "react";
import { gridOf } from "../../components/map/weatherGrid";
import { useWeatherGrid } from "../../data/queries";
import {
  lineWind,
  pastForecast,
  tripWeather,
  type WhereWeather,
  whereWeather,
} from "./whereWeather";

/**
 * The 16 forecast days over the points, and the days of the trip. Undefined
 * while loading.
 */
export function useWhereWeather(
  points: LonLat[] | undefined,
  today: string,
  startDate: string,
  days: number,
) {
  const past = pastForecast(today, startDate);
  // The query is keyed on the cells, so the same points fetch nothing new.
  const grid = useMemo(() => points && gridOf(points), [points]);
  const forecasts = useWeatherGrid(grid?.cells ?? []);
  const fresh = useMemo((): WhereWeather | undefined => {
    if (!grid || forecasts.data?.length !== grid.cells.length) return;
    return whereWeather(grid, forecasts.data, today);
  }, [grid, forecasts.data, today]);
  // Other dates or a longer train time make a new grid. Until it loads, the
  // last forecast stays, so the strip doesn't flicker.
  const [last, setLast] = useState(fresh);
  if (fresh && fresh !== last) setLast(fresh);
  const weather = fresh ?? (grid ? last : undefined);
  const trip = useMemo(
    () => weather && tripWeather(weather, startDate, days),
    [weather, startDate, days],
  );
  const wind = useMemo(
    () => trip && ((line: LonLat[]) => lineWind(trip, line).effort),
    [trip],
  );
  return {
    weather,
    trip,
    wind,
    past,
    loading: !!grid && !fresh && !forecasts.isError,
    failed: forecasts.isError,
  };
}
