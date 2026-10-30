import {
  BedDouble,
  CalendarDays,
  Clock,
  CloudRain,
  Euro,
  MoveHorizontal,
  Signpost,
  Star,
  Sunset,
  Thermometer,
  TrainFront,
  TrendingUp,
  Wind,
} from "lucide-react";

/** One icon per stat. Each icon has only this meaning. See docs/07-design-system.md. */
export const statIcons = {
  distance: MoveHorizontal,
  ascent: TrendingUp,
  ridingTime: Clock,
  signed: Signpost,
  beds: BedDouble,
  stars: Star,
  rain: CloudRain,
  wind: Wind,
  temperature: Thermometer,
  daylight: Sunset,
  train: TrainFront,
  dates: CalendarDays,
  budget: Euro,
};

export type StatIcon = keyof typeof statIcons;
