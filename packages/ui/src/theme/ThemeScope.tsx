import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import type { ResolvedTheme } from "./ThemeProvider";

const PortalContainerContext = createContext<HTMLElement | null>(null);

/** Element that popovers in this subtree portal into, so they keep its theme. */
export function usePortalContainer() {
  return useContext(PortalContainerContext) ?? undefined;
}

/** Forces a theme on its subtree, e.g. to show light and dark side by side. */
export function ThemeScope({
  theme,
  className,
  children,
}: {
  theme: ResolvedTheme;
  className?: string;
  children: ReactNode;
}) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return (
    <div
      ref={setElement}
      data-theme={theme}
      className={cn("bg-bg text-text", className)}
    >
      <PortalContainerContext.Provider value={element}>
        {children}
      </PortalContainerContext.Provider>
    </div>
  );
}
