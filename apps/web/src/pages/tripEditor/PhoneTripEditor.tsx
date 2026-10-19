import { Link } from "@tanstack/react-router";
import {
  addDays,
  localTimeToDate,
  tripStats,
  type LonLat,
  type Place,
  type RouteNetwork,
  type Trip,
} from "@wayline/domain";
import {
  BottomSheet,
  FloatingButton,
  FloatingTitle,
  SHEET_PEEK,
  type SheetSnap,
  useFormat,
} from "@wayline/ui";
import { ChevronLeft, Download } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadTripGpx } from "../../data/gpx";
import { PhoneStageSheet } from "./PhoneStageSheet";
import { PhoneStopSheet } from "./PhoneStopSheet";
import { type MapAlternative, type MapPadding, TripMap } from "./TripMap";
import type { TripEditorState } from "./useTripEditor";

// The sheet's rounded corners overlap the map, so the map shows through them.
const SHEET_RADIUS = 16;

export type PhoneTripEditorProps = {
  trip: Trip;
  editor: TripEditorState;
  selected: number;
  onSelect: (index: number) => void;
  network?: RouteNetwork;
  alternatives: MapAlternative[];
  onPickAlternative: (place: Place) => void;
  hoverKm?: number;
  onHoverKm: (km: number | undefined) => void;
  hover?: LonLat;
  /** The note after an edit. */
  toast: ReactNode;
};

/** Phone layout: full-screen map, floating header and a bottom sheet. */
export function PhoneTripEditor({
  trip,
  editor,
  selected,
  onSelect,
  network,
  alternatives,
  onPickAlternative,
  hoverKm,
  onHoverKm,
  hover,
  toast,
}: PhoneTripEditorProps) {
  const { t } = useTranslation("tripEditor");
  const [snap, setSnap] = useState<SheetSnap>("half");
  const [stopOpen, setStopOpen] = useState(false);

  // Fit the trip into the part of the map above the half-open sheet.
  const padding = useMemo<MapPadding>(() => {
    const half = Math.round(innerHeight * 0.56) - SHEET_PEEK + SHEET_RADIUS;
    return { top: 80, right: 112, bottom: half + 24, left: 48 };
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
          onSelect={onSelect}
          alternatives={alternatives}
          onPickAlternative={onPickAlternative}
          hover={hover}
          padding={padding}
          controls={false}
        >
          <div className="absolute inset-x-3 top-16 z-toast flex justify-center">
            {toast}
          </div>
        </TripMap>
      </div>
      <PhoneHeader trip={trip} />
      <BottomSheet snap={snap} onSnapChange={setSnap} label={t("phone.sheet")}>
        <PhoneStageSheet
          trip={trip}
          selected={selected}
          onSelect={onSelect}
          network={network}
          hoverKm={hoverKm}
          onHoverKm={onHoverKm}
          onOpenStop={() => setStopOpen(true)}
        />
      </BottomSheet>
      <PhoneStopSheet
        trip={trip}
        index={selected}
        editor={editor}
        open={stopOpen}
        onOpenChange={setStopOpen}
      />
    </div>
  );
}

function PhoneHeader({ trip }: { trip: Trip }) {
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
        subtitle={t("phone.subtitle", { dates, distance })}
      />
      <FloatingButton
        variant="accent"
        label={t("header.exportGpx")}
        onClick={() => downloadTripGpx(trip)}
      >
        <Download aria-hidden />
      </FloatingButton>
    </div>
  );
}
