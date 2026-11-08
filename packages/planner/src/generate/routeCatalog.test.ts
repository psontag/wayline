import type { NetworkEdge, RouteInfo } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { cleanRouteName, RouteCatalog } from "./routeCatalog";

describe("cleanRouteName", () => {
  it.each([
    ["Main-Radweg, Abschnitte 3 bis 9", "Main-Radweg"],
    ['Main-Radweg, Abschnitt 10 "Wertheim bis Miltenberg"', "Main-Radweg"],
    ["Neckartal-Radweg Teil 4", "Neckartal-Radweg"],
    ["[D10] Elberadweg linkselbisch [Abschnitt B]", "Elberadweg"],
    ["[D11] Ostsee-Oberbayern 08 [Thüringen Nord]", "Ostsee-Oberbayern"],
    ["D-Route 6 - Donauroute [Regensburg - Passau]", "Donauroute"],
    ["D2 Ostseeküsten-Radweg - Abschnitt Fehmarn", "Ostseeküsten-Radweg"],
    ["Donauradweg - Abschnitt Deutschland 2", "Donauradweg"],
    [
      "Deutscher Limes-Radweg 2. Abschnitt Holzhausen",
      "Deutscher Limes-Radweg",
    ],
    ["Innradweg - Bayern", "Innradweg"],
    ["BahnRadRoute Weser - Lippe (Hauptroute)", "BahnRadRoute Weser - Lippe"],
    ["Grafschafter Fietsentour, Hauptroute", "Grafschafter Fietsentour"],
    ["EuroVelo 15 - Rheinradweg - Teilstrecke Köln - Moers", "EuroVelo 15"],
    ["Eurovelo 7 - Sun Route - part Germany", "EuroVelo 7"],
    ["EV4 Germany, Bamberg - Bayreuth", "EuroVelo 4"],
    ["3-Länder-Radweg", "3-Länder-Radweg"],
    ["Alb-Donau-Kreis Tour 10", "Alb-Donau-Kreis Tour 10"],
    ["GeoRadweg Altmühltal Route 1", "GeoRadweg Altmühltal Route 1"],
  ])("cleans %s", (name, clean) => {
    expect(cleanRouteName(name)).toBe(clean);
  });

  it.each([
    "(41) Netphen - (43) Netphen-Dreis-Tiefenbach",
    "Köln (50) - Wesseling (75)",
    "10-11",
    "R20",
    "*-*",
    "Radverkehrsnetz NRW, Kreis Soest",
    "Radroutennetz Gifhorn",
    "Lokales Radwegenetz Rhein-Neckar-Kreis Ost",
    "D-Netz Route 3",
    "legacy: Radverkehrsnetz BW, Landkreis Göppingen",
    "BahnRadRoute Hellweg-Weser (Zubringer Bahnhof Brake)",
    "Jubiläumsradweg 50 Jahre Landkreis Ludwigsburg",
  ])("drops %s", (name) => {
    expect(cleanRouteName(name)).toBeUndefined();
  });
});

describe("RouteCatalog", () => {
  const edge = (id: number, routes: string[]) =>
    ({ id, routes, network: "icn" }) as NetworkEdge;
  const info = (name: string, network: RouteInfo["network"]) =>
    ({ name, network }) as RouteInfo;

  it("names each route on an edge once and drops non-routes", () => {
    const catalog = new RouteCatalog([]);
    const e = edge(0, ["Main-Radweg Teil 1", "Main-Radweg Teil 2", "1-2"]);
    expect(catalog.on(e)).toEqual(["Main-Radweg"]);
  });

  it("takes the class of the route, not of its edges", () => {
    const table = [info("County Way", "lcn"), info("Big Way", "ncn")];
    const catalog = new RouteCatalog([edge(0, ["County Way"])], table);
    expect(catalog.rank("Big Way")).toBeLessThan(catalog.rank("County Way"));
  });

  it("takes the best class of the sections", () => {
    const table = [
      info("Long Way Teil 1", "lcn"),
      info("Long Way Teil 2", "ncn"),
    ];
    const other = [info("Other Way", "rcn")];
    const catalog = new RouteCatalog([], [...table, ...other]);
    expect(catalog.rank("Long Way")).toBeLessThan(catalog.rank("Other Way"));
  });

  it("falls back on the edges without a table", () => {
    const catalog = new RouteCatalog([edge(0, ["Some Way"])]);
    expect(catalog.rank("Some Way")).toBe(0);
  });
});
