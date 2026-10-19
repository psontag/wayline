/** Small tile with a label over a value, e.g. "Wind" over "45 % headwind". */
export function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-bg p-2.5">
      <span className="text-2xs text-text-muted">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
