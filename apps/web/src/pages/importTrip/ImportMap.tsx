import type { GeoTown, LonLat } from "@wayline/domain";
import { PlaceMarker, useThemeTokens } from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { useTranslation } from "react-i18next";
import { Marker, Source } from "react-map-gl/maplibre";
import { AppMap, MapLayer } from "../../components/map/AppMap";
import { type ImportFile, townNear } from "./importDays";

const lineLayout = { "line-cap": "round", "line-join": "round" } as const;

/** The imported days, colored like stages in the editor. */
export function ImportMap({
  files,
  hovered,
  towns,
}: {
  files: ImportFile[];
  hovered?: number;
  towns?: GeoTown[];
}) {
  const { t } = useTranslation("importTrip");
  const tokens = useThemeTokens();
  const data: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: files.map((file, i) => ({
      type: "Feature",
      properties: {
        b: i % 2 === 1,
        dimmed: hovered !== undefined && hovered !== i,
      },
      geometry: {
        type: "LineString",
        coordinates: file.preview,
      },
    })),
  };
  const ends = files.flatMap((file, i) => {
    const out: LonLat[] = [];
    const first = file.points[0]?.coord;
    const last = file.points.at(-1)?.coord;
    if (i === 0 && first) out.push(first);
    if (last) out.push(last);
    return out;
  });
  const names = ends.map(
    (coord) => (towns && townNear(towns, coord)?.name) ?? "",
  );

  return (
    <AppMap
      label={t("map.label")}
      fit={files.flatMap((f) => f.preview)}
      fitKey={files.map((f) => f.id).join()}
      hiddenLabels={names.filter(Boolean)}
    >
      <Source id="days" type="geojson" data={data}>
        <MapLayer
          id="day-casing"
          type="line"
          layout={lineLayout}
          paint={{
            "line-color": tokens.routeCasing,
            "line-width": 7,
            "line-opacity": ["case", ["get", "dimmed"], 0.3, 1],
          }}
        />
        <MapLayer
          id="day-line"
          type="line"
          layout={lineLayout}
          paint={{
            "line-color": ["case", ["get", "b"], tokens.stageB, tokens.stageA],
            "line-width": 4,
            "line-opacity": ["case", ["get", "dimmed"], 0.3, 1],
          }}
        />
      </Source>
      {ends.map((coord, i) => (
        <Marker
          key={`${i}-${coord.join()}`}
          longitude={coord[0]}
          latitude={coord[1]}
          anchor="left"
          offset={[-6, 0]}
        >
          <PlaceMarker name={names[i] ?? ""} />
        </Marker>
      ))}
    </AppMap>
  );
}
