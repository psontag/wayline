import { Link } from "@tanstack/react-router";
import { Button, MessagePanel } from "@wayline/ui";
import {
  CircleAlert,
  LogIn,
  MapPinOff,
  RefreshCw,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { type ErrorKind, useErrorText } from "../errors";

const icons: Record<ErrorKind, LucideIcon> = {
  PROVIDER_UNAVAILABLE: CircleAlert,
  RATE_LIMITED: CircleAlert,
  NOT_FOUND: MapPinOff,
  CONFLICT: RefreshCw,
  INVALID: CircleAlert,
  UNAUTHORIZED: LogIn,
  OFFLINE: WifiOff,
  INTERNAL: CircleAlert,
  UPDATE: RefreshCw,
};

export type ErrorPanelProps = {
  error: unknown;
  /** Replaces the title, e.g. "Could not load your trips". */
  title?: string;
  /** What could not be reached, e.g. "the router". */
  thing?: string;
  /** Runs for Try again and Reload. Without it, the page reloads. */
  onRetry?: () => void;
};

/** A panel or screen that could not show its content. */
export function ErrorPanel({ error, title, thing, onRetry }: ErrorPanelProps) {
  const text = useErrorText()(error, thing);
  const Icon = icons[text.kind];
  const retry = onRetry ?? (() => location.reload());
  return (
    <div role="alert">
      <MessagePanel
        icon={<Icon aria-hidden />}
        title={title ?? text.title}
        text={title ? `${text.title}. ${text.text}` : text.text}
        actions={
          text.action === "back" ? (
            <BackToTrips />
          ) : (
            <Button
              variant="primary"
              onClick={
                text.action === "login" ? () => location.reload() : retry
              }
            >
              {text.actionLabel}
            </Button>
          )
        }
      />
    </div>
  );
}

function BackToTrips() {
  const { t } = useTranslation("common");
  return (
    <Button asChild variant="primary">
      <Link to="/">{t("errors.action.back")}</Link>
    </Button>
  );
}

/** An ErrorPanel that fills a screen. Used by the router. */
export function ErrorScreen(props: ErrorPanelProps) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <ErrorPanel {...props} />
    </div>
  );
}

/** Shown for a URL that leads nowhere. */
export function NotFoundScreen() {
  const { t } = useTranslation("common");
  return (
    <div className="mx-auto w-full max-w-sm">
      <MessagePanel
        icon={<MapPinOff aria-hidden />}
        title={t("errors.pageNotFound.title")}
        text={t("errors.pageNotFound.text")}
        actions={<BackToTrips />}
      />
    </div>
  );
}
