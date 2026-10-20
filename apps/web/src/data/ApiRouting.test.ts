import { isErrorCode, type LonLat, RouteRequest } from "@wayline/domain";
import { fakeBrouterLeg } from "@wayline/providers";
import { describe, expect, it } from "vitest";
import { createApiClient } from "./apiClient";
import { ApiRouting } from "./ApiRouting";

const points: LonLat[] = [
  [10.89, 49.89],
  [10.95, 49.8],
  [11.0, 49.75],
  [11.05, 49.72],
  [11.0, 49.6],
];

function stub(answer: (body: RouteRequest) => Response) {
  let open = 0;
  let maxOpen = 0;
  const urls: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    urls.push(req.url);
    open++;
    maxOpen = Math.max(maxOpen, open);
    await new Promise((r) => setTimeout(r, 5));
    open--;
    return answer(RouteRequest.parse(await req.json()));
  };
  return { fetch, urls, maxOpen: () => maxOpen };
}

describe("ApiRouting", () => {
  it("routes each leg through /api/route, at most 3 at once", async () => {
    const api = stub(({ from, to, profile }) =>
      Response.json(fakeBrouterLeg(from, to, profile)),
    );
    const routing = new ApiRouting(createApiClient("http://w", api.fetch));
    const legs = await routing.route(points, { profile: "scenic" });
    expect(legs).toHaveLength(4);
    legs.forEach((leg, i) => {
      expect(leg.from).toEqual(points[i]);
      expect(leg.to).toEqual(points[i + 1]);
      expect(leg.profileHash).toBe("fake-scenic");
      expect(leg.distance).toBeGreaterThan(0);
    });
    expect(api.urls.every((u) => u === "http://w/api/route")).toBe(true);
    expect(api.maxOpen()).toBe(3);
  });

  it("turns API errors into WaylineErrors", async () => {
    const api = stub(() =>
      Response.json(
        { code: "INVALID", message: "BRouter: datafile E20_N60.rd5 not found" },
        { status: 400 },
      ),
    );
    const routing = new ApiRouting(createApiClient("http://w", api.fetch));
    const error = await routing
      .route([points[0]!, [20, 60]], { profile: "touring" })
      .catch((e) => e);
    expect(isErrorCode(error, "INVALID")).toBe(true);
    expect(error.message).toContain("E20_N60");
  });
});
