import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { ArrowUp, Check, Layers, TrainFront } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../theme/ThemeScope";
import { IconButton } from "./IconButton";
import { MapLegendLine, type MapLegendItem } from "./MapLegend";

export type MapLayerKind = "hotels" | "stations" | "rain" | "wind";

export type MapLayerToggle = {
  kind: MapLayerKind;
  label: string;
  checked: boolean;
};

export type MapLayerGroup = { title: string; items: MapLayerToggle[] };

export type MapLayerMenuProps = {
  groups: MapLayerGroup[];
  onCheckedChange: (kind: MapLayerKind, checked: boolean) => void;
  /** Lines that can't be turned off, e.g. the cycling network. */
  legend?: MapLegendItem[];
};

/** Wind speed steps in km/h, from the wind-speed-1 to -4 tokens. */
export const WIND_SPEED_STEPS = [10, 20, 30] as const;

const windSpeedColors = [
  "bg-wind-speed-1",
  "bg-wind-speed-2",
  "bg-wind-speed-3",
  "bg-wind-speed-4",
] as const;

function Swatch({ kind }: { kind: MapLayerKind }) {
  switch (kind) {
    case "hotels":
      return (
        <span className="size-3 rounded-full border-2 border-marker bg-surface" />
      );
    case "stations":
      return (
        <span className="flex size-3.5 items-center justify-center rounded-sm bg-text-muted text-surface">
          <TrainFront className="size-2.5" aria-hidden />
        </span>
      );
    case "rain":
      return <span className="size-3 rounded-full bg-rain/60" />;
    case "wind":
      return <ArrowUp className="size-3.5 rotate-45 text-wind-speed-3" />;
  }
}

/** Key for the wind arrow colors. */
export function WindSpeedScale({ className }: { className?: string }) {
  const { t } = useTranslation("ui");
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="flex gap-0.5">
        {windSpeedColors.map((color) => (
          <span key={color} className={cn("h-1.5 flex-1 rounded-sm", color)} />
        ))}
      </div>
      <div className="flex text-2xs text-text-muted tabular-nums">
        {WIND_SPEED_STEPS.map((step) => (
          <span key={step} className="flex-1 text-right">
            {step}
          </span>
        ))}
        <span className="flex-1 text-right">{t("mapLayers.kmh")}</span>
      </div>
    </div>
  );
}

/**
 * Map legend with layers to turn on and off. Sits under the zoom buttons.
 * Stays open while layers are toggled.
 */
export function MapLayerMenu({
  groups,
  onCheckedChange,
  legend = [],
}: MapLayerMenuProps) {
  const { t } = useTranslation("ui");
  const container = usePortalContainer();
  return (
    <MenuPrimitive.Root modal={false}>
      <MenuPrimitive.Trigger asChild>
        <IconButton
          label={t("mapLayers.label")}
          icon={<Layers aria-hidden />}
          size="sm"
        />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal container={container}>
        <MenuPrimitive.Content
          side="left"
          align="start"
          sideOffset={8}
          className="z-popover flex w-max flex-col gap-1 rounded-md border border-border bg-surface-raised p-1 text-text shadow-md"
        >
          {groups.map((group, i) => (
            <MenuPrimitive.Group
              key={group.title}
              className={cn(i > 0 && "border-t border-border pt-1")}
            >
              <MenuPrimitive.Label className="px-2 py-1 text-2xs font-semibold text-text-muted">
                {group.title}
              </MenuPrimitive.Label>
              {group.items.map((item) => (
                <div key={item.kind}>
                  <MenuPrimitive.CheckboxItem
                    checked={item.checked}
                    onCheckedChange={(checked) =>
                      onCheckedChange(item.kind, checked)
                    }
                    // Keep the menu open to toggle more layers.
                    onSelect={(e) => e.preventDefault()}
                    className={cn(
                      "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-sm outline-none select-none",
                      "data-highlighted:bg-hover",
                    )}
                  >
                    <span className="flex size-4 items-center justify-center">
                      <Swatch kind={item.kind} />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    <span className="flex size-4 items-center justify-center rounded-sm border border-border">
                      <MenuPrimitive.ItemIndicator>
                        <Check className="size-3" aria-hidden />
                      </MenuPrimitive.ItemIndicator>
                    </span>
                  </MenuPrimitive.CheckboxItem>
                  {item.kind === "wind" && item.checked && (
                    <WindSpeedScale className="px-2 pt-0.5 pb-1.5 pl-8" />
                  )}
                </div>
              ))}
            </MenuPrimitive.Group>
          ))}
          {legend.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border px-2 py-1.5 text-xs text-text-muted">
              {legend.map((item) => (
                <MapLegendLine key={item.label} item={item} />
              ))}
            </div>
          )}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
