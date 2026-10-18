import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({
  placement = "screen",
}: {
  placement?: "screen" | "inline";
}) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "z-toast flex flex-col items-center gap-2 outline-none",
        placement === "screen" && "fixed inset-x-4 bottom-4",
      )}
    />
  );
}

export type ToastProps = {
  message: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Milliseconds. Infinity keeps the toast open. */
  duration?: number;
  action?: { label: string; onClick: () => void };
};

/** Short note after an action, with an optional undo-style action. */
export function Toast({
  message,
  open,
  onOpenChange,
  duration,
  action,
}: ToastProps) {
  const { t } = useTranslation("ui");
  return (
    <ToastPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
      className="flex max-w-full items-center gap-3 rounded-md bg-inverse py-2.5 pr-2 pl-3.5 text-sm text-on-inverse shadow-md"
    >
      <ToastPrimitive.Description>{message}</ToastPrimitive.Description>
      {action && (
        <ToastPrimitive.Action altText={action.label} asChild>
          <button
            type="button"
            onClick={action.onClick}
            className={cn(
              "rounded-sm font-bold text-inverse-accent hover:underline",
              focusRing,
            )}
          >
            {action.label}
          </button>
        </ToastPrimitive.Action>
      )}
      <ToastPrimitive.Close
        aria-label={t("toast.close")}
        className={cn(
          "flex size-6 items-center justify-center rounded-sm text-on-inverse opacity-70 hover:opacity-100",
          focusRing,
        )}
      >
        <X className="size-4" aria-hidden />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
