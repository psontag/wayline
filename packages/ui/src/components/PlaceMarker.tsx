/** A place on the map: a dot with its name next to it. */
export function PlaceMarker({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-3 rounded-full border-2 border-surface bg-marker shadow-sm" />
      <span className="rounded-sm border border-border bg-surface px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-text shadow-sm">
        {name}
      </span>
    </span>
  );
}
