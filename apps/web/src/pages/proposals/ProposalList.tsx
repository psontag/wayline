import { Link } from "@tanstack/react-router";
import { type GenerateRequest, type Proposal } from "@wayline/domain";
import {
  Button,
  ElevationProfile,
  MessagePanel,
  ProgressBar,
  ProposalCard,
  ProposalCardSkeleton,
  useFormat,
} from "@wayline/ui";
import { ArrowRight, Mountain, RotateCcw, SearchX } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { networkArea } from "../../components/NetworkLayer";
import { useNetwork, useTripWeather } from "../../data/queries";
import { tripStops } from "../tripEditor/tripArea";
import { profilePoints } from "../tripEditor/surfaceProfile";
import { flavourOf, routeColorKey } from "./routeColor";
import {
  type ComparisonTag,
  comparisonTags,
  dayBreaks,
  progressValue,
  proposalStats,
  relaxOptions,
  type Relaxed,
  windTag,
} from "./proposalView";
import type { Generation } from "./useGeneration";

export type ProposalListProps = {
  request: GenerateRequest;
  generation: Generation & { cancel: () => void; retry: () => void };
  selected?: string;
  onSelect: (id: string) => void;
  onHover: (id: string | undefined) => void;
  onOpen: (proposal: Proposal) => void;
  /** Id of the proposal being saved. */
  opening?: string;
  openFailed: boolean;
  onRelax: (request: GenerateRequest) => void;
};

/** Side panel: progress or result line, then the proposal cards. */
export function ProposalList({
  request,
  generation,
  selected,
  onSelect,
  onHover,
  onOpen,
  opening,
  openFailed,
  onRelax,
}: ProposalListProps) {
  const { status, proposals } = generation;
  const tags = useMemo(() => comparisonTags(proposals), [proposals]);

  if (status === "failed" && generation.failedLimit) {
    return (
      <NoResult
        request={request}
        onRelax={onRelax}
        limit={generation.failedLimit}
      />
    );
  }
  if (status === "error") return <Failure retry={generation.retry} />;
  if (status === "cancelled" && proposals.length === 0) {
    return <Cancelled request={request} retry={generation.retry} />;
  }

  return (
    <>
      {status === "running" ? (
        <Progress generation={generation} />
      ) : (
        <ResultLine
          count={proposals.length}
          cancelled={status === "cancelled"}
          retry={generation.retry}
        />
      )}
      <div className="flex flex-col gap-2 p-3 lg:min-h-0 lg:flex-1 lg:overflow-auto">
        {proposals.map((p, i) => (
          <ProposalItem
            key={p.id}
            proposal={p}
            number={i + 1}
            tags={tags.get(p.id) ?? []}
            selected={p.id === selected}
            onSelect={() => onSelect(p.id)}
            onHover={(hover) => onHover(hover ? p.id : undefined)}
            onOpen={() => onOpen(p)}
            opening={opening === p.id}
            openFailed={openFailed && p.id === selected}
          />
        ))}
        {status === "running" && <ProposalCardSkeleton />}
      </div>
    </>
  );
}

function Progress({
  generation,
}: {
  generation: Generation & { cancel: () => void };
}) {
  const { t } = useTranslation("proposals");
  const { progress, loaded, searched } = generation;
  const phase = progress?.phase ?? "loading";
  const title =
    phase === "routing" && progress
      ? t("progress.routing", {
          current: Math.min(progress.done + 1, progress.total),
          total: progress.total,
        })
      : t(`progress.${phase}`);
  const steps = [
    loaded && t("progress.loaded"),
    searched > 0 && t("progress.searched", { count: searched }),
    (phase === "cutting" || phase === "routing") && t("progress.cut"),
  ].filter(Boolean);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 border-b border-border px-4 py-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">{title}</span>
        <Button variant="ghost" size="sm" onClick={generation.cancel}>
          {t("progress.cancel")}
        </Button>
      </div>
      <ProgressBar
        value={progressValue(progress)}
        aria-label={t("progress.label")}
      />
      <span className="min-h-5 text-xs text-text-muted">
        {steps.join(" · ")}
      </span>
    </div>
  );
}

function ResultLine({
  count,
  cancelled,
  retry,
}: {
  count: number;
  cancelled: boolean;
  retry: () => void;
}) {
  const { t } = useTranslation("proposals");
  return (
    <div
      role="status"
      className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-2"
    >
      <span className="font-bold">
        {cancelled
          ? t("cancelled.count", { count })
          : t("done.count", { count })}
      </span>
      {cancelled ? (
        <Button variant="ghost" size="sm" onClick={retry}>
          <RotateCcw aria-hidden />
          {t("cancelled.again")}
        </Button>
      ) : (
        <span className="hidden text-right text-xs text-text-muted sm:inline">
          {t("done.hint")}
        </span>
      )}
    </div>
  );
}

