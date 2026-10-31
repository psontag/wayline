import {
  Link,
  Outlet,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import {
  Button,
  cn,
  focusRing,
  IconButton,
  Logo,
  ThemeToggle,
  TopBar,
  TopBarSpacer,
} from "@wayline/ui";
import { Plus, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIsPhone } from "./useIsPhone";

export function AppShell() {
  const { t } = useTranslation();
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  // On phones the trip editor is a full-screen map with floating controls.
  const fullScreen = isPhone && !!matchRoute({ to: "/trips/$tripId" });
  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      {!fullScreen && (
        <TopBar>
          <Link
            to="/"
            aria-label={t("app.name")}
            className={cn("rounded-sm", focusRing)}
          >
            <Logo />
          </Link>
          <nav aria-label={t("nav.label")} className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
              <Link to="/" activeOptions={{ exact: true }}>
                {t("nav.trips")}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/new">
                <Plus aria-hidden />
                {t("nav.newTrip")}
              </Link>
            </Button>
          </nav>
          <TopBarSpacer />
          <div className="flex items-center gap-1">
            <IconButton
              label={t("nav.settings")}
              icon={<Settings aria-hidden />}
              aria-current={
                matchRoute({ to: "/settings" }) ? "page" : undefined
              }
              onClick={() => void navigate({ to: "/settings" })}
            />
            <ThemeToggle />
          </div>
        </TopBar>
      )}
      <main className="flex min-h-0 flex-1 flex-col overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
