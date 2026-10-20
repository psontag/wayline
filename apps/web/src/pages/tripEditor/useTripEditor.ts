import type { Hotel, LonLat, Place, Trip } from "@wayline/domain";
import type { HotelOption } from "@wayline/providers";
import { type SaveState, useFormat } from "@wayline/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSaveTrip } from "../../data/queries";
import { useServices } from "../../data/ServicesProvider";
import { moveStop, setHotel, setLocked } from "./edits";

export type EditorNote = { id: number; message: string };

export function toHotel({ osmId, name, coord, stars, website }: HotelOption) {
  const hotel: Hotel = { osmId, name, coord };
  if (stars) hotel.stars = stars;
  if (website) hotel.website = website;
  return hotel;
}

/**
 * Edits of a trip with undo and redo. Every edit saves right away.
 * Read-only for trips shared with the user.
 */
export function useTripEditor(trip: Trip, readOnly = false) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const { routing, lodging } = useServices();
  const save = useSaveTrip();
  const [past, setPast] = useState<Trip[]>([]);
  const [future, setFuture] = useState<Trip[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<EditorNote>();

  const canEdit = !readOnly && !busy && !save.isPending;
  const saveState: SaveState =
    save.isPending || busy ? "saving" : save.isError ? "error" : "saved";

  // Edits start from the latest saved trip, so updatedAt always matches.
  const commit = (next: Trip, message?: string) => {
    setPast((p) => [...p.slice(-49), trip]);
    setFuture([]);
    save.mutate(next);
    if (message) setNote({ id: Date.now(), message });
  };

  const restore = (target: Trip) =>
    save.mutate({ ...target, updatedAt: trip.updatedAt });

  return {
    readOnly,
    canEdit,
    saveState,
    note,
    clearNote: () => setNote(undefined),
    canUndo: canEdit && past.length > 0,
    canRedo: canEdit && future.length > 0,
    undo() {
      const prev = past.at(-1);
      if (!prev || !canEdit) return;
      setPast(past.slice(0, -1));
      setFuture([...future, trip]);
      setNote(undefined);
      restore(prev);
    },
    redo() {
      const next = future.at(-1);
      if (!next || !canEdit) return;
      setFuture(future.slice(0, -1));
      setPast([...past, trip]);
      restore(next);
    },
    rename(name: string) {
      if (canEdit) commit({ ...trip, name });
    },
    setStartDate(startDate: string) {
      if (canEdit) commit({ ...trip, startDate });
    },
    setLocked(index: number, locked: boolean) {
      if (canEdit) commit(setLocked(trip, index, locked));
    },
    setHotel(index: number, hotel: Hotel) {
      if (canEdit) commit(setHotel(trip, index, hotel));
    },
    async moveStop(index: number, place: Place) {
      if (!canEdit) return;
      setBusy(true);
      try {
        const next = await moveStop(trip, index, place, {
          route: (points: LonLat[]) =>
            routing.route(points, { profile: trip.settings.profile }),
          nearestHotel: async (coord) => {
            const [nearest] = await lodging.hotelsNear(coord, { limit: 1 });
            return nearest && toHotel(nearest);
          },
        });
        const after = next.stages[index + 1];
        commit(
          next,
          after
            ? t("note.nextStage", {
                day: index + 2,
                place: place.name,
                distance: format.distance(after.stats.distance),
              })
            : t("note.lastStage", { day: index + 1, place: place.name }),
        );
      } finally {
        setBusy(false);
      }
    },
  };
}

export type TripEditorState = ReturnType<typeof useTripEditor>;
