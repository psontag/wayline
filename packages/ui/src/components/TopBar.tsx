import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** The wayline wordmark: a short route between two stops. */
export function Logo() {
  const { t } = useTranslation("ui");
  return (
    <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-text">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-6">
        <path
          d="M3 18c4-1 5-6 9-6s5 5 9 4"
          className="stroke-route"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="3" cy="18" r="2" className="fill-marker" />
        <circle cx="21" cy="16" r="2" className="fill-marker" />
      </svg>
      {t("logo.wordmark")}
    </span>
  );
}

/** App header. Put the logo or a back link first and actions last. */
export function TopBar({ children }: { children: ReactNode }) {
  return (
    <header className="z-panel flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      {children}
    </header>
  );
}

/** Pushes the following items in a TopBar to the end. */
export function TopBarSpacer() {
  return <div className="flex-1" />;
}
