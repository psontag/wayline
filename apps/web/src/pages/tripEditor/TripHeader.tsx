import { useNavigate } from "@tanstack/react-router";
import type { Trip } from "@wayline/domain";
import {
  Badge,
  Button,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  SaveStatus,
} from "@wayline/ui";
import {
  Copy,
  Download,
  Ellipsis,
  Eye,
  Pencil,
  Redo2,
  Share2,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TopBarActions } from "../../components/TopBarSlot";
import { useDeleteTrip, useDuplicateTrip } from "../../data/queries";
import { downloadTripGpx } from "../../data/gpx";
import type { TripEditorState } from "./useTripEditor";

/** Save state and trip actions, in the app top bar. */
export function TripActions({
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

  return (
    <TopBarActions>
      {editor.readOnly ? (
        <div className="flex min-w-0 items-center gap-2">
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
          <SaveStatus state={editor.saveState} />
          <div className="flex gap-1">
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
          <Button size="sm" disabled={!canShare} onClick={onShare}>
            <Share2 aria-hidden />
            {t("header.share")}
          </Button>
        </>
      )}
      <Button variant="primary" size="sm" onClick={() => downloadTripGpx(trip)}>
        <Download aria-hidden />
        {t("header.exportGpx")}
      </Button>
    </TopBarActions>
  );
}

/** Rename, duplicate and delete, next to the trip name in the panel. */
export function TripMenu({
  trip,
  editor,
  onRename,
}: {
  trip: Trip;
  editor: TripEditorState;
  onRename: () => void;
}) {
  const { t } = useTranslation("tripEditor");
  const navigate = useNavigate();
  const duplicate = useDuplicateTrip();
  const remove = useDeleteTrip();

  return (
    <Menu
      trigger={
        <IconButton
          size="sm"
          label={t("header.menu")}
          icon={<Ellipsis aria-hidden />}
        />
      }
    >
      {!editor.readOnly && (
        <MenuItem
          icon={<Pencil aria-hidden />}
          disabled={!editor.canEdit}
          onSelect={onRename}
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
  );
}
