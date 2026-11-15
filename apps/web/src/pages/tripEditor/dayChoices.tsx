import { Button, type StopChoice, type StopChoicesProps } from "@wayline/ui";
import type { TFunction } from "i18next";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OtherWay, OtherWaysState } from "./otherWays";
import type { StopHover } from "./StopPicker";

const WAY = "way:";

function wayTitle(t: TFunction<["tripEditor", "proposals"]>, way: OtherWay) {
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

/**
 * Towns and ways in one list, by today's km. Ways end at the current stop,
 * so tomorrow and the hotels stay as they are.
 */
export function useDayChoices(
  towns: StopChoice[],
  ways: OtherWaysState,
): StopChoice[] {
  const { t } = useTranslation(["tripEditor", "proposals"]);
  const now = towns.find((c) => c.current);
  const wayRows = ways.ways.map((way, i): StopChoice => ({
    id: WAY + way.id,
    name: wayTitle(t, way),
    current: false,
    distance: way.route.stats.distance,
    ascent: way.route.stats.ascent,
    ...(now?.nextDistance !== undefined && {
      nextDistance: now.nextDistance,
    }),
    ...(now?.hotels !== undefined && { hotels: now.hotels }),
    way: i,
    detail: way.tags
      .slice(0, 3)
      .map((tag) => t(`proposals:card.tag.${tag}`))
      .join(" · "),
  }));
  return [...towns, ...wayRows].sort((a, b) => a.distance - b.distance);
}

/** Hover and pick for a list of towns and ways. */
export function dayChoiceProps(
  hover: StopHover,
  ways: OtherWaysState,
  pickTown: (name: string) => void,
): Pick<StopChoicesProps, "onSelect" | "onHover" | "hoveredId"> {
  const hoveredId = ways.hovered ? WAY + ways.hovered : hover.name;
  return {
    onSelect: (id) => {
      hover.onHover(undefined);
      ways.onHover(undefined);
      if (!id.startsWith(WAY)) return pickTown(id);
      const way = ways.ways.find((w) => WAY + w.id === id);
      if (way) ways.onPick(way);
    },
    onHover: (id) => {
      const isWay = id?.startsWith(WAY);
      ways.onHover(isWay ? id?.slice(WAY.length) : undefined);
      hover.onHover(isWay ? undefined : id);
    },
    ...(hoveredId && { hoveredId }),
  };
}

/** Under the list: find other ways, and how the search went. */
export function WaysFooter({
  ways,
  disabled,
}: {
  ways: OtherWaysState;
  disabled: boolean;
}) {
  const { t } = useTranslation("tripEditor");
  const { on, loading, failed } = ways;
  if (on && !loading && !failed) {
    return ways.ways.length === 0 ? (
      <p className="px-1.5 text-xs text-text-muted">{t("otherWays.none")}</p>
    ) : null;
  }
  return (
    <div className="flex items-center gap-2 px-1.5">
      <span className="flex-1 text-xs text-text-muted">
        {loading
          ? t("otherWays.searching")
          : failed
            ? t("otherWays.failed")
            : t("otherWays.hint")}
      </span>
      {!loading && (
        <Button size="sm" disabled={disabled} onClick={ways.onSearch}>
          <Search aria-hidden />
          {t(failed ? "otherWays.retry" : "otherWays.find")}
        </Button>
      )}
    </div>
  );
}
