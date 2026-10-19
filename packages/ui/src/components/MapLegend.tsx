import { cn } from "../lib/cn";

export type MapLegendItem = {
  label: string;
  line: "route" | "route-dimmed" | "dashed";
};

const lines = {
  route: "h-1 bg-route",
  "route-dimmed": "h-1 bg-route-dimmed",
  dashed: "h-0 border-t-2 border-dashed border-text-muted",
} as const;

/** Key for the lines on a map. */
export function MapLegend({ items }: { items: MapLegendItem[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted shadow-sm">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          <span className={cn("w-3.5 rounded-full", lines[item.line])} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
