import type { LonLat, Place, RouteTag } from "@wayline/domain";
import { HOTEL_KM } from "@wayline/providers";
import {
  Button,
  type RouteColor,
  type StopChoice as ChoiceRow,
  StopChoices,
} from "@wayline/ui";
import type { TFunction } from "i18next";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ChoiceStages } from "./edits";
import type { DayRoute } from "./dayRoutes";
import type { StopChoice as StopOption } from "./stopChoices";

/** A route for the day: the day as it would be if picked. */
export type DayChoice = ChoiceRow & {
  /** This day if picked. Missing until routed. */
  line?: LonLat[];
  /** The next day if picked. Missing when it stays, as for a way. */
  nextLine?: LonLat[];
  /** What picking it writes. Missing until routed. */
  stages?: ChoiceStages;
};

/** What the panel and the map share about the choices of a day. */
export type DayChoicesState = {
  choices: DayChoice[];
  hovered?: string;
  onHover: (id: string | undefined) => void;
  onPick: (choice: DayChoice) => void;
  /** The search for other ways. */
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
};

/**
 * Colors of the choices on the map and in the table. Not route-1 or
 * route-4: they look like the day colors.
 */
const COLORS: RouteColor[] = [
  "route2",
  "route3",
  "route5",
  "route6",
  "route7",
  "route8",
];

type T = TFunction<["tripEditor", "proposals"]>;

/** A route to the same stop: by the towns on the way. */
function wayTitle(t: T, route: DayRoute) {
  const via = route.via.slice(0, 2).join(", ");
  return via ? t("dayRoutes.via", { places: via }) : t("dayRoutes.way");
}

/** Shorter, longer, flatter, hillier or scenic, against the current day. */
function differences(
  t: T,
  route: DayRoute,
  now: StopOption | undefined,
): string[] {
  const { distance, ascent } = route.stages.stage.stats;
  const out: string[] = [];
  if (now) {
    if (distance < (1 - KM_GAP) * now.distance)
      out.push(t("dayRoutes.shorter"));
    if (distance > (1 + KM_GAP) * now.distance) out.push(t("dayRoutes.longer"));
    const climb = ascent - now.ascent;
    const gap = Math.max(CLIMB_GAP_M, CLIMB_GAP * now.ascent);
    if (climb < -gap) out.push(t("dayRoutes.flatter"));
    if (climb > gap) out.push(t("dayRoutes.hillier"));
  }
  if (route.flavour === "nature" || route.character === "scenic") {
    out.push(t("dayRoutes.scenic"));
  }
  return out;
}

/** Route tags the differences to the current day already cover. */
const SAID: RouteTag[] = [
  "longer",
  "shorter",
  "moreClimbing",
  "flat",
  "hilly",
  "climbs",
];
/** Routes this much shorter or longer than now say so. */
const KM_GAP = 0.1;
/** Routes with this much more or less climbing say so: share, and meters. */
const CLIMB_GAP = 0.25;
const CLIMB_GAP_M = 100;

export function useDayChoices(
  options: StopOption[],
  routes: DayRoute[],
  beds?: (place: Place) => number | undefined,
): DayChoice[] {
  const { t } = useTranslation(["tripEditor", "proposals"]);
  return useMemo(
    () => dayChoices(t, options, routes, beds),
    [options, routes, beds, t],
  );
}

/**
 * The current day, the given towns and the routes in one list, by today's
 * km. Towns take colors first, so theirs stay when the routes arrive. A
 * route to another town is named after it; one to the same stop by the
 * towns on the way, and keeps tomorrow and the hotels. Of routes to the
 * same place with the same km and climbing, or the same name, only the
 * first shows.
 */
