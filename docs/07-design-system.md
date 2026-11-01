# Design system

All UI looks the same: same colors, spacing, sizes and components. Light and dark mode are both supported.

## Approach

1. **Tokens** define every visual value in one place.
2. **Components** in `packages/ui` use only tokens.
3. **App code** uses only components from `packages/ui` and layout utilities.
4. **Tooling** blocks anything else.

## Tokens

Tokens are CSS variables in `packages/ui/src/tokens.css`. Each color token has a light and a dark value, written as `light-dark(light, dark)`.

Color tokens are semantic. They name the purpose, not the color.

| Token | Use |
|---|---|
| `bg`, `surface`, `surface-raised` | Page, panels, popovers |
| `text`, `text-muted` | Text |
| `border` | Lines and outlines |
| `accent`, `on-accent` | Primary actions, text on accent |
| `success`, `warning`, `danger` | Status |
| `focus-ring` | Keyboard focus |
| `hover`, `active`, `selected`, `selected-border` | Interaction states |
| `scrim` | Behind dialogs and sheets |
| `inverse`, `on-inverse`, `inverse-accent` | Toasts and tooltips |
| `terrain-paved`, `terrain-gravel`, `terrain-unpaved`, `terrain-unknown` | Surface colors, e.g. in the strip under the elevation profile. Gravel is green so it never looks like a climb. Unknown is for route parts without surface data. |
| `grade-1`, `grade-2`, `grade-3` | Climbs in the elevation profile: under 4 %, 4–7 %, over 7 % |
| `proposed` | The proposed route of a changed day, on the map and in the elevation profile. Always used faded. |
| `rain` | Rain bars in the weather timeline |
| `wind-head`, `wind-cross`, `wind-tail` | Wind relative to the route |
| `wind-speed-1` to `wind-speed-4` | Wind speed, cyan to deep indigo, on the map and in the weather timeline: below 10, 10–20, 20–30, 30+ km/h |
| `night` | Dark hours in the weather timeline |

Map tokens:

| Token | Use |
|---|---|
| `route`, `route-casing` | Route line and its outline |
| `route-dimmed` | Unselected routes in the legend |
| `route-selected` | Selected stage |
| `stage-a`, `stage-b` | Stages in the trip editor alternate between these two |
| `route-best`, `route-nature`, `route-flat`, `route-hilly`, `route-sights` | One color per proposal on the proposals map, by flavour or list order |
| `on-route` | Text on a route color |
| `route-outline` | Casing of the highlighted proposal |
| `hillshade-shadow`, `hillshade-highlight` | Terrain shading on the maps |
| `marker`, `via-point` | Stops and via points |
| `route-highlight` | Part of the route in focus, e.g. a hovered climb. Drawn on a halo in `surface`. |
| `network` | Signed cycling routes, a quiet layer below the route |

Color values:

| Token | Light | Dark |
|---|---|---|
| `bg` | `#F6F7F9` | `#101216` |
| `surface` | `#FFFFFF` | `#171A20` |
| `surface-raised` | `#FFFFFF` | `#1E222A` |
| `text` | `#15181D` | `#EDEFF3` |
| `text-muted` | `#5A616C` | `#A0A7B3` |
| `border` | `#E1E4EA` | `#2A2F38` |
| `accent` | `#FFB088` | `#FFB088` |
| `on-accent` | `#3B1503` | `#2A0F02` |
| `success` | `#2F9E6B` | `#5CCB97` |
| `warning` | `#B7791F` | `#F2CF7E` |
| `danger` | `#C2412D` | `#FF8F7D` |
| `focus-ring` | `#B4532A` | `#FFB088` |
| `hover` | `#EEF0F4` | `#20242C` |
| `active` | `#E4E7EC` | `#2A2F38` |
| `selected` | `#FFEDE3` | `#2D211B` |
| `selected-border` | `#B4532A` | `#FFB088` |
| `scrim` | black 35 % | black 55 % |
| `inverse` | `#15181D` | `#EDEFF3` |
| `on-inverse` | `#EDEFF3` | `#15181D` |
| `inverse-accent` | `#FFB088` | `#B4532A` |
| `terrain-paved` | `#7E8BA3` | `#AEB9CC` |
| `terrain-gravel` | `#E8B850` | `#F2CF7E` |
| `terrain-unpaved` | `#B98E73` | `#D9B49C` |
| `terrain-unknown` | `#C3C8D0` | `#4B5260` |
| `rain` | `#3D84D6` | `#6AB0F5` |
| `wind-head` | `#C2412D` | `#FF8F7D` |
| `wind-cross` | `#B7791F` | `#F2CF7E` |
| `wind-tail` | `#2F9E6B` | `#5CCB97` |
| `wind-speed-1` | `#4FA5B2` | `#4E98A3` |
| `wind-speed-2` | `#1D7F8C` | `#4CC4B9` |
| `wind-speed-3` | `#2F4AA6` | `#8B9CF5` |
| `wind-speed-4` | `#2B1A6B` | `#C0A8FF` |
| `night` | `#E4E7EC` | `#0B0D11` |
| `route`, `route-selected` | `#FF9A73` | `#FFA67F` |
| `route-casing` | `#B4532A` | `#101216` |
| `route-dimmed` | `#C3C8D0` | `#4B5260` |
| `stage-a` | `#FFC7AE` | `#C98C72` |
| `stage-b` | `#C9BDE6` | `#8F82B8` |
| `marker` | `#15181D` | `#EDEFF3` |
| `via-point` | `#B4532A` | `#FFB088` |
| `route-highlight` | `#15181D` | `#FFFFFF` |
| `network` | `#9DB7A0` | `#4E6B57` |
| `route-best` | `#FF9A73` | `#FFA67F` |
| `route-nature` | `#3FB37A` | `#62D197` |
| `route-flat` | `#4F9FF0` | `#6DB4FF` |
| `route-hilly` | `#A685EC` | `#BB9EFF` |
| `route-sights` | `#EE7FB4` | `#FF93C6` |
| `on-route` | `#15181D` | `#101216` |
| `route-outline` | `#3A3F48` | `#0B0C0F` |
| `hillshade-shadow` | `#5A616C` | `#000000` |
| `hillshade-highlight` | `#FFFFFF` | `#8B93A0` |

