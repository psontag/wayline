import { Link } from "@tanstack/react-router";
import {
  addDays,
  type GenerateRequest,
  localTimeToDate,
  type Proposal,
  type Theme,
} from "@wayline/domain";
import {
  Button,
  MessagePanel,
  ProgressBar,
  ProposalCard,
  ProposalCardSkeleton,
  useFormat,
} from "@wayline/ui";
import { ArrowRight, Mountain, RotateCcw, SearchX } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  elevationSamples,
  progressValue,
  proposalStats,
  relaxOptions,
  type Relaxed,
  tripPoints,
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
            theme={request.theme}
            number={i + 1}
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
  theme,
  number,
  selected,
  onSelect,
  onHover,
  onOpen,
  opening,
  openFailed,
}: {
  proposal: Proposal;
  theme?: Theme;
  number: number;
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
  const themeValue = theme && proposal.themes?.[theme];
  const stats = proposalStats(trip);
  const profile = useMemo(() => elevationSamples(tripPoints(trip)), [trip]);
  const from = trip.stages[0]?.start.name ?? "";
  const to = trip.stages.at(-1)?.end.name ?? "";
  const via = proposal.via.length
    ? proposal.via
    : trip.stages.slice(0, -1).map((s) => s.end.name);

  return (
    <ProposalCard
      number={number}
      title={
        via.length ? t("card.via", { stops: format.list(via) }) : trip.name
      }
      subtitle={[
        t(
          `card.subtitle.${trip.kind === "one-way" ? "one-way" : "multi-day-loop"}`,
          { from, to },
        ),
        ...(theme && themeValue !== undefined
          ? [
              t(`card.theme.${theme}`, {
                share: format.percent(themeValue),
                count: Math.round(themeValue),
              }),
            ]
          : []),
      ].join(" · ")}
      stats={[
        { value: format.distance(stats.distance), label: t("card.distance") },
        { value: format.elevation(stats.ascent), label: t("card.ascent") },
        { value: format.percent(stats.paved), label: t("card.paved") },
        {
          value: format.distance(stats.longestDay),
          label: t("card.longestDay"),
        },
      ]}
      profile={profile}
      footer={
        routeNames.length
          ? t("card.routes", { routes: routeNames.join(" · ") })
          : t("card.noRoutes")
      }
      selected={selected}
      onSelect={onSelect}
      onHover={onHover}
    >
      <ol className="flex flex-col gap-2 border-t border-border pt-3">
        {trip.stages.map((stage, i) => (
          <li
            key={stage.id}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-xs text-text-muted">
                {trip.startDate
                  ? t("card.dayDate", {
                      day: i + 1,
                      date: format.date(
                        localTimeToDate(addDays(trip.startDate, i)),
                      ),
                    })
                  : t("card.day", { day: i + 1 })}
              </span>
              <span className="truncate font-semibold">
                {t("card.stage", {
                  from: stage.start.name,
                  to: stage.end.name,
                })}
              </span>
            </span>
            <span className="shrink-0 text-text-muted tabular-nums">
              {t("card.stageStats", {
                distance: format.distance(stage.stats.distance),
                ascent: format.elevation(stage.stats.ascent),
              })}
            </span>
          </li>
        ))}
      </ol>
      <span className="text-xs text-text-muted tabular-nums">
        {t("card.score", { score: format.percent(proposal.score) })}
      </span>
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
