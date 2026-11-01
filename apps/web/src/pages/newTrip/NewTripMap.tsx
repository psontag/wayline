import { useQuery } from "@tanstack/react-query";
import type { LonLat, Place } from "@wayline/domain";
import { EndpointMarker } from "@wayline/ui";
import { useTranslation } from "react-i18next";
import { Marker } from "react-map-gl/maplibre";
import { AppMap } from "../../components/map/AppMap";
import { useServices } from "../../data/ServicesProvider";

/** Corners of the area with route data. */
function useDataRegion() {
  const { network } = useServices();
  return useQuery({
    queryKey: ["newTrip", "dataRegion"],
    staleTime: Infinity,
    queryFn: async (): Promise<LonLat[]> => {
      const [w, s, e, n] = (await network.manifest()).region.bbox;
      return [
        [w, s],
        [e, n],
      ];
    },
  });
}

export function NewTripMap({
  start,
  end,
}: {
  start: Place | null;
  end: Place | null;
}) {
  const { t } = useTranslation("newTrip");
  const region = useDataRegion();
  const places = [start, end].filter((p): p is Place => p !== null);

  // Wait for the region, so the map opens on it instead of moving there.
  if (region.isPending) return null;
  return (
    <AppMap
      label={t("map.label")}
      fit={places.length ? places.map((p) => p.coord) : (region.data ?? [])}
      network="full"
      hiddenLabels={places.map((p) => p.name)}
    >
      {places.map((place) => (
        <Marker
          key={place.name + place.coord.join()}
          longitude={place.coord[0]}
          latitude={place.coord[1]}
          anchor="left"
          offset={[-12, 0]}
        >
          <EndpointMarker
            name={place.name}
            station={place.kind === "station"}
          />
        </Marker>
      ))}
    </AppMap>
  );
}
