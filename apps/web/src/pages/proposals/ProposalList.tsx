import { Link } from "@tanstack/react-router";
import {
  type GenerateRequest,
  headwindShare,
  type Proposal,
  ridingHours,
  type RouteTag,
  type StageWeather,
  type WindDay,
} from "@wayline/domain";
import {
  Button,
  ElevationProfile,
  InlineError,
  MessagePanel,
  PanelHeader,
  PanelSection,
  ProgressBar,
  ProposalCard,
  ProposalCardSkeleton,
  Suggestion,
  useFormat,
} from "@wayline/ui";
import { ArrowRight, Mountain, RotateCcw, SearchX } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { networkArea } from "../../components/NetworkLayer";
import { useNetwork, useTripsWeather } from "../../data/queries";
import { tripStops } from "../tripEditor/tripArea";
import { bedsNear, useTripPlaces } from "../tripEditor/stopChoices";
import { profilePoints } from "../tripEditor/surfaceProfile";
import { routeColorAt } from "./routeColor";
import {
  type ComparisonTag,
  comparisonTags,
  dayBreaks,
  progressValue,
  proposalStats,
  type RainTag,
  rainTag,
  relaxOptions,
  shortRequest,
  shownRouteTags,
  titleRoutes,
  titleTowns,
  tripRidingHours,
  type Relaxed,
  windTag,
  withDays,
} from "./proposalView";
import { useRequestSummary } from "./ProposalsHeader";
import type { Generation } from "./useGeneration";

export type ProposalListProps = {
  request: GenerateRequest;
  generation: Generation & { cancel: () => void; retry: () => void };
  selected?: string;
  /** The user picked the selected card: it stays in place as others come in. */
  picked?: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | undefined) => void;
  onHoverDay: (day: number | undefined) => void;
  onOpen: (proposal: Proposal) => void;
  /** Id of the proposal being saved. */
  opening?: string;
  /** Why saving the selected proposal failed. */
  openError?: string;
  onRelax: (request: GenerateRequest) => void;
  /** With several starts: where a proposal starts, and the train there. */
  startOf?: (proposal: Proposal) => string | undefined;
  /** More requests, run after request. */
  also?: GenerateRequest[];
};

/** Side panel: progress or result line, then the proposal cards. */
export function ProposalList({
  request,
  generation,
  selected,
  picked = false,
  onSelect,
  onHover,
  onHoverDay,
  onOpen,
  opening,
  openError,
  onRelax,
  startOf,
  also,
}: ProposalListProps) {
  const { t } = useTranslation("proposals");
  const { places, dates } = useRequestSummary(request, also);
  const { status, proposals } = generation;
  const weather = useTripsWeather(proposals.map((p) => p.trip));
  const windDays = proposals.map((p, i) => {
    const days = weather[i];
    return days ? toWindDays(days, p) : undefined;
  });
  const headwind = new Map(
    proposals.flatMap((p, i) => {
      const days = windDays[i];
      return days ? [[p.id, headwindShare(days)] as const] : [];
    }),
  );
  const tags = comparisonTags(proposals, headwind);
  const routeTags = shownRouteTags(proposals);
  const towns = titleTowns(proposals);
  const titled = titleRoutes(proposals);
  const rain = proposals.map((_, i) => rainTag(weather[i] ?? undefined));
  // Dry on every route says nothing about the route.
  const allDry = rain.every((r) => r?.kind === "dry");
  const [kept, setKept] = useState(false);
  const shortTrip = kept ? undefined : shortRequest(request);

  const list = useKeepSelectedInPlace(
    proposals.map((p) => p.id).join(),
    picked ? selected : undefined,
  );

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
    <div ref={list} className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PanelHeader eyebrow={dates} title={places ?? t("title")} />
      <PanelSection
        icon="days"
        title={t("title")}
        summary={
          proposals.length === 0
            ? undefined
            : status === "cancelled"
              ? t("cancelled.count", { count: proposals.length })
              : t("done.count", { count: proposals.length })
        }
        notice={
          status === "running" || status === "cancelled" || shortTrip ? (
            <div className="flex flex-col gap-3">
              {status === "running" ? (
                <Progress generation={generation} />
              ) : status === "cancelled" ? (
                <CancelledNotice retry={generation.retry} />
              ) : null}
              {shortTrip && (
                <ShortTripNotice
                  request={request}
                  short={shortTrip}
                  onRelax={onRelax}
                  onKeep={() => setKept(true)}
                />
              )}
            </div>
          ) : undefined
        }
      >
        {proposals.map((p, i) => (
          <ProposalItem
            key={p.id}
            proposal={p}
            number={i + 1}
            windDays={windDays[i]}
            toEnd={request.kind === "one-way" && !request.endStation}
            town={towns.get(p.id)}
            route={titled.get(p.id)}
            tags={tags.get(p.id) ?? []}
            routeTags={routeTags.get(p.id) ?? []}
            rain={allDry ? undefined : rain[i]}
            selected={p.id === selected}
            onSelect={() => onSelect(p.id)}
            onHover={(hover) => onHover(hover ? p.id : undefined)}
            onHoverDay={onHoverDay}
            onOpen={() => onOpen(p)}
            opening={opening === p.id}
            openError={p.id === selected ? openError : undefined}
            start={startOf?.(p)}
          />
        ))}
        {status === "running" && <ProposalCardSkeleton />}
      </PanelSection>
    </div>
  );
}

