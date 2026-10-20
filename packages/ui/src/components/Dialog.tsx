import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePortalContainer } from "../theme/ThemeScope";
import { Button } from "./Button";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Buttons at the bottom right. */
  footer?: ReactNode;
};

/** A centered dialog with a close button. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: DialogProps) {
  const { t } = useTranslation("ui");
  const container = usePortalContainer();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal container={container}>
        <RadixDialog.Overlay className="fixed inset-0 z-dialog bg-scrim" />
        <div className="fixed inset-0 z-dialog flex items-center justify-center p-4">
          <RadixDialog.Content
            {...(!description && { "aria-describedby": undefined })}
            className="relative flex max-h-full w-full max-w-sm flex-col gap-4 overflow-auto rounded-lg border border-border bg-surface-raised p-5 text-text shadow-md"
          >
            <div className="flex flex-col gap-1 pr-8">
              <RadixDialog.Title className="text-lg font-extrabold tracking-tight">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="text-sm text-text-muted">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            {children}
            {footer && <div className="flex justify-end gap-2">{footer}</div>}
            {/* Last in the DOM, so focus starts in the content. */}
            <RadixDialog.Close asChild>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t("dialog.close")}
                className="absolute top-4 right-4"
              >
                <X aria-hidden />
              </Button>
            </RadixDialog.Close>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
