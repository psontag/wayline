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
import { networkArea } from "../../components/NetworkLayer";
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

/** Places of an area, for lookups without the network. */
export type PlaceIndex = {
  hotels: HotelIndex;
  towns: GeoTown[];
  stations: GeoStation[];
};

/** Places around points, e.g. a route. Undefined while they load. */
export function usePlaceIndex(points: LonLat[]): PlaceIndex | undefined {
  const { network } = useServices();
  // Every 20th point is enough for the area, and keeps Math.min in bboxAround
  // well below the argument limit for long tracks.
  const area = networkArea(
    points.filter((_, i) => i % 20 === 0 || i === points.length - 1),
  );
  const places = useQuery({
    queryKey: ["places", area],
    queryFn: () => network.places(area),
    enabled: !!area,
    staleTime: Infinity,
  });
  return useMemo(
    () => (places.data ? placeIndex(places.data) : undefined),
    [places.data],
  );
}

/** Places along a trip: its route and the stop alternatives. */
export function useTripPlaces(trip: Trip): PlaceIndex | undefined {
  const points = useMemo(
    () =>
      trip.stages.flatMap((stage) => [
        stage.start.coord,
        stage.end.coord,
        ...stage.legs.flatMap((leg) => decodeLine(leg.geometry)),
        ...stage.end.alternatives.map((a) => a.coord),
      ]),
    [trip.stages],
  );
  return usePlaceIndex(points);
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

/** Train stops this close to the end can become the destination. */
const DESTINATION_KM = 20;
/** Train stops closer than this to each other count as one choice. */
const DESTINATION_GAP_KM = 2;
const DESTINATIONS = 6;
const SIZE_RANK: Record<TownSize, number> = { city: 0, town: 1, village: 2 };

/** A loop has to end where it starts. */
export function hasMovableDestination(trip: Trip): boolean {
  return trip.kind === "one-way" || trip.kind === "route";
}

/**
 * Train stops the last stage could end at instead: in bigger towns first,
 * then closer ones first, each in another place.
 */
export function destinationStations(
  stage: Stage,
  { stations, towns }: PlaceIndex,
): Place[] {
  const taken = [stage.start.coord, stage.end.coord];
  const found = stations.flatMap((s) => {
    const coord: LonLat = [s.lon, s.lat];
    const km = distanceKm(coord, stage.end.coord);
    if (km > DESTINATION_KM) return [];
    const town = towns.find((t) => distanceKm([t.lon, t.lat], coord) < 3);
    const rank = town ? SIZE_RANK[town.place] : 3;
    const place: Place = {
      name: s.name,
      kind: "station",
      coord,
      osmId: s.id,
    };
    return [{ place, km, rank }];
  });
  const out: Place[] = [];
  for (const { place } of found.sort(
    (a, b) => a.rank - b.rank || a.km - b.km,
  )) {
    if (out.length === DESTINATIONS) break;
    if (taken.some((c) => distanceKm(c, place.coord) < DESTINATION_GAP_KM)) {
      continue;
    }
    taken.push(place.coord);
    out.push(place);
  }
  return out;
}

/** The stop and its alternatives with km, ascent, beds and town size. */
export function stopChoices(
  trip: Trip,
  index: number,
  places?: PlaceIndex,
  alternatives = trip.stages[index]?.end.alternatives ?? [],
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
  const others = alternatives.map((place): StopChoice => ({
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
 * estimate until they are routed the same way picking them routes. The last
 * stage has alternatives only with `findStations`, as each one is routed.
 */
export function useStopOptions(
  trip: Trip,
  index: number,
  findStations = false,
): StopChoice[] {
  const places = useTripPlaces(trip);
  const { routing } = useServices();
  const alternatives = useMemo(() => {
    const stage = trip.stages[index];
    if (!stage) return [];
    if (index < trip.stages.length - 1) return stage.end.alternatives;
    return findStations && places ? destinationStations(stage, places) : [];
  }, [trip, index, findStations, places]);
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
    return withRouted(stopChoices(trip, index, places, alternatives), byName);
  }, [trip, index, places, alternatives, routed]);
}

/** Hotels at the stop of a stage, with the route to measure detours. */
export function useStopHotels(trip: Trip, index: number) {
  const places = useTripPlaces(trip);
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
