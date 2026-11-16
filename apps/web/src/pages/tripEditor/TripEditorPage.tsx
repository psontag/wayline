import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  addDays,
  addHours,
  decodeLine,
  findClimbs,
  type Leg,
  type LonLat,
  type Place,
  pointAtKm,
  dayHours,
  routePoints,
  stageSpeed,
  stageStartTime,
  timeToHours,
  type Trip,
} from "@wayline/domain";
import {
  type MapLayerGroup,
  type MapLayerKind,
  PreviewLabel,
  SegmentedControl,
  Toast,
  ToastProvider,
  ToastViewport,
  useFormat,
} from "@wayline/ui";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorScreen } from "../../components/ErrorPanel";
import { networkArea } from "../../components/NetworkLayer";
import {
  useMe,
  useNetwork,
  useTrip,
  useTripWeather,
  useWeatherGrid,
} from "../../data/queries";
import { tripWeatherPoints } from "./stageWeather";
import { TripWeatherPanel } from "./TripWeatherPanel";
import { DayPanel } from "./DayPanel";
import { StageProfile } from "./StageProfile";
import { useRouteStations } from "./stations";
import {
  bedsNear,
  hasMovableDestination,
  useHotelTowns,
  useMapHotels,
  useStopOptions,
  useTripPlaces,
} from "./stopChoices";
import {
  type DayChoice,
  type DayChoicesState,
  useDayChoices,
} from "./dayChoices";
import {
  type ChoiceStages,
  routedStageIfEnding,
  samePlace,
  stageLine,
} from "./edits";
import { type DayRoute, MAX_ROUTES, useDayRoutes } from "./dayRoutes";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedHover } from "../../components/useDebouncedHover";
import { useServices } from "../../data/ServicesProvider";

/** The pointer rests this long on a town before its route loads. */
const TOWN_HOVER_MS = 120;

