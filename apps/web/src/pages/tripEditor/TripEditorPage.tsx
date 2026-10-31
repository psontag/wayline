import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import {
  decodeLine,
  findClimbs,
  pointAtKm,
  routePoints,
  type Trip,
} from "@wayline/domain";
import {
  Button,
  Toast,
  ToastProvider,
  ToastViewport,
  useFormat,
} from "@wayline/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { networkArea } from "../../components/NetworkLayer";
import { useMe, useNetwork, useTrip } from "../../data/queries";
import { StageList } from "./StageList";
import { StageProfile } from "./StageProfile";
import { useRouteStations } from "./stations";
import { useMapHotels, useStopOptions } from "./stopChoices";
import { ShareDialog } from "./ShareDialog";
import { TripHeader } from "./TripHeader";
import { isChanged } from "./routeEdits";
import { type RouteEditing, TripMap } from "./TripMap";
import { tripStops } from "./tripArea";
import { TripSummary } from "./TripSummary";
import { PhoneTripEditor } from "./PhoneTripEditor";
import { useIsPhone } from "../../components/useIsPhone";
import { useTripEditor } from "./useTripEditor";

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
  const shareDialog = canShare && (
    <ShareDialog trip={trip} open={sharing} onOpenChange={setSharing} />
  );

  const selected = Math.min(search.stage ?? 0, trip.stages.length - 1);
  const select = (stage: number) => {
    setHoverKm(undefined);
    setHoveredClimb(undefined);
    void navigate({ search: { stage }, replace: true });
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
  const hover =
    hoverKm !== undefined && points.length
      ? pointAtKm(points, hoverKm).coord
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
          network={network}
          alternatives={alternatives}
          onPickAlternative={(place) => void editor.moveStop(selected, place)}
          hoverKm={hoverKm}
          onHoverKm={setHoverKm}
          hover={hover}
          route={routeEditing(true)}
          toast={<ToastViewport placement="inline" />}
        />
      </ToastProvider>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {shareDialog}
      <TripHeader
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
              onSelect={select}
              hovered={hoveredDay}
              highlight={highlight}
              alternatives={alternatives}
              onPickAlternative={(place) =>
                void editor.moveStop(selected, place)
              }
              hotels={isLast ? [] : mapHotels.hotels}
              stations={stations}
              selectedHotelId={stage?.hotel?.osmId}
              onSelectHotel={(osmId) => {
                const h = mapHotels.hotels.find((x) => x.osmId === osmId);
                if (!h) return;
                const { name, coord, stars, website } = h;
                editor.setHotel(selected, {
                  osmId,
                  name,
                  coord,
                  ...(stars === undefined ? {} : { stars }),
                  ...(website === undefined ? {} : { website }),
                });
              }}
              hover={hover}
              route={routeEditing(false)}
            >
              <ToastProvider>
                {toast}
                <div className="absolute inset-x-4 bottom-8 z-toast flex justify-center">
                  <ToastViewport placement="inline" />
                </div>
              </ToastProvider>
            </TripMap>
          </div>
          <StageProfile
            key={stage?.id}
            trip={trip}
            index={selected}
            network={network}
            hoverKm={hoverKm}
            onHoverKm={setHoverKm}
            climbs={climbs}
            highlightedClimb={hoveredClimb}
          />
        </div>
        <aside className="flex shrink-0 flex-col border-border bg-surface lg:w-panel lg:border-l">
          <TripSummary trip={trip} editor={editor} />
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-auto">
            <StageList
              trip={trip}
              selected={selected}
              onSelect={select}
              onHover={setHoveredDay}
              onHoverClimb={setHoveredClimb}
              editor={editor}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
