// Records BRouter answers from the local BRouter (`pnpm brouter`).
// Run: node packages/providers/fixtures/brouter/record.js
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const base = process.env.BROUTER_URL ?? "http://localhost:17777";

const legs = [
  {
    name: "bamberg-forchheim-touring",
    lonlats: "10.8873,49.8917|11.0587,49.7186",
    profile: "touring",
  },
  {
    name: "ebrach-burgebrach-scenic",
    lonlats: "10.4934,49.8510|10.7461,49.8274",
    profile: "scenic",
  },
  {
    name: "forchheim-erlangen-fast",
    lonlats: "11.0587,49.7186|11.0026,49.5964",
    profile: "fast",
  },
];

for (const { name, lonlats, profile } of legs) {
  const url = `${base}/brouter?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  writeFileSync(join(dir, `${name}.json`), await res.text());
  console.log(name);
}
