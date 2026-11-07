import type { BBox } from "./schema";

// Shapes of the static geodata files in /data/<dataset>/.
// Written by pipeline/build.py (tiled) and pipeline/spike/export_mock.py (mock).

export type Manifest = {
  version: string;
  region: { name: string; bbox: BBox };
  /**
   * File names relative to the manifest. A tiled dataset has no network
   * file. Older and mock datasets have places in one file and no search index.
   */
  files: {
    network?: string;
    places?: string;
    search?: string;
    routes?: string;
  };
  /** Only in tiled datasets. */
  tiles?: TileIndex;
  /** Vector tiles of the signed routes, for the map. Built by pipeline/lines.py. */
  lines?: LineTiles;
  /** All bikeable ways, for the router. Built by pipeline/routing.py. */
  routing?: RoutingTiles;
  createdAt: string;
};

/** Binary tiles, gzipped. The format is in pipeline/README.md. */
export type RoutingTiles = {
  format: 1;
  /** Tile edge in degrees. Key "x_y" as in TileIndex. */
  size: number;
  /** Search part: nodes and edges. "{key}" for the tile key. */
  path: string;
  /** Geometry part: shape points and elevation. */
  geometry: string;
  keys: string[];
  /** Way types by their index in the edge attributes. */
  highways: string[];
};

export type TileIndex = {
  /** Tile edge in degrees. Tile key "x_y" = floor(lon / size)_floor(lat / size). */
  size: number;
  /** File path relative to the manifest, with "{key}" for the tile key. */
  path: string;
  /** Tiles that exist. Others have no network. */
  keys: string[];
  /**
   * Towns, stations and hotels per tile, with the same keys. Towns and
   * stations are in the tile of their node.
   */
  places?: { path: string; keys: string[] };
};

/** Places of one tile. */
export type PlaceTile = Places & { tile: string };

/**
 * Towns and stations on the route network, for place search. Short keys
 * keep the file small.
 */
export type SearchIndex = {
  version: string;
  places: SearchEntry[];
};

export type SearchEntry = {
  /** OSM id, e.g. "n240009". */
  i: string;
  n: string;
  k: GeoTown["place"] | "station";
  x: number;
  y: number;
  /** Hotels of a town, if any. */
  h?: number;
};

export type LineTiles = {
  /** File path relative to the manifest, with "{z}", "{x}" and "{y}". */
  path: string;
  minzoom: number;
  maxzoom: number;
  /** Area with tiles. Inside it, every tile exists, if empty. */
  bounds: BBox;
};

/**
 * A signed route, keyed by name. Line tiles hold its id in the "routes"
 * property ("|1|5|", main route first).
 */
export type RouteInfo = {
  id: number;
  name: string;
  /** Best network class of its OSM relations. */
  network: NetworkClass;
  /** Sum of its edges. */
  lengthKm: number;
  bbox: BBox;
};

export type RouteTable = {
  version: string;
  routes: RouteInfo[];
};

/**
 * One tile of the route network. It holds the nodes in the tile, every edge
 * that touches one of them, and the far nodes of those edges. So edges that
 * cross a tile border are in both tiles.
 */
export type NetworkTile = RouteNetwork & { tile: string };

export type NetworkClass = "icn" | "ncn" | "rcn" | "lcn" | "connector";

export type NetworkNode = {
  /**
   * Stable within one dataset version. In a full network it is also the
   * index in RouteNetwork.nodes. In a part of a tiled network it is not.
   */
  id: number;
  lon: number;
  lat: number;
  kind: "junction" | "town" | "station";
  name?: string;
  /** Hotels of the town at this node. Only nodes with hotels can be stops. */
  hotelCount: number;
};

/** What an edge passes. Shares are 0 to 1 of its length. */
export type Scenery = {
  /** landuse=forest, natural=wood, within ~100 m. */
  forest: number;
  /** Rivers, canals and lakes over 5 ha, within ~200 m. */
  water: number;
  /** landuse=vineyard, within ~150 m. */
  vineyard: number;
  /** Inside nature reserves, national parks and nature parks. */
  nature: number;
  /** Count of named castles, ruins, monasteries, city gates, attractions, viewpoints and museums within 500 m. */
  sights: number;
};

export type NetworkEdge = {
  /** Same rules as NetworkNode.id. */
  id: number;
  from: number;
  to: number;
  lengthKm: number;
  pavedShare: number;
  surface: { paved: number; gravel: number; unpaved: number };
  /** Main network class by km. */
  network: NetworkClass;
  /** Signed route names, longest share first. */
  routes: string[];
  /** 0 to 1. Higher is nicer. */
  score: number;
  /** Meters, in the direction from → to. */
  ascent: number;
  descent: number;
  /** Encoded polyline from → to. */
  geometry: string;
  /** Meters, one per geometry point. */
  elevation: number[];
  /** Missing in the Oberfranken mock data. */
  scenery?: Scenery;
};

export type RouteNetwork = {
  version: string;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
};

export type GeoTown = {
  id: string;
  name: string;
  place: "city" | "town" | "village";
  /** OSM population, if tagged. */
  population?: number;
  lon: number;
  lat: number;
  hotelCount: number;
  /** Network node the town snaps to, if any. */
  nodeId: number | null;
};

export type GeoStation = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  nodeId: number | null;
};

export type GeoHotel = {
  id: string;
  name: string;
  kind: "hotel" | "guest_house" | "motel";
  lon: number;
  lat: number;
  stars?: number;
  website?: string;
};

export type Places = {
  version: string;
  towns: GeoTown[];
  stations: GeoStation[];
  hotels: GeoHotel[];
};
