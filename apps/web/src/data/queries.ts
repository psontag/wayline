import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addDays,
  type BBox,
  type LonLat,
  routePoints,
  sampleAt,
  stageStartTime,
  type StageWeather,
  type Trip,
  weatherAlongStage,
} from "@wayline/domain";
import { cellOf, type Forecast } from "@wayline/providers";
import { useServices } from "./ServicesProvider";

export const queryKeys = {
  me: ["me"] as const,
  trips: ["trips"] as const,
  shares: (id: string) => ["shares", id] as const,
  trip: (id: string) => ["trip", id] as const,
  forecast: (cell: LonLat) => ["forecast", ...cell] as const,
};

/** Email of the logged-in user. Null without a server. */
export function useMe() {
  const { me } = useServices();
  return useQuery({ queryKey: queryKeys.me, queryFn: me, staleTime: Infinity });
}

export function useShares(id: string, enabled = true) {
  const { trips } = useServices();
  return useQuery({
    queryKey: queryKeys.shares(id),
    queryFn: () => trips.shares(id),
    enabled,
  });
}

export function useSetShares(id: string) {
  const { trips } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (emails: string[]) => trips.setShares(id, emails),
    onSuccess: (emails) => {
      client.setQueryData(queryKeys.shares(id), emails);
      client.setQueryData<Trip>(
        queryKeys.trip(id),
        (trip) => trip && { ...trip, sharedWith: emails },
      );
    },
  });
}

export function useTrips() {
  const { trips } = useServices();
  return useQuery({ queryKey: queryKeys.trips, queryFn: () => trips.list() });
}

export function useTrip(id: string) {
  const { trips } = useServices();
  return useQuery({
    queryKey: queryKeys.trip(id),
    queryFn: () => trips.get(id),
  });
}

/** Saves a trip. Fails with WaylineError CONFLICT if it changed meanwhile. */
export function useSaveTrip() {
  const { trips } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (trip: Trip) => trips.save(trip),
    onSuccess: (saved) => {
      client.setQueryData(queryKeys.trip(saved.id), saved);
      void client.invalidateQueries({ queryKey: queryKeys.trips });
    },
  });
}

export function useDeleteTrip() {
  const { trips } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trips.delete(id),
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: queryKeys.trip(id) });
      void client.invalidateQueries({ queryKey: queryKeys.trips });
    },
  });
}

export function useDuplicateTrip() {
  const { trips } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      trips.duplicate(id, name),
    onSuccess: (copy) => {
      client.setQueryData(queryKeys.trip(copy.id), copy);
      void client.invalidateQueries({ queryKey: queryKeys.trips });
    },
  });
}

/** The route network, for surface colors in the elevation profile. */
export function useNetwork(bbox: BBox | undefined) {
  const { network } = useServices();
  return useQuery({
    queryKey: ["network", bbox],
    queryFn: () => network.network(bbox),
    enabled: !!bbox,
    staleTime: Infinity,
  }).data;
}

const FORECAST_STALE_MS = 2 * 60 * 60 * 1000;

/**
 * Weather along a stage at the expected time at each km.
 * Data is null when the trip has no start date or the stage is beyond the
 * forecast range. Old data stays visible while new data loads.
 */
export function useWeather(trip: Trip | undefined, stageIndex: number) {
  const forecast = useForecast();
  const stage = trip?.stages[stageIndex];
  const date = trip?.startDate && addDays(trip.startDate, stageIndex);
  const startTime = trip && stageStartTime(trip.settings, stageIndex);
  const avgSpeed = trip?.settings.avgSpeed;

  return useQuery({
    queryKey: [
      "weather",
      stage?.id,
      date,
      startTime,
      avgSpeed,
      stage?.legs.map((l) => l.geometry.length + ":" + l.distance).join(","),
    ],
    enabled: !!stage,
    placeholderData: keepPreviousData,
    queryFn: () =>
      trip && stage ? stageWeather(trip, stageIndex, forecast) : null,
  });
}

/**
 * Weather of every day of a trip. Data is null when any day has no
 * forecast.
 */
export function useTripWeather(trip: Trip | undefined, enabled = true) {
  const forecast = useForecast();
  return useQuery({
    queryKey: [
      "tripWeather",
      trip?.id,
      trip?.startDate,
      trip?.stages.map((s) => s.id).join(","),
    ],
    enabled: enabled && !!trip?.startDate,
    queryFn: async () => {
      if (!trip) return null;
      const days = await Promise.all(
        trip.stages.map((_, i) => stageWeather(trip, i, forecast)),
      );
      return days.some((d) => !d) ? null : (days as StageWeather[]);
    },
  });
}

/** Fetches the forecast of a cell, cached. */
function useForecast() {
  const { weather } = useServices();
  const client = useQueryClient();
  return (cell: LonLat) =>
    client.fetchQuery({
      queryKey: queryKeys.forecast(cell),
      queryFn: () => weather.forecast(cell),
      staleTime: FORECAST_STALE_MS,
    });
}

async function stageWeather(
  trip: Trip,
  stageIndex: number,
  forecast: (cell: LonLat) => Promise<Forecast>,
): Promise<StageWeather | null> {
  const stage = trip.stages[stageIndex];
  const date = trip.startDate && addDays(trip.startDate, stageIndex);
  const startTime = stageStartTime(trip.settings, stageIndex);
  const avgSpeed = trip.settings.avgSpeed;
  if (!stage || !date || !startTime || !avgSpeed) return null;
  const points = routePoints(stage.legs);
  const cells = new Map<string, LonLat>();
  for (const p of points) {
    const cell = cellOf(p.coord);
    cells.set(cell.join(), cell);
  }
  const forecasts = new Map<string, Forecast>();
  await Promise.all(
    [...cells.values()].map(async (cell) => {
      forecasts.set(cell.join(), await forecast(cell));
    }),
  );
  return weatherAlongStage(
    points,
    { date, startTime, avgSpeed },
    (coord, time) => {
      const f = forecasts.get(cellOf(coord).join());
      return f && sampleAt(f.samples, time);
    },
  );
}
