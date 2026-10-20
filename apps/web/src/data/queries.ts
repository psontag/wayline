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
  type Stop,
  type Trip,
  weatherAlongStage,
} from "@wayline/domain";
import { cellOf, type Forecast } from "@wayline/providers";
import { useServices } from "./ServicesProvider";

export const queryKeys = {
  trips: ["trips"] as const,
  trip: (id: string) => ["trip", id] as const,
  forecast: (cell: LonLat) => ["forecast", ...cell] as const,
  hotels: (coord: LonLat) => ["hotels", ...coord] as const,
};

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
  const { weather } = useServices();
  const client = useQueryClient();
  const stage = trip?.stages[stageIndex];
  const date = trip?.startDate && addDays(trip.startDate, stageIndex);
  const { startTime, avgSpeed } = trip?.settings ?? {};

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
    queryFn: async () => {
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
          const forecast = await client.fetchQuery({
            queryKey: queryKeys.forecast(cell),
            queryFn: () => weather.forecast(cell),
            staleTime: FORECAST_STALE_MS,
          });
          forecasts.set(cell.join(), forecast);
        }),
      );
      return weatherAlongStage(
        points,
        { date, startTime, avgSpeed },
        (coord, time) => {
          const forecast = forecasts.get(cellOf(coord).join());
          return forecast && sampleAt(forecast.samples, time);
        },
      );
    },
  });
}

/** Hotels near a stop, nearest first. */
export function useHotels(stop: Stop | undefined) {
  const { lodging } = useServices();
  return useQuery({
    queryKey: queryKeys.hotels(stop?.coord ?? [0, 0]),
    enabled: !!stop,
    queryFn: () => (stop ? lodging.hotelsNear(stop.coord) : []),
  });
}
