import type { LonLat } from "@wayline/domain";
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
import type { OtherWay } from "./otherWays";
import type { StopChoice as StopOption } from "./stopChoices";

/**
 * A town to end the day in or another way to the stop: the day as it would
 * be. Both show, preview and pick alike.
 */
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

function wayTitle(t: TFunction<["tripEditor", "proposals"]>, way: OtherWay) {
  if (way.name) return way.name;
  const via = way.via.slice(0, 2).join(", ");
  // "Direct" is the generator's shortest way, which may still be longer
  // than the current route.
  const kind =
    way.character &&
    way.character !== "direct" &&
    t(`proposals:card.character.${way.character}`);
  const place = via && t("otherWays.via", { places: via });
  return [kind, place].filter(Boolean).join(" · ") || t("otherWays.way");
}

export function useDayChoices(
  options: StopOption[],
  ways: OtherWay[],
): DayChoice[] {
  const { t } = useTranslation(["tripEditor", "proposals"]);
  return useMemo(() => dayChoices(t, options, ways), [options, ways, t]);
}

/**
 * Towns and ways in one list, by today's km. Towns take colors first, so
 * theirs stay when the ways arrive. Ways end at the current stop, so
 * tomorrow and the hotels stay as they are. Of ways with the same name, or
 * the same km and climbing, only the first shows.
 */
export function dayChoices(
  t: TFunction<["tripEditor", "proposals"]>,
  options: StopOption[],
  ways: OtherWay[],
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
  const kept: OtherWay[] = [];
  const same = (a: OtherWay, b: OtherWay) =>
    wayTitle(t, a) === wayTitle(t, b) ||
    (Math.abs(a.stage.stats.distance - b.stage.stats.distance) < 100 &&
      Math.abs(a.stage.stats.ascent - b.stage.stats.ascent) < 10);
  for (const way of ways) {
    if (!kept.some((k) => same(k, way))) kept.push(way);
  }
  const wayRows = kept.map((way): DayChoice => ({
    id: `way:${way.id}`,
    kind: "way",
    name: wayTitle(t, way),
    current: false,
    distance: way.stage.stats.distance,
    ascent: way.stage.stats.ascent,
    ...(now?.nextDistance !== undefined && {
      nextDistance: now.nextDistance,
    }),
    ...(now?.beds && { hotels: now.beds.total }),
    color: color(),
    detail: way.tags
      .slice(0, 3)
      .map((tag) => t(`proposals:card.tag.${tag}`))
      .join(" · "),
    line: way.line,
    stages: { stage: way.stage },
  }));
  return [...towns, ...wayRows].sort((a, b) => a.distance - b.distance);
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
          {t("otherWays.failed")}
        </span>
        <Button size="sm" onClick={state.onRetry}>
          {t("otherWays.retry")}
        </Button>
      </div>
    );
  }
  return state.loading ? (
    <p className="px-1.5 text-xs text-text-muted">{t("otherWays.searching")}</p>
  ) : null;
}
