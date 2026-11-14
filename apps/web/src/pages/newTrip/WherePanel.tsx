import { Button, PanelHeader } from "@wayline/ui";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Step 1 of New trip: days, train, areas. The map picks the start. */
export function WherePanel({
  onChoosePlace,
  lead,
  children,
}: {
  onChoosePlace: () => void;
  /** Sections above the rest, e.g. the areas on phones. */
  lead?: ReactNode;
  /** The sections: days, train from home, areas, … */
  children?: ReactNode;
}) {
  const { t } = useTranslation("newTrip");
  return (
    <div className="flex min-h-0 w-full flex-col border-border bg-surface max-md:flex-1 max-md:border-t md:max-w-panel md:border-l">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PanelHeader eyebrow={t("step.where")} title={t("where.title")} />
        {lead}
        {children}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-4">
        <span className="text-xs text-text-muted">{t("where.hint")}</span>
        <Button type="button" onClick={onChoosePlace}>
          {t("where.choosePlace")}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
