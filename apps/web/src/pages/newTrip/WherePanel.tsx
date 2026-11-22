import { Button, PanelHeader, SegmentedControl } from "@wayline/ui";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Ways to start a trip on the Where screen. */
export const whereTabs = ["areas", "routes", "place"] as const;
export type WhereTab = (typeof whereTabs)[number];

/** First screen of New trip: dates, then one way to start. */
export function WherePanel({
  tab,
  onTab,
  ride,
  children,
}: {
  tab: WhereTab;
  onTab: (tab: WhereTab) => void;
  /** A picked signed route: the footer rides it. */
  ride?: { label: string; hint: string; onRide: () => void };
  /** The sections: days, train from home, then the list of the tab. */
  children?: ReactNode;
}) {
  const { t } = useTranslation("newTrip");
  const hint = ride
    ? ride.hint
    : t(
        tab === "areas"
          ? "where.hint"
          : tab === "routes"
            ? "where.routeHint"
            : "where.placeHint",
      );
  return (
    <div className="flex min-h-0 w-full flex-col border-border bg-surface max-md:flex-1 max-md:border-t md:max-w-panel md:border-l">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PanelHeader
          title={t("where.title")}
          notice={
            <SegmentedControl
              stretch
              aria-label={t("where.startFrom")}
              value={tab}
              onValueChange={(v) => onTab(v as WhereTab)}
              options={whereTabs.map((v) => ({
                value: v,
                label: t(`where.tab.${v}`),
              }))}
            />
          }
        />
        {children}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-4">
        <span className="text-xs text-text-muted">{hint}</span>
        {ride && (
          <Button type="button" variant="primary" onClick={ride.onRide}>
            {ride.label}
            <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