/**
 * Proposals that come in above the card the user picked push it down. This
 * scrolls the list by as much, so the card stays where the user saw it.
 * Without a pick, the selection follows the top card and nothing scrolls.
 */
function useKeepSelectedInPlace(order: string, selected?: string) {
  const list = useRef<HTMLDivElement>(null);
  const last = useRef<{ selected?: string; top: number }>(undefined);
  useLayoutEffect(() => {
    const el = list.current;
    const card = el?.querySelector('[aria-pressed="true"]')?.closest("article");
    if (!el || !card || !selected) {
      last.current = undefined;
      return;
    }
    // Place in the list content, so the user's own scrolling doesn't count.
    const top = () =>
      card.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop;
    const prev = last.current;
    if (prev && prev.selected === selected) el.scrollTop += top() - prev.top;
    last.current = { selected, top: top() };
  }, [order, selected]);
  return list;
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
    generation.run &&
      generation.run.count > 1 &&
      t("progress.start", {
        current: generation.run.index + 1,
        total: generation.run.count,
      }),
    loaded && t("progress.loaded"),
    searched > 0 && t("progress.searched", { count: searched }),
    (phase === "cutting" || phase === "routing") && t("progress.cut"),
  ].filter(Boolean);

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
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

/** A to B is much shorter than planned: offer fewer days. */
function ShortTripNotice({
  request,
  short,
  onRelax,
  onKeep,
}: {
  request: GenerateRequest;
  short: NonNullable<ReturnType<typeof shortRequest>>;
  onRelax: (request: GenerateRequest) => void;
  onKeep: () => void;
}) {
  const { t } = useTranslation("proposals");
  const format = useFormat();
  return (
    <Suggestion
      text={t("short.text", {
        from: request.startStation?.name ?? "",
        to: request.endStation?.name ?? "",
        distance: format.distance(short.km * 1000),
        total: format.distance(short.plannedKm * 1000),
      })}
    >
      <Button size="sm" onClick={() => onRelax(withDays(request, short.days))}>
        {t("short.fewer", { count: short.days })}
      </Button>
      <Button size="sm" variant="ghost" onClick={onKeep}>
        {t("short.keep", { count: request.days })}
      </Button>
    </Suggestion>
  );
}

function CancelledNotice({ retry }: { retry: () => void }) {
  const { t } = useTranslation("proposals");
  return (
    <div role="status" className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-muted">{t("cancelled.title")}</span>
      <Button variant="ghost" size="sm" onClick={retry}>
        <RotateCcw aria-hidden />
        {t("cancelled.again")}
      </Button>
    </div>
  );
}

function toWindDays(days: StageWeather[], proposal: Proposal): WindDay[] {
  return days.map((d, i) => ({
    wind: d.wind,
    distance: proposal.trip.stages[i]?.stats.distance ?? 0,
  }));
}

/** A stop with this many places to sleep or fewer is flagged. */
const WEAK_STOP_BEDS = 2;

