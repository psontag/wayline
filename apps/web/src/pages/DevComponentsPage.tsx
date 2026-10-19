import {
  Badge,
  Button,
  Card,
  Chip,
  IconButton,
  Input,
  Label,
  SegmentedControl,
  Select,
  StageCard,
  StatBlock,
  SurfaceBar,
  SurfaceLegend,
  ThemeScope,
  ThemeToggle,
  Toast,
  ToastProvider,
  ToastViewport,
  useFormat,
  type ResolvedTheme,
  Combobox,
  ConfirmDialog,
  DateField,
  EmptyState,
  FormField,
  MapHint,
  MapLegend,
  Menu,
  NumberInput,
  NumberStepper,
  PlaceMarker,
  RadioCards,
  TripCard,
  AlternativeMarker,
  DateButton,
  ElevationProfile,
  EndpointMarker,
  GhostViaMarker,
  HotelRow,
  HoverMarker,
  InlineEdit,
  MenuItem,
  MenuSeparator,
  type ProfilePoint,
  SaveStatus,
  StopMarker,
  TextLink,
  ViaMarker,
  ViaRow,
  WeatherStrip,
  type WeatherStripItem,
  MessagePanel,
  ProgressBar,
  ProposalCard,
  ProposalCardSkeleton,
  ProposalMarker,
  ChoiceCard,
  ChoiceGroup,
  FloatingButton,
  FloatingTitle,
  InfoTile,
  LinkRow,
  SheetDialog,
} from "@wayline/ui";
import {
  Mountain,
  BedDouble,
  ChevronLeft,
  Copy,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  MousePointerClick,
  Pencil,
  Redo2,
  Share2,
  TrainFront,
  Trash2,
  Undo2,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

const stages = [
  {
    day: 1,
    date: new Date(2027, 5, 12),
    from: "Bamberg",
    to: "Coburg",
    distance: 78_000,
    ascent: 650,
    surface: { paved: 70, gravel: 18, unpaved: 12 },
    temperature: { min: 15, max: 21 },
    wind: { kind: "tail", share: 0.6, speedKmh: 14 },
    color: "a",
  },
  {
    day: 2,
    date: new Date(2027, 5, 13),
    from: "Coburg",
    to: "Kronach",
    distance: 64_000,
    ascent: 720,
    surface: { paved: 62, gravel: 24, unpaved: 14 },
    temperature: { min: 17, max: 23 },
    wind: { kind: "head", share: 0.45, speedKmh: 16 },
    color: "b",
  },
  {
    day: 3,
    date: new Date(2027, 5, 14),
    from: "Kronach",
    to: "Kulmbach",
    distance: 58_000,
    ascent: 540,
    surface: { paved: 88, gravel: 12, unpaved: 0 },
    temperature: { min: 16, max: 24 },
    wind: { kind: "cross", share: 0.5, speedKmh: 9 },
    color: "a",
  },
] as const;

const alternatives = [
  { name: "Küps", distance: 56_000 },
  { name: "Kronach", distance: 64_000 },
  { name: "Steinwiesen", distance: 75_000 },
];

export function DevComponentsPage() {
  const { t } = useTranslation("devComponents");
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2">
      <Column theme="light" title={t("light")} />
      <Column theme="dark" title={t("dark")} />
    </div>
  );
}

