// Prints how proposals come out on fixed test trips, and writes a map per
// trip to report/out/index.html. Needs the built data. Run: pnpm report:trips
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  decodeLine,
  type GenerateRequest,
  type LonLat,
  type Proposal,
} from "@wayline/domain";
import { TiledNetworkSource } from "@wayline/providers";
import { readDataFile } from "@wayline/providers/testing";
import { it } from "vitest";
import { corridorShare } from "../src/generate/corridor";
import { Planners } from "../src/generate/generate";

const place = (name: string, coord: LonLat) => ({
  name,
  kind: "station" as const,
  coord,
});
const heidelberg = place("Heidelberg", [8.675, 49.403]);
const bamberg = place("Bamberg", [10.9, 49.9]);
const hamburg = place("Hamburg", [10.006, 53.553]);
const koeln = place("Köln", [6.959, 50.943]);
const berlin = place("Berlin", [13.369, 52.525]);
const freiburg = place("Freiburg", [7.841, 47.998]);
const garmisch = place("Garmisch", [11.096, 47.491]);

type Trip = [
  string,
  GenerateRequest["kind"],
  typeof bamberg,
  typeof bamberg | undefined,
  number,
  number,
  number,
];
const trips: Trip[] = [
  ["Loop Heidelberg 3×70", "multi-day-loop", heidelberg, undefined, 3, 70, 900],
  ["Loop Bamberg 3×60", "multi-day-loop", bamberg, undefined, 3, 60, 800],
  ["Loop Hamburg 3×70", "multi-day-loop", hamburg, undefined, 3, 70, 500],
  [
    "Loop Kassel 4×60",
    "multi-day-loop",
    place("Kassel", [9.447, 51.318]),
    undefined,
    4,
    60,
    1000,
  ],
  ["Loop Garmisch 3×60", "multi-day-loop", garmisch, undefined, 3, 60, 1000],
  [
    "Loop Rostock 5×70",
    "multi-day-loop",
    place("Rostock", [12.131, 54.078]),
    undefined,
    5,
    70,
    400,
  ],
  ["One-way Köln 4×70", "one-way", koeln, undefined, 4, 70, 800],
  [
    "One-way Leipzig 3×70",
    "one-way",
    place("Leipzig", [12.382, 51.345]),
    undefined,
    3,
    70,
    600,
  ],
  [
    "München to Passau 3×70",
    "one-way",
    place("München", [11.558, 48.14]),
    place("Passau", [13.45, 48.574]),
    3,
    70,
    800,
  ],
  ["Hamburg to Berlin 4×70", "one-way", hamburg, berlin, 4, 70, 500],
  [
    "Heidelberg to Heilbronn 3×60",
    "one-way",
    heidelberg,
    place("Heilbronn", [9.21866, 49.14229]),
    3,
    60,
    1000,
  ],
  ["Day loop Heidelberg 60", "day-loop", heidelberg, undefined, 1, 60, 700],
  ["Day loop Berlin 70", "day-loop", berlin, undefined, 1, 70, 300],
  ["Day loop Freiburg 50", "day-loop", freiburg, undefined, 1, 50, 800],
  ["Day loop Garmisch 50", "day-loop", garmisch, undefined, 1, 50, 800],
  ["Open ride Bamberg 80", "one-way", bamberg, undefined, 1, 80, 800],
  ["Open ride Köln 70", "one-way", koeln, undefined, 1, 70, 600],
  [
    "Würzburg to Bamberg 170",
    "one-way",
    place("Würzburg", [9.936, 49.802]),
    bamberg,
    1,
    170,
    1200,
  ],
  [
    "Köln to Bonn 45",
    "one-way",
    koeln,
    place("Bonn", [7.097, 50.732]),
    1,
    45,
    500,
  ],
];

const COLORS = [
  "#ff9a73",
  "#3fb37a",
  "#4f9ff0",
  "#a685ec",
  "#ee7fb4",
  "#d4a72c",
  "#2bb6b0",
  "#8a8f98",
];

function lineOf(p: Proposal): LonLat[] {
  return p.trip.stages.flatMap((s) =>
    s.legs.flatMap((leg) => decodeLine(leg.geometry)),
  );
}

