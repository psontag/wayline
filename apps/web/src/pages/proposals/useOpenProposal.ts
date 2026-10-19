import type { Proposal } from "@wayline/domain";
import { useMutation } from "@tanstack/react-query";
import { useSaveTrip } from "../../data/queries";
import { useServices } from "../../data/ServicesProvider";

// Trips saved from proposals, so opening one again shows the same trip.
const savedTrips = new Map<string, string>();

/** Saves the proposal as a trip and returns the trip id. */
export function useOpenProposal() {
  const { trips } = useServices();
  const save = useSaveTrip();
  return useMutation({
    mutationFn: async (proposal: Proposal) => {
      const known = savedTrips.get(proposal.id);
      if (known) {
        const exists = await trips.get(known).then(
          () => true,
          () => false,
        );
        if (exists) return known;
      }
      const now = new Date().toISOString();
      const saved = await save.mutateAsync({
        ...proposal.trip,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
      savedTrips.set(proposal.id, saved.id);
      return saved.id;
    },
  });
}
