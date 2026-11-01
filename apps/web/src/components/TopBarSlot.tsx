import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

const SlotContext = createContext<{
  target: HTMLElement | null;
  setTarget: (el: HTMLElement | null) => void;
}>({ target: null, setTarget: () => {} });

/** Lets a page put its own actions into the top bar. */
export function TopBarSlotProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <SlotContext.Provider value={{ target, setTarget }}>
      {children}
    </SlotContext.Provider>
  );
}

/** Where page actions land in the top bar. */
export function TopBarSlotTarget() {
  const { setTarget } = useContext(SlotContext);
  return <div ref={setTarget} className="flex items-center gap-2" />;
}

/** Renders its children in the top bar. */
export function TopBarActions({ children }: { children: ReactNode }) {
  const { target } = useContext(SlotContext);
  return target ? createPortal(children, target) : null;
}
