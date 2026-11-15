import type { Stage } from "@wayline/domain";
import { Button, PanelSection, RouteChoices } from "@wayline/ui";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OtherWay } from "./otherWays";

/** What the panel and the map share about the other ways of a day. */
export type OtherWaysState = {
  /** Searched or searching. */
  on: boolean;
  onSearch: () => void;
  loading: boolean;
  failed: boolean;
  ways: OtherWay[];
  hovered?: string;
  onHover: (id: string | undefined) => void;
  onPick: (way: OtherWay) => void;
};

/** Other routes from the day's start to its stop, searched on request. */
export function OtherWaysSection({
  stage,
  state,
  disabled,
}: {
  stage: Stage;
  state: OtherWaysState;
  disabled: boolean;
}) {
  const { t } = useTranslation(["tripEditor", "proposals"]);
  const { on, loading, failed, ways } = state;
  const found = on && !loading && !failed;
  const title = (way: OtherWay) => {
    const via = way.via.slice(0, 2).join(", ");
    // "Direct" is the generator's shortest way, which may still be longer
    // than the current route.
    const kind =
      way.character &&
      way.character !== "direct" &&
      t(`proposals:card.character.${way.character}`);
    const place = via && t("otherWays.via", { places: via });
    return [kind, place].filter(Boolean).join(" · ") || t("otherWays.way");
  };
  return (
    <PanelSection
      icon="ways"
      title={t("section.otherWays")}
      summary={
        found ? t("otherWays.summary", { count: ways.length }) : undefined
      }
      collapsible
    >
      {!found && (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-text-muted">
            {loading
              ? t("otherWays.searching")
              : failed
                ? t("otherWays.failed")
                : t("otherWays.hint", { place: stage.end.name })}
          </span>
          {!loading && (
            <Button size="sm" disabled={disabled} onClick={state.onSearch}>
              <Search aria-hidden />
              {t(failed ? "otherWays.retry" : "otherWays.find")}
            </Button>
          )}
        </div>
      )}
      {found && ways.length === 0 && (
        <p className="text-xs text-text-muted">{t("otherWays.none")}</p>
      )}
      {found && ways.length > 0 && (
        <RouteChoices
          choices={ways.map((way) => ({
            id: way.id,
            title: title(way),
            detail: way.tags
              .slice(0, 3)
              .map((tag) => t(`proposals:card.tag.${tag}`))
              .join(" · "),
            distance: way.route.stats.distance,
            ascent: way.route.stats.ascent,
            change: way.route.stats.distance - stage.stats.distance,
          }))}
          disabled={disabled}
          onSelect={(id) => {
            const way = ways.find((w) => w.id === id);
            if (way) state.onPick(way);
          }}
          onHover={state.onHover}
          {...(state.hovered && { hoveredId: state.hovered })}
        />
      )}
    </PanelSection>
  );
}
