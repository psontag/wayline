/** Hotel near the selected stop, as shown on the trip map. */
export type MapHotel = {
  osmId: string;
  name: string;
  kind: "hotel" | "guest_house" | "motel";
  stars?: number;
  coord: [number, number];
  /** Extra km to ride compared to the stop. */
  detourKm: number;
  website?: string;
};