function svg(lines: LonLat[][]): string {
  const all = lines.flat();
  const lons = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  const [west, east] = [Math.min(...lons), Math.max(...lons)];
  const [south, north] = [Math.min(...lats), Math.max(...lats)];
  const wide = (east - west) * 0.66;
  const scale = 300 / Math.max(wide, north - south, 0.01);
  const paths = lines.map((line, i) => {
    const d = line
      .filter((_, k) => k % 4 === 0)
      .map(
        (c) =>
          `${((c[0] - west) * 0.66 * scale).toFixed(1)},${((north - c[1]) * scale).toFixed(1)}`,
      )
      .join(" ");
    return `<polyline points="${d}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="2" opacity="0.8"/>`;
  });
  return `<svg width="320" height="320" viewBox="-10 -10 320 320" style="background:#fff;border:1px solid #ddd">${paths.join("")}</svg>`;
}

it("reports", { timeout: 900_000 }, async () => {
  const root = new URL("../../../apps/web/public/data/", import.meta.url);
  const latest = JSON.parse(
    await readFile(new URL("latest.json", root), "utf8"),
  );
  const planners = new Planners(
    new TiledNetworkSource(readDataFile, `/data/${latest.version}`),
  );
  const html: string[] = [];
  const tagged = new Map<string, number>();
  let total = 0;
  for (const [
    name,
    kind,
    startStation,
    endStation,
    days,
    kmPerDay,
    maxAscentPerDay,
  ] of trips) {
    const request: GenerateRequest = {
      kind,
      startStation,
      ...(endStation ? { endStation } : {}),
      days,
      kmPerDay,
      maxAscentPerDay,
      hotelBudget: "mid",
      startTime: "09:00",
    };
    const planner = await planners.for(request);
    const t = performance.now();
    const result = await planner.generate(request);
    const ms = performance.now() - t;
    const proposals = result.ok ? result.proposals : [];
    const lines = proposals.map(lineOf);
    let road = 0;
    let corridor = 0;
    for (const [i, a] of lines.entries()) {
      const ends = [a[0] as LonLat, a.at(-1) as LonLat];
      for (const b of lines.slice(0, i)) {
        road = Math.max(road, corridorShare(a, b, 0.2, ends, 5));
        corridor = Math.max(corridor, corridorShare(a, b, 2, ends, 5));
      }
    }
    const rows = proposals.map((p, i) => {
      const km = p.trip.stages.reduce((s, x) => s + x.stats.distance, 0) / 1000;
      const up = p.trip.stages.reduce((s, x) => s + x.stats.ascent, 0);
      for (const tag of p.tags ?? [])
        tagged.set(tag, (tagged.get(tag) ?? 0) + 1);
      total++;
      return `${i + 1} ${km.toFixed(0)} km ${up.toFixed(0)} m, via ${p.via.slice(0, 3).join(", ")} [${[p.followedRoute, ...(p.tags ?? [])].filter(Boolean).join(", ")}]`;
    });
    console.log(
      `\n${name}: ${proposals.length} proposals, ${(ms / 1000).toFixed(1)} s, same road ${(road * 100).toFixed(0)} %, same corridor ${(corridor * 100).toFixed(0)} %`,
    );
    console.log(rows.join("\n"));
    html.push(
      `<section><h2>${name}: ${proposals.length}</h2><p>${(ms / 1000).toFixed(1)} s, same road ${(road * 100).toFixed(0)} %, same corridor ${(corridor * 100).toFixed(0)} %</p>${lines.length ? svg(lines) : ""}<ol>${rows.map((r) => `<li>${r.replace(/^\d+ /, "")}</li>`).join("")}</ol></section>`,
    );
  }
  console.log(
    `\n${total} proposals. Tags: ${[...tagged]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, n]) => `${tag} ${Math.round((n / total) * 100)} %`)
      .join(", ")}`,
  );
  const out = new URL("out/", import.meta.url);
  await mkdir(out, { recursive: true });
  await writeFile(
    new URL("index.html", out),
    `<!doctype html><meta charset="utf-8"><title>Trip report</title><style>body{font:14px sans-serif;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}h2{font-size:16px}</style>${html.join("")}`,
  );
});
