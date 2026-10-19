import { CalendarDays, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type DateFieldProps = {
  /** "YYYY-MM-DD", or "" for no date. */
  value: string;
  onValueChange: (value: string) => void;
  /** Earliest date, "YYYY-MM-DD". */
  min?: string;
  id?: string;
  placeholder?: string;
  /** Show a button that clears the date. */
  clearable?: boolean;
};

/**
 * Date in our format, e.g. "Sat 12 Jun". The browser date picker does the
 * picking: a hidden native input lies on top of the field.
 */
export function DateField({
  value,
  onValueChange,
  min,
  id,
  placeholder,
  clearable = false,
}: DateFieldProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const [y, m, d] = value.split("-").map(Number);
  const text = value && y && m && d ? format.date(new Date(y, m - 1, d)) : "";

  return (
    <div
      className={cn(
        "relative flex h-10 items-center gap-2 rounded-sm border border-border bg-surface px-3 text-base text-text",
        "transition-colors hover:border-text-muted",
        "has-focus-visible:outline-2 has-focus-visible:outline-focus-ring",
      )}
    >
      <CalendarDays className="size-4 shrink-0 text-text-muted" aria-hidden />
      <span
        className={cn("flex-1 truncate", !text && "text-text-muted")}
        aria-hidden
      >
        {text || placeholder || t("date.placeholder")}
      </span>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        onChange={(e) => onValueChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // Not supported or not allowed. The input still takes typing.
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      {clearable && value && (
        <button
          type="button"
          aria-label={t("date.clear")}
          onClick={() => onValueChange("")}
          className={cn(
            "relative flex size-6 items-center justify-center rounded-sm text-text-muted hover:bg-hover hover:text-text",
            focusRing,
          )}
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
