import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  type LonLat,
  type Place,
  pointAtKm,
  routePoints,
  statsFromLegs,
} from "@wayline/domain";
import { Button, cn, focusRing, Logo, TopBar, TopBarSpacer } from "@wayline/ui";
import { BookmarkPlus, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { networkArea } from "../../components/NetworkLayer";
import { downloadTripGpx } from "../../data/gpx";
import { useNetwork, useSaveTrip } from "../../data/queries";
import { useServices } from "../../data/ServicesProvider";
import { placeOptions } from "../newTrip/places";
import {
  insertVia,
  mapPlace,
  moveVia,
  removeVia,
  routeToTrip,
  viaDistances,
} from "./route";
import { type Endpoint, RouteMap } from "./RouteMap";
import { RoutePanel } from "./RoutePanel";
import { RouteProfile } from "./RouteProfile";
import type { RouteSearch } from "./search";
import { useRoute } from "./useRoute";

/** Stations and towns to search, and to name points picked on the map. */
function usePlaces() {
  const { network } = useServices();
  const places = useQuery({
    queryKey: ["places"],
    queryFn: () => network.places(),
    staleTime: Infinity,
  });
  return useMemo(
    () => (places.data ? placeOptions(places.data) : []),
    [places.data],
  );
}

export function RoutePage() {
  const { t } = useTranslation("route");
  const search = useSearch({ from: "/route" });
  const navigate = useNavigate({ from: "/route" });
  const places = usePlaces();
  const save = useSaveTrip();
  const [fitKey, setFitKey] = useState(0);
  const [hoverKm, setHoverKm] = useState<number>();

  const { from, to } = search;
  const via = useMemo(() => search.via ?? [], [search.via]);
  const profile = search.profile ?? "touring";
  const points = useMemo<LonLat[]>(
    () => (from && to ? [from.coord, ...via, to.coord] : []),
    [from, to, via],
  );
  const route = useRoute(points, profile);
  const network = useNetwork(networkArea(points));
  const legs = points.length ? route.data : undefined;
  const updating = route.isFetching;
  const stats = useMemo(() => legs && statsFromLegs(legs), [legs]);
  const line = useMemo(() => routePoints(legs ?? []), [legs]);
  const hover =
    hoverKm !== undefined && line.length
      ? pointAtKm(line, hoverKm).coord
      : undefined;

  const update = (patch: Partial<RouteSearch>, fit = false) => {
    setHoverKm(undefined);
    // Zoom once the new points are in the URL.
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true }).then(
      () => fit && setFitKey((k) => k + 1),
    );
  };
  const pickPlace = (which: Endpoint) => (place: Place) =>
    update({ [which]: place }, true);
  const pickOnMap = (which: Endpoint, coord: LonLat) =>
    update({ [which]: mapPlace(coord, places) });
  const setVia = (next: LonLat[]) =>
    update({ via: next.length ? next : undefined });

  // Names and distances for the via list. Distances need the current legs.
  const viaPoints = via.map((coord, i) => ({
    name: mapPlace(coord, places).name,
    distance:
      legs && legs.length === via.length + 1
        ? viaDistances(legs)[i]
        : undefined,
  }));

  const trip = () =>
    from && to && legs && !route.isPlaceholderData
      ? routeToTrip({
          name: t("tripName", { from: from.name, to: to.name }),
          from,
          to,
          via: via.map((coord) => mapPlace(coord, places)),
          legs,
          profile,
        })
      : undefined;
  const ready = !!(from && to && legs && !route.isPlaceholderData);

  const saveAsTrip = () => {
    const next = trip();
    if (!next) return;
    save.mutate(next, {
      onSuccess: (saved) =>
        void navigate({ to: "/trips/$tripId", params: { tripId: saved.id } }),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar>
        <Link
          to="/"
          aria-label={t("backToList")}
          className={cn("rounded-sm", focusRing)}
        >
          <Logo />
        </Link>
        <div className="hidden h-6 w-px bg-border sm:block" />
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-md font-bold">{t("title")}</h1>
          <span className="truncate text-xs text-text-muted">
            {from && to
              ? t("subtitle", { from: from.name, to: to.name })
              : t("subtitleEmpty")}
          </span>
        </div>
        <TopBarSpacer />
        <Button
          size="sm"
          disabled={!ready || save.isPending}
          onClick={saveAsTrip}
        >
          <BookmarkPlus aria-hidden />
          <span className="hidden sm:inline">{t("saveAsTrip")}</span>
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!ready}
          onClick={() => {
            const next = trip();
            if (next) downloadTripGpx(next);
          }}
        >
          <Download aria-hidden />
          <span className="hidden sm:inline">{t("exportGpx")}</span>
        </Button>
      </TopBar>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-w-0 flex-col lg:flex-1">
          <div className="relative aspect-square shrink-0 lg:aspect-auto lg:min-h-0 lg:flex-1">
            <RouteMap
              from={from}
              to={to}
              via={via}
              legs={legs}
              updating={updating}
              hover={hover}
              picking={!from ? "from" : !to ? "to" : undefined}
              onPick={pickOnMap}
              onAddVia={(leg, coord) => setVia(insertVia(via, leg, coord))}
              onMoveVia={(i, coord) => setVia(moveVia(via, i, coord))}
              onRemoveVia={(i) => setVia(removeVia(via, i))}
              fitKey={fitKey}
            />
          </div>
          <RouteProfile
            legs={legs}
            stats={stats}
            network={network}
            hoverKm={hoverKm}
            onHoverKm={setHoverKm}
          />
        </div>
        <aside className="flex shrink-0 flex-col border-border bg-surface lg:w-panel lg:overflow-auto lg:border-l">
          <RoutePanel
            places={places}
            from={from}
            to={to}
            onFrom={pickPlace("from")}
            onTo={pickPlace("to")}
            onSwap={() =>
              update({
                from: to,
                to: from,
                via: via.length ? [...via].reverse() : undefined,
              })
            }
            profile={profile}
            onProfile={(next) => update({ profile: next })}
            stats={stats}
            via={viaPoints}
            onRemoveVia={(i) => setVia(removeVia(via, i))}
            updating={updating}
            failed={route.isError}
            onRetry={() => void route.refetch()}
          />
        </aside>
      </div>
    </div>
  );
}
