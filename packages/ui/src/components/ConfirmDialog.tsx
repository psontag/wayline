import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useTranslation } from "react-i18next";
import { usePortalContainer } from "../theme/ThemeScope";
import { Button } from "./Button";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Danger for actions that can't be undone, e.g. delete. */
  tone?: "primary" | "danger";
};

/** Asks before an action. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = "primary",
}: ConfirmDialogProps) {
  const { t } = useTranslation("ui");
  const container = usePortalContainer();
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal container={container}>
        <AlertDialog.Overlay className="fixed inset-0 z-dialog bg-scrim" />
        <div className="fixed inset-0 z-dialog flex items-center justify-center p-4">
          <AlertDialog.Content className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-border bg-surface-raised p-5 text-text shadow-md">
            <AlertDialog.Title className="text-lg font-extrabold tracking-tight">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-text-muted">
              {description}
            </AlertDialog.Description>
            <div className="mt-3 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">{t("dialog.cancel")}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant={tone} onClick={onConfirm}>
                  {confirmLabel}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