export function dayChoices(
  t: T,
  options: StopOption[],
  routes: DayRoute[],
  beds?: (place: Place) => number | undefined,
): DayChoice[] {
  const now = options.find((o) => o.current);
  let next = 0;
  const color = () => COLORS[next++ % COLORS.length];
  const towns = options.map((o): DayChoice => ({
    id: o.place.name,
    kind: "stop",
    name: o.place.name,
    current: o.current,
    distance: o.distance,
    ascent: o.ascent,
    ...(o.nextDistance !== undefined && { nextDistance: o.nextDistance }),
    ...(o.beds && { hotels: o.beds.total }),
    ...(o.size && { size: o.size }),
    ...(!o.current && { color: color() }),
    ...(o.line && { line: o.line }),
    ...(o.nextLine && { nextLine: o.nextLine }),
    ...(o.stages && { stages: o.stages }),
  }));
  const title = (r: DayRoute) =>
    r.name ?? (r.stages.next ? r.stages.stage.end.name : wayTitle(t, r));
  const kept: DayRoute[] = [];
  const same = (a: DayRoute, b: DayRoute) => {
    const [x, y] = [a.stages.stage, b.stages.stage];
    return (
      x.end.name === y.end.name &&
      ((!a.stages.next && title(a) === title(b)) ||
        (Math.abs(x.stats.distance - y.stats.distance) < 100 &&
          Math.abs(x.stats.ascent - y.stats.ascent) < 10))
    );
  };
  for (const route of routes) {
    if (!kept.some((k) => same(k, route))) kept.push(route);
  }
  const routeRows = kept.map((route): DayChoice => {
    const { stage, next: tomorrow } = route.stages;
    const nextDistance = tomorrow?.stats.distance ?? now?.nextDistance;
    const hotels = tomorrow ? beds?.(stage.end) : now?.beds?.total;
    return {
      id: `route:${route.id}`,
      kind: tomorrow && !route.name ? "stop" : "way",
      name: title(route),
      current: false,
      distance: stage.stats.distance,
      ascent: stage.stats.ascent,
      ...(nextDistance !== undefined && { nextDistance }),
      ...(hotels !== undefined && { hotels }),
      color: color(),
      detail: [
        ...differences(t, route, now),
        ...route.tags
          .filter((tag) => !SAID.includes(tag))
          .map((tag) => t(`proposals:card.tag.${tag}`)),
      ]
        .slice(0, 3)
        .join(" · "),
      line: route.line,
      ...(route.nextLine && { nextLine: route.nextLine }),
      stages: route.stages,
    };
  });
  return [...towns, ...routeRows].sort((a, b) => a.distance - b.distance);
}

/** The day's choices as a table. Hover previews one, a click picks it. */
export function DayChoiceTable({
  state,
  disabled,
  hotels = true,
  children,
}: {
  state: DayChoicesState;
  disabled: boolean;
  /** Without the next day and hotels, e.g. at the end of a trip. */
  hotels?: boolean;
  /** Above the footer, e.g. a note on the choices. */
  children?: ReactNode;
}) {
  const { choices } = state;
  return (
    <StopChoices
      choices={choices}
      disabled={disabled}
      onSelect={(id) => {
        const choice = choices.find((c) => c.id === id);
        if (choice) state.onPick(choice);
      }}
      onHover={state.onHover}
      {...(state.hovered && { hoveredId: state.hovered })}
      footer={
        <>
          {children}
          <WaysStatus state={state} />
        </>
      }
      {...(hotels && { hotelsRadius: HOTEL_KM * 1000 })}
    />
  );
}

/** How the search for other ways goes, while it matters. */
function WaysStatus({ state }: { state: DayChoicesState }) {
  const { t } = useTranslation("tripEditor");
  if (state.failed) {
    return (
      <div className="flex items-center gap-2 px-1.5">
        <span className="flex-1 text-xs text-text-muted">
          {t("dayRoutes.failed")}
        </span>
        <Button size="sm" onClick={state.onRetry}>
          {t("dayRoutes.retry")}
        </Button>
      </div>
    );
  }
  return state.loading ? (
    <p className="px-1.5 text-xs text-text-muted">{t("dayRoutes.searching")}</p>
  ) : null;
}
