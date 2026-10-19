import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { AppShell } from "./components/AppShell";
import { DevComponentsPage } from "./pages/DevComponentsPage";
import { validateNewTripSearch } from "./pages/newTrip/search";
import { validateProposalsSearch } from "./pages/proposals/search";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { validateTripEditorSearch } from "./pages/tripEditor/search";
import { TripListPage } from "./pages/tripList/TripListPage";

// Each screen owns its folder in pages/, including its search params.
// Screens with a map load lazily: MapLibre is large.

const rootRoute = createRootRoute({
  component: AppShell,
});

const tripListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TripListPage,
});

const newTripRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/new",
  validateSearch: validateNewTripSearch,
  component: lazyRouteComponent(
    () => import("./pages/newTrip/NewTripPage"),
    "NewTripPage",
  ),
});

const proposalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proposals",
  validateSearch: validateProposalsSearch,
  component: lazyRouteComponent(
    () => import("./pages/proposals/ProposalsPage"),
    "ProposalsPage",
  ),
});

const tripEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trips/$tripId",
  validateSearch: validateTripEditorSearch,
  component: lazyRouteComponent(
    () => import("./pages/tripEditor/TripEditorPage"),
    "TripEditorPage",
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/map",
  component: lazyRouteComponent(() => import("./pages/MapPage"), "MapPage"),
});

const devComponentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/components",
  component: DevComponentsPage,
});

const routeTree = rootRoute.addChildren([
  tripListRoute,
  newTripRoute,
  proposalsRoute,
  tripEditorRoute,
  settingsRoute,
  mapRoute,
  devComponentsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
