import { Link } from "@tanstack/react-router";
import {
  addDays,
  type GenerateRequest,
  localTimeToDate,
} from "@wayline/domain";
import {
  Badge,
  Button,
  cn,
  focusRing,
  Logo,
  type StatIcon,
  statIcons,
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

  const date = (iso: string) => localTimeToDate(`${iso}T00:00`);
  const start = request?.startDate;
  const chips: { text: string; icon?: StatIcon }[] = request
    ? [
        { text: t(`request.kind.${request.kind}`) },
        ...(places ? [{ text: places }] : []),
        {
          icon: "dates" as const,
          text: start
            ? request.days > 1
              ? t("request.dates", {
                  dates: format.dateRange(
                    date(start),
                    date(addDays(start, request.days - 1)),
                  ),
                  count: request.days,
                })
              : t("request.date", { date: format.date(date(start)) })
            : t("request.days", { count: request.days }),
        },
        ...(request.dayShares?.some((share) => share < 1)
          ? [{ text: t("request.shortDays") }]
          : []),
        {
          icon: "distance" as const,
          text: t(
            request.days === 1 ? "request.distance" : "request.kmPerDay",
            { distance: format.distance(request.kmPerDay * 1000) },
          ),
        },
        {
          icon: "ascent" as const,
          text: t("request.maxAscent", {
            ascent: format.elevation(request.maxAscentPerDay),
          }),
        },
        { text: t(`request.profile.${request.profile}`) },
        ...(request.theme
          ? [{ text: t(`request.theme.${request.theme}`) }]
          : []),
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
          {chips.map(({ text, icon }) => {
            const Icon = icon && statIcons[icon];
            return (
              <li key={text}>
                <Badge size="md" className="gap-1">
                  {Icon && (
                    <Icon aria-hidden className="size-3.5 text-text-muted" />
                  )}
                  {text}
                </Badge>
              </li>
            );
          })}
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
