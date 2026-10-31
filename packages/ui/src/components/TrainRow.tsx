import { Bookmark, BookmarkCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { IconButton } from "./IconButton";

export type TrainRowProps = {
  departure: Date;
  arrival: Date;
  changes: number;
  /** e.g. ["ICE 591", "RE 10"] */
  lines: string[];
  /** bahn.de search for this train. */
  href: string;
  saved?: boolean;
  /** Without it, the row has no save button, e.g. on shared trips. */
  onToggleSave?: () => void;
};

/** One train connection: times, duration, changes and lines. */
export function TrainRow({
  departure,
  arrival,
  changes,
  lines,
  href,
  saved = false,
  onToggleSave,
}: TrainRowProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const hours = (arrival.getTime() - departure.getTime()) / 3_600_000;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1",
        saved && "bg-selected",
      )}
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "flex min-w-0 flex-1 flex-col rounded-sm hover:underline",
          focusRing,
        )}
      >
        <span className="text-sm font-semibold tabular-nums">
          {t("train.times", {
            departure: format.time(departure),
            arrival: format.time(arrival),
          })}
        </span>
        <span className="truncate text-xs text-text-muted">
          {[
            format.duration(hours),
            t("train.changes", { count: changes }),
            lines.join(", "),
          ].join(" · ")}
        </span>
      </a>
      {onToggleSave && (
        <IconButton
          size="sm"
          label={t(saved ? "train.unsave" : "train.save")}
          icon={
            saved ? (
              <BookmarkCheck aria-hidden className="text-selected-border" />
            ) : (
              <Bookmark aria-hidden />
            )
          }
          aria-pressed={saved}
          onClick={onToggleSave}
        />
      )}
    </div>
  );
}