// Stable, so the memos that use them keep.
const NO_ROUTES: DayRoute[] = [];
const NO_CHOICES: MapChoice[] = [];
import { ShareDialog } from "./ShareDialog";
import { TripActions } from "./TripHeader";
import { proposedSection } from "./proposedSection";
import { isChanged } from "./routeEdits";
import {
  formatDelta,
  type MapAlternative,
  type MapChoice,
  type RouteEditing,
  type TownLayer,
  TripMap,
} from "./TripMap";
import { tripStops } from "./tripArea";
import { TripPanel } from "./TripPanel";
import { PhoneTripEditor } from "./PhoneTripEditor";
import { useIsPhone } from "../../components/useIsPhone";
import { toHotel, useTripEditor } from "./useTripEditor";
import { useUndoKeys } from "./useUndoKeys";
import { type PanelView, useMapLayers, usePanelView } from "./mapView";
import { fieldAt, gridOf } from "../../components/map/weatherGrid";
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
  const error = trip.error ?? me.error;
  if (error) {
    return (
      <ErrorScreen
        error={error}
        onRetry={() => {
          void trip.refetch();
          void me.refetch();
        }}
      />
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-text-muted">
      <p role="status">{t("loading")}</p>
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
  useUndoKeys(editor);
  const network = useNetwork(networkArea(tripStops(trip)));
  const isPhone = useIsPhone();
  const { routing } = useServices();
  const [hoverKm, setHoverKm] = useState<number>();
  const [hoveredDay, setHoveredDay] = useState<number>();
  const [hoveredClimb, setHoveredClimb] = useState<number>();
  const [proposedHighlighted, setProposedHighlighted] = useState(false);
  const [previewLegs, setPreviewLegs] = useState<Leg[]>();
  const [sharing, setSharing] = useState(false);
  const [view, setView] = usePanelView();
  const [layers, setLayers] = useMapLayers();
  // Hour the weather map shows. Follows the ride start until moved.
  const [mapTime, setMapTime] = useState<number>();
  const [findingDestination, setFindingDestination] = useState(false);
  // Stop choice under the pointer, in the stop table or on the map.
  const [choiceHover, setChoiceHover] = useState<{ day: number; id: string }>();
  const [replaced, setReplaced] = useState<{
    day: number;
    stages: ChoiceStages;
  }>();
  const [viaSelection, setViaSelection] = useState<{
    day: number;
    coord: LonLat;
  }>();
  const shareDialog = canShare && (
    <ShareDialog trip={trip} open={sharing} onOpenChange={setSharing} />
  );

  const selected = Math.min(search.stage ?? 0, trip.stages.length - 1);
  // Without a stage in the URL, the panel shows the whole trip.
  const dayOpen = search.stage !== undefined;
  // A one-day trip shows the same route either way, so it can always be
  // edited.
  const editsRoute = dayOpen || trip.stages.length === 1;
  // By coordinate, so it goes away when an edit moves or removes the point.
  const viaIndex = (trip.stages[selected]?.via ?? []).findIndex(
    ({ coord }) =>
      viaSelection?.day === selected &&
      coord[0] === viaSelection.coord[0] &&
      coord[1] === viaSelection.coord[1],
  );
  const selectedVia = viaIndex < 0 ? undefined : viaIndex;
  const selectVia = (index: number | undefined) => {
    const coord =
      index === undefined
        ? undefined
        : trip.stages[selected]?.via[index]?.coord;
    setViaSelection(coord && { day: selected, coord });
  };
  const select = (stage: number) => {
    setHoverKm(undefined);
    setHoveredClimb(undefined);
    setHoveredDay(undefined);
    setProposedHighlighted(false);
    setMapTime(undefined);
    setFindingDestination(false);
    void navigate({ search: { stage }, replace: true });
  };
  const showTrip = () => {
    setHoveredClimb(undefined);
    setFindingDestination(false);
    void navigate({ search: {}, replace: true });
  };

  const stage = trip.stages[selected];
  const overview = !dayOpen;
  const chartLegs = useMemo(
    () => (overview ? trip.stages.flatMap((s) => s.legs) : (stage?.legs ?? [])),
    [overview, trip.stages, stage],
  );
  const points = useMemo(() => routePoints(chartLegs), [chartLegs]);
  const climbs = useMemo(() => findClimbs(points), [points]);
  // A climb hovered in the list, or the one under the chart crosshair.
  const crosshairClimb =
    hoverKm === undefined
      ? -1
      : climbs.findIndex((c) => hoverKm >= c.startKm && hoverKm <= c.endKm);
  const activeClimb =
    hoveredClimb ?? (crosshairClimb >= 0 ? crosshairClimb : undefined);
  const climb = activeClimb === undefined ? undefined : climbs[activeClimb];
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
      rideStart + (stage ? dayHours(stage.stats, trip.settings.avgSpeed) : 0),
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
  const tripWeatherOn = weatherOn && overview;
  const tripWeather = useTripWeather(trip, tripWeatherOn);
  const tripPoints = useMemo(
    () => (tripWeather.data ? tripWeatherPoints(tripWeather.data) : []),
    [tripWeather.data],
  );
  // On the trip level, the map shows the weather where the pointer is.
  const pointed =
    tripWeatherOn && hoverKm !== undefined
      ? tripPoints.reduce<(typeof tripPoints)[number] | undefined>(
          (best, p) =>
            !best || Math.abs(p.km - hoverKm) < Math.abs(best.km - hoverKm)
              ? p
              : best,
          undefined,
        )
      : undefined;
  const date = trip.startDate && addDays(trip.startDate, selected);
  const fieldTime =
    pointed?.time ?? (date && `${date}T${addHours("00:00", time)}`);
  const weatherField = useMemo(
    () =>
      weatherGrid && grid.data?.length === weatherGrid.cells.length && fieldTime
        ? fieldAt(weatherGrid, grid.data, fieldTime)
        : undefined,
    [weatherGrid, grid.data, fieldTime],
  );
  // Where the rider is at the marker time, inside the ride window.
  const riderKm =
    weatherOn && stage
      ? (time - rideStart) * stageSpeed(stage.stats, trip.settings.avgSpeed)
      : undefined;
  const markKm = tripWeatherOn
    ? hoverKm
    : weatherOn
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
  const options = useStopOptions(trip, selected, findingDestination);
  const mapHotels = useMapHotels(trip, selected);
  const stations = useRouteStations(trip);
  const routesOn = dayOpen && !editor.readOnly;
  const routes = useDayRoutes(trip, selected, routesOn);
  const found = (routesOn && routes.data) || NO_ROUTES;
  // The day before the last route picked, to switch back to, while the
  // next day still ends where it did.
  const nextStage = trip.stages[selected + 1];
  const before =
    replaced?.day === selected &&
    stage &&
    replaced.stages.stage.legs !== stage.legs &&
    (!replaced.stages.next ||
      (nextStage && samePlace(nextStage.end, replaced.stages.next.end)))
      ? replaced.stages
      : undefined;
  const routeList = useMemo(() => {
    if (!before || !stage) return found;
    const same = samePlace(before.stage.end, stage.end);
    const previous: DayRoute = {
      id: "previous",
      name: t("dayRoutes.previous"),
      tags: [],
      via: [],
      stages: same
        ? {
            stage: {
              ...stage,
              via: before.stage.via,
              legs: before.stage.legs,
              stats: before.stage.stats,
            },
          }
        : before,
      line: stageLine(before.stage),
      ...(!same && before.next && { nextLine: stageLine(before.next) }),
    };
    // Last, so a found route with the same km and climbing shows instead.
    return [...found.slice(0, MAX_ROUTES - 1), previous];
  }, [before, stage, found, t]);
  // Other towns show only on the last day, as train stops to end at.
  const towns = useMemo(
    () => (isLast ? options : options.filter((o) => o.current)),
    [isLast, options],
  );
  const places = useTripPlaces(trip);
  const budget = trip.settings.hotelBudget;
  const beds = useCallback(
    (place: Place) =>
      places ? bedsNear(places.hotels, place.coord, budget).total : undefined,
    [places, budget],
  );
  const choiceList = useDayChoices(towns, routeList, beds);
  const pick = (choice: DayChoice) => {
    const now = trip.stages[selected];
    if (!choice.stages || !now) return;
    setChoiceHover(undefined);
    setFindingDestination(false);
    const next = trip.stages[selected + 1];
    setReplaced(
      choice.id.startsWith("route:")
        ? {
            day: selected,
            stages: {
              stage: now,
              ...(choice.stages.next && next && { next }),
            },
          }
        : undefined,
    );
    void editor.takeChoice(selected, choice.stages);
  };
  const pickAlternative = (id: string) => {
    const choice = choiceList.find((c) => c.id === id);
    if (choice) pick(choice);
  };
  const hoverChoice = (id: string | undefined) =>
    setChoiceHover(id ? { day: selected, id } : undefined);
  const hoveredChoice =
    dayOpen &&
    choiceHover?.day === selected &&
    choiceList.some((c) => !c.current && c.id === choiceHover.id)
      ? choiceHover.id
      : undefined;
  const choices: DayChoicesState = {
    choices: choiceList,
    ...(hoveredChoice && { hovered: hoveredChoice }),
    onHover: hoverChoice,
    onPick: pick,
    loading: routesOn && routes.isFetching,
    failed: routesOn && routes.isError,
    onRetry: () => void routes.refetch(),
  };
  const mapChoices = useMemo(
    () =>
      choiceList.flatMap((c) =>
        !c.current && c.color && c.line
          ? [
              {
                id: c.id,
                color: c.color,
                line: c.line,
                ...(c.nextLine && { nextLine: c.nextLine }),
              },
            ]
          : [],
      ),
    [choiceList],
  );
  // One marker per town another choice ends in, for the first such choice.
  const alternatives = useMemo(() => {
    if (readOnly || !stage) return [];
    const out: MapAlternative[] = [];
    for (const c of choiceList) {
      const end = c.stages?.stage.end;
      if (c.current || !end || samePlace(end, stage.end)) continue;
      if (out.some((a) => samePlace(a.place, end))) continue;
      out.push({
        id: c.id,
        place: end,
        ...(c.hotels !== undefined && { beds: c.hotels }),
        ...(c.color && { color: c.color }),
        label: t("stage.alternative", {
          name: end.name,
          distance: format.distance(c.distance),
        }),
      });
    }
    return out;
  }, [readOnly, stage, choiceList, t, format]);

  // Towns with hotels around the stop, to end the day in instead.
  const townsOn =
    dayOpen &&
    !readOnly &&
    layers.towns &&
    (!isLast || hasMovableDestination(trip));
  const taken = useMemo(
    () => alternatives.map((a) => a.place.coord),
    [alternatives],
  );
  const hotelTowns = useHotelTowns(trip, selected, townsOn, taken);
  const [townHover, setTownHover, clearTownHover] = useDebouncedHover<{
    day: number;
    id: string;
  }>(TOWN_HOVER_MS);
  const hoveredTown =
    townsOn && townHover?.day === selected
      ? hotelTowns.find((town) => town.id === townHover.id)
      : undefined;
  const townRoute = useQuery({
    // The same key as the stop options, so a town routed there is reused.
    queryKey: [
      "stopRoute",
      trip.id,
      trip.updatedAt,
      selected,
      hoveredTown?.place.name,
    ],
    queryFn: () => {
      if (!hoveredTown) throw new Error("No town hovered");
      return routedStageIfEnding(trip, selected, hoveredTown.place, (points) =>
        routing.route(points, { profile: trip.settings.profile }),
      );
    },
    enabled: !!hoveredTown,
    staleTime: Infinity,
  });
  const townRouted = hoveredTown && townRoute.data;
  const townChoice: MapChoice | undefined = townRouted
    ? {
        id: `town:${hoveredTown.id}`,
        color: "route1",
        line: townRouted.line,
        ...(townRouted.nextLine && { nextLine: townRouted.nextLine }),
      }
    : undefined;
  const pickTown = (id: string) => {
    const town = hotelTowns.find((x) => x.id === id);
    if (!town || !editor.canEdit) return;
    // Phones have no hover: the first tap previews, the second picks.
    if (isPhone && hoveredTown?.id !== id) {
      setTownHover({ day: selected, id });
      return;
    }
    clearTownHover();
    void editor.moveStop(selected, town.place);
  };
  const nextDay = trip.stages[selected + 1];
  const townLine = (day: number, distance: number, ascent: number) => (
    <span className="block">
      {t("town.day", {
        day,
        delta: formatDelta(t, format, { distance, ascent }),
      })}
    </span>
  );
  const townPreview = hoveredTown && stage && (
    <PreviewLabel>
      <span className="block">
        {t("town.title", {
          name: hoveredTown.place.name,
          count: hoveredTown.hotels,
        })}
      </span>
      {townRouted ? (
        <>
          {townLine(
            selected + 1,
            townRouted.distance - stage.stats.distance,
            townRouted.ascent - stage.stats.ascent,
          )}
          {nextDay &&
            townRouted.stages.next &&
            townLine(
              selected + 2,
              townRouted.stages.next.stats.distance - nextDay.stats.distance,
              townRouted.stages.next.stats.ascent - nextDay.stats.ascent,
            )}
        </>
      ) : (
        <span className="block font-medium">
          {t(townRoute.isError ? "town.failed" : "town.routing")}
        </span>
      )}
      <span className="block font-medium">
        {t(isPhone ? "town.tap" : "town.click")}
      </span>
    </PreviewLabel>
  );
  const townLayer: TownLayer | undefined = townsOn
    ? {
        towns: hotelTowns.map((town) => ({
          id: town.id,
          place: town.place,
          hotels: town.hotels,
          label: t("town.label", {
            name: town.place.name,
            count: town.hotels,
          }),
        })),
        ...(hoveredTown && { previewed: hoveredTown.id }),
        ...(townPreview && { preview: townPreview }),
        onHover: (id) => setTownHover(id ? { day: selected, id } : undefined),
        onPick: pickTown,
      }
    : undefined;

  const selectedLegs = stage?.legs;
  const proposedLegs = isChanged(trip, selected)
    ? trip.proposed?.[selected]?.legs
    : undefined;
  const proposed = useMemo(() => {
    const section =
      selectedLegs &&
      proposedLegs &&
      proposedSection(selectedLegs, proposedLegs);
    return section ? [section.coords] : [];
  }, [selectedLegs, proposedLegs]);
  const routeEditing: RouteEditing | undefined = readOnly
    ? undefined
    : {
        enabled: editor.canEdit,
        preview: (target, at) => editor.preview(selected, target, at),
        onAddVia: (leg, at) => void editor.insertVia(selected, leg, at),
        onMoveVia: (coord, at) => void editor.moveVia(selected, coord, at),
        onRemoveVia: (coord) => void editor.removeVia(selected, coord),
        onPreviewChange: setPreviewLegs,
        onEndDayAt:
          selected < trip.stages.length - 1 || hasMovableDestination(trip)
            ? (place) => void editor.moveStop(selected, place)
            : undefined,
        onStartDayAt:
          selected > 0
            ? (place) => void editor.moveStop(selected - 1, place)
            : undefined,
        selectedVia,
        onSelectVia: selectVia,
        proposed,
        proposedHighlighted,
      };

  const toast = editor.note && (
    <Toast
      key={editor.note.id}
      open
      onOpenChange={(open) => !open && editor.clearNote()}
      duration={editor.note.sticky ? Infinity : 8000}
      message={editor.note.message}
      action={
        editor.note.action && editor.note.actionLabel
          ? { label: editor.note.actionLabel, onClick: editor.noteAction }
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
          kind: "towns",
          label: t("layers.towns"),
          checked: layers.towns,
        },
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
  const chart = tripWeatherOn ? (
    <TripWeatherPanel
      trip={trip}
      days={tripWeather.data}
      points={tripPoints}
      loading={tripWeather.isPending}
      hoverKm={hoverKm}
      onHoverKm={setHoverKm}
      actions={switcher}
      plain={isPhone}
    />
  ) : weatherOn ? (
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
      key={overview ? "trip" : stage?.id}
      trip={trip}
      index={selected}
      overview={overview}
      network={network}
      hoverKm={hoverKm}
      onHoverKm={setHoverKm}
      climbs={climbs}
      highlightedClimb={activeClimb}
      proposedHighlighted={proposedHighlighted}
      onHighlightProposed={setProposedHighlighted}
      previewLegs={previewLegs}
      actions={switcher}
      plain={isPhone}
    />
  );
  const mapLayers = {
    choices: !dayOpen
      ? NO_CHOICES
      : townChoice
        ? [...mapChoices, townChoice]
        : mapChoices,
    ...(townChoice
      ? { hoveredChoice: townChoice.id }
      : hoveredChoice && { hoveredChoice }),
    ...(townLayer && { towns: townLayer }),
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

  // The side panel on desktop, the sheet on phones.
  const panel = dayOpen ? (
    <DayPanel
      key={selected}
      trip={trip}
      index={selected}
      editor={editor}
      onSelect={select}
      onBack={showTrip}
      onHoverClimb={setHoveredClimb}
      highlightedClimb={activeClimb}
      onHighlightProposed={setProposedHighlighted}
      findingDestination={findingDestination}
      onFindingDestination={setFindingDestination}
      choices={choices}
      selectedVia={selectedVia}
      onSelectVia={selectVia}
      chart={isPhone ? chart : undefined}
    />
  ) : (
    <TripPanel
      trip={trip}
      editor={editor}
      hovered={hoveredDay}
      onHover={setHoveredDay}
      onOpenDay={select}
    />
  );

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
          overview={overview}
          onSelect={select}
          alternatives={dayOpen ? alternatives : []}
          onPickAlternative={pickAlternative}
          hover={hover}
          panel={panel}
          // A day shows the chart under its header instead.
          chart={dayOpen ? undefined : chart}
          mapLayers={mapLayers}
          route={editsRoute ? routeEditing : undefined}
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
              onPickAlternative={pickAlternative}
              onHoverAlternative={hoverChoice}
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
              route={editsRoute ? routeEditing : undefined}
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
          {panel}
        </aside>
      </div>
    </div>
  );
}
