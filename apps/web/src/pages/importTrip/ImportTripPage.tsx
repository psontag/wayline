import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  addDays,
  type HotelBudget,
  localTimeToDate,
  type Profile,
} from "@wayline/domain";
import {
  Button,
  cn,
  DateField,
  FileDrop,
  FormField,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  SortableList,
  useFormat,
} from "@wayline/ui";
import { TriangleAlert, X } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSaveTrip } from "../../data/queries";
import { useServices } from "../../data/ServicesProvider";
import { startTimes } from "../newTrip/form";
import { usePlaceIndex } from "../tripEditor/stopChoices";
import { toHotel } from "../tripEditor/useTripEditor";
import { ImportMap } from "./ImportMap";
import {
  buildImportTrip,
  byFileName,
  GAP_KM,
  gapBefore,
  type ImportFile,
  readImportFile,
  townNear,
} from "./importDays";

/** Meters off the network, without elevation, before the day gets a note. */
const OFF_NETWORK_NOTE = 2000;

// iOS knows no type for .gpx and greys the files out unless the list
// also allows plain data.
const GPX_TYPES =
  ".gpx,application/gpx+xml,application/xml,text/xml,application/octet-stream";

const profiles: Profile[] = ["touring", "fast", "scenic", "quiet"];
const budgets: HotelBudget[] = ["low", "mid", "high"];