function Column({ theme, title }: { theme: ResolvedTheme; title: string }) {
  const { t } = useTranslation("devComponents");
  const format = useFormat();
  const profileLabelId = useId();
  const [profile, setProfile] = useState("touring");
  const [selectedDay, setSelectedDay] = useState(2);
  const [locked, setLocked] = useState<Record<number, boolean>>({
    1: true,
    2: true,
  });
  const [stop, setStop] = useState("Kronach");

  return (
    <ThemeScope
      theme={theme}
      className="flex min-w-0 flex-col gap-8 p-4 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <ThemeToggle />
      </div>

      <Section title={t("section.buttons")}>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary">{t("demo.planTrip")}</Button>
          <Button>
            <Download aria-hidden />
            {t("demo.exportGpx")}
          </Button>
          <Button variant="ghost">{t("demo.cancel")}</Button>
          <IconButton
            variant="secondary"
            label={t("demo.undo")}
            icon={<Undo2 aria-hidden />}
          />
          <IconButton label={t("demo.redo")} icon={<Redo2 aria-hidden />} />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" size="sm">
            <Download aria-hidden />
            {t("demo.exportGpx")}
          </Button>
          <Button size="sm">
            <Share2 aria-hidden />
            {t("demo.share")}
          </Button>
          <Button variant="ghost" size="sm">
            {t("demo.cancel")}
          </Button>
          <IconButton
            size="sm"
            label={t("demo.undo")}
            icon={<Undo2 aria-hidden />}
          />
          <Button variant="primary" disabled>
            {t("demo.planTrip")}
          </Button>
        </div>
      </Section>

      <Section title={t("section.fields")}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-24">
            <Input
              label={t("demo.kmPerDay")}
              defaultValue="80"
              inputMode="numeric"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label id={profileLabelId}>{t("demo.profile")}</Label>
            <SegmentedControl
              aria-labelledby={profileLabelId}
              value={profile}
              onValueChange={setProfile}
              options={[
                { value: "touring", label: t("demo.touring") },
                { value: "fast", label: t("demo.fast") },
                { value: "scenic", label: t("demo.scenic") },
                { value: "quiet", label: t("demo.quiet") },
              ]}
            />
          </div>
        </div>
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor={`${profileLabelId}-rating`}>{t("demo.rating")}</Label>
          <Select
            id={`${profileLabelId}-rating`}
            defaultValue="8"
            options={ratingOptions(t("demo.ratingAny"))}
          />
        </div>
      </Section>

      <Section title={t("section.chips")}>
        <div className="flex flex-wrap items-center gap-1.5">
          {alternatives.map((alt) => (
            <Chip
              key={alt.name}
              selected={alt.name === stop}
              onClick={() => setStop(alt.name)}
            >
              {t("demo.alternative", {
                name: alt.name,
                distance: format.distance(alt.distance),
              })}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{t("demo.oneWay")}</Badge>
          <Badge>{t("demo.dayLoop")}</Badge>
          <Badge tone="accent">{t("demo.draft")}</Badge>
        </div>
      </Section>

      <Section title={t("section.stats")}>
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-2">
            <StatBlock
              value={t("demo.stageCount", { count: 4 })}
              label={t("demo.stages")}
            />
            <StatBlock
              value={format.distance(252_000)}
              label={t("demo.distance")}
            />
            <StatBlock
              value={format.elevation(2340)}
              label={t("demo.ascent")}
            />
            <StatBlock value={format.percent(0.84)} label={t("demo.paved")} />
          </div>
          <div className="flex flex-wrap gap-5">
            <StatBlock
              size="lg"
              value={format.distance(78_000)}
              label={t("demo.distance")}
            />
            <StatBlock
              size="lg"
              value={format.elevation(650)}
              label={t("demo.ascent")}
            />
            <StatBlock
              size="lg"
              value={format.percent(0.86)}
              label={t("demo.paved")}
            />
          </div>
          <SurfaceBar shares={{ paved: 70, gravel: 18, unpaved: 12 }} />
          <SurfaceLegend />
        </Card>
      </Section>

      <Section title={t("section.stages")}>
        <div className="flex max-w-panel flex-col gap-2 rounded-md bg-surface p-3">
          {stages.map((stage) => (
            <StageCard
              key={stage.day}
              {...stage}
              to={stage.day === 2 ? stop : stage.to}
              selected={stage.day === selectedDay}
              onSelect={() => setSelectedDay(stage.day)}
              locked={locked[stage.day] ?? false}
              onLockedChange={(value) =>
                setLocked({ ...locked, [stage.day]: value })
              }
              alternatives={alternatives.map((alt) => (
                <Chip
                  key={alt.name}
                  selected={alt.name === stop}
                  onClick={() => setStop(alt.name)}
                >
                  {t("demo.alternative", {
                    name: alt.name,
                    distance: format.distance(alt.distance),
                  })}
                </Chip>
              ))}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="primary" size="sm" className="flex-1">
                  <a
                    href="https://www.booking.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("demo.bookHotels", { place: stop })}
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
                <div className="w-20 shrink-0">
                  <Select
                    size="sm"
                    aria-label={t("demo.rating")}
                    defaultValue="8"
                    options={ratingOptions(t("demo.ratingAny"))}
                  />
                </div>
              </div>
            </StageCard>
          ))}
        </div>
      </Section>

      <Section title={t("section.toast")}>
        <ToastProvider>
          <Toast
            open
            duration={Infinity}
            message={t("demo.toastMessage")}
            action={{ label: t("demo.toastAction"), onClick: () => undefined }}
          />
          <ToastViewport placement="inline" />
        </ToastProvider>
      </Section>

      <FormDemos />
      <TripDemos />
      <TripEditorParts />
      <ProposalDemos />

      <PhoneParts />
    </ThemeScope>
  );
}

const profile: ProfilePoint[] = Array.from({ length: 61 }, (_, i) => ({
  km: i,
  ele: 300 + 120 * Math.sin(i / 9) + 40 * Math.sin(i / 2.5),
  surface: i > 18 && i < 30 ? "gravel" : i > 44 && i < 50 ? "unpaved" : "paved",
}));

const weather: WeatherStripItem[] = [0, 10, 20, 30, 40, 50, 60].map(
  (km, i) => ({
    distance: km * 1000,
    time: new Date(2027, 5, 13, 9, Math.round((km / 18) * 60)),
    temperature: 17 + i,
    condition: i === 3 ? "cloud" : i === 4 ? "rain" : "sun",
    wind: {
      kind: i < 2 ? "tail" : i < 5 ? "head" : "cross",
      rotation: i < 2 ? 10 : i < 5 ? 175 : 95,
    },
  }),
);

function TripEditorParts() {
  const { t } = useTranslation("devComponents");
  const [hoverKm, setHoverKm] = useState<number>();
  const [date, setDate] = useState("2027-06-12");
  const [name, setName] = useState("Franconia, four days");
  const [renaming, setRenaming] = useState(false);
  return (
    <Section title={t("section.tripEditor")}>
      <Card className="flex flex-col gap-3">
        <SurfaceLegend />
        <ElevationProfile
          points={profile}
          hoverKm={hoverKm}
          onHoverKm={setHoverKm}
          aria-label={t("demo.elevation")}
        />
        <div className="border-t border-border pt-2">
          <WeatherStrip items={weather} />
        </div>
      </Card>
      <Card className="flex flex-col gap-3">
        <HotelRow
          name="Hotel Bauerngirgl"
          stars={3}
          distance={400}
          website="https://example.com"
          action={
            <Button variant="ghost" size="sm">
              {t("demo.change")}
            </Button>
          }
        />
        <TextLink href="https://www.bahn.de" target="_blank" rel="noreferrer">
          <TrainFront aria-hidden />
          {t("demo.train")}
        </TextLink>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SaveStatus state="saved" />
        <SaveStatus state="saving" />
        <SaveStatus state="error" />
        <DateButton value={date} onChange={setDate}>
          {date}
        </DateButton>
        <Menu
          trigger={
            <IconButton
              size="sm"
              label={t("demo.menu")}
              icon={<EllipsisVertical aria-hidden />}
            />
          }
        >
          <MenuItem
            icon={<Pencil aria-hidden />}
            onSelect={() => setRenaming(true)}
          >
            {t("demo.rename")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 aria-hidden />} tone="danger">
            {t("demo.delete")}
          </MenuItem>
        </Menu>
        {renaming ? (
          <InlineEdit
            value={name}
            aria-label={t("demo.rename")}
            onCommit={(next) => {
              setName(next);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <span className="text-md font-bold">{name}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-md bg-bg p-4">
        <EndpointMarker name="Bamberg" station />
        <StopMarker day={1} name="Coburg" />
        <StopMarker day={2} name="Kronach" selected />
        <AlternativeMarker
          label={t("demo.alternative", { name: "Küps", distance: "56 km" })}
        />
        <HoverMarker />
        <ViaMarker aria-label={t("demo.removeVia")} />
        <GhostViaMarker />
      </div>
      <div className="max-w-sm">
        <ViaRow
          n={1}
          name="Lichtenfels"
          detail="34 km"
          removeLabel={t("demo.removeVia")}
          onRemove={() => undefined}
        />
      </div>
    </Section>
  );
}

function PhoneParts() {
  const { t } = useTranslation("devComponents");
  const [day, setDay] = useState(2);
  const [stop, setStop] = useState("Kronach");
  const [open, setOpen] = useState(false);
  const radioName = useId();
  return (
    <Section title={t("section.phone")}>
      <div className="flex items-center gap-2 rounded-md bg-hover p-3">
        <FloatingButton label={t("demo.back")}>
          <ChevronLeft aria-hidden />
        </FloatingButton>
        <FloatingTitle
          title={t("demo.tripName")}
          subtitle="Sat 12 Jun – Tue 15 Jun · 252 km"
        />
        <FloatingButton variant="accent" label={t("demo.exportGpx")}>
          <Download aria-hidden />
        </FloatingButton>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((n) => (
          <Chip
            key={n}
            size="md"
            selected={n === day}
            onClick={() => setDay(n)}
          >
            {t("demo.day", { day: n })}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <InfoTile label={t("demo.weather")} value={t("demo.weatherValue")} />
        <InfoTile label={t("demo.wind")} value={t("demo.windValue")} />
      </div>
      <LinkRow
        icon={<BedDouble aria-hidden />}
        title={t("demo.stop")}
        subtitle="Hotel Bauerngirgl · 3 stars"
        onClick={() => setOpen(true)}
      />
      <ChoiceGroup legend={t("demo.stopTown")}>
        {alternatives.map(({ name, distance }) => (
          <ChoiceCard
            key={name}
            name={radioName}
            value={name}
            checked={stop === name}
            onChange={() => setStop(name)}
            title={name}
            meta={format(distance)}
            note={stop === name ? t("demo.current") : undefined}
          />
        ))}
      </ChoiceGroup>
      <HotelRow
        variant="card"
        selected
        name="Hotel Bauerngirgl"
        stars={3}
        distance={400}
        action={<Button size="sm">{t("demo.picked")}</Button>}
      />
      <HotelRow
        variant="card"
        name="Hotel Sonne"
        stars={3}
        distance={900}
        action={<Button size="sm">{t("demo.pick")}</Button>}
      />
      <Button variant="primary" size="lg">
        {t("demo.bookHotels", { place: "Kronach" })}
      </Button>
      <SheetDialog
        open={open}
        onOpenChange={setOpen}
        title={t("demo.whereToStop")}
        subtitle="Day 2 · Sun 13 Jun · from Coburg"
      >
        <InfoTile label={t("demo.wind")} value={t("demo.windValue")} />
      </SheetDialog>
    </Section>
  );
}

function format(meters: number) {
  return `${meters / 1000} km`;
}

function ratingOptions(any: string) {
  return [
    { value: "any", label: any },
    { value: "7", label: "7+" },
    { value: "8", label: "8+" },
    { value: "9", label: "9+" },
  ];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-md font-bold text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

const demoPlaces = ["Bamberg", "Coburg", "Kronach", "Kulmbach", "Lichtenfels"];

function FormDemos() {
  const { t } = useTranslation("devComponents");
  const id = useId();
  const [kind, setKind] = useState("one-way");
  const [days, setDays] = useState<number | undefined>(3);
  const [km, setKm] = useState<number | undefined>(70);
  const [date, setDate] = useState("2027-06-12");
  const [place, setPlace] = useState("Bamberg");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState("touring");
  const placeOption = (name: string) => ({
    value: name,
    label: name,
    description: t("demo.station"),
    icon: <TrainFront aria-hidden />,
  });

  return (
    <Section title={t("section.forms")}>
      <div className="flex max-w-panel flex-col gap-4">
        <FormField label={t("demo.kind")} labelId={`${id}-kind`}>
          <RadioCards
            aria-labelledby={`${id}-kind`}
            value={kind}
            onValueChange={setKind}
            options={[
              {
                value: "one-way",
                label: t("demo.oneWayTrip"),
                hint: t("demo.oneWayHint"),
              },
              {
                value: "loop",
                label: t("demo.loop"),
                hint: t("demo.loopHint"),
              },
            ]}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("demo.start")} htmlFor={`${id}-place`}>
            <Combobox
              id={`${id}-place`}
              options={demoPlaces
                .filter((p) => p.toLowerCase().includes(search.toLowerCase()))
                .map(placeOption)}
              onSearchChange={setSearch}
              value={place}
              selected={placeOption(place)}
              onValueChange={setPlace}
            />
          </FormField>
          <FormField label={t("demo.startDate")} htmlFor={`${id}-date`}>
            <DateField
              id={`${id}-date`}
              clearable
              value={date}
              onValueChange={setDate}
            />
          </FormField>
          <FormField label={t("demo.days")} htmlFor={`${id}-days`}>
            <NumberStepper
              id={`${id}-days`}
              min={1}
              max={14}
              value={days}
              onValueChange={setDays}
            />
          </FormField>
          <FormField
            label={t("demo.kmPerDay")}
            htmlFor={`${id}-km`}
            error={km ? undefined : t("demo.kmError")}
          >
            <NumberInput
              id={`${id}-km`}
              unit={t("demo.km")}
              value={km}
              onValueChange={setKm}
              aria-invalid={!km}
            />
          </FormField>
        </div>
        <FormField
          label={t("demo.profile")}
          labelId={`${id}-profile`}
          hint={t("demo.profileHint")}
        >
          <SegmentedControl
            stretch
            aria-labelledby={`${id}-profile`}
            value={profile}
            onValueChange={setProfile}
            options={[
              { value: "touring", label: t("demo.touring") },
              { value: "fast", label: t("demo.fast") },
              { value: "scenic", label: t("demo.scenic") },
              { value: "quiet", label: t("demo.quiet") },
            ]}
          />
        </FormField>
      </div>
    </Section>
  );
}

const demoPreview: [number, number][] = [
  [10.9, 49.9],
  [10.95, 50.02],
  [11.06, 50.14],
  [11.2, 50.2],
  [11.32, 50.24],
  [11.45, 50.1],
  [11.57, 49.94],
];

function TripDemos() {
  const { t } = useTranslation("devComponents");
  const [dialog, setDialog] = useState(false);
  return (
    <Section title={t("section.trips")}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TripCard
          title={<a href="#trip">{t("demo.tripName")}</a>}
          badge={<Badge>{t("demo.oneWay")}</Badge>}
          dates={t("demo.tripDates")}
          stats={t("demo.tripStats")}
          preview={demoPreview}
          actions={
            <Menu
              trigger={
                <IconButton
                  size="sm"
                  label={t("demo.actions")}
                  icon={<Ellipsis aria-hidden />}
                />
              }
            >
              <MenuItem icon={<Copy aria-hidden />}>
                {t("demo.duplicate")}
              </MenuItem>
              <MenuItem
                icon={<Trash2 aria-hidden />}
                tone="danger"
                onSelect={() => setDialog(true)}
              >
                {t("demo.delete")}
              </MenuItem>
            </Menu>
          }
        />
        <div className="flex flex-col items-start gap-3">
          <Button variant="danger" onClick={() => setDialog(true)}>
            <Trash2 aria-hidden />
            {t("demo.delete")}
          </Button>
          <PlaceMarker name={t("demo.placeName")} />
          <MapLegend
            items={[
              { label: t("demo.network"), line: "network" },
              { label: t("demo.route"), line: "route" },
              { label: t("demo.area"), line: "dashed" },
            ]}
          />
          <MapHint icon={<MousePointerClick aria-hidden />}>
            {t("demo.mapHint")}
          </MapHint>
        </div>
      </div>
      <EmptyState
        title={t("demo.emptyTitle")}
        text={t("demo.emptyText")}
        action={<Button variant="primary">{t("demo.planTrip")}</Button>}
      />
      <ConfirmDialog
        open={dialog}
        onOpenChange={setDialog}
        title={t("demo.deleteTitle")}
        description={t("demo.deleteText")}
        confirmLabel={t("demo.delete")}
        tone="danger"
        onConfirm={() => undefined}
      />
    </Section>
  );
}

const proposalProfile = Array.from(
  { length: 40 },
  (_, i) => 300 + 120 * Math.sin(i / 4) + 4 * i,
);

function ProposalDemos() {
  const { t } = useTranslation("devComponents");
  const format = useFormat();
  const [selected, setSelected] = useState(2);
  const stats = [
    { value: format.distance(252_000), label: t("demo.distance") },
    { value: format.elevation(2340), label: t("demo.ascent") },
    { value: format.percent(0.84), label: t("demo.paved") },
    { value: format.distance(78_000), label: t("demo.longestDay") },
  ];
  return (
    <Section title={t("section.proposals")}>
      <Card className="flex flex-col gap-2">
        <span className="font-bold">{t("demo.routing")}</span>
        <ProgressBar value={0.68} aria-label={t("demo.routing")} />
      </Card>
      <div className="flex flex-col gap-2">
        {[1, 2].map((n) => (
          <ProposalCard
            key={n}
            number={n}
            title={t("demo.proposalTitle")}
            subtitle={t("demo.proposalSubtitle")}
            stats={stats}
            profile={proposalProfile}
            footer={t("demo.proposalRoutes")}
            selected={selected === n}
            onSelect={() => setSelected(n)}
          >
            <Button variant="primary">{t("demo.openTrip")}</Button>
          </ProposalCard>
        ))}
        <ProposalCardSkeleton />
      </div>
      <div className="flex items-center gap-3">
        <ProposalMarker number={1} />
        <ProposalMarker number={2} selected />
      </div>
      <Card padding="none">
        <MessagePanel
          icon={<Mountain aria-hidden />}
          title={t("demo.noResultTitle")}
          text={t("demo.noResultText")}
          actions={
            <Button variant="primary">{t("demo.noResultAction")}</Button>
          }
        />
      </Card>
    </Section>
  );
}
