import { useQuery } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { pointAtKm, routePoints, type Trip } from "@wayline/domain";
import {
  Button,
  Toast,
  ToastProvider,
  ToastViewport,
  useFormat,
} from "@wayline/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTrip } from "../../data/queries";
import { useServices } from "../../data/ServicesProvider";
import { StageList } from "./StageList";
import { StageProfile } from "./StageProfile";
import { useStopOptions } from "./StopPicker";
import { TripHeader } from "./TripHeader";
import { TripMap } from "./TripMap";
import { TripSummary } from "./TripSummary";
import { useTripEditor } from "./useTripEditor";

export function TripEditorPage() {
  const { t } = useTranslation("tripEditor");
  const { tripId } = useParams({ from: "/trips/$tripId" });
  const trip = useTrip(tripId);

  if (trip.data) return <TripEditor trip={trip.data} />;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-text-muted">
      {trip.isError ? (
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

/** The route network, for surface colors in the elevation profile. */
function useNetwork() {
  const { network } = useServices();
  return useQuery({
    queryKey: ["network"],
    queryFn: () => network.network(),
    staleTime: Infinity,
  }).data;
}

function TripEditor({ trip }: { trip: Trip }) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const search = useSearch({ from: "/trips/$tripId" });
  const navigate = useNavigate({ from: "/trips/$tripId" });
  const editor = useTripEditor(trip);
  const network = useNetwork();
  const [hoverKm, setHoverKm] = useState<number>();

  const selected = Math.min(search.stage ?? 0, trip.stages.length - 1);
  const select = (stage: number) => {
    setHoverKm(undefined);
    void navigate({ search: { stage }, replace: true });
  };

  const stage = trip.stages[selected];
  const points = useMemo(() => routePoints(stage?.legs ?? []), [stage]);
  const hover =
    hoverKm !== undefined && points.length
      ? pointAtKm(points, hoverKm).coord
      : undefined;

  const isLast = selected === trip.stages.length - 1;
  const options = useStopOptions(trip, selected);
  const alternatives = isLast
    ? []
    : options
        .filter((o) => !o.current)
        .map(({ place, distance }) => ({
          place,
          label: t("stage.alternative", {
            name: place.name,
            distance: format.distance(distance),
          }),
        }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TripHeader trip={trip} editor={editor} />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-w-0 flex-col lg:flex-1">
          <div className="relative aspect-square shrink-0 lg:aspect-auto lg:min-h-0 lg:flex-1">
            <TripMap
              trip={trip}
              selected={selected}
              onSelect={select}
              alternatives={alternatives}
              onPickAlternative={(place) =>
                void editor.moveStop(selected, place)
              }
              hover={hover}
            >
              <ToastProvider>
                {editor.note && (
                  <Toast
                    key={editor.note.id}
                    open
                    onOpenChange={(open) => !open && editor.clearNote()}
                    duration={8000}
                    message={editor.note.message}
                    action={{ label: t("note.undo"), onClick: editor.undo }}
                  />
                )}
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
          />
        </div>
        <aside className="flex shrink-0 flex-col border-border bg-surface lg:w-panel lg:border-l">
          <TripSummary trip={trip} />
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-auto">
            <StageList
              trip={trip}
              selected={selected}
              onSelect={select}
              editor={editor}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
