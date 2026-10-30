import type { Proposal } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { routeColorKey } from "./routeColor";

const proposal = (flavour?: string) =>
  ({ id: "p", ...(flavour && { flavour }) }) as unknown as Proposal;

describe("routeColorKey", () => {
  it("uses the index without a flavour", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => routeColorKey(proposal(), i))).toEqual(
      ["best", "nature", "flat", "hilly", "sights", "best"],
    );
  });

  it("uses the flavour when there is one", () => {
    expect(routeColorKey(proposal("hilly"), 0)).toBe("hilly");
  });

  it("ignores an unknown flavour", () => {
    expect(routeColorKey(proposal("wine"), 2)).toBe("flat");
  });
});
