import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";

export type NetworkRank = "international" | "national" | "regional" | "local";

export type NetworkRouteCardProps = {
  name: string;
  rank: NetworkRank;
  /** Meters of the whole route. */
  length: number;
  /** Other signed routes on the same way. */
  others?: string[];
  className?: string;
};

/** Name, kind and length of a signed cycling route under the pointer. */
export function NetworkRouteCard({
  name,
  rank,
  length,
  others = [],
  className,
}: NetworkRouteCardProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  return (
    <div
      className={cn(
        "flex max-w-popover flex-col rounded-md border border-border bg-surface px-3 py-2 shadow-md",
        className,
      )}
    >
      <span className="text-sm font-bold text-text">{name}</span>
      <span className="text-xs text-text-muted tabular-nums">
        {t("networkRoute.meta", {
          rank: t(`networkRoute.rank.${rank}`),
          distance: format.distance(length),
        })}
      </span>
      {others.length > 0 && (
        <span className="mt-1 text-xs text-text-muted">
          {t("networkRoute.also", { names: others.join(", ") })}
        </span>
      )}
    </div>
  );
}
