import {
  decodeLine,
  distanceKm,
  type GeoStation,
  type GeoTown,
  type HotelBudget,
  type LonLat,
  type Place,
  type Places,
  type Stage,
  type Trip,
} from "@wayline/domain";
import {
  byBudget,
  fitsBudget,
  HOTEL_KM,
  HotelIndex,
  type HotelOption,
  toOption,
} from "@wayline/providers";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useServices } from "../../data/ServicesProvider";
import {
  routedStageIfEnding,
  stageIfEndingAt,
  type StageIfEnding,
} from "./edits";

export type TownSize = GeoTown["place"];

/** Hotels within HOTEL_KM. inBudget only when the trip has a budget. */
export type Beds = { total: number; inBudget?: number };

export type StopChoice = StageIfEnding & {
  place: Place;
  current: boolean;
  /** Missing while the region data loads. */
  beds?: Beds;
  size?: TownSize;
};

/** Places of the region, for lookups without the network. */
export type PlaceIndex = {
  hotels: HotelIndex;
  towns: GeoTown[];
  stations: GeoStation[];
};

/** Region places, loaded once. */
export function usePlaceIndex(): PlaceIndex | undefined {
  const { network } = useServices();
  const places = useQuery({
    queryKey: ["places"],
    queryFn: () => network.places(),
    staleTime: Infinity,
  });
  return useMemo(
    () => (places.data ? placeIndex(places.data) : undefined),
    [places.data],
  );
}

export function placeIndex(places: Places): PlaceIndex {
  return {
    hotels: new HotelIndex(places.hotels),
    towns: places.towns,
    stations: places.stations,
  };
}

export function bedsNear(
  hotels: HotelIndex,
  coord: LonLat,
  budget?: HotelBudget,
): Beds {
  const near = hotels.near(coord, HOTEL_KM);
  return budget
    ? {
        total: near.length,
        inBudget: near.filter((h) => fitsBudget(h, budget)).length,
      }
    : { total: near.length };
}

/** OSM size of the town at a place: by OSM id, else by name close by. */
export function townSize(towns: GeoTown[], place: Place): TownSize | undefined {
  const town =
    (place.osmId && towns.find((t) => t.id === place.osmId)) ||
    towns.find(
      (t) =>
        t.name === place.name && distanceKm([t.lon, t.lat], place.coord) < 3,
    );
  return town ? town.place : undefined;
}

/**
 * Route points of the stage and the next one near a stop. Hotels further
 * away than this are not listed anyway.
 */
export function routeNear(
  stage: Stage,
  next: Stage | undefined,
  coord: LonLat,
): LonLat[] {
  return [...stage.legs, ...(next?.legs ?? [])]
    .flatMap((leg) => decodeLine(leg.geometry))
    .filter((p) => distanceKm(p, coord) <= HOTEL_KM * 2);
}

/** Hotels near a stop: in budget first, each group by detour. */
export function stopHotels(
  hotels: HotelIndex,
  coord: LonLat,
  route: LonLat[],
  budget?: HotelBudget,
): HotelOption[] {
  return byBudget(
    hotels.near(coord, HOTEL_KM).map((h) => toOption(h, coord, route)),
    budget,
  );
}

/** The stop and its alternatives with km, ascent, beds and town size. */
export function stopChoices(
  trip: Trip,
  index: number,
  places?: PlaceIndex,
): StopChoice[] {
  const stage = trip.stages[index];
  if (!stage) return [];
  const next = trip.stages[index + 1];
  const budget = trip.settings.hotelBudget;
  const extra = (place: Place) =>
    places
      ? {
          beds: bedsNear(places.hotels, place.coord, budget),
          size: townSize(places.towns, place),
        }
      : {};
  const current: StopChoice = {
    place: stage.end,
    current: true,
    distance: stage.stats.distance,
    ascent: stage.stats.ascent,
    ...(next ? { nextDistance: next.stats.distance } : {}),
    ...extra(stage.end),
  };
  const others = stage.end.alternatives.map((place): StopChoice => ({
    place,
    current: false,
    ...stageIfEndingAt(stage, next, place.coord),
    ...extra(place),
  }));
  return [current, ...others].sort((a, b) => a.distance - b.distance);
}

/** Replaces estimates with routed numbers, by place name. */
export function withRouted(
  choices: StopChoice[],
  routed: Map<string, StageIfEnding>,
): StopChoice[] {
  return choices
    .map((c) => {
      const r = c.current ? undefined : routed.get(c.place.name);
      return r ? { ...c, ...r } : c;
    })
    .sort((a, b) => a.distance - b.distance);
}

/**
 * The stop and its alternatives, shortest stage first. Alternatives show an
 * estimate until they are routed the same way picking them routes.
 */
export function useStopOptions(trip: Trip, index: number): StopChoice[] {
  const places = usePlaceIndex();
  const { routing } = useServices();
  const alternatives = useMemo(
    () => trip.stages[index]?.end.alternatives ?? [],
    [trip, index],
  );
  const routed = useQueries({
    queries: alternatives.map((place) => ({
      queryKey: ["stopRoute", trip.id, trip.updatedAt, index, place.name],
      queryFn: () =>
        routedStageIfEnding(trip, index, place, (points) =>
          routing.route(points, { profile: trip.settings.profile }),
        ),
      staleTime: Infinity,
    })),
    // Structurally shared, so the array only changes with new data.
    combine: (results) => results.map((r) => r.data),
  });
  return useMemo(() => {
    const byName = new Map<string, StageIfEnding>();
    alternatives.forEach((place, i) => {
      const r = routed[i];
      if (r) byName.set(place.name, r);
    });
    return withRouted(stopChoices(trip, index, places), byName);
  }, [trip, index, places, alternatives, routed]);
}

/** Hotels at the stop of a stage, with the route to measure detours. */
export function useStopHotels(trip: Trip, index: number) {
  const places = usePlaceIndex();
  return useMemo(() => {
    const stage = trip.stages[index];
    if (!stage) return { hotels: [], route: [] };
    const coord = stage.end.coord;
    const route = routeNear(stage, trip.stages[index + 1], coord);
    const hotels = places
      ? stopHotels(places.hotels, coord, route, trip.settings.hotelBudget)
      : [];
    return { hotels, route, loading: !places };
  }, [trip, index, places]);
}

/**
 * Map data for the selected day: hotels at the stop, and the hotel count
 * per alternative by name. The hotels fit TripMap's `hotels` prop.
 */
export function useMapHotels(trip: Trip, index: number) {
  const { hotels } = useStopHotels(trip, index);
  const options = useStopOptions(trip, index);
  return useMemo(() => {
    const beds = new Map<string, number>();
    for (const { place, beds: b } of options) {
      if (b) beds.set(place.name, b.total);
    }
    return {
      hotels: hotels.map(
        ({ osmId, name, kind, stars, coord, detourKm, website }) => ({
          osmId,
          name,
          kind,
          coord,
          detourKm,
          ...(stars === undefined ? {} : { stars }),
          ...(website === undefined ? {} : { website }),
        }),
      ),
      beds,
    };
  }, [hotels, options]);
}
