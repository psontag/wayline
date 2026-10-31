import { useNavigate } from "@tanstack/react-router";
import { localTimeToDate, type Trip } from "@wayline/domain";
import {
  Badge,
  Button,
  DateButton,
  IconButton,
  InlineEdit,
  Menu,
  MenuItem,
  MenuSeparator,
  SaveStatus,
  PageBar,
  TopBarSpacer,
  useFormat,
} from "@wayline/ui";
import {
  Copy,
  Download,
  EllipsisVertical,
  Eye,
  Pencil,
  Redo2,
  Share2,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeleteTrip, useDuplicateTrip } from "../../data/queries";
import { downloadTripGpx } from "../../data/gpx";
import type { TripEditorState } from "./useTripEditor";

/** Bar of the trip editor: name, date, save state and trip actions. */
export function TripHeader({
  trip,
  editor,
  canShare,
  onShare,
}: {
  trip: Trip;
  editor: TripEditorState;
  /** Only with trips on the server. */
  canShare: boolean;
  onShare: () => void;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const navigate = useNavigate();
  const duplicate = useDuplicateTrip();
  const remove = useDeleteTrip();
  const [renaming, setRenaming] = useState(false);
  const from = trip.stages[0]?.start.name ?? "";
  const to = trip.stages.at(-1)?.end.name ?? "";

  return (
    <PageBar>
      <div className="flex min-w-0 flex-col">
        {renaming ? (
          <InlineEdit
            value={trip.name}
            aria-label={t("header.renameLabel")}
            onCommit={(name) => {
              editor.rename(name);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <h1 className="truncate text-md font-bold">{trip.name}</h1>
        )}
        <span className="truncate text-xs text-text-muted">
          {t("header.subtitle", { kind: t(`kind.${trip.kind}`), from, to })}
        </span>
      </div>
      <div className="hidden md:block">
        <DateButton
          value={trip.startDate}
          onChange={editor.setStartDate}
          disabled={!editor.canEdit}
          aria-label={t("header.startDate")}
        >
          {trip.startDate
            ? t("header.startDateValue", {
                date: format.date(localTimeToDate(trip.startDate)),
                time: trip.settings.startTime,
              })
            : t("header.setStartDate")}
        </DateButton>
      </div>
      <TopBarSpacer />
      {editor.readOnly ? (
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <span className="truncate text-sm text-text-muted">
            {t("header.sharedBy", { owner: trip.owner })}
          </span>
          <Badge size="md">
            <Eye className="mr-1 size-3.5" aria-hidden />
            {t("header.viewOnly")}
          </Badge>
        </div>
      ) : (
        <>
          <div className="hidden sm:block">
            <SaveStatus state={editor.saveState} />
          </div>
          <div className="hidden gap-1 md:flex">
            <IconButton
              size="sm"
              label={t("header.undo")}
              icon={<Undo2 aria-hidden />}
              disabled={!editor.canUndo}
              onClick={editor.undo}
            />
            <IconButton
              size="sm"
              label={t("header.redo")}
              icon={<Redo2 aria-hidden />}
              disabled={!editor.canRedo}
              onClick={editor.redo}
            />
          </div>
          <div className="hidden md:block">
            <Button size="sm" disabled={!canShare} onClick={onShare}>
              <Share2 aria-hidden />
              {t("header.share")}
            </Button>
          </div>
        </>
      )}
      <Button variant="primary" size="sm" onClick={() => downloadTripGpx(trip)}>
        <Download aria-hidden />
        <span className="hidden sm:inline">{t("header.exportGpx")}</span>
      </Button>
      <Menu
        trigger={
          <IconButton
            size="sm"
            label={t("header.menu")}
            icon={<EllipsisVertical aria-hidden />}
          />
        }
      >
        {!editor.readOnly && (
          <MenuItem
            icon={<Pencil aria-hidden />}
            disabled={!editor.canEdit}
            onSelect={() => setRenaming(true)}
          >
            {t("header.rename")}
          </MenuItem>
        )}
        <MenuItem
          icon={<Copy aria-hidden />}
          onSelect={() =>
            duplicate.mutate(
              { id: trip.id, name: t("header.copyName", { name: trip.name }) },
              {
                onSuccess: (copy) =>
                  void navigate({
                    to: "/trips/$tripId",
                    params: { tripId: copy.id },
                  }),
              },
            )
          }
        >
          {t("header.duplicate")}
        </MenuItem>
        {!editor.readOnly && (
          <>
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 aria-hidden />}
              tone="danger"
              onSelect={() => {
                if (!confirm(t("header.deleteConfirm", { name: trip.name }))) {
                  return;
                }
                remove.mutate(trip.id, {
                  onSuccess: () => void navigate({ to: "/" }),
                });
              }}
            >
              {t("header.delete")}
            </MenuItem>
          </>
        )}
      </Menu>
    </PageBar>
  );
}
