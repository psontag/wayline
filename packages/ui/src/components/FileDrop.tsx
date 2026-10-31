import { Plus, Upload } from "lucide-react";
import { type DragEvent, useState } from "react";
import { cn } from "../lib/cn";

export type FileDropProps = {
  /** Text on the area, e.g. "Choose GPX files". */
  label: string;
  /** Muted text below the label. Only on the large area. */
  hint?: string;
  /** File types, as for an input, e.g. ".gpx". */
  accept?: string;
  multiple?: boolean;
  /** Large for an empty screen, small below a list. */
  size?: "sm" | "lg";
  onFiles: (files: File[]) => void;
  className?: string;
};

/** Dashed area that opens the file picker on click and takes dropped files. */
export function FileDrop({
  label,
  hint,
  accept,
  multiple = false,
  size = "sm",
  onFiles,
  className,
}: FileDropProps) {
  const [over, setOver] = useState(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const files = [...event.dataTransfer.files];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  const Icon = size === "lg" ? Upload : Plus;

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-text-muted transition-colors hover:bg-hover",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring",
        size === "lg"
          ? "flex-col gap-2.5 bg-surface px-6 py-16 text-center"
          : "h-11 gap-2 text-sm font-semibold",
        over && "border-selected-border bg-selected",
        className,
      )}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // Picking the same file again should fire again.
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <Icon
        aria-hidden
        className={size === "lg" ? "size-8 text-text" : "size-4"}
      />
      {size === "lg" ? (
        <>
          <span className="text-lg font-extrabold text-text">{label}</span>
          {hint && <span className="max-w-sm leading-normal">{hint}</span>}
        </>
      ) : (
        label
      )}
    </label>
  );
}