function ProposalItem({
  proposal,
  number,
  tags,
  selected,
  onSelect,
  onHover,
  onOpen,
  opening,
  openFailed,
}: {
  proposal: Proposal;
  number: number;
  tags: ComparisonTag[];
  selected: boolean;
  onSelect: () => void;
  onHover: (hover: boolean) => void;
  onOpen: () => void;
  opening: boolean;
  openFailed: boolean;
}) {
  const { t } = useTranslation("proposals");
  const format = useFormat();
  const { trip, routeNames } = proposal;
  const stats = proposalStats(trip);
  const via = proposal.via.length
    ? proposal.via
    : trip.stages.slice(0, -1).map((s) => s.end.name);
  const weather = useTripWeather(trip, selected && trip.kind === "one-way");
  const wind =
    weather.data &&
    windTag(
      weather.data.map((d, i) => ({
        wind: d.wind,
        distance: trip.stages[i]?.stats.distance ?? 0,
      })),
    );
  const flavour = flavourOf(proposal);
  const name = flavour
    ? t(`flavour.${flavour}`)
    : proposal.character
      ? t(`card.character.${proposal.character}`)
      : t("card.option", { number });

  return (
    <ProposalCard
      number={number}
      color={routeColorKey(proposal, number - 1)}
      title={name}
      subtitle={via.length ? t("card.via", { stops: format.list(via) }) : ""}
      tags={[
        ...tags.map((tag) => t(`card.tag.${tag}`)),
        ...(wind?.kind === "tail" ? [t("card.tag.tailwind")] : []),
        ...(wind?.kind === "head"
          ? [t("card.tag.headwind", { day: wind.day })]
          : []),
      ]}
      stats={[
        { value: format.distance(stats.distance), label: t("card.distance") },
        { value: format.elevation(stats.ascent), label: t("card.ascent") },
        { value: format.percent(stats.paved), label: t("card.paved") },
      ]}
      chart={selected && <Profile proposal={proposal} />}
      days={trip.stages.map((stage, i) => {
        const share = trip.settings.dayShares?.[i] ?? 1;
        return {
          label: String(i + 1),
          place: stage.end.name,
          distance: format.distance(stage.stats.distance),
          ...(share < 1
            ? { tag: t(share <= 0.5 ? "card.halfDay" : "card.shortDay") }
            : {}),
        };
      })}
      footer={
        routeNames.length
          ? t("card.routes", { routes: routeNames.slice(0, 2).join(" · ") })
          : t("card.noRoutes")
      }
      selected={selected}
      onSelect={onSelect}
      onHover={onHover}
    >
      {openFailed && (
        <span role="alert" className="text-sm text-danger">
          {t("card.openFailed")}
        </span>
      )}
      <Button variant="primary" onClick={onOpen} disabled={opening}>
        {opening ? t("card.opening") : t("card.open")}
        <ArrowRight aria-hidden />
      </Button>
    </ProposalCard>
  );
}

/** Elevation of the whole trip, with a line where each day starts. */
function Profile({ proposal }: { proposal: Proposal }) {
  const { t } = useTranslation("proposals");
  const format = useFormat();
  const { trip } = proposal;
  const network = useNetwork(networkArea(tripStops(trip)));
  const legs = useMemo(() => trip.stages.flatMap((s) => s.legs), [trip]);
  const points = useMemo(() => profilePoints(legs, network), [legs, network]);
  const highest = Math.max(0, ...points.map((p) => p.ele));
  return (
    <ElevationProfile
      axes
      points={points}
      dayBreaks={dayBreaks(trip)}
      aria-label={t("card.chart", {
        distance: format.distance((points.at(-1)?.km ?? 0) * 1000),
        elevation: format.elevation(highest),
      })}
    />
  );
}

function NoResult({
  request,
  limit,
  onRelax,
}: {
  request: GenerateRequest;
  limit: NonNullable<Generation["failedLimit"]>;
  onRelax: (request: GenerateRequest) => void;
}) {
  const { t } = useTranslation("proposals");
  const format = useFormat();
  const options = relaxOptions(request, limit);
  const label = (o: Relaxed) => {
    switch (o.change) {
      case "maxAscentPerDay":
        return t("failed.relax.maxAscentPerDay", {
          ascent: format.elevation(o.value),
        });
      case "kmPerDay":
        return t("failed.relax.kmPerDay", {
          distance: format.distance(o.value * 1000),
        });
      case "days":
        return t("failed.relax.days", { count: o.value });
      case "anyBudget":
        return t("failed.relax.anyBudget");
    }
  };

  return (
    <MessagePanel
      icon={
        limit === "maxAscentPerDay" ? (
          <Mountain aria-hidden />
        ) : (
          <SearchX aria-hidden />
        )
      }
      title={t("failed.title")}
      text={t(`failed.text.${limit}`, {
        ascent: format.elevation(request.maxAscentPerDay),
        start: request.startStation?.name ?? "",
        days: t("request.days", { count: request.days }),
        distance: format.distance(request.kmPerDay * 1000),
      })}
      actions={
        <>
          {options.map((o, i) => (
            <Button
              key={o.change}
              variant={i === 0 ? "primary" : "secondary"}
              onClick={() => onRelax(o.request)}
            >
              {label(o)}
            </Button>
          ))}
          <ChangeInputs request={request} />
        </>
      }
    />
  );
}

function Cancelled({
  request,
  retry,
}: {
  request: GenerateRequest;
  retry: () => void;
}) {
  const { t } = useTranslation("proposals");
  return (
    <MessagePanel
      icon={<SearchX aria-hidden />}
      title={t("cancelled.title")}
      text={t("cancelled.text")}
      actions={
        <>
          <Button variant="primary" onClick={retry}>
            {t("cancelled.again")}
          </Button>
          <ChangeInputs request={request} />
        </>
      }
    />
  );
}

function Failure({ retry }: { retry: () => void }) {
  const { t } = useTranslation("proposals");
  return (
    <MessagePanel
      icon={<SearchX aria-hidden />}
      title={t("error.title")}
      text={t("error.text")}
      actions={
        <Button variant="primary" onClick={retry}>
          {t("error.retry")}
        </Button>
      }
    />
  );
}

function ChangeInputs({ request }: { request: GenerateRequest }) {
  const { t } = useTranslation("proposals");
  return (
    <Button asChild variant="ghost">
      <Link to="/new" search={{ request }}>
        {t("failed.change")}
      </Link>
    </Button>
  );
}
