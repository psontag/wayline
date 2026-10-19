import { Calendar } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "./Button";

export type DateButtonProps = {
  /** "YYYY-MM-DD" */
  value?: string;
  onChange: (value: string) => void;
  /** Text on the button, e.g. the formatted date. */
  children: ReactNode;
  "aria-label"?: string;
  disabled?: boolean;
};

/** Button that opens the browser's date picker. */
export function DateButton({
  value,
  onChange,
  children,
  "aria-label": ariaLabel,
  disabled,
}: DateButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="relative inline-flex">
      <Button
        size="sm"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          try {
            input.current?.showPicker();
          } catch {
            input.current?.focus();
          }
        }}
      >
        <Calendar aria-hidden />
        {children}
      </Button>
      {/* The picker opens at this input, so it sits under the button. */}
      <input
        ref={input}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value ?? ""}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="pointer-events-none absolute inset-0 opacity-0"
      />
    </span>
  );
}
