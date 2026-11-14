import {
  BedDouble,
  Bike,
  CalendarDays,
  Clock,
  CloudRain,
  CloudSun,
  Euro,
  List,
  Map as MapIcon,
  MapPin,
  MoveHorizontal,
  Route,
  Signpost,
  Sparkles,
  Star,
  Sunset,
  Thermometer,
  TrainFront,
  TrendingUp,
  UmbrellaOff,
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
  dry: UmbrellaOff,
  wind: Wind,
  temperature: Thermometer,
  daylight: Sunset,
  train: TrainFront,
  dates: CalendarDays,
  budget: Euro,
};

export type StatIcon = keyof typeof statIcons;

/** One icon per kind of panel section, on every screen. See docs/07-design-system.md. */
export const sectionIcons = {
  dates: CalendarDays,
  trip: Bike,
  days: List,
  trains: TrainFront,
  ride: Route,
  routes: Signpost,
  stop: MapPin,
  hotel: BedDouble,
  weather: CloudSun,
  areas: MapIcon,
  suggestions: Sparkles,
};

export type SectionIcon = keyof typeof sectionIcons;
