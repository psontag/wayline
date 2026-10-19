import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  text: string;
  /** Usually one primary button. */
  action?: ReactNode;
};

/** Shown when a list has nothing yet. */
export function EmptyState({ title, text, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3.5 rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
      <svg viewBox="0 0 120 48" fill="none" aria-hidden className="h-12">
        <path
          d="M6 40c20-4 24-28 44-28s22 22 40 20 20-16 24-20"
          className="stroke-route"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="6" cy="40" r="5" className="fill-marker" />
        <circle cx="114" cy="12" r="5" className="fill-marker" />
      </svg>
      <span className="text-lg font-extrabold">{title}</span>
      <span className="max-w-sm leading-normal text-text-muted">{text}</span>
      {action}
    </div>
  );
}