Other tokens:

| Group | Values |
|---|---|
| Spacing | 4 px steps, also for sizes: `0.5`–`3.5` in half steps, `4`–`12`, `14`, `16`, `20`, `24`, `px` |
| Height | `chart` 168 px: the chart in the panel under the trip map, the same in every view |
| Width | `sm` 384 px, `panel` 440 px, `page` 1120 px |
| Radius | `sm` 4 px, `md` 6 px, `lg` 8 px, `xl` 16 px (sheets), `full` |
| Font size | `2xs` 11, `xs` 12, `sm` 13, `base` 14, `md` 15, `lg` 18, `xl` 22, `2xl` 28 px |
| Font weight | `normal`, `medium`, `semibold`, `bold`, `extrabold` |
| Line height | `tight` 1.15, `normal` 1.5 |
| Letter spacing | `tight` −0.02 em, `wide` 0.06 em |
| Shadow | `sm`, `md`, `sheet` (upwards, for bottom sheets) |
| Z-index | `map`, `panel`, `sheet`, `popover`, `dialog`, `toast` |
| Motion duration | `fast` 120 ms, `normal` 200 ms |
| Breakpoints | `sm` 640, `md` 768, `lg` 1024 px |

## Styling

- Tailwind CSS v4. Only our tokens exist as classes, e.g. `bg-surface`, `p-4`, `text-text-muted`.
- Components are based on Radix UI primitives, in the style of shadcn/ui. The code lives in `packages/ui` and is ours to change.
- Icons: Lucide only. No emoji.
- Font: Manrope, system fonts as fallback. Tabular numbers for all stats.
- Look: cool greys, tight corners (4–6 px), one pastel accent (peach). Dark text on pastel fills. Light mode routes get a deeper outline.

## Icons

Stats use a fixed set of Lucide icons, exported as `statIcons` from `packages/ui/src/icons.ts`.

| Key | Icon | Meaning |
|---|---|---|
| `distance` | `MoveHorizontal` | Distance |
| `ascent` | `TrendingUp` | Ascent |
| `ridingTime` | `Clock` | Riding time |
| `signed` | `Signpost` | Share on signed routes |
| `beds` | `BedDouble` | Beds, places to sleep |
| `stars` | `Star` | Hotel stars |
| `rain` | `CloudRain` | Rain |
| `dry` | `UmbrellaOff` | No rain expected |
| `wind` | `Wind` | Wind |
| `temperature` | `Thermometer` | Temperature |
| `daylight` | `Sunset` | Sunrise and sunset |
| `train` | `TrainFront` | Train station, train link |
| `dates` | `CalendarDays` | Dates of a trip |
| `budget` | `Euro` | Hotel budget |

Rules:

