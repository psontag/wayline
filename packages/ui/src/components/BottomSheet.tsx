import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Drawer } from "vaul";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../theme/ThemeScope";
import { focusRing } from "./Button";

export type SheetSnap = "peek" | "half" | "full";

const snaps: SheetSnap[] = ["peek", "half", "full"];

/** Visible height of a sheet at peek, in px. Enough for a title row. */
export const SHEET_PEEK = 150;

// vaul takes px strings or shares of the window height. Full leaves room for
// a floating header above the sheet.
const snapPoints = [`${SHEET_PEEK}px`, 0.56, 0.9];

const next: Record<SheetSnap, SheetSnap> = {
  peek: "half",
  half: "full",
  full: "peek",
};

export type BottomSheetProps = {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Accessible name of the sheet. */
  label: string;
  children: ReactNode;
};

/**
 * Sheet over a full-screen map. Always open, at one of three heights. The map
 * behind it stays usable.
 */
export function BottomSheet({
  snap,
  onSnapChange,
  label,
  children,
}: BottomSheetProps) {
  const { t } = useTranslation("ui");
  const container = usePortalContainer();
  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      noBodyStyles
      snapPoints={snapPoints}
      activeSnapPoint={snapPoints[snaps.indexOf(snap)]}
      setActiveSnapPoint={(point) => {
        const index = snapPoints.indexOf(point ?? "");
        const value = snaps[index];
        if (value) onSnapChange(value);
      }}
    >
      <Drawer.Portal container={container}>
        <Drawer.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-0 z-sheet flex flex-col rounded-t-xl bg-surface text-base text-text shadow-sheet outline-none"
        >
          <Drawer.Title className="sr-only">{label}</Drawer.Title>
          <button
            type="button"
            aria-label={
              snap === "full" ? t("sheet.collapse") : t("sheet.expand")
            }
            onClick={() => onSnapChange(next[snap])}
            className={cn(
              "flex h-7 w-full shrink-0 cursor-pointer items-center justify-center rounded-t-xl",
              focusRing,
            )}
          >
            <span className="h-1.5 w-10 rounded-full bg-border" />
          </button>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
