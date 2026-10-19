import type { Place, Profile, Stats } from "@wayline/domain";
import {
  Button,
  FormField,
  IconButton,
  MessagePanel,
  SegmentedControl,
  StatBlock,
  SurfaceBar,
  useFormat,
} from "@wayline/ui";
import { ArrowUpDown, Route, TriangleAlert } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { PlaceField } from "../newTrip/PlaceField";

const profiles: Profile[] = ["touring", "fast", "scenic", "quiet"];

export type RoutePanelProps = {
  places: Place[];
  from?: Place;
  to?: Place;
  onFrom: (place: Place) => void;
  onTo: (place: Place) => void;
  onSwap: () => void;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  stats?: Stats;
  updating: boolean;
  failed: boolean;
  onRetry: () => void;
};

/** Start, end, profile and the totals of the route. */
export function RoutePanel({
  places,
  from,
  to,
  onFrom,
  onTo,
  onSwap,
  profile,
  onProfile,
  stats,
  updating,
  failed,
  onRetry,
}: RoutePanelProps) {
  const { t } = useTranslation("route");
  const format = useFormat();
  const id = useId();

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-border p-4">
        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <FormField label={t("start")} htmlFor={`${id}-from`}>
              <PlaceField
                id={`${id}-from`}
                places={places}
                value={from ?? null}
                onChange={onFrom}
              />
            </FormField>
            <FormField label={t("end")} htmlFor={`${id}-to`}>
              <PlaceField
                id={`${id}-to`}
                places={places}
                value={to ?? null}
                onChange={onTo}
              />
            </FormField>
          </div>
          <div className="pb-6">
            <IconButton
              label={t("swap")}
              icon={<ArrowUpDown aria-hidden />}
              disabled={!from && !to}
              onClick={onSwap}
            />
          </div>
        </div>
        <p className="text-xs text-text-muted">{t("pointsHint")}</p>
        <FormField
          label={t("profile.label")}
          labelId={`${id}-profile`}
          hint={t(`profile.hint.${profile}`)}
        >
          <SegmentedControl
            aria-labelledby={`${id}-profile`}
            stretch
            value={profile}
            onValueChange={(v) => onProfile(v as Profile)}
            options={profiles.map((p) => ({
              value: p,
              label: t(`profile.${p}`),
            }))}
          />
        </FormField>
      </div>

      {failed && !updating ? (
        <MessagePanel
          icon={<TriangleAlert aria-hidden />}
          title={t("error.title")}
          text={t("error.text")}
          actions={<Button onClick={onRetry}>{t("error.retry")}</Button>}
        />
      ) : stats ? (
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="grid grid-cols-4 gap-2">
            <StatBlock
              value={format.distance(stats.distance)}
              label={t("stats.distance")}
            />
            <StatBlock
              value={format.elevation(stats.ascent)}
              label={t("stats.ascent")}
            />
            <StatBlock
              value={format.elevation(stats.descent)}
              label={t("stats.descent")}
            />
            <StatBlock
              value={format.percent(stats.surface.paved)}
              label={t("stats.paved")}
            />
          </div>
          <SurfaceBar shares={stats.surface} />
          <p role="status" className="min-h-4 text-xs text-text-muted">
            {updating ? t("updating") : ""}
          </p>
        </div>
      ) : (
        <MessagePanel
          icon={<Route aria-hidden />}
          title={t("empty.title")}
          text={updating ? t("updating") : t("empty.text")}
        />
      )}
    </>
  );
}
