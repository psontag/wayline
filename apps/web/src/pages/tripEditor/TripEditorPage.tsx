import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import {
  addDays,
  addHours,
  decodeLine,
  findClimbs,
  pointAtKm,
  ridingHours,
  routePoints,
  stageSpeed,
  stageStartTime,
  timeToHours,
  type Trip,
} from "@wayline/domain";
import {
  Button,
  type MapLayerGroup,
  type MapLayerKind,
  SegmentedControl,
  Toast,
  ToastProvider,
  ToastViewport,
  useFormat,
} from "@wayline/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { networkArea } from "../../components/NetworkLayer";
import { useMe, useNetwork, useTrip, useWeatherGrid } from "../../data/queries";
import { DayPanel } from "./DayPanel";
import { StageProfile } from "./StageProfile";
import { useRouteStations } from "./stations";
import { useMapHotels, useStopOptions } from "./stopChoices";
import { ShareDialog } from "./ShareDialog";
import { TripActions } from "./TripHeader";
import { isChanged } from "./routeEdits";
import { type RouteEditing, TripMap } from "./TripMap";
import { tripStops } from "./tripArea";
import { TripPanel } from "./TripPanel";
import { PhoneTripEditor } from "./PhoneTripEditor";
import { useIsPhone } from "../../components/useIsPhone";
import { toHotel, useTripEditor } from "./useTripEditor";
import { type PanelView, useMapLayers, usePanelView } from "./mapView";
import { fieldAt, gridOf } from "./weatherGrid";
import { WeatherPanel } from "./WeatherPanel";

