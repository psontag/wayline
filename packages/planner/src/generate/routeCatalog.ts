import type { NetworkClass, NetworkEdge, RouteInfo } from "@wayline/domain";

/** Lower is more important. */
const CLASS_RANK: Record<NetworkClass, number> = {
  icn: 0,
  ncn: 0,
  rcn: 1,
  lcn: 2,
  connector: 3,
};
const NO_RANK = 4;
/** Rank of international and national routes. */
export const NATIONAL = CLASS_RANK.icn;
/** Rank of regional routes. Routes below it come last. */
export const REGIONAL = CLASS_RANK.rcn;

/** Signed, but nothing a rider knows as a route. */
const NOT_A_ROUTE = [
  // Junction to junction: "(41) Netphen - (43) Siegen", "10-11".
  /\(\d+\).*-.*\(\d+\)/,
  /^\d+\s*-\s*\d+$/,
  // Only a reference: "R20", "*-*".
  /^.{1,4}$/,
  // Networks of an area.
  /Rad(verkehrs|routen|wege|wegweisungs)?netz/i,
  /^D-Netz/,
  /^legacy:/,
  // Parts that only lead to a route.
  /Zubringer|Abstecher/i,
  // County routes.
  /Landkreis/,
];

/** Where the name of a section or variant starts. The first match cuts. */
const SECTION = [
  /\s*[[(].*$/,
  /\s+-\s+(part|Abschnitt|Teilstrecke|Etappe)\b.*$/i,
  /,?\s+(\d+\.\s+)?(Abschnitte?|Teil\s?\d|Etappe)\b.*$/,
  /,?\s+(Hauptroute|Hauptweg|Nebenroute|Alternative|Variante)$/i,
  /\s+-\s+(Baden-Württemberg|Bayern|Brandenburg|Hessen|Niedersachsen|NRW|Sachsen|Thüringen)$/,
  /\s+(links|rechts)elbisch.*$/,
];

/**
 * The name riders know a route by, the same for all its sections. Undefined
 * if the name is not that of a route.
 */
export function cleanRouteName(name: string): string | undefined {
  const euroVelo = /^(?:euro\s?velo|ev)\s?(\d+)\b/i.exec(name);
  if (euroVelo) return `EuroVelo ${euroVelo[1]}`;
  if (NOT_A_ROUTE.some((p) => p.test(name))) return undefined;

  let clean = name.replace(/^(\[D\d+\]\s*|D-Route \d+ - |D\d+ )/, "");
  // A number before a section is the section: "Ostsee-Oberbayern 08 [Sachsen]".
  const inSections = /\[/.test(clean);
  for (const section of SECTION) clean = clean.replace(section, "");
  if (inSections) clean = clean.replace(/\s+\d+$/, "");
  clean = clean.trim();
  return clean.length > 4 ? clean : undefined;
}

/** The routes on edges, by clean name, with their class. */
export class RouteCatalog {
  private ranks = new Map<string, number>();
  private kms = new Map<string, number>();
  private clean = new Map<string, string | undefined>();
  private onEdge = new Map<number, string[]>();

  /** table: classes per route. Without it, the class of the route's edges. */
  constructor(edges: NetworkEdge[], table: RouteInfo[] = []) {
    for (const { name, network, lengthKm } of table) {
      this.add(name, network, lengthKm);
    }
    if (table.length) return;
    for (const e of edges) {
      for (const name of e.routes) this.add(name, e.network, e.lengthKm);
    }
  }

  /** Length of all sections of a route, also outside the loaded area. */
  km(name: string): number {
    return this.kms.get(name) ?? 0;
  }

  /** Clean route names on an edge. */
  on(edge: NetworkEdge): string[] {
    let names = this.onEdge.get(edge.id);
    if (!names) {
      const clean = edge.routes.flatMap((n) => this.cleanName(n) ?? []);
      names = [...new Set(clean)];
      this.onEdge.set(edge.id, names);
    }
    return names;
  }

  /** Lower is more important. */
  rank(name: string): number {
    return this.ranks.get(name) ?? NO_RANK;
  }

  private add(name: string, network: NetworkClass, km: number) {
    const clean = this.cleanName(name);
    if (!clean) return;
    this.ranks.set(clean, Math.min(CLASS_RANK[network], this.rank(clean)));
    this.kms.set(clean, this.km(clean) + km);
  }

  private cleanName(name: string): string | undefined {
    if (!this.clean.has(name)) this.clean.set(name, cleanRouteName(name));
    return this.clean.get(name);
  }
}
