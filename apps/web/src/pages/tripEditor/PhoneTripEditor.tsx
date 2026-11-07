import { Link } from "@tanstack/react-router";
import {
  addDays,
  localTimeToDate,
  tripStats,
  type LonLat,
  type Place,
  type Trip,
} from "@wayline/domain";
import {
  BottomSheet,
  FloatingButton,
  FloatingTitle,
  Menu,
  MenuItem,
  SHEET_PEEK,
  type SheetSnap,
  useFormat,
} from "@wayline/ui";
import {
  ChevronLeft,
  Download,
  Ellipsis,
  Redo2,
  Share2,
  Undo2,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadTripGpx } from "../../data/gpx";
import {
  type MapAlternative,
  type MapPadding,
  type RouteEditing,
  TripMap,
  type TripMapProps,
} from "./TripMap";
import type { TripEditorState } from "./useTripEditor";

// The sheet's rounded corners overlap the map, so the map shows through them.
const SHEET_RADIUS = 16;

export type PhoneTripEditorProps = {
  trip: Trip;
  editor: TripEditorState;
  selected: number;
  /** The map shows the whole trip, not the selected day. */
  overview: boolean;
  onSelect: (index: number) => void;
  alternatives: MapAlternative[];
  onPickAlternative: (place: Place) => void;
  hover?: LonLat;
  /** Trip or day level, the same as the desktop side panel. */
  panel: ReactNode;
  /** Elevation or weather, in the sheet. */
  chart: ReactNode;
  /** Layers the user can turn on and off, and the weather. */
  mapLayers: Pick<TripMapProps, "stations" | "network" | "weather" | "layers">;
  /** Route edits of the selected stage. */
  route?: RouteEditing;
  /** The note after an edit. */
  toast: ReactNode;
  /** Opens the share dialog. Only for the owner of a trip on the server. */
  onShare?: () => void;
};

/** Phone layout: full-screen map, floating header and a bottom sheet. */
export function PhoneTripEditor({
  trip,
  editor,
  selected,
  overview,
  onSelect,
  alternatives,
  onPickAlternative,
  hover,
  panel,
  chart,
  mapLayers,
  route,
  toast,
  onShare,
}: PhoneTripEditorProps) {
  const { t } = useTranslation("tripEditor");
  const [snap, setSnap] = useState<SheetSnap>("half");
  // Opening a day or the trip shows it on the map above the sheet.
  const level = overview ? -1 : selected;
  const [shownLevel, setShownLevel] = useState(level);
  if (level !== shownLevel) {
    setShownLevel(level);
    setSnap("half");
  }

  // Fit the trip or the day into the part of the map above the half-open
  // sheet.
  const padding = useMemo<MapPadding>(() => {
    const half = Math.round(innerHeight * 0.56) - SHEET_PEEK + SHEET_RADIUS;
    return { top: 80, right: 48, bottom: half + 24, left: 48 };
  }, []);

  return (
    <div className="relative flex-1 overflow-hidden bg-bg">
      <div
        className="absolute inset-x-0 top-0"
        style={{ bottom: SHEET_PEEK - SHEET_RADIUS }}
      >
        <TripMap
          trip={trip}
          selected={selected}
          overview={overview}
          onSelect={onSelect}
          {...mapLayers}
          alternatives={alternatives}
          onPickAlternative={onPickAlternative}
          hover={hover}
          route={route}
          padding={padding}
          controls={false}
        >
          <div className="absolute inset-x-3 top-16 z-toast flex justify-center">
            {toast}
          </div>
        </TripMap>
      </div>
      <PhoneHeader trip={trip} editor={editor} onShare={onShare} />
      <BottomSheet snap={snap} onSnapChange={setSnap} label={t("phone.sheet")}>
        {/* Bottom padding: at full height the lowest part of the sheet is
            off screen. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto pb-24">
          {panel}
          <div className="p-4">{chart}</div>
        </div>
      </BottomSheet>
    </div>
  );
}

function PhoneHeader({
  trip,
  editor,
  onShare,
}: {
  trip: Trip;
  editor: TripEditorState;
  onShare?: () => void;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const distance = format.distance(tripStats(trip.stages).distance);
  const days = trip.stages.length;
  const dates = trip.startDate
    ? format.dateRange(
        localTimeToDate(trip.startDate),
        localTimeToDate(addDays(trip.startDate, days - 1)),
      )
    : t("summary.stageCount", { count: days });

  return (
    <div className="absolute inset-x-3 top-3 z-panel flex items-center gap-2">
      <FloatingButton asChild label={t("backToList")}>
        <Link to="/">
          <ChevronLeft aria-hidden />
        </Link>
      </FloatingButton>
      <FloatingTitle
        title={trip.name}
        subtitle={
          editor.readOnly
            ? t("phone.sharedSubtitle", { owner: trip.owner })
            : t("phone.subtitle", { dates, distance })
        }
      />
      {!editor.readOnly && (
        <>
          <FloatingButton
            label={t("header.undo")}
            disabled={!editor.canUndo}
            onClick={editor.undo}
          >
            <Undo2 aria-hidden />
          </FloatingButton>
          <FloatingButton
            label={t("header.redo")}
            disabled={!editor.canRedo}
            onClick={editor.redo}
          >
            <Redo2 aria-hidden />
          </FloatingButton>
        </>
      )}
      <Menu
        trigger={
          <FloatingButton label={t("phone.more")}>
            <Ellipsis aria-hidden />
          </FloatingButton>
        }
      >
        {onShare && (
          <MenuItem icon={<Share2 aria-hidden />} onSelect={onShare}>
            {t("header.share")}
          </MenuItem>
        )}
        <MenuItem
          icon={<Download aria-hidden />}
          onSelect={() => downloadTripGpx(trip)}
        >
          {t("header.exportGpx")}
        </MenuItem>
      </Menu>
    </div>
  );
}
