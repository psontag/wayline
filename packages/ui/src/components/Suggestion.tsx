import type { ReactNode } from "react";

/** A hint about the inputs, with buttons that change them. */
export function Suggestion({
  text,
  children,
}: {
  text: string;
  /** Small buttons. */
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md bg-selected px-3 py-2 text-sm"
    >
      <span>{text}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
