import { Link } from "@tanstack/react-router";
import { addDays, localTimeToDate, type TripSummary } from "@wayline/domain";
import {
  Badge,
  ConfirmDialog,
  IconButton,
  Menu,
  MenuItem,
  TripCard,
  useFormat,
} from "@wayline/ui";
import { Copy, Ellipsis, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeleteTrip, useDuplicateTrip } from "../../data/queries";

export function TripListItem({ trip }: { trip: TripSummary }) {
  const { t } = useTranslation("tripList");
  const format = useFormat();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const duplicateTrip = useDuplicateTrip();
  const deleteTrip = useDeleteTrip();

  const date = (iso: string) => format.date(localTimeToDate(`${iso}T00:00`));
  const dates = !trip.startDate
    ? t("noDate")
    : trip.stageCount > 1
      ? t("dateRange", {
          start: date(trip.startDate),
          end: date(addDays(trip.startDate, trip.stageCount - 1)),
        })
      : date(trip.startDate);
  const values = {
    distance: format.distance(trip.stats.distance),
    ascent: format.elevation(trip.stats.ascent),
    count: trip.stageCount,
  };
  const stats =
    trip.stageCount > 1 ? t("statsWithStages", values) : t("stats", values);

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
        preview={trip.preview}
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
            <MenuItem
              icon={<Trash2 aria-hidden />}
              tone="danger"
              onSelect={() => setConfirmDelete(true)}
            >
              {t("delete")}
            </MenuItem>
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
