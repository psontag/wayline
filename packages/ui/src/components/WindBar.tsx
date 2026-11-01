import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";

export type WindBarShares = { head: number; cross: number; tail: number };

const segments = [
  { key: "tail", color: "bg-wind-tail" },
  { key: "cross", color: "bg-wind-cross" },
  { key: "head", color: "bg-wind-head" },
] as const;

/** Thin bar with the tail, cross and head wind shares of a day. */
export function WindBar({
  shares,
  className,
}: {
  shares: WindBarShares;
  className?: string;
}) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const label = segments
    .filter(({ key }) => shares[key] >= 0.005)
    .map(({ key }) =>
      t(`stage.wind.${key}`, { share: format.percent(shares[key]) }),
    )
    .join(", ");
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex h-1.5 gap-0.5 overflow-hidden rounded-full",
        className,
      )}
    >
      {segments.map(({ key, color }) =>
        shares[key] > 0 ? (
          <div key={key} className={color} style={{ flexGrow: shares[key] }} />
        ) : null,
      )}
    </div>
  );
}