function ProposalItem({
  proposal,
  number,
  windDays,
  toEnd,
  town,
  route,
  tags,
  routeTags,
  rain,
  selected,
  onSelect,
  onHover,
  onHoverDay,
  onOpen,
  opening,
  openError,
  start,
}: {
  proposal: Proposal;
  number: number;
  /** Where it starts, e.g. "From Neustadt · 1 h 05 by train". */
  start: string | undefined;
  /** Undefined while loading or without a forecast. */
  windDays: WindDay[] | undefined;
  /** The trip has no chosen end: named after where it goes. */
  toEnd: boolean;
  /** Town to name the proposal after. */
  town: string | undefined;
  /** Signed route to name the proposal after. Goes before the town. */
  route: string | undefined;
  tags: ComparisonTag[];
  routeTags: RouteTag[];
  rain: RainTag | undefined;
  selected: boolean;
  onSelect: () => void;
  onHover: (hover: boolean) => void;
  onHoverDay: (day: number | undefined) => void;
  onOpen: () => void;
  opening: boolean;
  openError: string | undefined;
}) {
  const { t } = useTranslation("proposals");
  const format = useFormat();
  const { trip, routeNames } = proposal;
  const stats = proposalStats(trip);
  const via = proposal.via.length
    ? proposal.via
    : trip.stages.slice(0, -1).map((s) => s.end.name);
  const wind = windDays && windTag(windDays);
  const places = useTripPlaces(trip);
  // All beds, not only in budget: budgets guess from OSM stars.
  const beds = useMemo(
    () =>
      places
        ? trip.stages
            .slice(0, -1)
            .map((stage) => bedsNear(places.hotels, stage.end.coord).total)
        : [],
    [places, trip],
  );
  const firstWeak = beds.findIndex((count) => count <= WEAK_STOP_BEDS);
  const first = trip.stages[0];
  const last = trip.stages.at(-1);
  const name =
    proposal.homeward && first
      ? t("card.homeward", { place: first.start.name })
      : proposal.character === "direct"
        ? t("card.character.direct")
        : route
          ? toEnd && last
            ? t("card.routeTo", { route, place: last.end.name })
            : route
          : toEnd && last
            ? t("card.destination", { place: last.end.name })
            : proposal.character
              ? t(`card.character.${proposal.character}`)
              : town
                ? t("card.via", { stops: town })
                : t("card.option", { number });
  // One day: the wind speed says more than the day number.
  const speed =
    trip.stages.length === 1 && windDays?.[0]
      ? format.speed(windDays[0].wind.avgSpeed)
      : undefined;
  const isOffInput = (tag: RouteTag) =>
    tag === "longer" || tag === "shorter" || tag === "moreClimbing";
  const tagOf = (
    key: RouteTag | ComparisonTag | "rain" | "dry" | "tailwind",
  ) => ({
    label: t(`card.tag.${key}`),
    hint: t(`card.tagHint.${key}`),
  });
  // Most useful first: a closed card shows only the first few.
  const cardTags = [
    ...(firstWeak >= 0
      ? [
          {
            label: t("card.tag.fewBeds", { day: firstWeak + 1 }),
            hint: t("card.tagHint.fewBeds", { day: firstWeak + 1 }),
          },
        ]
      : []),
    ...(proposal.followedRoute && !route
      ? [
          {
            label: proposal.followedRoute,
            hint: t("card.tagHint.followedRoute"),
          },
        ]
      : []),
    ...routeTags.filter(isOffInput).map(tagOf),
    ...(rain?.kind === "rain"
      ? [
          rain.day
            ? {
                label: t("card.tag.rainDay", { day: rain.day }),
                hint: t("card.tagHint.rainDay", { day: rain.day }),
              }
            : tagOf("rain"),
        ]
      : []),
    ...(rain?.kind === "dry" ? [tagOf("dry")] : []),
    ...(wind?.kind === "tail"
      ? [
          speed
            ? {
                label: t("card.tag.tailwindSpeed", { speed }),
                hint: t("card.tagHint.tailwindSpeed", { speed }),
              }
            : tagOf("tailwind"),
        ]
      : []),
    ...(wind?.kind === "head"
      ? [
          speed
            ? {
                label: t("card.tag.headwindSpeed", { speed }),
                hint: t("card.tagHint.headwindSpeed", { speed }),
              }
            : {
                label: t("card.tag.headwind", { day: wind.day }),
                hint: t("card.tagHint.headwind", { day: wind.day }),
              },
        ]
      : []),
    ...tags.map(tagOf),
    ...routeTags.filter((tag) => !isOffInput(tag)).map(tagOf),
    ...routeNames
      .slice(0, 2)
      .filter((r) => r !== route && r !== proposal.followedRoute)
      .map((r) => ({ label: r, hint: t("card.tagHint.mainRoute") })),
  ];

  return (
    <ProposalCard
      number={number}
      color={routeColorAt(number - 1)}
      title={name}
      subtitle={[
        start,
        via.length
          ? t(proposal.homeward ? "card.trainOutVia" : "card.via", {
              stops: format.list(via),
            })
          : "",
      ]
        .filter(Boolean)
        .join(" · ")}
      tags={cardTags}
      stats={[
        {
          icon: "distance",
          value: format.distance(stats.distance),
          label: t("card.distance"),
        },
        {
          icon: "ascent",
          value: format.elevation(stats.ascent),
          label: t("card.ascent"),
        },
        {
          icon: "ridingTime",
          value: format.duration(tripRidingHours(trip)),
          label: t("card.ridingTime"),
        },
      ]}
      surface={stats.surface}
      chart={selected && <Profile proposal={proposal} />}
      days={trip.stages.map((stage, i) => {
        const share = trip.settings.dayShares?.[i] ?? 1;
        const count = beds[i];
        return {
          label: String(i + 1),
          place: stage.end.name,
          distance: format.distance(stage.stats.distance),
          ascent: format.elevation(stage.stats.ascent),
          ridingTime: format.duration(
            ridingHours(stage.stats, trip.settings.avgSpeed),
          ),
          ...(share < 1
            ? { tag: t(share <= 0.5 ? "card.halfDay" : "card.shortDay") }
            : {}),
          ...(count !== undefined && count <= WEAK_STOP_BEDS
            ? { warning: t("card.beds", { count }) }
            : {}),
        };
      })}
      selected={selected}
      onSelect={onSelect}
      onHover={onHover}
      onHoverDay={onHoverDay}
    >
      {openError && <InlineError>{openError}</InlineError>}
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
