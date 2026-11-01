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
import { Button, MessagePanel } from "@wayline/ui";
import { Route } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsPhone } from "../../components/useIsPhone";
import { useDayWind } from "../../data/queries";
import { ProposalList } from "./ProposalList";
import { ProposalsHeader } from "./ProposalsHeader";
import { ProposalsMap } from "./ProposalsMap";
import { useGeneration } from "./useGeneration";
import { useOpenProposal } from "./useOpenProposal";

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
  const { selected } = useSearch({ from: "/proposals" });
  const navigate = useNavigate({ from: "/proposals" });
  const home = request.startStation?.coord;
  const windOn = plansWithWind(request) && !!home;
  const dayWind = useDayWind(windOn ? home : undefined, request.startDate);
  // Null makes the generation wait for the forecast.
  const wind = windOn ? (dayWind.isPending ? null : dayWind.data) : undefined;
  const generation = useGeneration(request, wind);
  // Wind in the middle of the ride, shown at the start.
  const middle =
    wind?.length &&
    windAt(
      wind,
      timeToHours(request.startTime) + request.kmPerDay / AVG_SPEED_KMH / 2,
    );
  const open = useOpenProposal();
  const [hovered, setHovered] = useState<string>();
  const [hoveredDay, setHoveredDay] = useState<number>();
  const isPhone = useIsPhone();
  const { proposals } = generation;

  const select = (id: string) =>
    void navigate({
      search: (s) => ({ ...s, selected: id }),
      replace: true,
    });

  // Select the first proposal as soon as it is there.
  const first = proposals[0]?.id;
  const known = proposals.some((p) => p.id === selected);
  useEffect(() => {
    if (first && !known) {
      void navigate({
        search: (s) => ({ ...s, selected: first }),
        replace: true,
      });
    }
  }, [first, known, navigate]);

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
      <ProposalsHeader request={request} />
      {/* Phones: the map stays on top while the list scrolls below it. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-2/5 shrink-0 lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1">
          <ProposalsMap
            proposals={proposals}
            places={places}
            highlighted={hovered ?? selected}
            highlightedDay={hoveredDay}
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
            onSelect={select}
            onHover={setHovered}
            onHoverDay={setHoveredDay}
            onOpen={onOpen}
            opening={open.isPending ? open.variables.id : undefined}
            openFailed={open.isError}
            onRelax={(next) => void navigate({ search: { request: next } })}
          />
        </aside>
      </div>
    </div>
  );
}