export function TripEditorPage() {
  const { t } = useTranslation("tripEditor");
  const { tripId } = useParams({ from: "/trips/$tripId" });
  const trip = useTrip(tripId);
  const me = useMe();

  if (trip.data && me.isSuccess) {
    // Someone else's trip, shared with me.
    const readOnly = me.data !== null && trip.data.owner !== me.data;
    return (
      <TripEditor
        trip={trip.data}
        readOnly={readOnly}
        canShare={me.data !== null && !readOnly}
      />
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-text-muted">
      {trip.isError || me.isError ? (
        <>
          <p>{t("notFound")}</p>
          <Button asChild>
            <Link to="/">{t("backToList")}</Link>
          </Button>
        </>
      ) : (
        <p role="status">{t("loading")}</p>
      )}
    </div>
  );
}

function TripEditor({
  trip,
  readOnly,
  canShare,
}: {
  trip: Trip;
  readOnly: boolean;
  canShare: boolean;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const search = useSearch({ from: "/trips/$tripId" });
  const navigate = useNavigate({ from: "/trips/$tripId" });
  const editor = useTripEditor(trip, readOnly);
  const network = useNetwork(networkArea(tripStops(trip)));
  const isPhone = useIsPhone();
  const [hoverKm, setHoverKm] = useState<number>();
  const [hoveredDay, setHoveredDay] = useState<number>();
  const [hoveredClimb, setHoveredClimb] = useState<number>();
  const [sharing, setSharing] = useState(false);
  const [view, setView] = usePanelView();
  const [layers, setLayers] = useMapLayers();
  // Hour the weather map shows. Follows the ride start until moved.
  const [mapTime, setMapTime] = useState<number>();
  const shareDialog = canShare && (
    <ShareDialog trip={trip} open={sharing} onOpenChange={setSharing} />
  );

  const selected = Math.min(search.stage ?? 0, trip.stages.length - 1);
  // Without a stage in the URL, the panel shows the whole trip.
  const dayOpen = search.stage !== undefined;
  const select = (stage: number) => {
    setHoverKm(undefined);
    setHoveredClimb(undefined);
    setHoveredDay(undefined);
    setMapTime(undefined);
    void navigate({ search: { stage }, replace: true });
  };
  const showTrip = () => {
    setHoveredClimb(undefined);
    void navigate({ search: {}, replace: true });
  };

  const stage = trip.stages[selected];
  const points = useMemo(() => routePoints(stage?.legs ?? []), [stage]);
  const climbs = useMemo(() => findClimbs(points), [points]);
  const climb = hoveredClimb === undefined ? undefined : climbs[hoveredClimb];
  const highlight = climb
    ? points
        .filter((p) => p.km >= climb.startKm && p.km <= climb.endKm)
        .map((p) => p.coord)
    : undefined;

  const weatherOn = view === "weather";
  const rideStart = timeToHours(stageStartTime(trip.settings, selected));
  const ride = {
    start: rideStart,
    end:
      rideStart +
      (stage ? ridingHours(stage.stats, trip.settings.avgSpeed) : 0),
  };
  const time = mapTime ?? rideStart;
  // The whole trip, so the weather does not end at the selected day.
  const weatherGrid = useMemo(
    () =>
      weatherOn
        ? gridOf(
            trip.stages.flatMap((s) =>
              s.legs.flatMap((leg) => decodeLine(leg.geometry)),
            ),
          )
        : undefined,
    [weatherOn, trip.stages],
  );
  const grid = useWeatherGrid(weatherGrid?.cells ?? []);
  const date = trip.startDate && addDays(trip.startDate, selected);
  const weatherField = useMemo(
    () =>
      weatherGrid && grid.data?.length === weatherGrid.cells.length && date
        ? fieldAt(weatherGrid, grid.data, `${date}T${addHours("00:00", time)}`)
        : undefined,
    [weatherGrid, grid.data, date, time],
  );
  // Where the rider is at the marker time, inside the ride window.
  const riderKm =
    weatherOn && stage
      ? (time - rideStart) * stageSpeed(stage.stats, trip.settings.avgSpeed)
      : undefined;
  const markKm = weatherOn
    ? riderKm !== undefined &&
      riderKm >= 0 &&
      stage &&
      riderKm <= stage.stats.distance / 1000
      ? riderKm
      : undefined
    : hoverKm;
  const hover =
    markKm !== undefined && points.length
      ? pointAtKm(points, markKm).coord
      : undefined;

  const isLast = selected === trip.stages.length - 1;
  const options = useStopOptions(trip, selected);
  const mapHotels = useMapHotels(trip, selected);
  const stations = useRouteStations(trip);
  const alternatives =
    isLast || readOnly
      ? []
      : options
          .filter((o) => !o.current)
          .map(({ place, distance }) => ({
            place,
            beds: mapHotels.beds.get(place.name),
            label: t("stage.alternative", {
              name: place.name,
              distance: format.distance(distance),
            }),
          }));

  const proposed = useMemo(
    () =>
      trip.stages.flatMap((_, i) =>
        isChanged(trip, i)
          ? [
              (trip.proposed?.[i]?.legs ?? []).flatMap((leg) =>
                decodeLine(leg.geometry),
              ),
            ]
          : [],
      ),
    [trip],
  );
  const routeEditing = (tapToAdd: boolean): RouteEditing | undefined =>
    readOnly
      ? undefined
      : {
          enabled: editor.canEdit,
          tapToAdd,
          preview: (leg, at) => editor.preview(selected, leg, at),
          onAddVia: (leg, at, keep) =>
            void editor.insertVia(selected, leg, at, keep),
          onMoveVia: (coord, at) => void editor.moveVia(selected, coord, at),
          onRemoveVia: (coord) => void editor.removeVia(selected, coord),
          proposed,
        };

  const toast = editor.note && (
    <Toast
      key={editor.note.id}
      open
      onOpenChange={(open) => !open && editor.clearNote()}
      duration={8000}
      message={editor.note.message}
      action={
        editor.note.changed
          ? { label: t("note.undo"), onClick: editor.undo }
          : undefined
      }
    />
  );

  const layerGroups: MapLayerGroup[] = [
    {
      title: t("layers.map"),
      items: [
        {
          kind: "network",
          label: t("layers.network"),
          checked: layers.network,
        },
        // The phone map has no hotels.
        ...(isPhone
          ? []
          : [
              {
                kind: "hotels" as const,
                label: t("layers.hotels"),
                checked: layers.hotels,
              },
            ]),
        {
          kind: "stations",
          label: t("layers.stations"),
          checked: layers.stations,
        },
      ],
    },
    ...(weatherOn
      ? [
          {
            title: t("layers.weather"),
            items: [
              {
                kind: "rain" as const,
                label: t("layers.rain"),
                checked: layers.rain,
              },
              {
                kind: "wind" as const,
                label: t("layers.wind"),
                checked: layers.wind,
              },
            ],
          },
        ]
      : []),
  ];
  const switcher = (
    <SegmentedControl
      stretch={isPhone}
      aria-label={t("panel.label")}
      options={[
        { value: "elevation", label: t("panel.elevation") },
        { value: "weather", label: t("panel.weather") },
      ]}
      value={view}
      onValueChange={(next) => setView(next as PanelView)}
    />
  );
  const setRideStart = editor.readOnly
    ? undefined
    : (start: string) => {
        setMapTime(undefined);
        editor.setRideStart(selected, start);
      };

  // The view under the map, or in the phone sheet.
  const chart = weatherOn ? (
    <WeatherPanel
      key={stage?.id}
      trip={trip}
      index={selected}
      onRideStartChange={setRideStart}
      time={time}
      onTimeChange={setMapTime}
      ride={ride}
      actions={switcher}
      plain={isPhone}
    />
  ) : (
    <StageProfile
      key={stage?.id}
      trip={trip}
      index={selected}
      network={network}
      hoverKm={hoverKm}
      onHoverKm={setHoverKm}
      climbs={climbs}
      highlightedClimb={hoveredClimb}
      actions={switcher}
      plain={isPhone}
    />
  );
  const mapLayers = {
    stations: layers.stations ? stations : [],
    network: layers.network ? ("quiet" as const) : ("off" as const),
    weather: weatherField && {
      field: weatherField,
      rain: layers.rain,
      wind: layers.wind,
    },
    layers: {
      groups: layerGroups,
      onCheckedChange: (kind: MapLayerKind, checked: boolean) =>
        setLayers({ ...layers, [kind]: checked }),
    },
  };

  if (isPhone) {
    return (
      <ToastProvider>
        {toast}
        {shareDialog}
        <PhoneTripEditor
          trip={trip}
          editor={editor}
          onShare={canShare ? () => setSharing(true) : undefined}
          selected={selected}
          onSelect={select}
          alternatives={alternatives}
          onPickAlternative={(place) => void editor.moveStop(selected, place)}
          hover={hover}
          chart={chart}
          mapLayers={mapLayers}
          route={routeEditing(true)}
          toast={<ToastViewport placement="inline" />}
        />
      </ToastProvider>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {shareDialog}
      <TripActions
        trip={trip}
        editor={editor}
        canShare={canShare}
        onShare={() => setSharing(true)}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-w-0 flex-col lg:flex-1">
          <div className="relative aspect-square shrink-0 lg:aspect-auto lg:min-h-0 lg:flex-1">
            <TripMap
              trip={trip}
              selected={selected}
              overview={!dayOpen}
              onSelect={select}
              hovered={hoveredDay}
              highlight={highlight}
              alternatives={dayOpen ? alternatives : []}
              onPickAlternative={(place) =>
                void editor.moveStop(selected, place)
              }
              hotels={
                !dayOpen || isLast || !layers.hotels ? [] : mapHotels.hotels
              }
              {...mapLayers}
              selectedHotelId={stage?.hotel?.osmId}
              onSelectHotel={(osmId) => {
                const h = mapHotels.hotels.find((x) => x.osmId === osmId);
                if (h) editor.setHotel(selected, toHotel(h));
              }}
              {...(editor.canEdit && {
                onToggleSaveHotel: (osmId: string) => {
                  const h = mapHotels.hotels.find((x) => x.osmId === osmId);
                  if (h) editor.toggleSavedHotel(toHotel(h));
                },
              })}
              hover={hover}
              route={dayOpen ? routeEditing(false) : undefined}
            >
              <ToastProvider>
                {toast}
                <div className="absolute inset-x-4 bottom-8 z-toast flex justify-center">
                  <ToastViewport placement="inline" />
                </div>
              </ToastProvider>
            </TripMap>
          </div>
          {chart}
        </div>
        <aside className="flex shrink-0 flex-col border-border bg-surface lg:w-panel lg:overflow-auto lg:border-l">
          {dayOpen ? (
            <DayPanel
              key={selected}
              trip={trip}
              index={selected}
              editor={editor}
              onSelect={select}
              onBack={showTrip}
              onHoverClimb={setHoveredClimb}
            />
          ) : (
            <TripPanel
              trip={trip}
              editor={editor}
              hovered={hoveredDay}
              onHover={setHoveredDay}
              onOpenDay={select}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