export function ImportTripPage() {
  const { t } = useTranslation("importTrip");
  const format = useFormat();
  const id = useId();
  const navigate = useNavigate();
  const { routing, lodging, graph } = useServices();
  const places = usePlaceIndex();
  const save = useSaveTrip();

  const [files, setFiles] = useState<ImportFile[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [hovered, setHovered] = useState<number>();
  const [name, setName] = useState<string>();
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [budget, setBudget] = useState<HotelBudget>("mid");
  const [profile, setProfile] = useState<Profile>("touring");

  const [reading, setReading] = useState(false);
  const addFiles = async (picked: File[]) => {
    setReading(true);
    try {
      const results = await Promise.all(
        picked.map((file) => readImportFile(file, graph)),
      );
      const read = results.flatMap((r) => (r.ok ? [r.file] : []));
      setFailed(results.flatMap((r) => (r.ok ? [] : [r.fileName])));
      setFiles((current) => [...current, ...read].sort(byFileName));
    } finally {
      setReading(false);
    }
  };

  const townName = (file: ImportFile | undefined, end: "start" | "end") => {
    const point = end === "start" ? file?.points[0] : file?.points.at(-1);
    return point && places && townNear(places.towns, point.coord)?.name;
  };
  const suggestedName = (() => {
    const from = townName(files[0], "start");
    const to = townName(files.at(-1), "end");
    if (from && to && from !== to) return t("nameFromTo", { from, to });
    return files[0]?.name ?? from ?? "";
  })();
  const tripName = name ?? suggestedName;

  const create = useMutation({
    mutationFn: async () => {
      const trip = await buildImportTrip(
        files,
        {
          name: tripName.trim() || t("defaultName"),
          profile,
          hotelBudget: budget,
          startTime,
          ...(startDate ? { startDate } : {}),
        },
        {
          towns: places?.towns ?? [],
          route: (points, p) => routing.route(points, { profile: p }),
          hotelNear: async (coord, b, route) => {
            const [nearest] = await lodging.hotelsNear(coord, {
              limit: 1,
              budget: b,
              route,
            });
            return nearest && toHotel(nearest);
          },
          fallbackName: (day) =>
            day === 0 ? t("start") : t("dayEnd", { day }),
        },
      );
      return save.mutateAsync(trip);
    },
    onSuccess: (trip) =>
      void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } }),
  });

  const move = (from: number, to: number) =>
    setFiles((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });

  /** Without elevation in the file, the network gives it where it can. */
  const hasClimb = (file: ImportFile) =>
    file.hasElevation || file.offNetwork < file.distance;
  const elevationNote = (file: ImportFile) => {
    if (file.hasElevation || file.offNetwork < OFF_NETWORK_NOTE) return;
    if (!hasClimb(file)) return t("days.noElevation");
    return t("days.offNetwork", {
      distance: format.distance(file.offNetwork),
    });
  };

  const total = files.reduce((sum, f) => sum + f.distance, 0);
  const dayDate = (index: number) =>
    startDate
      ? format.date(localTimeToDate(addDays(startDate, index)))
      : undefined;

  return (
    <div className="flex flex-col md:min-h-0 md:flex-1 md:flex-row">
      <div
        className={cn(
          "relative aspect-square shrink-0 md:aspect-auto md:min-w-0 md:flex-1",
          // On phones the map shows once there is something on it.
          !files.length && "max-md:hidden",
        )}
      >
        <ImportMap files={files} hovered={hovered} towns={places?.towns} />
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (files.length) create.mutate();
        }}
        className="flex w-full flex-col bg-surface md:min-h-0 md:max-w-panel md:border-l md:border-border"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          <h1 className="text-xl font-extrabold tracking-tight">
            {t("title")}
          </h1>

          {files.length === 0 ? (
            <FileDrop
              size="lg"
              accept={GPX_TYPES}
              multiple
              label={t("drop.label")}
              hint={t("drop.hint")}
              onFiles={(picked) => void addFiles(picked)}
            />
          ) : (
            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-bold">{t("days.title")}</h2>
                <span className="text-xs text-text-muted tabular-nums">
                  {t("days.total", {
                    count: files.length,
                    distance: format.distance(total),
                  })}
                </span>
              </div>
              <p className="text-xs text-text-muted">{t("days.hint")}</p>
              <SortableList
                items={files}
                getKey={(f) => f.id}
                onMove={move}
                handleLabel={(_, i) => t("days.move", { day: i + 1 })}
                renderItem={(file, i) => {
                  const gap = gapBefore(files, i);
                  const notes = [
                    gap > GAP_KM &&
                      t("days.gap", {
                        distance: format.distance(gap * 1000),
                        day: i,
                      }),
                    elevationNote(file),
                  ].filter((n): n is string => !!n);
                  const date = dayDate(i);
                  return (
                    <div
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(undefined)}
                      className="flex flex-col gap-2 py-2 pr-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="font-bold">
                            {date
                              ? t("days.dayDate", { day: i + 1, date })
                              : t("days.day", { day: i + 1 })}
                          </span>
                          <span className="truncate text-xs text-text-muted">
                            {file.fileName}
                          </span>
                        </div>
                        <span className="text-sm whitespace-nowrap tabular-nums">
                          {format.distance(file.distance)}
                          {hasClimb(file) &&
                            ` · ${format.elevation(file.ascent)}`}
                        </span>
                        <IconButton
                          size="sm"
                          label={t("days.remove", { day: i + 1 })}
                          icon={<X aria-hidden />}
                          onClick={() =>
                            setFiles((c) => c.filter((f) => f.id !== file.id))
                          }
                        />
                      </div>
                      {notes.map((note) => (
                        <p
                          key={note}
                          className="flex items-start gap-2 rounded-sm bg-hover px-2.5 py-2 text-xs leading-normal"
                        >
                          <TriangleAlert
                            aria-hidden
                            className="mt-0.5 size-3.5 shrink-0 text-warning"
                          />
                          {note}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <FileDrop
                accept={GPX_TYPES}
                multiple
                label={t("drop.add")}
                onFiles={(picked) => void addFiles(picked)}
              />
            </section>
          )}

          {reading && (
            <p role="status" className="text-sm text-text-muted">
              {t("reading")}
            </p>
          )}

          {failed.length > 0 && (
            <p role="alert" className="text-sm text-danger">
              {t("failed", { files: failed.join(", "), count: failed.length })}
            </p>
          )}

          {files.length > 0 && (
            <>
              <FormField label={t("name")} htmlFor={`${id}-name`}>
                <Input
                  id={`${id}-name`}
                  value={tripName}
                  placeholder={t("defaultName")}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label={t("startDate")}
                  note={t("optional")}
                  htmlFor={`${id}-date`}
                >
                  <DateField
                    id={`${id}-date`}
                    clearable
                    value={startDate}
                    onValueChange={setStartDate}
                  />
                </FormField>
                <FormField label={t("startTime")} htmlFor={`${id}-time`}>
                  <Select
                    id={`${id}-time`}
                    value={startTime}
                    onValueChange={setStartTime}
                    options={startTimes.map((time) => ({
                      value: time,
                      label: format.time(new Date(`2000-01-01T${time}`)),
                    }))}
                  />
                </FormField>
              </div>

              {files.length > 1 && (
                <FormField
                  label={t("hotelBudget")}
                  icon="budget"
                  htmlFor={`${id}-budget`}
                  hint={t("hotelHint")}
                >
                  <Select
                    id={`${id}-budget`}
                    value={budget}
                    onValueChange={(v) => setBudget(v as HotelBudget)}
                    options={budgets.map((b) => ({
                      value: b,
                      label: t(`budget.${b}`),
                    }))}
                  />
                </FormField>
              )}

              <FormField
                label={t("profile.label")}
                labelId={`${id}-profile`}
                hint={t("profile.hint")}
              >
                <SegmentedControl
                  stretch
                  aria-labelledby={`${id}-profile`}
                  value={profile}
                  onValueChange={(v) => setProfile(v as Profile)}
                  options={profiles.map((p) => ({
                    value: p,
                    label: t(`profile.${p}`),
                  }))}
                />
              </FormField>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4 max-md:sticky max-md:bottom-0">
          {create.isError ? (
            <span role="alert" className="text-sm text-danger">
              {t("createFailed")}
            </span>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={!files.length || !places || create.isPending}
          >
            {create.isPending ? t("creating") : t("create")}
          </Button>
        </div>
      </form>
    </div>
  );
}
