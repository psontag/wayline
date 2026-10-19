import { createContext, type ReactNode, useContext, useState } from "react";
import { createServices, type Services } from "./services";

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  /** Defaults to createServices(). Tests pass their own. */
  services?: Services;
  children: ReactNode;
}) {
  const [value] = useState(() => services ?? createServices());
  return (
    <ServicesContext.Provider value={value}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices needs a ServicesProvider");
  return services;
}
