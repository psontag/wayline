import type { BBox } from "./schema";

// Shapes of the static geodata files in /data/<dataset>/.
// Written by pipeline/spike/export_mock.py.

export type Manifest = {
  version: string;
  region: { name: string; bbox: BBox };
  /** File names relative to the manifest. */
  files: { network: string; places: string };
  createdAt: string;
};

export type NetworkClass = "icn" | "ncn" | "rcn" | "lcn" | "connector";

export type NetworkNode = {
  /** Index in RouteNetwork.nodes. Stable within one dataset version. */
  id: number;
  lon: number;
  lat: number;
  kind: "junction" | "town" | "station";
  name?: string;
  /** Hotels of the town at this node. Only nodes with hotels can be stops. */
  hotelCount: number;
};

export type NetworkEdge = {
  /** Index in RouteNetwork.edges. */
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
