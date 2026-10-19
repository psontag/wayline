export type ProgressBarProps = {
  /** 0 to 1. */
  value: number;
  "aria-label"?: string;
};

/** Thin bar for a long task, e.g. generating proposals. */
export function ProgressBar({ value, ...props }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-1.5 overflow-hidden rounded-full bg-hover"
      {...props}
    >
      <div
        className="h-full bg-accent transition-all duration-normal"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
