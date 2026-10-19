import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  Button,
  cn,
  focusRing,
  Logo,
  ThemeToggle,
  TopBar,
  TopBarSpacer,
} from "@wayline/ui";
import { useTranslation } from "react-i18next";

export function AppShell() {
  const { t } = useTranslation();
  // The trip editor has its own top bar.
  const ownTopBar = !!useMatchRoute()({ to: "/trips/$tripId" });
  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      {!ownTopBar && (
        <TopBar>
          <Link
            to="/"
            aria-label={t("app.name")}
            className={cn("rounded-sm", focusRing)}
          >
            <Logo />
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/map">{t("nav.map")}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/dev/components">{t("nav.components")}</Link>
            </Button>
          </nav>
          <TopBarSpacer />
          <ThemeToggle />
        </TopBar>
      )}
      <main className="flex min-h-0 flex-1 flex-col overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
