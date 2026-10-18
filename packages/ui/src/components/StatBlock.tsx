import { cn } from "../lib/cn";

export type StatBlockProps = {
  value: string;
  label: string;
  size?: "md" | "lg";
};

/** A number with a short label below, e.g. "78 km" over "Distance". */
export function StatBlock({ value, label, size = "md" }: StatBlockProps) {
  return (
    <div className="flex min-w-0 flex-col tabular-nums">
      <span
        className={cn(
          "whitespace-nowrap text-text",
          size === "md" ? "text-lg font-bold" : "text-xl font-semibold",
        )}
      >
        {value}
      </span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}
