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
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AppShell() {
  const { t } = useTranslation();
  // The trip editor and the proposals have their own top bar.
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const ownTopBar =
    !!matchRoute({ to: "/trips/$tripId" }) ||
    !!matchRoute({ to: "/proposals" });
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
          <div className="flex items-center gap-1">
            <IconButton
              label={t("nav.settings")}
              icon={<Settings aria-hidden />}
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
