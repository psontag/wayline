import type { Trip } from "@wayline/domain";
import { ChartPanel, IconButton } from "@wayline/ui";
import { Pause, Play } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StageWeather } from "./DayWeatherTimeline";

/** Time the play button moves on per step, in hours. */
const PLAY_STEP = 0.25;
const PLAY_MS = 200;

/** Weather of the selected stage under the map, with the time marker. */
export function WeatherPanel({
  trip,
  index,
  onRideStartChange,
  time,
  onTimeChange,
  ride,
  actions,
  plain = false,
}: {
  trip: Trip;
  index: number;
  onRideStartChange?: (start: string) => void;
  time: number;
  onTimeChange: (time: number) => void;
  /** Ride window in hours. Play runs through it. */
  ride: { start: number; end: number };
  /** Controls at the end of the header, e.g. the panel switcher. */
  actions?: ReactNode;
  /** Without the panel frame and title, e.g. in the phone sheet. */
  plain?: boolean;
}) {
  const { t } = useTranslation("tripEditor");
  const stage = trip.stages[index];
  const [playing, setPlaying] = useState(false);
  const latest = useRef({ time, onTimeChange, ride });
  useEffect(() => {
    latest.current = { time, onTimeChange, ride };
  });

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const { time, onTimeChange, ride } = latest.current;
      const next = time + PLAY_STEP;
      if (next > ride.end) {
        setPlaying(false);
        return;
      }
      onTimeChange(next);
    }, PLAY_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const play = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // Start over when the marker is outside the ride.
    if (time < ride.start || time + PLAY_STEP > ride.end) {
      onTimeChange(ride.start);
    }
    setPlaying(true);
  };

  if (!stage) return null;
  return (
    <ChartPanel
      title={
        plain
          ? undefined
          : t("profile.title", {
              day: index + 1,
              from: stage.start.name,
              to: stage.end.name,
            })
      }
      tabs={actions}
      plain={plain}
    >
      <StageWeather
        trip={trip}
        index={index}
        onRideStartChange={onRideStartChange}
        time={time}
        onTimeChange={(next) => {
          setPlaying(false);
          onTimeChange(next);
        }}
        leading={
          <IconButton
            label={t(playing ? "weatherPanel.pause" : "weatherPanel.play")}
            icon={playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            size="sm"
            onClick={play}
          />
        }
      />
    </ChartPanel>
  );
}
