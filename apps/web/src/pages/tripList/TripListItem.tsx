import { Link } from "@tanstack/react-router";
import { addDays, localTimeToDate, type TripSummary } from "@wayline/domain";
import {
  Badge,
  ConfirmDialog,
  IconButton,
  Menu,
  MenuItem,
  Stat,
  TripCard,
  useFormat,
} from "@wayline/ui";
import { Copy, Ellipsis, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMapSnapshot } from "../../components/map/mapSnapshot";
import { useDeleteTrip, useDuplicateTrip } from "../../data/queries";

export function TripListItem({ trip }: { trip: TripSummary }) {
  const { t } = useTranslation("tripList");
  const format = useFormat();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const duplicateTrip = useDuplicateTrip();
  const deleteTrip = useDeleteTrip();
  const map = useMapSnapshot(trip.preview);

  const date = (iso: string) => format.date(localTimeToDate(`${iso}T00:00`));
  const dates = !trip.startDate
    ? t("noDate")
    : trip.stageCount > 1
      ? t("dateRange", {
          start: date(trip.startDate),
          end: date(addDays(trip.startDate, trip.stageCount - 1)),
        })
      : date(trip.startDate);
  const stats = (
    <>
      <Stat
        size="sm"
        icon="distance"
        value={format.distance(trip.stats.distance)}
        label={t("stat.distance")}
      />
      <Stat
        size="sm"
        icon="ascent"
        value={format.elevation(trip.stats.ascent)}
        label={t("stat.ascent")}
      />
      {trip.stageCount > 1 && (
        <Stat
          size="sm"
          icon="dates"
          value={t("stat.stageCount", { count: trip.stageCount })}
          label={t("stat.stages")}
        />
      )}
    </>
  );

  return (
    <>
      <TripCard
        title={
          <Link to="/trips/$tripId" params={{ tripId: trip.id }}>
            {trip.name}
          </Link>
        }
        badge={<Badge>{t(`kind.${trip.kind}`)}</Badge>}
        dates={dates}
        stats={stats}
        byline={
          trip.shared && (
            <>
              <Users aria-hidden />
              <span className="truncate">
                {t("sharedBy", { owner: trip.owner })}
              </span>
            </>
          )
        }
        preview={trip.preview}
        map={map}
        actions={
          <Menu
            trigger={
              <IconButton
                size="sm"
                label={t("actions")}
                icon={<Ellipsis aria-hidden />}
              />
            }
          >
            <MenuItem
              icon={<Copy aria-hidden />}
              onSelect={() =>
                duplicateTrip.mutate({
                  id: trip.id,
                  name: t("copyName", { name: trip.name }),
                })
              }
            >
              {t("duplicate")}
            </MenuItem>
            {!trip.shared && (
              <MenuItem
                icon={<Trash2 aria-hidden />}
                tone="danger"
                onSelect={() => setConfirmDelete(true)}
              >
                {t("delete")}
              </MenuItem>
            )}
          </Menu>
        }
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteDialog.title")}
        description={t("deleteDialog.text", { name: trip.name })}
        confirmLabel={t("deleteDialog.confirm")}
        tone="danger"
        onConfirm={() => deleteTrip.mutate(trip.id)}
      />
    </>
  );
}
