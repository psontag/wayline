import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  AVG_SPEED_KMH,
  type GenerateRequest,
  type Place,
  plansWithWind,
  type Proposal,
  timeToHours,
  windAt,
} from "@wayline/domain";
import { Button, MessagePanel, useFormat } from "@wayline/ui";
import { useTrainTime } from "./useTrainTime";
import { Route } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedHover } from "../../components/useDebouncedHover";
import { useIsPhone } from "../../components/useIsPhone";
import { useDayWind } from "../../data/queries";
import { useFailedText } from "../../errors";
import { ProposalList } from "./ProposalList";
import { ProposalsHeader } from "./ProposalsHeader";
import { ProposalsMap } from "./ProposalsMap";
import { useGeneration } from "./useGeneration";
import { useOpenProposal } from "./useOpenProposal";

/** Waits this long before the map follows the pointer in the list. */
const HOVER_MS = 120;

export function ProposalsPage() {
  const { t } = useTranslation("proposals");
  const { request } = useSearch({ from: "/proposals" });

  if (!request) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ProposalsHeader />
        <div className="mx-auto w-full max-w-sm">
          <MessagePanel
            icon={<Route aria-hidden />}
            title={t("title")}
            text={t("noRequest")}
            actions={
              <Button asChild variant="primary">
                <Link to="/new">{t("newTrip")}</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }
  return <Proposals request={request} />;
}

function Proposals({ request }: { request: GenerateRequest }) {
  const { t } = useTranslation("proposals");
  const { selected, also, area } = useSearch({ from: "/proposals" });
  const navigate = useNavigate({ from: "/proposals" });
  const format = useFormat();
  const trainTime = useTrainTime(request.startDate);
  const requests = [request, ...(also ?? [])];
  // Ids are "<request index>-<id>" with several requests.
  const startOf =
    also &&
    ((p: Proposal) => {
      const place = requests[Number(p.id.split("-")[0])]?.startStation;
      if (!place) return undefined;
      const minutes = trainTime(place);
      return minutes === undefined
        ? t("card.from", { place: place.name })
        : t("card.fromTrain", {
            place: place.name,
            time: format.duration(minutes / 60),
          });
    });
  const home = request.startStation?.coord;
  const windOn = plansWithWind(request) && !!home;
  const dayWind = useDayWind(windOn ? home : undefined, request.startDate);
  // Null makes the generation wait for the forecast.
  const wind = windOn ? (dayWind.isPending ? null : dayWind.data) : undefined;
  const generation = useGeneration(request, wind, also);
  // Wind in the middle of the ride, shown at the start.
  const middle =
    wind?.length &&
    windAt(
      wind,
      timeToHours(request.startTime) + request.kmPerDay / AVG_SPEED_KMH / 2,
    );
  const open = useOpenProposal();
  const failedText = useFailedText();
  const [hovered, setHovered, clearHovered] =
    useDebouncedHover<string>(HOVER_MS);
  const [hoveredDay, setHoveredDay] = useState<number>();
  const isPhone = useIsPhone();
  const { proposals } = generation;

  // New cards move the list under a still pointer, and no pointer event says
  // so. The hover would stay on a card that is no longer there.
  const order = proposals.map((p) => p.id).join();
  const [shownOrder, setShownOrder] = useState(order);
  if (order !== shownOrder) {
    setShownOrder(order);
    clearHovered();
    setHoveredDay(undefined);
  }

  // The map zooms only to a proposal the user picked, not to the first one
  // selected on load.
  const [focused, setFocused] = useState<string>();
  // The request the user picked a proposal for.
  const asked = JSON.stringify(request);
  const [pickedFor, setPickedFor] = useState<string>();
  const picked = pickedFor === asked;
  const select = (id: string) => {
    setFocused(id);
    setPickedFor(asked);
    void navigate({
      search: (s) => ({ ...s, selected: id }),
      replace: true,
    });
  };

  useEffect(() => {
    if (!focused) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        setFocused(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  // Select the first proposal as soon as it is there. While the search runs,
  // a better one may come first: it takes the selection until the user picks.
  const first = proposals[0]?.id;
  const known = proposals.some((p) => p.id === selected);
  const follow = generation.status === "running" && !picked;
  useEffect(() => {
    if (first && (!known || (follow && first !== selected))) {
      void navigate({
        search: (s) => ({ ...s, selected: first }),
        replace: true,
      });
    }
  }, [first, known, follow, selected, navigate]);

  const places: Place[] = [
    request.startStation,
    request.kind === "one-way" ? request.endStation : undefined,
  ].filter((p): p is Place => !!p);

  const onOpen = (proposal: Proposal) =>
    open.mutate(proposal, {
      onSuccess: (tripId) =>
        void navigate({ to: "/trips/$tripId", params: { tripId } }),
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProposalsHeader request={request} also={also} area={area} />
      {/* Phones: the map stays on top while the list scrolls below it. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-2/5 shrink-0 lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1">
          <ProposalsMap
            proposals={proposals}
            places={places}
            highlighted={hovered ?? selected}
            highlightedDay={hoveredDay}
            focused={focused === selected ? focused : undefined}
            onSelect={select}
            compact={isPhone}
            {...(middle && home && { wind: { ...middle, at: home } })}
          />
        </div>
        <aside className="flex min-h-0 flex-1 flex-col border-t border-border bg-surface lg:w-panel lg:flex-none lg:border-t-0 lg:border-l">
          <ProposalList
            request={request}
            generation={generation}
            selected={selected}
            picked={picked}
            onSelect={select}
            onHover={setHovered}
            onHoverDay={setHoveredDay}
            onOpen={onOpen}
            opening={open.isPending ? open.variables.id : undefined}
            openError={
              open.isError
                ? failedText(t("card.openFailed"), open.error)
                : undefined
            }
            onRelax={(next) => void navigate({ search: { request: next } })}
            {...(startOf && { startOf })}
            {...(also && { also })}
          />
        </aside>
      </div>
    </div>
  );
}
