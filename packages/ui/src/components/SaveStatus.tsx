import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";

export type SaveState = "saved" | "saving" | "error";

const dot: Record<SaveState, string> = {
  saved: "bg-success",
  saving: "bg-warning",
  error: "bg-danger",
};

/** Dot and word that tell whether changes are saved. */
export function SaveStatus({ state }: { state: SaveState }) {
  const { t } = useTranslation("ui");
  return (
    <span
      role="status"
      className="flex items-center gap-1.5 text-sm whitespace-nowrap text-text-muted"
    >
      <span className={cn("size-2 rounded-full", dot[state])} />
      {t(`save.${state}`)}
    </span>
  );
}
