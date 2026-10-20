import { Link } from "@tanstack/react-router";
import type { GenerateRequest } from "@wayline/domain";
import {
  Badge,
  Button,
  cn,
  focusRing,
  Logo,
  TextLink,
  TopBar,
  TopBarSpacer,
  useFormat,
} from "@wayline/ui";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Top bar with the search inputs and a way back to change them. */
export function ProposalsHeader({ request }: { request?: GenerateRequest }) {
  const { t } = useTranslation("proposals");
  const format = useFormat();
  const from = request?.startStation?.name;
  const to = request?.endStation?.name;
  const places =
    request && request.kind !== "one-way"
      ? from && t("request.loopFrom", { from })
      : from && to && t("request.places", { from, to });

  const chips = request
    ? [
        t(`request.kind.${request.kind}`),
        ...(places ? [places] : []),
        t("request.days", { count: request.days }),
        ...(request.dayShares?.some((share) => share < 1)
          ? [t("request.shortDays")]
          : []),
        t(request.days === 1 ? "request.distance" : "request.kmPerDay", {
          distance: format.distance(request.kmPerDay * 1000),
        }),
        t("request.maxAscent", {
          ascent: format.elevation(request.maxAscentPerDay),
        }),
        t(`request.profile.${request.profile}`),
        ...(request.theme ? [t(`request.theme.${request.theme}`)] : []),
      ]
    : [];

  return (
    <TopBar>
      <Link
        to="/"
        aria-label={t("backToList")}
        className={cn("rounded-sm", focusRing)}
      >
        <Logo />
      </Link>
      <div className="hidden h-6 w-px bg-border sm:block" />
      <TextLink asChild className="font-semibold">
        <Link to="/new" search={request ? { request } : {}}>
          <ChevronLeft aria-hidden />
          {t("newTrip")}
        </Link>
      </TextLink>
      <h1 className="text-md font-bold">{t("title")}</h1>
      <TopBarSpacer />
      {chips.length > 0 && (
        <ul
          aria-label={t("request.label")}
          className="hidden flex-wrap justify-end gap-1.5 lg:flex"
        >
          {chips.map((chip) => (
            <li key={chip}>
              <Badge size="md">{chip}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Button asChild size="sm">
        <Link to="/new" search={request ? { request } : {}}>
          {t("edit")}
        </Link>
      </Button>
    </TopBar>
  );
}
