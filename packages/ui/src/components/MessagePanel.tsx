import type { ReactNode } from "react";

export type MessagePanelProps = {
  /** A Lucide icon. */
  icon: ReactNode;
  title: string;
  text: string;
  /** Buttons, stacked. Put the main one first. */
  actions?: ReactNode;
};

/** Explains why a panel has no content and what to do next. */
export function MessagePanel({
  icon,
  title,
  text,
  actions,
}: MessagePanelProps) {
  return (
    <div className="flex flex-col gap-3.5 px-5 py-6">
      <span className="flex size-10 items-center justify-center rounded-full bg-selected text-text [&_svg]:size-5">
        {icon}
      </span>
      <span className="text-lg font-extrabold">{title}</span>
      <span className="leading-normal text-text-muted">{text}</span>
      {actions && <div className="flex flex-col gap-2">{actions}</div>}
    </div>
  );
}