- One meaning per icon. Don't use these icons for anything else.
- Repeated stats are icon plus value (`Stat`). The label is the tooltip and the aria-label.
- Lists show icons only in column headers, not in every row (`DayList`).
- Panel section headings have an icon from `sectionIcons` (see [Side panels](#side-panels)). Other headings, flavour labels and plain buttons have none. Only known actions (zoom, close, more) are icon-only.
- The paved share is shown as the surface bar (`SurfaceBar`), not as a number.

## Dark mode

- Default follows the system setting. The user can override it in Settings.
- The choice is stored in local storage and set as `data-theme` on `<html>`.
- Only token values change. Components never check the theme.
- `data-theme` on any element forces its subtree into that theme. `/dev/components` uses this.

## Map

Every screen uses `AppMap` (`apps/web/src/components/map/AppMap.tsx`). It owns:

- base style and theme switch
- hillshade
- signed cycling routes: `full`, `quiet` or `off`
- zoom buttons, legend or map layers, hint and attribution
- fitting to points, with padding for panels and sheets

Signed cycling routes show by size:

| Routes | From zoom | Width |
|---|---|---|
| EuroVelo, national | always | 2–4 px |
| Regional | 9 | 1.25–3 px |
| Local | 11 | 1–2 px |

Hovering or tapping a route highlights all of it and shows its name, kind, full length and other routes on the same way.

Screens add only their own sources, layers and markers as children. Line and fill layers use `MapLayer`, so they sit below the base map labels. Screens don't set a base style, controls or their own fitting.

- Base styles: OpenFreeMap Positron (light) and Dark.
- Map and chart colors come from a `useThemeTokens()` hook. It reads the resolved CSS variables and re-applies them on theme change.
- When the base style swaps, our own layers are added again.
- OSM attribution is shown in both themes.
- Screens with layers to turn on and off pass `layers`. The legend then moves into the map layers menu under the zoom buttons.

## Chart panel

The panel under the trip map shows one view at a time: Elevation or Weather. More views can follow. Every view uses the same frame from `packages/ui`, so switching moves nothing.

| Row | Component | Height | Holds |
|---|---|---|---|
| Title | `ChartPanel` | 32 px | Day title, view switcher on the right |
| Toolbar | `ChartToolbar` | 32 px | Legend, or ride time and best start |
| Chart | `ChartBody` | `chart` 168 px | The chart, scales in a 56 px left margin |
| Info | `ChartInfo` | 20 px | Values at the pointer or marker, with units |

- A view always renders all rows, also while loading or without data.
- No floating tooltips in the panel. Values go into the info line.
- Scales sit in the left margin. A second scale goes inside the chart at the right edge.
- Text that changes, like warnings, replaces text in a row. It never adds a row.
- On phones the panel sits in the stage sheet with `plain`: no frame and no title, and the view switcher fills the row.

## Side panels

Every side panel follows these rules: the trip editor, proposals, new trip, import, the shared view and the phone sheets. A new screen with a panel uses the same parts.

### Structure

```
┌──────────────────────────────┐
│ Panel header                 │  title and menu, or back and siblings
├──────────────────────────────┤
│ ▣ Section          summary ⌄ │
│   notice                     │
│   body                       │
├──────────────────────────────┤
│ ▣ Section          summary › │
└──────────────────────────────┘
```

- A panel shows one level at a time. A list of items is one level, one item is the next.
- The panel header names the level. On the top level: title and its menu. On a detail level: back button and switches to the items next to it (day chips, prev and next).
- Below the header the panel is a stack of sections. Nothing else.
- Actions for the whole screen (save state, undo, share, export) sit in the top bar, not in the panel.
- The map and the panel stay in sync: hovering an item highlights it on the map, clicking it on the map opens it in the panel.

### Section

| Part | Holds |
|---|---|
| Header | Icon, title, summary on the right, chevron if it folds. 44 px high, the whole row is the button. |
| Notice | Optional. One line with an action, e.g. Changed with Revert, or a wind tip. Shows also when folded. |
| Body | Content, 16 px padding, 8–12 px gap |

- Sections are split by a border. No cards around sections, no headings inside a section.
- Every section has an icon, a title and a summary. The summary shows the current choice or the key numbers, so a folded section still says what matters.
- A section folds when its body is a choice or details. A section that gives an overview stays open.
- Order: what the user decides first comes first. Getting there before the ride, the ride before the stop.

### Content

Sections hold only these patterns:

| Pattern | Component | Use |
|---|---|---|
| Stat tiles | `StatTile` | Totals: icon and label, value, optional second line |
| Choice list | `ChoiceList` | Pick one of several: radio, name, muted second line, optional tag, actions at the end. The current row is `selected`. `MoreRow` shows the rest of a long list. |
| Choice table | `StopChoices` | Pick one of several when the options are compared by numbers in columns |
| Item rows | `NavRow` in a `RowList`, `DayCard` | Rows that open the next level. End in a right chevron. |
| Detail rows | `Stat`, `SurfaceBar`, short text | Facts about the item |
| Buttons | `Button`, `TextLink` | Actions on this section, at the end of the body |

- Choices use `ChoiceList`, also in forms. Use `StopChoices` only when the columns matter.
- A right chevron opens another level. A down chevron folds.

### Section icons

Exported as `sectionIcons` from `packages/ui/src/icons.ts`. One icon per kind of section, the same on every screen. A new kind of section adds its icon here first.

| Key | Icon | Section |
|---|---|---|
| `dates` | `CalendarDays` | Dates |
| `trip` | `Bike` | Trip totals |
| `days` | `List` | Days, proposals, files: lists of items |
| `trains` | `TrainFront` | Trains, Getting there, Getting home |
| `ride` | `Route` | Ride |
| `stop` | `MapPin` | Stop, start, end |
| `hotel` | `BedDouble` | Hotel |

### Components

| Component | Use |
|---|---|
| `PanelHeader` | Top of the panel. Title with menu, or a sticky row with back and sibling switch above the title. Optional line above the title, stats and a notice. |
| `PanelSection` | Header, notice and body. `icon` is required. |
| `StatTile`, `ChoiceList`, `StopChoices`, `NavRow`, `DayCard` | Content patterns above |

### Example: trip editor

| Level | Header | Sections |
|---|---|---|
| Trip | Trip name, trip menu | Dates, Trip, Days, Trains |
| Day | All days, day chips | Getting there (first day), Ride, Stop, Hotel, Getting home (last day) |

Click a day card, a route on the map or a day chip to open a day.

## Enforcement

| Rule | How |
|---|---|
| Only our tokens exist | Tailwind `@theme` resets the defaults (`--*: initial`, including spacing) and defines only our tokens |
| No unknown classes | `eslint-plugin-better-tailwindcss` `no-unknown-classes`, entry point `tokens.css` |
| No arbitrary values | `no-restricted-classes` with a pattern against `[...]` and `(...)` in the utility part. Arbitrary variants like `data-[state=on]:` stay allowed. |
| Apps don't use raw `<button>`, `<input>`, `<select>`, `<textarea>` | ESLint `no-restricted-syntax` in `apps/web` |
| Readable contrast | Vitest test over token pairs in both themes |
| Side panels look the same | `PanelSection` takes `icon` only as a `sectionIcons` key. Panels are built from `PanelHeader` and `PanelSection` only; checked in review. |
| Every component works in both themes | `/dev/components` page in the app shows every component in light and dark |

## Units and formats

Examples in English:

| Value | Format |
|---|---|
| Distance | `78 km`, `850 m` below 1 km |
| Ascent | `650 m` |
| Temperature | `22 °C` |
| Time | 24 h, `14:30` |
| Duration | `4 h 15`, `45 min` below 1 h, in 5 min steps |
| Rain | `1.2 mm` |
| Date | `Sat 12 Jun` |

All formatting goes through shared functions in `packages/ui`. They follow the current locale (see `08-translation.md`).

## Wording

The same thing always has the same name in the UI. Translations use one fixed term per entry too.

| Term | Meaning |
|---|---|
| Trip | The whole plan |
| Stage | One day of a trip |
| Proposal | A generated trip before it is saved |
| Stop | Place where a stage ends |
| Via point | Point the user adds to change a route |
| Day loop | A one-day ride that ends where it starts |
| Multi-day loop | A multi-day trip that ends where it starts |
| Theme | What a trip should lean toward: Nature, Rivers & lakes, Wine or Culture |
| Length | One day or several days |
| Shape | A to B, loop, or anywhere (one day only) |
| Anywhere | A one-day ride in any direction, back by train |
| With the wind | Planning a day trip with the wind forecast |
| Train out | Taking the train to the start of a ride that ends at home |
| Back by | Latest arrival on the last day |
| Half day, short day | A day shortened by a late start or an early back-by time |
| Proposed route | The route of a stage as proposed, shown after a change |
| Changed, Revert | A stage that differs from its proposal, and the action that restores it |
| Direct, longer, scenic | Characters of one-day A to B proposals |
| Riding time | Time on the bike for a stage, without breaks |
| Ride window | The hours of a stage on the bike, shown on the weather timeline |
| Best start | The start time with the least rain, then the least headwind |
| Feels like | Temperature with wind chill |
| Elevation, Weather | The two views of the panel under the trip map |
| Time marker | The hour the weather map shows, on the weather timeline |
| Gusts | Strongest wind in an hour |
| Map layers | The legend on the map, where layers are turned on and off |
