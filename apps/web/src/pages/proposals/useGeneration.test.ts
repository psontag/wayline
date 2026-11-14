import type { Proposal } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { mergeProposals } from "./useGeneration";

const proposal = (id: string, rank: number, score = 0) =>
  ({ id, rank: [rank], score }) as Proposal;

describe("mergeProposals", () => {
  it("adds each found proposal in rank order", () => {
    let shown: Proposal[] = [];
    for (const p of [proposal("a", 2), proposal("b", 0), proposal("c", 1)]) {
      shown = mergeProposals(shown, [p], false);
    }
    expect(shown.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps the best three of several requests", () => {
    const shown = mergeProposals(
      [proposal("a", 0, 1), proposal("b", 1, 4)],
      [proposal("c", 0, 3), proposal("d", 1, 2)],
      true,
    );
    expect(shown.map((p) => p.id)).toEqual(["b", "c", "d"]);
  });
});
