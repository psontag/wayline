import { type StatIcon, statIcons } from "../icons";

export type StatTileProps = {
  icon: StatIcon;
  /** "Distance" */
  label: string;
  /** "207 km" */
  value: string;
  /** Second line, e.g. "Sun 8 – Tue 10 Nov". */
  detail?: string;
};

/** One total in a tile: icon and label, value, optional second line. */
export function StatTile({ icon, label, value, detail }: StatTileProps) {
  const Icon = statIcons[icon];
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-bg px-3 py-2.5 tabular-nums">
      <span className="flex items-center gap-1.5 text-2xs text-text-muted">
        <Icon className="size-3 shrink-0" aria-hidden />
        {label}
      </span>
      <span className="truncate text-lg font-extrabold">{value}</span>
      {detail && (
        <span className="truncate text-2xs text-text-muted">{detail}</span>
      )}
    </div>
  );
}
