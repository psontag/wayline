import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { AppShell } from "./components/AppShell";
import { DevComponentsPage } from "./pages/DevComponentsPage";
import { HomePage } from "./pages/HomePage";

const rootRoute = createRootRoute({
  component: AppShell,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/map",
  // MapLibre is large. Load it only on map pages.
  component: lazyRouteComponent(() => import("./pages/MapPage"), "MapPage"),
});

const devComponentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/components",
  component: DevComponentsPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  mapRoute,
  devComponentsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
