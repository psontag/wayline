import type { Place } from "@wayline/domain";
import { ReachLabel, useFormat, useThemeTokens } from "@wayline/ui";
import type { FeatureCollection, Point } from "geojson";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Marker, Source } from "react-map-gl/maplibre";
import { MapLayer } from "../../components/map/AppMap";
import { type Reach, reachBand } from "./reach";

export const REACH_LAYER = "reach-stations";

export type ReachStation = {
  place: Place;
  reach: Reach;
  /** Longer than the max train time. Shown faded. */
  over: boolean;
  /** Wet on a day of the trip. Shown faded. */
  wet?: boolean;
};

/** Stations colored by train time from home. */
export function ReachLayer({
  stations,
  attribution,
  hovered,
}: {
  stations: ReachStation[];
  attribution: string;
  /** Index into stations. */
  hovered?: number;
}) {
  const tokens = useThemeTokens();
  const data = useMemo(
    (): FeatureCollection<Point> => ({
      type: "FeatureCollection",
      features: stations.map((s, i) => ({
        type: "Feature",
        id: i,
        properties: {
          i,
          band: reachBand(s.reach.minutes),
          over: s.over,
          wet: !!s.wet,
        },
        geometry: { type: "Point", coordinates: s.place.coord },
      })),
    }),
    [stations],
  );
  const station = hovered === undefined ? undefined : stations[hovered];

  return (
    <>
      <Source
        id={REACH_LAYER}
        type="geojson"
        data={data}
        attribution={attribution}
      >
        <MapLayer
          id={REACH_LAYER}
          type="circle"
          layout={{
            "circle-sort-key": [
              "case",
              ["get", "over"],
              0,
              ["get", "wet"],
              1,
              2,
            ],
          }}
          paint={{
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              6,
              ["case", ["get", "over"], 2, 3.5],
              10,
              ["case", ["get", "over"], 4, 7],
            ],
            "circle-color": [
              "case",
              ["get", "over"],
              tokens.textMuted,
              [
                "match",
                ["get", "band"],
                1,
                tokens.reach1,
                2,
                tokens.reach2,
                tokens.reach3,
              ],
            ],
            "circle-opacity": [
              "case",
              ["get", "over"],
              0.35,
              ["get", "wet"],
              0.4,
              1,
            ],
            "circle-stroke-color": tokens.surface,
            "circle-stroke-width": ["case", ["get", "over"], 0, 1.5],
          }}
        />
      </Source>
      {station && <StationLabel station={station} />}
    </>
  );
}

function StationLabel({ station }: { station: ReachStation }) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const { place, reach } = station;
  return (
    <Marker
      longitude={place.coord[0]}
      latitude={place.coord[1]}
      anchor="bottom"
      offset={[0, -10]}
      style={{ pointerEvents: "none" }}
    >
      <ReachLabel
        name={place.name}
        time={format.duration(reach.minutes / 60)}
        changes={t("reach.changes", { count: reach.changes })}
        {...(reach.reservation && {
          reservation: {
            mark: t("reach.mark"),
            label: t("reach.reservationHint"),
          },
        })}
      />
    </Marker>
  );
}
